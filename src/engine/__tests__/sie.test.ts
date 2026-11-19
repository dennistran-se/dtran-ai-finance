import { describe, expect, it } from 'vitest'
import { createStore, importSIE, parseSIE } from '../index'

const SIE = `#FLAGGA 0
#FORMAT PC8
#SIETYP 4
#FNAMN "Exempel AB"
#ORGNR 556677-8899
#RAR 0 20250101 20251231
#KONTO 1930 "Företagskonto"
#KONTO 3002 "Försäljning 12 %"
#KONTO 2621 "Utgående moms 12 %"
#IB 0 1930 1000.00
#VER A 1 20250105 "Swish \\"dag\\" 12%"
{
   #TRANS 1930 {} 336.00 20250105 "Swish"
   #TRANS 3002 {} -300.00
   #TRANS 2621 {} -36.00
}
`

describe('SIE', () => {
  it('läser bolag, år, konton, ingående balans och verifikationer', () => {
    const o = parseSIE(SIE)
    expect(o.name).toBe('Exempel AB')
    expect(o.orgnr).toBe('556677-8899')
    expect(o.years['0']).toEqual(['20250101', '20251231'])
    expect(o.ib).toEqual([{ a: '1930', amt: 100000 }])
    expect(o.vers).toHaveLength(1)
    expect(o.vers[0].text).toBe('Swish "dag" 12%')
    expect(o.vers[0].lines[0]).toMatchObject({ a: '1930', d: 33600, td: '2025-01-05', tt: 'Swish' })
  })
  it('läser inte in samma verifikation två gånger', () => {
    const st = createStore()
    const a = importSIE(st, parseSIE(SIE)), b = importSIE(st, parseSIE(SIE))
    expect(a.add).toBe(1)
    expect(b.add).toBe(0)
    expect(st.companies[a.cid].ver).toHaveLength(2) // ingående balans + A1
  })
})
