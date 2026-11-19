import { describe, expect, it } from 'vitest'
import { applyKlarna, balanced, createStore, linesOf, parseKlarnaCsv } from '../index'

const CSV = `"summary_total_sale_amount";"summary_total_fee_amount"
"100";"2"
"total_sale_amount";"total_fee_amount";"total_return_amount";"total_reversal_amount";"total_tax_amount";"total_settlement_amount";"total_holdback_amount";"total_release_amount";"total_repay_amount";"total_commission_amount";"payment_reference";"payout_date"
"4660.00";"149.84";"1934.00";"0";"37.48";"2538.68";"0";"0";"0";"0";"123456789";"2026-07-03T00:00:00Z"
`

describe('Klarna', () => {
  it('läser utbetalningarna', () => {
    const p = parseKlarnaCsv(CSV)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ ref: '123456789', date: '2026-07-03', sale: 466000, ret: 193400, fee: 14984, tax: 3748, settle: 253868 })
  })
  it('kopplar utbetalningen till bankraden via referensnumret och bokar avgift och moms', () => {
    const st = createStore()
    st.companies.c1 = { co: { name: 'Butik AB', ind: 'shop', form: 'AB', channels: ['Klarna'] }, ver: [], inbox: [], learned: {}, psp: { klarna: parseKlarnaCsv(CSV) } }
    st.accounts.push({ id: 'a1', name: 'Företagskonto', bank: 'SEB', owner: 'c1' })
    st.pool.push({ id: 1, acc: 'a1', date: '2026-07-06', text: '123456789', amt: 253868, label: 'c1' })
    expect(applyKlarna(st, 'c1')).toBe(1)
    const it = st.companies.c1.inbox[0]
    const L = linesOf(it)
    expect(balanced(L)).toBe(true)
    expect(L.find(l => l.a === '6570')!.d).toBe(14984)
    expect(L.find(l => l.a === '2641')!.d).toBe(3748)
    expect(it.doc).toBe('Klarna avräkning 123456789')
  })
})
