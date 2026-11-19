import { xAmt, xDate } from './util'
import { H } from './store'

/** En rad från ett kalkylark eller en CSV, innan den har kopplats till konto och bolag. */
export interface SheetRow {
  id: string; date: string; text: string; amt: number; acc: string; typ: string; cat: string; kv: string
  owner: string; note: string; bas: string; vat: string; accBas?: string; org?: string
}
export interface SheetResult { sheet: string; hasAcc: boolean; hasOwner: boolean; hasId: boolean; rows: SheetRow[]; skv?: boolean }
type AOA = unknown[][]

const COLS: Record<string, RegExp> = {
  id: /^dtran-id$/, date: /^(datum|bokföringsdag|transaktionsdag|date|bokföringsdatum|transaktionsdatum)$/, acc: /^(konto|bankkonto|kortkonto)$/,
  text: /^(text|beskrivning|rubrik|meddelande|specifikation|referens|transaktion|motpart)$/, typ: /^(typ|transaktionstyp)$/, inn: /^(insättning|insättningar|in)$/,
  out: /^(uttag|ut)$/, amt: /^(belopp|summa|amount)$/, cat: /^(kategori)$/, kv: /^(kvitto|underlag)$/, owner: /^(tillhör|bolag)$/,
  note: /^(faktura \/ notering|notering|anteckning|kommentar|faktura)$/, bas: /^(bas-konto|baskonto|bokföringskonto)$/, vat: /^(moms|momssats)$/,
}

/** Hittar bladet och raden med rubriker (Datum, Text, Belopp …) och läser raderna. */
export function sheetRows(sheets: { name: string; rows: AOA }[]): SheetResult | null {
  let best: { sheet: string; map: Record<string, number>; rows: AOA } | null = null
  for (const { name, rows: A } of sheets) {
    for (let h = 0; h < Math.min(15, A.length); h++) {
      const map: Record<string, number> = {}
      ;(A[h] || []).map(H).forEach((x, i) => { for (const k in COLS) if (map[k] == null && COLS[k].test(x)) map[k] = i })
      if (map.date != null && map.text != null && (map.amt != null || map.out != null || map.inn != null)) {
        const rows = A.slice(h + 1)
        if (!best || rows.length > best.rows.length) best = { sheet: name, map, rows }
        break
      }
    }
  }
  if (!best) return sheets.length ? skvRows(sheets[0].rows) : null
  const M = best.map, g = (r: unknown[], k: string) => (M[k] != null ? r[M[k]] : null), s = (v: unknown) => (v == null ? '' : String(v).trim())
  const out: SheetRow[] = []
  for (const r of best.rows) {
    if (!r) continue
    const date = xDate(g(r, 'date'))
    if (!date) continue
    let amt = xAmt(g(r, 'amt'))
    if (amt == null) { const i = xAmt(g(r, 'inn')) || 0, o = xAmt(g(r, 'out')) || 0; amt = i - Math.abs(o) }
    if (!amt) continue
    const text = s(g(r, 'text'))
    if (!text) continue
    out.push({ id: s(g(r, 'id')), date, text, amt, acc: s(g(r, 'acc')), typ: s(g(r, 'typ')), cat: s(g(r, 'cat')), kv: s(g(r, 'kv')), owner: s(g(r, 'owner')), note: s(g(r, 'note')), bas: /^\d{4}/.test(s(g(r, 'bas'))) ? s(g(r, 'bas')).slice(0, 4) : '', vat: s(g(r, 'vat')).replace(/[^0-9RC]/gi, '').toUpperCase() })
  }
  return { sheet: best.sheet, hasAcc: M.acc != null, hasOwner: M.owner != null, hasId: M.id != null, rows: out }
}

/** Skatteverkets CSV "Bokförda transaktioner": första raden är bolagsnamn och organisationsnummer. */
export function skvRows(A: AOA): SheetResult | null {
  if (!A.length) return null
  const nm = String(A[0]?.[0] ?? '').trim(), org = String(A[0]?.[1] ?? '').trim()
  if (!/^\d{6}-\d{4}$/.test(org)) return null
  const rows: SheetRow[] = []
  A.slice(1).forEach(r => {
    const date = xDate(r[0]); if (!date) return
    const amt = xAmt(r[2]); if (!amt) return
    rows.push({ id: '', date, text: String(r[1] ?? '').trim(), amt, acc: 'Skattekonto ' + nm, typ: 'Skattekonto', cat: '', kv: 'Behövs inte', owner: nm, note: '', bas: '', vat: '', accBas: '1630', org })
  })
  return rows.length ? { sheet: 'Skattekonto', hasAcc: true, hasOwner: true, hasId: false, rows, skv: true } : null
}
