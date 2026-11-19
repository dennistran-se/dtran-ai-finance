import { isBankAcc } from './accounts'
import { locked, routeRow } from './store'
import type { BankAccount, Company, KlarnaPayout, Line, PoolRow, Store, Suggestion, ZettleReport } from './types'
import { dd, kr2, xAmt, xDate } from './util'

/** Klarnas avräkningsfil (settlements, CSV med semikolon). */
export function parseKlarnaCsv(txt: string): KlarnaPayout[] {
  const cells = (l: string) => l.split(';').map(x => x.replace(/^"|"$/g, ''))
  const pays: KlarnaPayout[] = []
  let hdr: string[] | null = null
  for (const l of txt.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)) {
    const c = cells(l)
    if (c[0] === 'total_sale_amount') { hdr = c; continue }
    if (c[0] === 'type' || c[0].startsWith('summary_')) { hdr = c[0] === 'type' ? null : hdr; continue }
    if (hdr && c.length === hdr.length && /^-?\d/.test(c[0])) {
      const o: Record<string, string> = {}
      hdr.forEach((h, i) => (o[h] = c[i]))
      const n = (k: string) => Math.round(parseFloat(o[k] || '0') * 100) || 0
      pays.push({ ref: o.payment_reference, date: xDate((o.payout_date || '').slice(0, 10)), sale: n('total_sale_amount'), fee: n('total_fee_amount'), ret: n('total_return_amount'), rev: n('total_reversal_amount'), tax: n('total_tax_amount'), settle: n('total_settlement_amount'), hold: n('total_holdback_amount'), rel: n('total_release_amount'), repay: n('total_repay_amount'), comm: n('total_commission_amount') })
    }
  }
  return pays.filter(p => p.ref && p.date)
}
export const isKlarnaCsv = (txt: string) => /^﻿?"?summary_total_sale_amount|total_settlement_amount/.test(txt.slice(0, 600))

/** Kopplar Klarnas utbetalningar till bankrader (samma belopp, referens i texten eller högst 5 dagar). */
export function applyKlarna(st: Store, cid: string): number {
  const c = st.companies[cid], P = c.psp?.klarna || []
  if (!P.length) return 0
  const own = new Set(st.accounts.filter(a => a.owner === cid).map(a => a.id)), used = new Set<number>()
  let n = 0
  st.pool.forEach(r => { if (r.psp?.ch === 'Klarna') delete r.psp })
  P.forEach(p => {
    p.row = null
    const cand = st.pool.filter(r => own.has(r.acc) && !used.has(r.id) && r.amt === p.settle && (r.text.includes(p.ref) || /klarna/i.test(r.text) || /^\d{8,10}$/.test(r.text.trim())))
      .sort((a, b) => (+b.text.includes(p.ref) - +a.text.includes(p.ref)) || dd(a.date, p.date) - dd(b.date, p.date))
    const r = cand[0]
    if (r && (r.text.includes(p.ref) || dd(r.date, p.date) <= 5)) { used.add(r.id); r.psp = { ch: 'Klarna', ref: p.ref }; p.row = r.id; n++ }
  })
  st.pool.filter(r => r.psp).forEach(r => { if (!locked(st, r)) routeRow(st, r, true) })
  return n
}

function salesAccFromHistory(c: Company, re: RegExp) {
  const v = c.ver.slice().reverse().find(v => re.test(v.text) && v.lines.some(l => /^3/.test(l.a)))
  return v ? { acc: v.lines.find(l => /^3/.test(l.a))!.a, vatLine: v.lines.some(l => /^26[123]1$/.test(l.a)) } : null
}

