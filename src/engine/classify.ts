import { SALESACC, VAT, isVat } from './accounts'
import type { AccType, Company, PoolRow, VatCode } from './types'
import { addDays, foodVat, supKey } from './util'

export interface Sug { acc: string; vat: VatCode; conf: number; why: string; need?: string; ask?: 0 | 1; rec?: number }
type Rule = [RegExp, 1 | -1, string, VatCode, number, string, string]

/** Regelmotorn från prototypen: första regeln som matchar text och tecken vinner. */
export const RULES: Rule[] =
[
 [/eget lån|ägarlån|lån från|lån till mig|aktieägar|privat utlägg|återbetalning lån/,1,'2893','0',.7,'Pengar från ägare eller närstående till bolaget. Det är ett lån (skuld), inte försäljning. Ingen moms.','Anteckning om vem som lånat ut'],
 [/eget lån|ägarlån|lån till mig|återbetalning lån|amortering lån/,-1,'2893','0',.7,'Återbetalning av lån till ägare eller närstående. Minskar skulden, ingen kostnad och ingen moms.','Anteckning om lånet'],
 [/ränta/,-1,'8420','0',.75,'Räntekostnad. Räntor är momsfria.','Låneavtal eller räntebesked'],
 [/försäkring/,-1,'6310','0',.85,'Försäkringar är momsfria.','Försäkringsbrev eller faktura'],
 [/bensin|drivmedel|circle k|preem|okq8|ingo|st1/,-1,'5611','25',.78,'Drivmedel, 25 % moms. Avdrag förutsätter att bilen används i verksamheten.','Kvitto'],
 [/hotell|scandic|strawberry|elite hotel/,-1,'5800','12',.8,'Hotell har 12 % moms.','Kvitto eller faktura'],
 [/taxi|uber|bolt|sj |skånetrafiken|dsb|tåg|flyg|sas|norwegian/,-1,'5800','6',.72,'Persontransport har 6 % moms i Sverige. Utrikes resor kan sakna svensk moms.','Kvitto'],
 [/foodora|wolt|avhämt|take ?away/,1,'3003','6',.82,'Mat för avhämtning eller leverans räknas som livsmedel: 6 % moms 1 april 2026–31 december 2027. Plattformens provision bör bokas separat.','Utbetalningsspecifikation från plattformen'],
 [/klarna|stripe|swish handel|swish/,1,'3001','25',.78,'Inbetalning från betalleverantör. Bokas som försäljning 25 % eftersom ingen försäljningsrapport finns för kanalen.','Specifikation över vilka ordrar betalningen gäller'],
 [/grossist|snabbgross|livsmedel|råvar|kaffe/,-1,'4010','6',.84,'Inköp av livsmedel: 6 % ingående moms sedan 1 april 2026.','Faktura med momsbelopp'],
 [/lunch|middag|representation|restaurangbesök/,-1,'6071','12',.55,'Representation har begränsad avdragsrätt.','Kvitto samt syfte och deltagare'],
 [/inköp varor|leverantör inköp/,-1,'4010','25',.8,'Inköp av handelsvaror för vidareförsäljning, 25 % moms.','Faktura med momsbelopp'],
 [/hyra|fastighet/,-1,'5010','25',.66,'Lokalhyra. 25 % moms bara om hyresvärden är frivilligt momsregistrerad.','Hyresavi som visar moms'],
 [/e\.?on|elbolag|ellevio|vattenfall|\bel\b/,-1,'5020','25',.85,'Elkostnad, 25 % moms.','Elfaktura'],
 [/postnord|dhl|frakt|schenker|budbee|instabox/,-1,'5710','25',.86,'Frakt och transport, 25 % moms.','Fraktfaktura'],
 [/google|meta|facebook|annons/,-1,'5910','RC25',.76,'Annonsering från bolag i annat EU-land: omvänd skattskyldighet. Du redovisar själv utgående och ingående moms.','Faktura med leverantörens EU-momsnummer'],
 [/shopify|abonnemang/,-1,'6540','RC25',.74,'Programvara från utländsk leverantör inom EU: omvänd skattskyldighet.','Faktura med leverantörens momsnummer'],
 [/telia|tele2|telenor|mobil/,-1,'6212','25',.88,'Mobilabonnemang, 25 % moms.','Faktura'],
 [/bankavgift|månadsavgift/,-1,'6570','0',.93,'Bankavgifter är momsfria. Kontoutdraget räcker som underlag.',''],
 [/skatteverket|skattekonto/,-1,'1630','0',.9,'Insättning på skattekontot. Ingen kostnad och ingen moms.',''],
 [/\blön/,-1,'7010','0',.6,'Förenklat: lönen bokas netto. Riktig lönebokföring kräver källskatt och arbetsgivaravgifter.','Lönespecifikation'],
 [/kontor|papper|skrivare/,-1,'6110','25',.82,'Kontorsmaterial, 25 % moms.','Kvitto'],
 [/förpackning|engångs|servett/,-1,'5460','25',.8,'Förbrukningsmaterial, 25 % moms.','Faktura'],
 [/ikea|inventari|stol|bord/,-1,'5410','25',.7,'Inventarier med kort livslängd eller lågt värde kan kostnadsföras direkt.','Kvitto']]

