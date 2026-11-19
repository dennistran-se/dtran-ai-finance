import { describe, expect, it } from 'vitest'
import { balanced, makeLines, momsRep } from '../ledger'
import type { Company } from '../types'

const co = (): Company => ({ co: { name: 'Test AB', ind: 'rest', form: 'AB', channels: [] }, ver: [], inbox: [], learned: {} })

describe('makeLines', () => {
  it('delar upp ett köp med 25 % moms', () => {
    const L = makeLines(-12500, '5460', '25')
    expect(balanced(L)).toBe(true)
    expect(L).toEqual([{ a: '5460', d: 10000, c: 0 }, { a: '2641', d: 2500, c: 0 }, { a: '1930', d: 0, c: 12500 }])
  })
  it('bokar omvänd skattskyldighet med 2645 och 2614', () => {
    const L = makeLines(-10000, '5910', 'RC25')
    expect(balanced(L)).toBe(true)
    expect(L.find(l => l.a === '2614')!.c).toBe(2500)
    expect(L.find(l => l.a === '2645')!.d).toBe(2500)
  })
  it('delar upp en försäljning med 12 % moms', () => {
    const L = makeLines(11200, '3002', '12')
    expect(L).toEqual([{ a: '1930', d: 11200, c: 0 }, { a: '3002', d: 0, c: 10000 }, { a: '2621', d: 0, c: 1200 }])
  })
})

describe('momsRep', () => {
  it('räknar rutorna 05, 11, 48 och 49', () => {
    const c = co()
    c.ver.push({ n: 1, date: '2025-02-01', text: 'Försäljning', lines: makeLines(11200, '3002', '12'), src: 'bank' })
    c.ver.push({ n: 2, date: '2025-02-02', text: 'Inköp', lines: makeLines(-12500, '5460', '25'), src: 'bank' })
    const r = momsRep(c, '2025-01-01', '2025-03-31')
    expect(r).toMatchObject({ r05: 10000, r11: 1200, r48: 2500, r49: -1300 })
  })
  it('hoppar över momsavräkningen och bokslutet', () => {
    const c = co()
    c.ver.push({ n: 1, date: '2025-02-01', text: 'Försäljning', lines: makeLines(11200, '3002', '12'), src: 'bank' })
    c.ver.push({ n: 2, date: '2025-03-31', text: 'Momsredovisning', lines: [{ a: '2621', d: 1200, c: 0 }, { a: '2650', d: 0, c: 1200 }], src: 'sie', kind: 'avr' })
    expect(momsRep(c, '2025-01-01', '2025-03-31').r11).toBe(1200)
  })
})
