## Labb 1 – Import av produktdata

Admin importerar leverantörens katalog med en knapp per format (CSV / XML) på admin-sidan.
Importen visar en rapport: nya, uppdaterade och överhoppade produkter (med orsak).

### Så fungerar det
- **Adapter** (`src/integrations/supplierAdapter.ts`) – den enda filen som känner till leverantörens format.
  Hämtar filen, avkodar rätt teckenkodning (CSV är Windows-1252, XML är UTF-8) och översätter till vårt format.
- **Validering** (`src/routes/admin.ts`) – Zod kontrollerar varje produkt mot våra regler.
  En trasig produkt hoppas över, resten importeras.
- **Upsert på artikelnummer (`sku`)** – samma import kan köras flera gånger utan dubbletter.

### Modellval
- `artNr` → `sku` (unik nyckel), `benamning` → `product_beskr`, `pris` → `pris`
- Nya kolumner: `ean` (text, så inledande nollor behålls), `kategori`, `lagersaldo`, `varianter` (TEXT[])
- `uppdaterad` sparas inte – vi har inget behov av det än.
- Tomt lagersaldo tolkas som 0.
- Importen uppdaterar bara fält som leverantören äger – bild, benefits och frakt lämnas orörda.

### Kända begränsningar
- Admin-routes saknar inloggningskontroll på servern (skyddas bara i frontend).
- Render gratisplan somnar efter 15 min; en extern tjänst pingar `/api/health` var 10:e minut.

## Labb 2 – Sök-API (Algolia)

Shoppens produkter speglas i ett Algolia-index. Kunden söker via sökfältet i headern,
som bara anropar vårt eget API – aldrig Algolia direkt.

### Så fungerar det
- **Adapter** (`src/integrations/searchAdapter.ts`) – den enda filen som känner till Algolia.
  Översätter mellan vår produktmodell och Algolias, och validerar Algolias svar med Zod.
- **Två nycklar:** admin-nyckeln (får skriva) och sök-nyckeln (får bara söka) finns båda
  bara på servern. Ingen nyckel når webbläsaren.
- **objectID = artikelnummer** (`sku`). Egna produkter utan artikelnummer får `id-<productid>`.
  Samma objectID igen uppdaterar posten i stället för att skapa en dubblett.

### Synk: databasen är sanningen, Algolia är en kopia
Vid import, skapa, ändra och ta bort sparas produkten **först i databasen**, sedan i Algolia.
Om Algolia inte svarar är produkten ändå sparad – svaret innehåller `searchIndexed: false`
och admin får en varning om att sökindexet inte är uppdaterat.
`POST /api/admin/search/reindex` skickar alla produkter på nytt om indexet hamnat efter.

### Sök-API: `GET /api/search`
| Parameter | Betydelse | Validering |
|---|---|---|
| `q` | fritext (stavfel tillåts) | max 100 tecken |
| `page` | sida, räknas från 1 | heltal ≥ 1 |
| `pageSize` | produkter per sida | 1 – `SEARCH_MAX_PAGE_SIZE` (50) |
| `sort` | `relevance`, `price_asc`, `price_desc` | endast dessa |
| `category` | filtrera på kategori | valfri |
| `inStock` | bara produkter i lager | `true`/`false` |

Ogiltiga värden ger **400** med ett begripligt
