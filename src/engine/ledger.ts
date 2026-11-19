import { VAT } from './accounts'
import type { AccType, Company, Line, Suggestion, VatCode } from './types'

export const cashOf = (L: Line[]) => L.reduce((s, l) => s + (l.a === '1930' || l.a === '1910' ? l.d - l.c : 0), 0)
export const balanced = (L: Line[]) => L.length > 1 && L.reduce((s, l) => s + l.d - l.c, 0) === 0

/** Saldo (debet minus kredit) för ett konto. Bokslutsverifikationer räknas inte på resultatkonton. */
export function bal(c: Company, acc: string, from?: string | null, to?: string | null, skipAvr = false): number {
  let s = 0
  const res = +acc >= 3000
  for (const v of c.ver) {
    if (from && v.date < from) continue
    if (to && v.date > to) continue
    if (skipAvr && v.kind === 'avr') continue
    if (res && v.kind === 'bokslut') continue
    for (const l of v.lines) if (l.a === acc) s += l.d - l.c
  }
  return s
}

export function sumType(c: Company, acc: Record<string, [string, AccType]>, type: AccType, f?: string, t?: string) {
  return Object.keys(acc).filter(a => acc[a][1] === type).reduce((s, a) => s + bal(c, a, f, t), 0)
}
export const result = (c: Company, acc: Record<string, [string, AccType]>, f?: string, t?: string) =>
  -sumType(c, acc, 'I', f, t) - sumType(c, acc, 'E', f, t)

export interface MomsReport { r05: number; r10: number; r11: number; r12: number; r21: number; r30: number; r48: number; r49: number }
export function momsRep(c: Company, f: string, t: string): MomsReport {
  const b = (a: string) => bal(c, a, f, t, true)
  const r05 = -(b('3001') + b('3002') + b('3003')), r10 = -b('2611'), r11 = -b('2621'), r12 = -b('2631'), r30 = -b('2614'), r48 = b('2641') + b('2645')
  return { r05, r10, r11, r12, r30, r48, r21: Math.round(r30 / 0.25), r49: r10 + r11 + r12 + r30 - r48 }
}

/** Konteringsrader för ett belopp med konto och momskod (bank 1930 som motkonto). */
export function makeLines(amt: number, acc: string, code: VatCode, vatAmt?: number | null): Line[] {
  const g = Math.abs(amt), v = VAT[code], L: Line[] = []
  if (amt > 0) {
    const r = v.rc ? 0 : v.r, m = vatAmt != null && r ? vatAmt : g - Math.round(g / (1 + r)), net = g - m
    L.push({ a: '1930', d: g, c: 0 }, { a: acc, d: 0, c: net })
    if (m) L.push({ a: v.out!, d: 0, c: m })
  } else if (v.rc) {
    const m = Math.round(g * 0.25)
    L.push({ a: acc, d: g, c: 0 }, { a: '2645', d: m, c: 0 }, { a: '2614', d: 0, c: m }, { a: '1930', d: 0, c: g })
  } else {
    const m = vatAmt != null && v.r ? vatAmt : g - Math.round(g / (1 + v.r)), net = g - m
    L.push({ a: acc, d: net, c: 0 })
    if (m) L.push({ a: '2641', d: m, c: 0 })
    L.push({ a: '1930', d: 0, c: g })
  }
  return L
}
export const swapCp = (L: Line[], cp?: string) => (cp ? L.map(l => (l.a === '1930' ? { ...l, a: cp } : l)) : L)
export const linesOf = (i: Suggestion) => i.lines || swapCp(makeLines(i.amt, i.acc, i.vat), i.cp)