const hasReports = (c: Company, ch: string) => c.ver.some(v => (v as { meta?: { ch?: string } }).meta?.ch === ch)

export function classify(tx: { text: string; amt: number }, c: Company): Sug {
  const t = tx.text.toLowerCase(), sg = tx.amt > 0 ? 1 : -1
  for (const ch of ['Zettle', 'Shopify']) if (sg > 0 && t.includes(ch.toLowerCase())) {
    if (hasReports(c, ch)) return { acc: '1580', vat: '0', conf: 0.93, why: `Utbetalning från ${ch}. Försäljningen bokas från ${ch}-rapporten, så det här är en betalning och inte en ny intäkt.`, need: 'Utbetalningsspecifikation' }
    return { acc: '3001', vat: '25', conf: 0.45, why: `Ingen ${ch}-rapport är importerad. Importera försäljningsrapporten under Försäljning, så bokas utbetalningen mot 1580 i stället för som ny intäkt.`, need: 'Försäljningsrapport' }
  }
  let base: Sug | null = null
  for (const r of RULES) if (r[0].test(t) && r[1] === sg) { base = { acc: r[2], vat: r[3], conf: r[4], why: r[5], need: r[6] }; break }
  if (!base) base = sg > 0
    ? { acc: '3001', vat: '25', conf: 0.3, why: 'Okänd inbetalning. Antar försäljning 25 %. Granska noga.', need: 'Vad betalningen avser' }
    : { acc: '6990', vat: '25', conf: 0.3, why: 'Ingen regel matchade. Välj konto och momssats själv.', need: 'Kvitto eller faktura och vad köpet avser' }
  const L = c.learned[supKey(tx.text)]
  if (L && L.sg === sg) return { ...base, acc: L.acc, vat: L.vat, conf: Math.max(0.9, base.conf), why: `Återkommande leverantör: samma kontering som du godkände i V${L.last}. ${base.why}`, rec: L.count }
  return base
}

/** Kategorier från användarens egen Excel (kolumnen Kategori). */
type CatTarget = [RegExp, string, (VatCode | 'food')?]
export const CATMAP: CatTarget[] = [
  [/^kontrollera|^kvitto$|^mat$|representation|^oklart|^annan$|^övrigt$|^vet ej/i, 'ASK'], [/ingrediens|råvar|inköp mat/i, '4010', 'food'], [/vmb/i, '4010', '0'],
  [/^inköp|köksmaskin|inventarie/i, '4010', '25'], [/programvara|mjukvara/i, '5420', '25'], [/frakt/i, '5710', '25'], [/bankavgift/i, '6570', '0'], [/ränta/i, '8420', '0'],
  [/privat lån|ägarutlägg/i, '2893', '0'], [/^lån/i, '2350', '0'], [/marknadsföring|annons/i, '5910', '25'], [/drivmedel|bensin/i, '5611', '25'], [/^el$/i, '5020', '25'],
  [/hyra/i, '5010', '25'], [/resa|parkering/i, '5800', '25'], [/förbrukning/i, '5460', '25'], [/tele|internet/i, '6212', '25'], [/^lön/i, '7010', '0'],
  [/avfall|vatten|städ/i, '5060', '25'], [/^försäljning|^inbetalning/i, 'SALE'], [/överföring/i, 'ASK'], [/^skatt|moms/i, '1630', '0'],
]

