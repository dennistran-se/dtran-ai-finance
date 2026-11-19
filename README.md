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

## Principer

- AI-text och bokföringslogik hålls isär. Konton, moms och belopp räknas alltid av motorn.
- Inget bokförs utan att användaren godkänner.
- Gamla verifikationer från Spiris eller Fortnox ändras aldrig.
- Inga påståenden om koppling till Skatteverket, banker eller laguppfyllelse förrän det finns.
