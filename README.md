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


## Labb 3 – Betalning (Stripe Checkout)

Kunden betalar på Stripes egen betalsida (hosted checkout). Kortuppgifter når aldrig
vår server eller React – Stripe hanterar dem, och vi får besked via webhook.

### Flödet
1. React skickar bara `{ productid, antal }` och leveransuppgifter till `POST /api/checkout` – aldrig priset.
2. Servern validerar varukorgen (Zod), hämtar **priserna från databasen** och kontrollerar lagersaldot.
3. Ordern sparas som **Obetald** (order + orderrader i en transaktion), med priset vid köpet på varje rad.
4. Servern skapar en Checkout Session med orderns id som `client_reference_id` och skickar kunden till Stripe.
5. Stripe anropar `POST /api/stripe/webhook`. Signaturen verifieras – utan giltig signatur svarar vi 400.
6. `checkout.session.completed` → ordern blir **Betald** och lagersaldot minskas, i en transaktion.
   `checkout.session.expired` → ordern blir **Avbruten**.
7. Kunden kommer tillbaka till `/orderbekraftelse`, som bara **visar** statusen – den ändrar den aldrig.

### Säkerhet och robusthet
- **Priset räknas på servern.** Ändras priset i webbläsaren påverkar det inte beloppet hos Stripe.
- **Idempotent webhook.** Uppdateringen gäller bara ordrar som fortfarande är `Obetald`. Kommer samma
  händelse två gånger händer ingenting andra gången – ordern blir inte betald två gånger och lagret
  minskas bara en gång. En betald order kan aldrig bli avbruten.
- **Webhooken svarar snabbt.** Databasen uppdateras först, Stripe får sitt svar, och sökindexet
  (nytt lagersaldo) uppdateras efteråt.
- **Timeout:** `STRIPE_TIMEOUT_MS` per anrop. Svarar inte Stripe får kunden ett begripligt meddelande
  och ordern förblir obetald.
- **Övergivna ordrar:** sessionen löper ut efter `CHECKOUT_EXPIRES_MINUTES` och ordern avbryts.

### Testa lokalt
`stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired --forward-to localhost:3000/api/stripe/webhook`
och lägg `whsec_...` som skrivs ut i `STRIPE_WEBHOOK_SECRET`. Testkort: `4242 4242 4242 4242`.
Live används en egen webhook-endpoint i Stripe Dashboard med en egen `whsec_...`.

## Labb 4 – Produktbilder i molnlagring (Supabase Storage)

Admin laddar upp en bild per produkt på admin-sidan. Filen skickas till vår egen server
(`POST /api/admin/products/:id/image`, multipart/form-data), som laddar upp den till en publik
bucket i Supabase Storage. Den hemliga nyckeln finns bara på servern – React anropar aldrig Supabase.

### Validering i tre lager
- **Admin-sidan** kontrollerar storleken innan filen skickas (snabb återkoppling). Reglerna hämtas
  från servern (`GET /api/admin/image-rules`) – inget är hårdkodat i React.
- **Servern** är den riktiga kontrollen: multer stoppar filer större än `IMAGE_MAX_MB`, och filtypen
  avgörs av filens första bytes ("magiska nummer") – inte av filnamnet. En PDF som döpts om till
  `.png` avvisas. Fel ger 400 med ett begripligt meddelande.
- **Supabase-bucketen** har egna gränser (JPEG/PNG, 4 MB) som extra skyddsnät.

### Byte av bild i rätt ordning
1. Ny bild laddas upp till en **ny unik sökväg** (`products/<sku>/<uuid>.jpg`) – aldrig admins
   filnamn, och en befintlig fil skrivs aldrig över (ny URL = ingen gammal bild i CDN-cachen).
2. Bildens **URL** (för att visa) och **sökväg** (för att radera senare) sparas på produkten.
3. **Först därefter** raderas den gamla filen.
Misslyckas uppladdningen är ingenting ändrat – produkten behåller sin gamla bild. Svarar inte
Supabase (timeout `SUPABASE_TIMEOUT_MS`) får admin ett begripligt meddelande.