export function catSug(r: { cat?: string; amt: number; date: string }, c: Company): Partial<Sug> | null {
  const cat = (r.cat || '').trim()
  if (!cat) return null
  for (const [re, acc, vat] of CATMAP) {
    if (!re.test(cat)) continue
    if (acc === 'ASK') return { ask: 1 }
    if (acc === 'SALE') {
      if (r.amt < 0) return { ask: 1 }
      const v = c.co.ind === 'rest' ? '12' : '25'
      return { acc: SALESACC[v], vat: v, conf: 0.6, why: `Din kategori: ${cat}. Pengar in från försäljning. Finns en försäljningsrapport (Zettle, kassa, Shopify) ska rapporten bokas i stället, så att momsen blir rätt.`, need: 'Försäljningsrapport' }
    }
    if (acc === '2350') return { acc, vat: '0', conf: 0.75, why: r.amt > 0 ? `Din kategori: ${cat}. Lån som kommer in är en skuld, inte en intäkt.` : `Din kategori: ${cat}. Amortering minskar skulden. Ingår ränta ska den delen bokas som räntekostnad.`, need: 'Låneavtal eller avbetalningsplan' }
    return { acc, vat: vat === 'food' ? foodVat(r.date) : (vat as VatCode), conf: 0.85, why: `Din kategori: ${cat}.` }
  }
  return { ask: 1 }
}

export interface OpenInvoice { nr: string; cust: string; amt: number; date: string }
export function openInvoices(c: Company): OpenInvoice[] {
  const inv: Record<string, OpenInvoice> = {}, paid = new Set<string>()
  c.ver.forEach(v => {
    let m = v.text.match(/^Kundfaktura till (.+?), (\d+)\s*$/)
    if (m) { const l = v.lines.find(l => l.a === '1510'); if (l) inv[m[2]] = { nr: m[2], cust: m[1].replace(/^\d+\s+/, ''), amt: l.d - l.c, date: v.date } }
    m = v.text.match(/^(Inbetalning från|Kreditfaktura till) .+?, (\d+)\s*$/)
    if (m) paid.add(m[2])
  })
  return Object.values(inv).filter(x => !paid.has(x.nr) && x.amt > 0)
}

const ZERO = ['6570', '2893', '2350', '8420', '7010', '1630']

