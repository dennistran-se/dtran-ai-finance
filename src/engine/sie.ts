import { accType } from './accounts'
import { addCompany, coByName, orgEq } from './store'
import type { Line, Store } from './types'
import { xDate } from './util'

export interface SieFile {
  name: string; orgnr: string
  years: Record<string, [string, string]>
  accs: Record<string, string>
  ib: { a: string; amt: number }[]
  vers: { s: string; n: string; date: string; text: string; lines: Line[] }[]
}

const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '
/** SIE-filer är oftast kodade i PC8 (CP437). */
export function decodeSie(u8: Uint8Array): string {
  const head = String.fromCharCode(...u8.slice(0, 600))
  if (/#FORMAT\s+PC8/i.test(head) || !/#FORMAT/i.test(head)) { let s = ''; for (const b of u8) s += b < 128 ? String.fromCharCode(b) : CP437[b - 128]; return s }
  return new TextDecoder('windows-1252').decode(u8)
}

export function parseSIE(txt: string): SieFile {
  const o: SieFile = { name: '', orgnr: '', years: {}, accs: {}, ib: [], vers: [] }
  let cur: SieFile['vers'][number] | null = null
  const q = (s: string) => { const m = s.match(/^"((?:[^"\\]|\\.)*)"/); return m ? m[1].replace(/\\"/g, '"') : s.split(/\s/)[0] }
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l) continue
    if (l.startsWith('#FNAMN')) o.name = q(l.slice(7).trim())
    else if (l.startsWith('#ORGNR')) o.orgnr = l.split(/\s+/)[1] || ''
    else if (l.startsWith('#RAR')) { const p = l.split(/\s+/); o.years[p[1]] = [p[2], p[3]] }
    else if (l.startsWith('#KONTO')) { const m = l.match(/^#KONTO\s+(\d+)\s+(.*)$/); if (m) o.accs[m[1]] = q(m[2]) }
    else if (l.startsWith('#IB ')) { const p = l.split(/\s+/); if (p[1] === '0') o.ib.push({ a: p[2], amt: Math.round(parseFloat(p[3]) * 100) }) }
    else if (l.startsWith('#VER')) {
      const m = l.match(/^#VER\s+(\S+)\s+(\S+)\s+(\d{8})\s*(?:"((?:[^"\\]|\\.)*)")?/)
      if (m) cur = { s: m[1].replace(/"/g, ''), n: m[2].replace(/"/g, ''), date: xDate(m[3]), text: (m[4] || '').replace(/\\"/g, '"'), lines: [] }
    } else if (l.startsWith('#TRANS') && cur) {
      const m = l.match(/^#TRANS\s+(\d+)\s+\{[^}]*\}\s+(-?[\d.]+)(?:\s+(\d{8}))?(?:\s+"((?:[^"\\]|\\.)*)")?/)
      if (m) { const amt = Math.round(parseFloat(m[2]) * 100); if (amt) cur.lines.push({ a: m[1], d: amt > 0 ? amt : 0, c: amt < 0 ? -amt : 0, td: m[3] ? xDate(m[3]) : '', tt: m[4] || '' }) }
    } else if (l === '}' && cur) { o.vers.push(cur); cur = null }
  }
  return o
}

/** Läser in en SIE-fil i rätt bolag. Verifikationer som redan finns läses inte in igen. */
export function importSIE(st: Store, o: SieFile): { cid: string; add: number; yr: string; n: number } {
  let cid = Object.keys(st.companies).find(id => orgEq(o.orgnr, st.companies[id].co.orgnr)) || coByName(st, o.name)
  if (!cid) cid = addCompany(st, { ind: /sole|shop|butik|store/i.test(o.name) ? 'shop' : 'rest', form: /\bab$/i.test(o.name) ? 'AB' : 'EF', name: o.name, channels: [] })
  const c = st.companies[cid]
  c.co.orgnr = c.co.orgnr || o.orgnr
  c.co.sie = c.co.sie || {}
  for (const a in o.accs) st.accx[a] = [o.accs[a], accType(a)]
  const yr = (o.years['0'] || [''])[0].slice(0, 4)
  const have = new Set(c.ver.filter(v => v.sie).map(v => v.sie))
  let add = 0
  const ibKey = 'IB|' + yr
  if (o.ib.length && !have.has(ibKey) && !c.ver.some(v => v.kind === 'ib' && v.date === yr + '-01-01')) {
    const L = o.ib.filter(x => x.amt).map(x => ({ a: x.a, d: x.amt > 0 ? x.amt : 0, c: x.amt < 0 ? -x.amt : 0 }))
    if (L.length) c.ver.push({ n: c.ver.length + 1, date: yr + '-01-01', text: `Ingående balans ${yr} (SIE)`, lines: L, src: 'sie', kind: 'ib', sie: ibKey, doc: null, need: '' })
  }
  for (const v of o.vers) {
    const k = `${v.s}|${v.n}|${yr}`
    if (have.has(k)) continue
    have.add(k)
    c.ver.push({ n: c.ver.length + 1, date: v.date, text: v.text, lines: v.lines, src: 'sie', kind: /^(årets resultat|bokslut)/i.test(v.text) ? 'bokslut' : /^momsredovisning/i.test(v.text) ? 'avr' : '', sie: k, sid: v.s + v.n, doc: 'I bokföringsprogrammet', need: '' })
    add++
  }
  c.co.sie[yr] = { n: o.vers.length }
  return { cid, add, yr, n: o.vers.length }
}
