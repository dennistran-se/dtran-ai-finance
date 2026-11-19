export const pad = (n: number) => String(n).padStart(2, '0')
export const lastDay = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
/** Antal dagar mellan två datum, alltid positivt (samma som prototypen). */
export const dd = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10)
export const kr2 = (o: number) => (o / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const kr = (o: number) => (Math.round(o / 100) || 0).toLocaleString('sv-SE') + ' kr'

/** Nyckel för en motpart: de två första orden med minst tre bokstäver. */
export function supKey(t: string): string {
  return t.toLowerCase().replace(/[0-9.,:;#\-–/]+/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 2).join(' ')
}

export function xDate(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
  if (typeof v === 'number') {
    if (v > 19000000 && v < 21000000) { const s = String(Math.round(v)); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` }
    if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10)
    return ''
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

export function xAmt(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Math.round(v * 100)
  let s = String(v).replace(/\s|kr|sek/gi, '').replace(/−/g, '-')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? null : Math.round(n * 100)
}

export const foodVat = (d: string): '6' | '12' => (d >= '2026-04-01' && d <= '2027-12-31' ? '6' : '12')
