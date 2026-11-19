import type { AccType, VatCode } from './types'

export const BASE_ACC: Record<string, [string, AccType]> = {
  '1580': ['Fordran betalleverantörer', 'A'], '1510': ['Kundfordringar', 'A'], '1630': ['Skattekonto', 'A'], '1910': ['Kassa', 'A'], '1930': ['Företagskonto', 'A'],
  '2010': ['Eget kapital', 'L'], '2081': ['Aktiekapital', 'L'], '2893': ['Skuld till ägare och närstående', 'L'], '2350': ['Skulder till kreditinstitut', 'L'], '2510': ['Skatteskulder', 'L'],
  '2710': ['Personalskatt', 'L'], '2731': ['Avräkning lagstadgade sociala avgifter', 'L'], '2091': ['Balanserad vinst', 'L'],
  '2611': ['Utgående moms 25 %', 'L'], '2614': ['Utgående moms omvänd skattskyldighet 25 %', 'L'], '2621': ['Utgående moms 12 %', 'L'], '2631': ['Utgående moms 6 %', 'L'],
  '2641': ['Ingående moms', 'L'], '2645': ['Beräknad ingående moms, förvärv utland', 'L'], '2650': ['Redovisningskonto för moms', 'L'],
  '3001': ['Försäljning 25 %', 'I'], '3002': ['Försäljning 12 %', 'I'], '3003': ['Försäljning 6 %', 'I'],
  '4010': ['Inköp varor och material', 'E'], '5010': ['Lokalhyra', 'E'], '5020': ['El', 'E'], '5410': ['Förbrukningsinventarier', 'E'], '5460': ['Förbrukningsmaterial', 'E'],
  '5420': ['Programvaror', 'E'], '5060': ['Städning och renhållning', 'E'], '5710': ['Frakter och transporter', 'E'], '5611': ['Drivmedel', 'E'], '5800': ['Resekostnader', 'E'],
  '5910': ['Annonsering', 'E'], '6310': ['Företagsförsäkringar', 'E'], '6071': ['Representation', 'E'], '6110': ['Kontorsmateriel', 'E'], '6212': ['Mobiltelefon', 'E'],
  '6540': ['IT-tjänster', 'E'], '6570': ['Bank- och betalavgifter', 'E'], '6990': ['Övriga externa kostnader', 'E'], '7010': ['Löner', 'E'],
  '8420': ['Räntekostnader', 'E'], '8423': ['Kostnadsränta för skatter och avgifter', 'E'], '8314': ['Skattefria ränteintäkter', 'I'],
}

export const VATACC = ['2611', '2614', '2621', '2631', '2641', '2645', '2650']
export const VAT: Record<VatCode, { r: number; out?: string; l: string; rc?: 1 }> = {
  '25': { r: 0.25, out: '2611', l: '25 %' }, '12': { r: 0.12, out: '2621', l: '12 %' }, '6': { r: 0.06, out: '2631', l: '6 %' },
  '0': { r: 0, l: 'Ingen moms' }, 'RC25': { r: 0.25, rc: 1, l: 'Omvänd 25 % (EU-tjänst)' },
}
export const isVat = (v: unknown): v is VatCode => typeof v === 'string' && v in VAT
export const SALESACC: Record<'25' | '12' | '6', string> = { '25': '3001', '12': '3002', '6': '3003' }
/** Konton där kvitto inte behövs (kontoutdraget räcker). */
export const NODOC = ['6570', '1630', '7010', '1580', '2893', '8420']

export function accType(a: string): AccType {
  const n = +a
  return n < 2000 ? 'A' : n < 3000 ? 'L' : n < 4000 ? 'I' : n >= 8000 && n < 8400 ? 'I' : 'E'
}
export const isBankAcc = (a: string) => /^19[0-9]{2}$/.test(a)
