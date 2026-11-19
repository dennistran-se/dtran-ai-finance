import { describe, expect, it } from 'vitest'
import { BASE_ACC, catSug, skvSug, suggest, type Company, type PoolRow } from '../index'

const c: Company = { co: { name: 'Mat AB', ind: 'rest', form: 'AB', channels: [] }, ver: [], inbox: [], learned: {} }
const row = (o: Partial<PoolRow>): PoolRow => ({ id: 1, acc: 'a1', date: '2025-05-01', text: 'X', amt: -10000, label: 'c1', ...o })

describe('förslag', () => {
  it('ger 12 % moms på råvaror 2025 och 6 % efter 1 april 2026', () => {
    expect(catSug(row({ cat: 'Inköp råvaror', date: '2025-05-01' }), c)).toMatchObject({ acc: '4010', vat: '12' })
    expect(catSug(row({ cat: 'Inköp råvaror', date: '2026-05-01' }), c)).toMatchObject({ acc: '4010', vat: '6' })
  })
  it('frågar när raden är markerad Kontrollera', () => {
    expect(suggest(row({ text: 'MAXI ICA', cat: 'Kontrollera' }), c, BASE_ACC).ask).toBe(1)
  })
  it('användarens eget svar vinner', () => {
    const s = suggest(row({ text: 'MAXI ICA', cat: 'Kontrollera', bas: '4010', vat: '12', ans: 'Råvaror' }), c, BASE_ACC)
    expect(s).toMatchObject({ acc: '4010', vat: '12', conf: 1, ask: 0 })
  })
  it('frågar om insättningar till bankgirot', () => {
    expect(suggest(row({ text: 'BG 1234-5678', amt: 50000 }), c, BASE_ACC)).toMatchObject({ ask: 1 })
  })
  it('känner igen händelser på skattekontot', () => {
    expect(skvSug('Debiterad preliminärskatt')!.acc).toBe('2510')
    expect(skvSug('Kostnadsränta')!.acc).toBe('8423')
  })
})
