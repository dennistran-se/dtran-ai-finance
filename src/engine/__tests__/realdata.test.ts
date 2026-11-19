/**
 * Jämför motorn med prototypen v3.6 på riktiga filer. Filerna ligger i data-local/,
 * som aldrig checkas in. Utan filerna hoppas testet över.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createStore, decodeSie, importRows, importSIE, parseSIE, reconcile, sheetRows } from '../index'
import { LOCAL, hasLocal, readBook } from './helpers'

const ok = hasLocal('alla_konton_2025.xlsx') && hasLocal('20250101-20251231.se')

describe.skipIf(!ok)('riktiga data: LDG 2025 (samma siffror som prototypen v3.6)', () => {
  it('stämmer av banken mot SIE-filen', () => {
    const st = createStore()
    const xl = sheetRows(readBook(LOCAL + 'alla_konton_2025.xlsx'))!
    importRows(st, xl.rows, { industries: { 'South Soles AB': 'shop' } })
    const o = parseSIE(decodeSie(new Uint8Array(readFileSync(LOCAL + '20250101-20251231.se'))))
    const { cid } = importSIE(st, o)
    const r = reconcile(st, cid)!
    const c = st.companies[cid]
    console.log('LDG 2025', { match: r.match, date: r.date, grupp: r.grupp, saknas: r.saknas, sumSaknas: r.sumSaknas, orphan: r.orphanN, booked: r.booked, inbox: c.inbox.length, ask: c.inbox.filter(i => i.ask).length, hist: Object.keys(c.hist!).length, ver: c.ver.length })
    expect(xl.rows.length).toBe(3560)
    expect({ match: r.match, date: r.date, grupp: r.grupp, saknas: r.saknas, orphan: r.orphanN, booked: r.booked }).toEqual({ match: 1046, date: 1, grupp: 167, saknas: 25, orphan: 2, booked: 1187 })
    expect(Math.round(r.sumSaknas / 100)).toBe(-15120)
    expect(c.ver.length).toBe(2069)
    expect(c.inbox.length).toBe(33)
    expect(c.inbox.filter(i => i.ask).length).toBe(5)
  })
})

const ok2 = ok && hasLocal('ss_bank_2026q3.xlsx') && hasLocal('klarna2025.csv') && hasLocal('klarna2026.csv')
describe.skipIf(!ok2)('riktiga data: South Soles och Klarna (samma siffror som prototypen v3.6)', () => {
  it('kopplar Klarnas utbetalningar till bankraderna', async () => {
    const { parseKlarnaCsv, applyKlarna, linesOf, balanced } = await import('../index')
    const st = createStore()
    importRows(st, sheetRows(readBook(LOCAL + 'alla_konton_2025.xlsx'))!.rows, { industries: { 'South Soles AB': 'shop' } })
    importRows(st, sheetRows(readBook(LOCAL + 'ss_bank_2026q3.xlsx'))!.rows)
    const cid = Object.keys(st.companies).find(id => /South/.test(st.companies[id].co.name))!
    const c = st.companies[cid]
    const pays = [...parseKlarnaCsv(readFileSync(LOCAL + 'klarna2025.csv', 'utf8')), ...parseKlarnaCsv(readFileSync(LOCAL + 'klarna2026.csv', 'utf8'))]
    c.psp = { klarna: [...new Map(pays.map(p => [p.ref, p])).values()].sort((a, b) => (a.date < b.date ? -1 : 1)) }
    expect(c.psp.klarna!.length).toBe(65)
    expect(applyKlarna(st, cid)).toBe(38)
    const kl = c.inbox.filter(i => /^Klarna utbetalning/.test(i.text))
    expect(kl.length).toBe(38)
    expect(kl.every(i => balanced(linesOf(i)))).toBe(true)
  })
})
