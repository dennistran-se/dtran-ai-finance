# DTRAN AI Finance

Ladda upp dina underlag och få hjälp att förbereda din bokföring.

Det här repot innehåller React-versionen (Vite, React och TypeScript). Den nuvarande prototypen finns i `legacy/prototyp-v3.6.html` som referens.

## Kom igång

```bash
npm install
npm run dev     # öppna adressen som visas, oftast http://localhost:5173
npm test        # kör testerna för bokföringsmotorn
npm run build   # bygger appen till mappen dist
```

## Struktur

- `src/engine/` – bokföringsmotorn utan gränssnitt: verifikationer, moms, SIE, avstämning, Klarna och Zettle. Allt räknas i öre.
- `src/screens/` – skärmarna: Hem, Att göra, Alla rader, Skatteverket och Inställningar.
- `data-local/` – plats för egna testfiler. Mappen och alla .se-, .xlsx- och .csv-filer ignoreras av git så att riktig bokföring aldrig laddas upp.

## Motorn (`src/engine/`)

| Fil | Vad den gör |
|---|---|
| `types.ts` | Datatyper: bolag, verifikationer, bankrader och förslag |
| `accounts.ts` | BAS-konton, momskoder och kontotyper |
| `ledger.ts` | Saldo, resultat, momsrapport (ruta 05–49) och konteringsrader |
| `classify.ts` | Förslag på konto och moms: regler, egna kategorier, historik och skattekontot |
| `sie.ts` | Läser SIE4 från Spiris eller Fortnox (PC8/CP437) |
| `reconcile.ts` | Avstämning bank mot bokföring: exakt, annat datum, samlade verifikationer och saknade |
| `psp.ts` | Klarnas avräkningar och Zettles försäljningsrapport |
| `sheets.ts` | Läser kalkylark och CSV, även Skatteverkets "Bokförda transaktioner" |
| `importRows.ts` | Lägger in bankrader, skapar bolag och konton och gör förslag |
| `store.ts` | Bankrader, förslag och godkännande |

Testerna i `src/engine/__tests__/` körs med `npm test`. `realdata.test.ts` jämför motorn med prototypen v3.6 på riktiga filer i `data-local/`. Testet hoppas över om filerna inte finns.

## Principer

- AI-text och bokföringslogik hålls isär. Konton, moms och belopp räknas alltid av motorn.
- Inget bokförs utan att användaren godkänner.
- Gamla verifikationer från Spiris eller Fortnox ändras aldrig.
- Inga påståenden om koppling till Skatteverket, banker eller laguppfyllelse förrän det finns.
