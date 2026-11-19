import { isBankAcc } from './accounts'
import { applyKlarna } from './psp'
import { accMap, locked, routeRow } from './store'
import type { BankAccount, Company, HistEntry, PoolRow, Recon, Store, VatCode, Voucher } from './types'
import { addDays, dd, supKey } from './util'

export const bankBas = (acc: BankAccount) => acc.bas || (/kontant|kassa/i.test(acc.name) ? '1910' : '1930')

interface Move { v: Voucher; i: number; date: string; amt: number; text: string }
/** Bankrörelser i bokföringen, en per bankrad i verifikationerna. */
export function bookedMoves(c: Company, bas: string): Move[] {
  const M: Move[] = []
  c.ver.forEach(v => { if (v.kind === 'ib' || v.corrected) return; v.lines.forEach((l, i) => { if (l.a !== bas) return; M.push({ v, i, date: l.td || v.date, amt: l.d - l.c, text: l.tt || v.text }) }) })
  return M
}

/** Huvudkontot och momssatsen för en bankrad i en verifikation. */
export function mainLine(v: Voucher, i: number): { acc: string; vat: VatCode } | null {
  const b = v.lines[i]
  const same = v.lines.filter((l, j) => j !== i && !isBankAcc(l.a) && (b.td ? l.td === b.td : true) && (b.tt ? l.tt === b.tt : true))
  const pool = same.length ? same : v.lines.filter((l, j) => j !== i && !isBankAcc(l.a))
  const nonvat = pool.filter(l => !/^26/.test(l.a))
  const m = (nonvat.length ? nonvat : pool).slice().sort((x, y) => Math.abs(y.d - y.c) - Math.abs(x.d - x.c))[0]
  if (!m) return null
  const amt = Math.abs(m.d - m.c), vatL = pool.filter(l => /^26(1|2|3|4)/.test(l.a))
  let vat: VatCode = '0'
  if (pool.some(l => l.a === '2614' || l.a === '2645')) vat = 'RC25'
  else if (vatL.length && amt) { const vv = vatL.reduce((s, l) => s + Math.abs(l.d - l.c), 0), r = Math.round((vv / amt) * 100); vat = r >= 20 ? '25' : r >= 9 ? '12' : r >= 4 ? '6' : '0' }
  return { acc: m.a, vat }
}

const vid = (v: Voucher) => v.sid || 'V' + v.n

/**
 * Jämför bolagets bankrader med bokföringen (verifikationer från SIE).
 * Ändrar aldrig verifikationer. Sätter status på bankraderna och lär sig hur motparter bokförts.
 */
