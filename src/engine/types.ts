/** Alla belopp är i öre (heltal). Datum är ISO-strängar YYYY-MM-DD. */
export type VatCode = '25' | '12' | '6' | '0' | 'RC25'
export type AccType = 'A' | 'L' | 'I' | 'E'

export interface Line { a: string; d: number; c: number; td?: string; tt?: string }

export interface Voucher {
  n: number
  date: string
  text: string
  lines: Line[]
  src: 'bank' | 'sie' | 'system' | 'kvitto' | 'rapport' | string
  kind?: '' | 'ib' | 'avr' | 'bokslut' | string
  sie?: string
  sid?: string
  doc?: string | null
  need?: string
  pool?: number | null
  corrected?: boolean
  meta?: { ch?: string } | null
}

export interface Suggestion {
  id: number
  pool?: number
  date: string
  text: string
  amt: number
  src: string
  from?: string
  acc: string
  vat: VatCode
  conf: number
  why: string
  need?: string
  ask?: 0 | 1
  doc?: string | null
  kv?: string
  dup?: string
  cp?: string
  lines?: Line[]
}

export interface Learned { acc: string; vat: VatCode; sg: 1 | -1; last: number; count: number }
export interface HistEntry { acc: string; vat: VatCode; n: number; ex: string; cnt: Record<string, number> }

export interface KlarnaPayout {
  ref: string; date: string; sale: number; fee: number; ret: number; rev: number; tax: number
  settle: number; hold: number; rel: number; repay: number; comm: number; row?: number | null
}

export interface ZettleReport {
  name: string; org: string; from: string; to: string
  excl?: number; vat?: number; incl?: number; ret?: number; total?: number
  rates: { rate: number; excl: number; vat: number; incl: number }[]
  fees: number; net: number; cash: number
}

export interface Recon {
  match: number; date: number; grupp: number; saknas: number; sumSaknas: number; booked: number
  orphan: { date: string; text: string; amt: number; v: string; acc: string }[]
  orphanN: number; accs: string[]
}

export interface CompanyInfo {
  name: string
  orgnr?: string
  ind: 'rest' | 'shop'
  form: 'AB' | 'EF' | string
  channels: string[]
  fyStart?: number
  sie?: Record<string, { n: number }>
}

export interface Company {
  co: CompanyInfo
  ver: Voucher[]
  inbox: Suggestion[]
  learned: Record<string, Learned>
  hist?: Record<string, HistEntry>
  psp?: { klarna?: KlarnaPayout[]; zettle?: ZettleReport[] }
  recon?: Recon
}

export interface BankAccount { id: string; name: string; bank: string; owner: string; bas?: string }

export type RecStatus = 'match' | 'date' | 'grupp' | 'saknas'

export interface PoolRow {
  id: number
  acc: string
  date: string
  text: string
  amt: number
  /** bolagets id, 'privat', 'skip' eller null (ej sorterad) */
  label: string | null
  cat?: string; kv?: string; note?: string; typ?: string
  bas?: string; vat?: string; ans?: string
  xl?: 1
  rec?: { st: RecStatus; v?: string; d?: number; vt?: string; g?: number } | null
  psp?: { ch: 'Klarna'; ref: string }
}

export interface Store {
  companies: Record<string, Company>
  accounts: BankAccount[]
  pool: PoolRow[]
  /** konton som lagts till från SIE-filer */
  accx: Record<string, [string, AccType]>
  lrules: Record<string, string>
  pid: number
  aid: number
  uid: number
}