/** Ersätter förslaget för en bankrad med Klarnas uppdelning: försäljning, avgift, moms på avgift och utbetalt. */
export function applyPspLines(it: Suggestion, r: PoolRow, a: BankAccount, c: Company) {
  if (!r.psp || r.psp.ch !== 'Klarna') return
  const p = (c.psp?.klarna || []).find(x => x.ref === r.psp!.ref)
  if (!p) return
  const bas = a.bas || '1930', cr = p.settle + p.fee + p.tax, h = salesAccFromHistory(c, /klarna/i)
  const L: Line[] = [{ a: bas, d: p.settle, c: 0 }]
  if (p.fee) L.push({ a: '6570', d: p.fee, c: 0 })
  if (p.tax) L.push({ a: '2641', d: p.tax, c: 0 })
  if (h && !h.vatLine) L.push({ a: h.acc, d: cr < 0 ? -cr : 0, c: cr > 0 ? cr : 0 })
  else { const acc = h ? h.acc : '3001', net = Math.round(cr / 1.25); L.push({ a: acc, d: 0, c: net }, { a: '2611', d: 0, c: cr - net }) }
  Object.assign(it, {
    lines: L, acc: L[L.length - 1].a, vat: '0', conf: 0.95, ask: 0, doc: 'Klarna avräkning ' + p.ref, need: '',
    text: `Klarna utbetalning ${p.ref} (försäljning ${kr2(p.sale)}, returer ${kr2(p.ret)})`,
    why: `Klarnas avräkning ${p.ref}: försäljning ${kr2(p.sale)} kr, returer ${kr2(p.ret)} kr, avgift ${kr2(p.fee)} kr och moms på avgiften ${kr2(p.tax)} kr. Utbetalt ${kr2(p.settle)} kr.${h ? ' Samma upplägg som du har använt tidigare.' : ''}${p.hold || p.rel || p.repay ? ' Obs: avräkningen innehåller reservationer eller återbetalningar. Kontrollera.' : ''}`,
  })
}

type AOA = unknown[][]
/** Zettles försäljningsrapport (PayPal POS), första bladet som rader. */
export function parseZettleReport(A: AOA): ZettleReport | null {
  if (!A.length || String(A[0]?.[0] ?? '').trim() !== 'Försäljningsrapport') return null
  const row = (lbl: string) => A.find(r => r && String(r[0] ?? '').trim() === lbl)
  const num = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : xAmt(v) || 0)
  const o: ZettleReport = { name: '', org: '', from: '', to: '', rates: [], fees: 0, net: 0, cash: 0 }
  const n = row('Företagsnamn'), g = row('Organisationsnummer'), p = row('Period:')
  o.name = n ? String(n[1]) : ''
  o.org = g ? String(g[1]) : ''
  if (p) { const m = String(p[1]).match(/(\d{4}-\d\d-\d\d)\s*-\s*(\d{4}-\d\d-\d\d)/); if (m) { o.from = m[1]; o.to = m[2] } }
  const s = row('Försäljning')
  if (s) { o.excl = num(s[1]); o.vat = num(s[2]); o.incl = num(s[3]) }
  const ri = A.findIndex(r => r && r[0] === 'Returer' && r[3] != null)
  if (ri >= 0) o.ret = num(A[ri][3])
  const ti = A.findIndex(r => r && r[0] === 'Totalt' && r[3] != null)
  if (ti >= 0) o.total = num(A[ti][3])
  const vi = A.findIndex(r => r && r[0] === 'Försäljning per momssats')
  if (vi >= 0) for (let i = vi + 1; i < A.length && A[i] && A[i][0] !== 'Totalt'; i++) { const m = String(A[i][0]).match(/(\d+)/); if (m) o.rates.push({ rate: +m[1], excl: num(A[i][1]), vat: num(A[i][2]), incl: num(A[i][3]) }) }
  const f = row('Summa avgifter'); o.fees = f ? Math.abs(num(f[3])) : 0
  const se = row('Summa efter avgifter'); o.net = se ? num(se[2]) : 0
  const k = A.find(r => r && r[0] === 'Kontanter'); o.cash = k ? num(k[2]) : 0
  return o.from ? o : null
}

/** Jämför Zettle-rapporten med det som är bokfört och med utbetalningarna i banken. */
export function zettleCompare(st: Store, cid: string, o: ZettleReport) {
  const c = st.companies[cid]
  const zv = c.ver.filter(v => v.date >= o.from && v.date <= o.to && !v.corrected && /zettle|paypal/i.test(v.text))
  let sales = 0, fees = 0, pay = 0
  zv.forEach(v => v.lines.forEach(l => { if (/^3/.test(l.a)) sales += l.c - l.d; if (l.a === '6570') fees += l.d - l.c; if (isBankAcc(l.a)) pay += l.d - l.c }))
  const own = new Set(st.accounts.filter(a => a.owner === cid).map(a => a.id))
  const bank = st.pool.filter(r => own.has(r.acc) && r.date >= o.from && r.date <= o.to && /zettle|paypal/i.test(r.text) && r.amt > 0)
  return { sales, fees, pay, bsum: bank.reduce((s, r) => s + r.amt, 0), bn: bank.length }
}