export function reconcile(st: Store, cid: string): Recon | null {
  const c = st.companies[cid]
  if (!c || !c.ver.some(v => v.src === 'sie')) return null
  const ACC = accMap(st)
  const res: Recon = { match: 0, date: 0, grupp: 0, saknas: 0, sumSaknas: 0, booked: 0, orphan: [], orphanN: 0, accs: [] }
  const hist: Record<string, HistEntry> = (c.hist = {})
  const learn = (r: { text: string; amt: number }, v: Voucher, i: number) => {
    const m = mainLine(v, i)
    if (!m || !ACC[m.acc]) return
    const k = supKey(r.text) || r.text, key = k + '|' + (r.amt > 0 ? 1 : -1)
    const h = (hist[key] = hist[key] || { acc: m.acc, vat: m.vat, n: 0, ex: vid(v), cnt: {} })
    const ck = m.acc + '|' + m.vat
    h.cnt[ck] = (h.cnt[ck] || 0) + 1
    h.n++
    const top = Object.entries(h.cnt).sort((a, b) => b[1] - a[1])[0][0].split('|')
    h.acc = top[0]; h.vat = top[1] as VatCode
  }
  c.ver.forEach(v => {
    if (v.src !== 'sie' || v.kind) return
    v.lines.forEach((l, i) => {
      if (!isBankAcc(l.a)) return
      const t = l.tt || v.text
      if (!t || /^(inbetalning från|utbetalning till|kundfaktura|leverantörsfaktura)/i.test(t)) return
      learn({ text: t, amt: l.d - l.c }, v, i)
    })
  })
  const accs = st.accounts.filter(a => a.owner === cid)
  const yrs = new Set(Object.keys(c.co.sie || {}))
  st.pool.filter(r => accs.some(A => A.id === r.acc) && !yrs.has(r.date.slice(0, 4))).forEach(r => { if (r.rec) r.rec = null })

  for (const A of accs) {
    const bas = bankBas(A)
    const rows = st.pool.filter(r => r.acc === A.id && r.label !== 'skip' && yrs.has(r.date.slice(0, 4))).sort((a, b) => (a.date < b.date ? -1 : 1))
    if (!rows.length) continue
    const lo = rows[0].date, hi = rows[rows.length - 1].date
    const M = bookedMoves(c, bas).filter(m => m.date >= addDays(lo, -5) && m.date <= addDays(hi, 5))
    const used = new Set<number>(), byAmt = new Map<number, number[]>()
    M.forEach((m, i) => { const a = byAmt.get(m.amt) || []; a.push(i); byAmt.set(m.amt, a) })
    rows.forEach(r => { r.rec = null })

    // 1. samma belopp, högst 3 dagar; 2. samma belopp, högst 31 dagar
    for (const [lim, stt] of [[3, 'match'], [31, 'date']] as const) rows.forEach(r => {
      if (r.rec) return
      let best: [number, number] | null = null
      for (const i of (byAmt.get(r.amt) || []).filter(i => !used.has(i))) { const d = dd(M[i].date, r.date); if (d <= lim && (!best || d < best[1])) best = [i, d] }
      if (best) { used.add(best[0]); const m = M[best[0]]; r.rec = { st: stt, v: vid(m.v), d: best[1], vt: m.v.text }; learn(r, m.v, m.i) }
    })
    // 3. flera bankrader samma dag = en verifikation (t.ex. Swish per dag)
    M.forEach((m, i) => {
      if (used.has(i)) return
      for (let k = 0; k <= 3; k++) for (const dsg of k ? [k, -k] : [0]) {
        const day = addDays(m.date, dsg), cand = rows.filter(r => !r.rec && r.date === day && Math.sign(r.amt) === Math.sign(m.amt))
        if (cand.length < 2) continue
        const groups = Object.values(cand.reduce<Record<string, PoolRow[]>>((g, r) => { (g[supKey(r.text)] = g[supKey(r.text)] || []).push(r); return g }, {}))
        for (const s of [cand, cand.filter(r => /^swish/i.test(r.text)), ...groups]) {
          if (s.length < 2) continue
          if (s.reduce((x, r) => x + r.amt, 0) === m.amt) { s.forEach(r => { r.rec = { st: 'grupp', v: vid(m.v), d: Math.abs(dsg), vt: m.v.text, g: s.length }; learn(r, m.v, m.i) }); used.add(i); return }
        }
      }
    })
    // 4. några av bankraderna runt datumet blir tillsammans en verifikation
    M.forEach((m, i) => {
      if (used.has(i)) return
      const cand = rows.filter(r => !r.rec && Math.sign(r.amt) === Math.sign(m.amt) && dd(r.date, m.date) <= 4).sort((a, b) => dd(a.date, m.date) - dd(b.date, m.date)).slice(0, 14)
      if (cand.length < 2) return
      const n = cand.length
      for (let mask = 3; mask < 1 << n; mask++) {
        if ((mask & (mask - 1)) === 0) continue
        let sum = 0
        for (let j = 0; j < n; j++) if (mask & (1 << j)) sum += cand[j].amt
        if (sum === m.amt) { const s2 = cand.filter((_, j) => mask & (1 << j)); s2.forEach(r => { r.rec = { st: 'grupp', v: vid(m.v), d: dd(r.date, m.date), vt: m.v.text, g: s2.length }; learn(r, m.v, m.i) }); used.add(i); return }
      }
    })
    // 5. en bankrad = flera bokförda händelser (t.ex. insättning med flera fakturabetalningar)
    rows.forEach(r => {
      if (r.rec) return
      const cand = M.map((m, i) => [m, i] as const).filter(([m, i]) => !used.has(i) && Math.sign(m.amt) === Math.sign(r.amt) && dd(m.date, r.date) <= 5).sort((a, b) => dd(a[0].date, r.date) - dd(b[0].date, r.date)).slice(0, 14)
      if (cand.length < 2) return
      const n = cand.length
      for (let mask = 3; mask < 1 << n; mask++) {
        if ((mask & (mask - 1)) === 0) continue
        let sum = 0
        for (let j = 0; j < n; j++) if (mask & (1 << j)) sum += cand[j][0].amt
        if (sum === r.amt) { const pick = cand.filter((_, j) => mask & (1 << j)); pick.forEach(([, i]) => used.add(i)); const m0 = pick[0][0]; r.rec = { st: 'grupp', v: pick.map(([m]) => vid(m.v)).join(', '), d: 0, vt: pick.length + ' bokförda händelser', g: pick.length }; learn(r, m0.v, m0.i); return }
      }
    })
    rows.forEach(r => { if (!r.rec) { r.rec = { st: 'saknas' }; res.saknas++; res.sumSaknas += r.amt } else res[r.rec.st]++ })
    M.forEach((m, i) => { if (!used.has(i)) res.orphan.push({ date: m.date, text: m.text, amt: m.amt, v: vid(m.v), acc: A.name }) })
    res.booked += M.length
    res.accs.push(A.name)
  }
  c.recon = { ...res, orphan: res.orphan.slice(0, 400), orphanN: res.orphan.length }
  if (c.psp?.klarna) applyKlarna(st, cid)
  st.pool.filter(r => accs.some(a => a.id === r.acc)).forEach(r => { if (!locked(st, r) || r.rec) routeRow(st, r, true) })
  return c.recon
}
