import { readFileSync, existsSync } from 'node:fs'
import * as XLSX from 'xlsx'

/** Läser ett kalkylark till rader per blad (samma inställningar som appen). */
export function readBook(path: string, raw = true) {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: true })
  return wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw, defval: null }) }))
}
export function readCsvBook(path: string) {
  const txt = readFileSync(path, 'utf8')
  const wb = XLSX.read(txt, { type: 'string', raw: true, cellDates: true })
  return wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: null }) }))
}
export const LOCAL = new URL('../../../data-local/', import.meta.url).pathname
export const hasLocal = (f: string) => existsSync(LOCAL + f)
