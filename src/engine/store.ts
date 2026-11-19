import { BASE_ACC } from './accounts'
import { classify, kvDoc, skvSug, suggest } from './classify'
import { applyPspLines } from './psp'
import { balanced, cashOf, linesOf } from './ledger'
import type { AccType, BankAccount, Company, CompanyInfo, PoolRow, Store, Suggestion } from './types'
import { dd, supKey } from './util'

export function createStore(): Store {
  return { companies: {}, accounts: [], pool: [], accx: {}, lrules: {}, pid: 1, aid: 1, uid: 1 }
}
/** Kontoplanen: grundkontona plus det som lästs in från SIE-filer. */
export const accMap = (st: Store): Record<string, [string, AccType]> => ({ ...BASE_ACC, ...st.accx })

export const H = (x: unknown) => String(x == null ? '' : x).toLowerCase().replace(/\s+/g, ' ').trim()
export const accById = (st: Store, id: string): BankAccount => st.accounts.find(a => a.id === id) || { id, name: '?', owner: 'privat', bank: '' }
export function coByName(st: Store, n: string): string | undefined {
  const t = H(n).replace(/ ab$/, '')
  return Object.keys(st.companies).find(id => { const c = H(st.companies[id].co.name).replace(/ ab$/, ''); return c === t || c.startsWith(t) || t.startsWith(c) })
}
export const orgEq = (a?: string, b?: string) => !!a && !!b && a.replace(/\D/g, '') === b.replace(/\D/g, '')

let cidSeq = 1
export function addCompany(st: Store, info: Partial<CompanyInfo> & { name: string }, withAccount = false): string {
  let id = 'c' + cidSeq++
  while (st.companies[id]) id = 'c' + cidSeq++
  st.companies[id] = { co: { ind: 'rest', form: 'AB', channels: [], ...info }, ver: [], inbox: [], learned: {} }
  if (withAccount) st.accounts.push({ id: 'a' + st.aid++, name: info.name.replace(/ AB$/, '') + ' – företagskonto', bank: '', owner: id })
  return id
}

export function rowStatus(st: Store, r: PoolRow): [string, string] {
  if (!r.label) return ['Osorterad', 'w']
  if (r.label === 'skip') return ['Borttagen', '']
  const a = accById(st, r.acc)
  if (r.label === 'privat' && a.owner === 'privat') return ['Privat', '']
  const cid = r.label === 'privat' ? a.owner : r.label, c = st.companies[cid]
  if (!c) return ['Okänt bolag', 'bad']
  const v = c.ver.find(v => v.pool === r.id)
  if (v) return [`Bokförd V${v.n} i ${c.co.name}`, 'ok']
  if (c.inbox.some(i => i.pool === r.id)) return ['Förslag i ' + c.co.name, 'ai']
  return ['Avvisad i ' + c.co.name, '']
}
export const locked = (st: Store, r: PoolRow) => rowStatus(st, r)[0].startsWith('Bokförd')
export function unroute(st: Store, r: PoolRow) { for (const c of Object.values(st.companies)) c.inbox = c.inbox.filter(i => i.pool !== r.id) }

function near(c: Company, r: PoolRow): string {
  const v = c.ver.find(v => !v.kind && cashOf(v.lines) === r.amt && dd(v.date, r.date) <= 3)
  if (v) return 'V' + v.n
  const i = c.inbox.find(i => i.amt === r.amt && dd(i.date, r.date) <= 3)
  return i ? 'förslag ' + i.date : ''
}

/** Skapar (eller tar bort) förslaget för en bankrad i rätt bolag. */
export function routeRow(st: Store, r: PoolRow, xl = false) {
  unroute(st, r)
  if (r.rec && r.rec.st !== 'saknas') return
  if (!r.label || r.label === 'skip') return
  const a = accById(st, r.acc)
  if (r.label === 'privat') {
    if (a.owner === 'privat' || !st.companies[a.owner]) return
    const g = Math.abs(r.amt)
    st.companies[a.owner].inbox.push({
      id: st.uid++, pool: r.id, date: r.date, text: 'Privat: ' + r.text, amt: r.amt, src: 'bank', from: a.name, acc: '2893', vat: '0',
      lines: r.amt < 0 ? [{ a: '2893', d: g, c: 0 }, { a: '1930', d: 0, c: g }] : [{ a: '1930', d: g, c: 0 }, { a: '2893', d: 0, c: g }], conf: 0.85,
      why: r.amt < 0 ? 'Privat köp från företagskontot. Bokas mot skuld till ägare (2893), så bolagets skuld till dig minskar. Ingen kostnad och ingen moms.' : 'Privata pengar in på företagskontot. Bokas som lån från ägare (2893).', need: '',
    })
    return
  }
  const cid = r.label, c = st.companies[cid]
  if (!c) return
  const s = suggest(r, c, accMap(st))
  const it: Suggestion = { id: st.uid++, pool: r.id, date: r.date, text: r.text, amt: r.amt, src: 'bank', from: a.name, ...s, doc: kvDoc(r), kv: r.kv || '', dup: xl || r.xl ? '' : near(c, r) }
  if (a.owner === cid && a.bas && a.bas !== '1930') {
    it.cp = a.bas
    if (a.bas === '1630') { const k = skvSug(r.text); if (k && !(it.conf >= 0.9)) { Object.assign(it, { ...k, conf: 0.85, ask: 0, need: '' }); if (k.acc === '1930') it.why += ' Kontrollera att den inte redan är bokförd från banken.' } }
  }
  if (a.owner !== cid) {
    it.cp = '2893'
    it.why = (a.owner === 'privat' ? 'Betalt med privat konto för bolaget: motkonto 2893 (skuld till ägare) i stället för bank. ' : 'Betalt från ett annat bolags konto: bokas mot 2893 som mellanhavande. Kontrollera. ') + s.why
    it.conf = Math.min(s.conf, 0.85)
  }
  if (r.psp) applyPspLines(it, r, a, c)
  c.inbox.push(it)
}

/** Godkänner ett förslag: skapar verifikationen och lär sig motparten. */
export function approve(c: Company, id: number): number | undefined {
  const i = c.inbox.find(x => x.id === id)
  if (!i) return
  const lines = linesOf(i)
  if (!balanced(lines)) throw new Error('Verifikationen balanserar inte')
  const n = c.ver.length + 1
  c.ver.push({ n, date: i.date, text: i.text, lines, src: i.src, kind: '', doc: i.doc || null, need: i.need || '', pool: i.pool ?? null })
  if (!i.lines) { const k = supKey(i.text), p = c.learned[k]; c.learned[k] = { acc: i.acc, vat: i.vat, sg: i.amt > 0 ? 1 : -1, last: n, count: (p && p.acc === i.acc ? p.count : 0) + 1 } }
  c.inbox = c.inbox.filter(x => x.id !== id)
  return n
}

export { classify }
