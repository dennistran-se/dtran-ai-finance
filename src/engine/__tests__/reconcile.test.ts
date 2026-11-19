import { describe, expect, it } from 'vitest'
import { createStore, importSIE, parseSIE, reconcile, type PoolRow } from '../index'

const ver = (n: number, date: string, text: string, bank: number, acc: string) =>
  `#VER A ${n} ${date.replace(/-/g, '')} "${text}"\n{\n #TRANS 1930 {} ${(bank / 100).toFixed(2)}\n #TRANS ${acc} {} ${(-bank / 100).toFixed(2)}\n}\n`

function setup() {
  const sie = `#FNAMN "Exempel AB"\n#ORGNR 556677-8899\n#RAR 0 20250101 20251231\n#KONTO 4010 "Inköp"\n#KONTO 3002 "Försäljning"\n#KONTO 1510 "Kundfordringar"\n` +
    ver(1, '2025-03-03', 'Snabbgross', -50000, '4010') +
    ver(2, '2025-03-10', 'Hyra', -800000, '5010') +
    ver(3, '2025-03-12', 'Swish Försäljning 12%', 45000, '3002') +
    ver(4, '2025-03-20', 'Inbetalning från Kund A, 11', 29000, '1510') +
    ver(5, '2025-03-20', 'Inbetalning från Kund B, 12', 21000, '1510')
  const st = createStore()
  const { cid } = importSIE(st, parseSIE(sie))
  st.accounts.push({ id: 'a1', name: 'Företagskonto', bank: 'SEB', owner: cid })
  const row = (date: string, text: string, amt: number): PoolRow => ({ id: st.pid++, acc: 'a1', date, text, amt, label: cid })
  st.pool.push(
    row('2025-03-04', 'SNABBGROSS', -50000), // samma belopp, 1 dag
    row('2025-03-25', 'HYRA', -800000), // samma belopp, 15 dagar
    row('2025-03-12', 'Swish från A', 20000), row('2025-03-12', 'Swish från B', 25000), // två Swish = en verifikation
    row('2025-03-21', 'BM 0001', 50000), // en insättning = två fakturabetalningar
    row('2025-03-28', 'OKÄND BUTIK', -12300), // saknas
  )
  return { st, cid }
}

describe('avstämning', () => {
  it('hittar exakta, förskjutna, samlade och saknade rader', () => {
    const { st, cid } = setup()
    const r = reconcile(st, cid)!
    expect(r).toMatchObject({ match: 1, date: 1, grupp: 3, saknas: 1, sumSaknas: -12300, orphanN: 0 })
    const s = Object.fromEntries(st.pool.map(p => [p.text, p.rec!.st]))
    expect(s).toEqual({ SNABBGROSS: 'match', HYRA: 'date', 'Swish från A': 'grupp', 'Swish från B': 'grupp', 'BM 0001': 'grupp', 'OKÄND BUTIK': 'saknas' })
  })
  it('skapar bara förslag för det som saknas, och lär sig av historiken', () => {
    const { st, cid } = setup()
    reconcile(st, cid)
    const inbox = st.companies[cid].inbox
    expect(inbox).toHaveLength(1)
    expect(inbox[0].text).toBe('OKÄND BUTIK')
    expect(st.companies[cid].hist!['snabbgross|-1'].acc).toBe('4010')
  })
})
