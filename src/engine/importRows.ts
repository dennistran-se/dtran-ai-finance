import { addCompany, coByName, H, locked, routeRow } from './store'
import type { SheetRow } from './sheets'
import type { BankAccount, PoolRow, Store } from './types'

const isPriv = (o: string) => /^privat/i.test(o)
const isSkip = (o: string) => /^ta bort|^skip|^överföring/i.test(o || '')
const isUnk = (o: string) => !o || /^vet ej|^okänd|^\?$/i.test(o)

export interface ImportOptions {
  /** bransch per nytt bolag (namn från kolumnen Tillhör) */
  industries?: Record<string, 'rest' | 'shop'>
  /** bolag för rader utan Tillhör */
  fixedCompany?: string | null
  /** konto för rader utan kontonamn */
  defaultAccount?: BankAccount
}
export interface ImportResult { add: number; dup: number; companies: string[] }

/** Läser in bankrader (t.ex. användarens Excel "Alla konton") och skapar förslag. */
export function importRows(st: Store, rows: SheetRow[], opt: ImportOptions = {}): ImportResult {
  const created: string[] = []
  const owners = [...new Set(rows.map(r => r.owner).filter(o => o && !isPriv(o) && !isUnk(o) && !isSkip(o)))]
  for (const o of owners) if (!coByName(st, o)) {
    const id = addCompany(st, { name: o.trim(), ind: opt.industries?.[o] || 'rest', form: /\bab$/i.test(o.trim()) ? 'AB' : 'EF', channels: [], orgnr: rows.find(r => r.owner === o && r.org)?.org })
    created.push(id)
  }
  const own: Record<string, Record<string, number>> = {}
  rows.forEach(r => {
    if (!r.acc) return
    const o = isPriv(r.owner) ? 'privat' : isUnk(r.owner) || isSkip(r.owner) ? null : coByName(st, r.owner)
    if (!o) return
    ;(own[r.acc] = own[r.acc] || {})[o] = (own[r.acc][o] || 0) + 1
  })
  const accFor = (n: string): BankAccount => {
    let a = st.accounts.find(x => H(x.name) === H(n))
    if (!a) {
      const top = Object.entries(own[n] || {}).sort((a, b) => b[1] - a[1])[0]
      a = { id: 'a' + st.aid++, name: n, bas: rows.find(r => r.acc === n)?.accBas, bank: (n.match(/\b(SEB|Swedbank|ICA|Nordea|Handelsbanken|Revolut|Svea|Lunar|Danske)\b/i) || [''])[0], owner: /privat/i.test(n) || !top ? 'privat' : top[0] }
      st.accounts.push(a)
    }
    return a
  }
  const key = (p: { acc: string; date: string; amt: number; text: string }) => `${p.acc}|${p.date}|${p.amt}|${p.text}`
  const have = new Map<string, number>()
  st.pool.forEach(p => have.set(key(p), (have.get(key(p)) || 0) + 1))
  let add = 0, dup = 0
  const touched: PoolRow[] = []
  for (const x of rows) {
    const a = x.acc ? accFor(x.acc) : opt.defaultAccount || accFor('Importerat konto')
    const label = isPriv(x.owner) ? 'privat' : isSkip(x.owner) ? 'skip' : isUnk(x.owner) ? (!x.owner && opt.fixedCompany ? opt.fixedCompany : null) : coByName(st, x.owner) || null
    const p: PoolRow = { id: st.pid, acc: a.id, date: x.date, text: x.text, amt: x.amt, label, cat: x.cat, kv: x.kv, note: x.note, typ: x.typ, bas: x.bas, vat: x.vat, xl: 1 }
    const k = key(p)
    if ((have.get(k) || 0) > 0) { have.set(k, have.get(k)! - 1); dup++; continue }
    st.pid++
    st.pool.push(p); touched.push(p); add++
  }
  touched.forEach(p => { if (!locked(st, p)) routeRow(st, p, true) })
  return { add, dup, companies: created }
}