/** Förslag för en bankrad, i samma prioritetsordning som prototypen v3.6. */
export function suggest(r: PoolRow, c: Company, acc: Record<string, [string, AccType]>): Sug {
  const s = classify(r, c)
  if (r.bas && acc[r.bas]) return { ...s, acc: r.bas, vat: isVat(r.vat) ? r.vat : ZERO.includes(r.bas) ? '0' : s.vat, conf: 1, why: 'Ditt svar' + (r.ans ? `: ${r.ans}` : '') + '.', ask: 0 }
  const k = supKey(r.text), L = c.learned[k]
  if (L && L.count >= 1 && (L.sg || 0) === (r.amt > 0 ? 1 : -1) && acc[L.acc]) return { ...s, acc: L.acc, vat: L.vat, conf: 0.95, why: 'Samma som du har svarat tidigare.', ask: 0 }
  if (r.amt > 0) {
    const inv = openInvoices(c).find(x => x.amt === r.amt && x.date <= addDays(r.date, 3))
    if (inv) return { ...s, acc: '1510', vat: '0', conf: 0.92, ask: 0, why: `Betalning av kundfaktura ${inv.nr} till ${inv.cust} (${inv.date}), som är obetald i bokföringen.`, need: '' }
  }
  if (r.amt > 0 && /^BG \d{3,4}-\d{4}/.test(r.text.trim())) return { ...s, acc: '1580', vat: '0', conf: 0.4, ask: 1, why: 'Insättning till bankgirot. Det kan vara en utbetalning från Zettle eller Shopify, eller en betald kundfaktura. Vad var det?' }
  if (r.amt > 0 && /zettle|izettle/i.test(r.text) && !/kortavgift/i.test(r.text)) return { ...s, acc: '1580', vat: '0', conf: 0.9, why: 'Utbetalning från Zettle. Försäljningen bokas från Zettle-rapporten mot 1580, så här bokas bara att pengarna kommer in.', need: 'Zettle-rapport för perioden', ask: 0 }
  const H = c.hist?.[k + '|' + (r.amt > 0 ? 1 : -1)]
  if (H && acc[H.acc]) return { ...s, acc: H.acc, vat: VAT[H.vat] ? H.vat : '0', conf: H.n >= 3 ? 0.9 : 0.75, why: `Så har du bokfört det tidigare (${H.ex}, ${H.n} ${H.n > 1 ? 'gånger' : 'gång'}).`, ask: 0, need: s.need }
  const cs = catSug(r, c)
  if (cs && cs.ask) {
    if (s.conf >= 0.85 && !/^kontrollera/i.test(r.cat || '')) return { ...s, ask: 0 }
    return { ...s, ask: 1, conf: Math.min(s.conf, 0.5), why: (r.cat ? `Du har markerat raden "${r.cat}". ` : '') + 'DTRAN behöver veta vad det var.' }
  }
  if (cs) {
    if (s.vat === 'RC25' && s.conf >= 0.7 && !ZERO.includes(cs.acc!)) return { ...s, ...cs, vat: 'RC25', why: cs.why + ' Utländsk leverantör: omvänd moms.', ask: 0 } as Sug
    return { ...s, ...cs, ask: 0 } as Sug
  }
  return { ...s, ask: s.conf < 0.6 ? 1 : 0 }
}

/** Händelser på Skatteverkets skattekonto. */
export function skvSug(text: string): { acc: string; vat: VatCode; why: string } | null {
  const t = text.toLowerCase()
  if (/preliminärskatt/.test(t)) return { acc: '2510', vat: '0', why: 'Debiterad eller tillgodoförd preliminärskatt bokas mot skatteskulder.' }
  if (/kostnadsränta/.test(t)) return { acc: '8423', vat: '0', why: 'Kostnadsränta på skattekontot. Den är inte avdragsgill.' }
  if (/intäktsränta/.test(t)) return { acc: '8314', vat: '0', why: 'Intäktsränta på skattekontot är skattefri.' }
  if (/moms/.test(t) && !/avgift/.test(t)) return { acc: '2650', vat: '0', why: 'Moms som dras från skattekontot bokas mot momsredovisningskontot.' }
  if (/arbetsgivaravgift/.test(t)) return { acc: '2731', vat: '0', why: 'Arbetsgivaravgifter.' }
  if (/avdragen skatt/.test(t)) return { acc: '2710', vat: '0', why: 'Skatt som dragits på lön.' }
  if (/förs.*avgift|förseningsavgift/.test(t)) return { acc: '6990', vat: '0', why: 'Förseningsavgift. Den är inte avdragsgill.' }
  if (/inbetalning|utbetalning/.test(t)) return { acc: '1930', vat: '0', why: 'Pengar mellan skattekontot och företagskontot.' }
  return null
}

export const KVOK = /^(digitalt|kvitto|kvittens|finns|kontant|faktura|ja)/i
export const kvDoc = (r: PoolRow) => (r.kv && KVOK.test(r.kv) ? `Underlag finns (${r.kv})` : null)
