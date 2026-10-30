# KLEOS – webbshop integrerad med omvärlden

Inlämningsuppgift 1 i kursen *Integration med 3-partssystem* (FSU25D).
Shoppen är byggd med React (Vite) och Express (TypeScript) och integrerar sex externa tjänster:
leverantörsfiler (CSV/XML), sök (Algolia), betalning (Stripe), molnlagring (Supabase Storage),
frakt (PostNord) och valutakurser (Frankfurter).

**Deployad shop:** https://ny-uppgift-ehandel-sibar-six.vercel.app
**Backend (Render):** https://ny-uppgift-ehandel-sibar.onrender.com/api/health

---

## Innehåll
1. [Kom igång](#kom-igång)
2. [Arkitektur](#arkitektur)
3. [Labb 1 – Import av produktdata](#labb-1--import-av-produktdata)
4. [Labb 2 – Sök-API (Algolia)](#labb-2--sök-api-algolia)
5. [Labb 3 – Betalning (Stripe)](#labb-3--betalning-stripe)
6. [Labb 4 – Produktbilder i molnlagring (Supabase Storage)](#labb-4--produktbilder-i-molnlagring-supabase-storage)
7. [Labb 5 – Frakt med PostNord (AI-labb)](#labb-5--frakt-med-postnord-ai-labb)
8. [Kända begränsningar](#kända-begränsningar)
9. [Reflektion](#reflektion)

---

## Kom igång

### Krav
- Node.js 24 (backend körs direkt som TypeScript med `node --watch`)
- Gratis testkonton hos:
  - **Supabase** – databas (Postgres) och Storage (en publik bucket `product-images`)
  - **Algolia** – sökindex
  - **Stripe** – i *testläge* + [Stripe CLI](https://docs.stripe.com/stripe-cli) för webhooks lokalt
  - **PostNord** – sandlådan på [atdeveloper.postnord.com](https://atdeveloper.postnord.com), *Customer plan*
- Leverantörens API-nyckel (ges ut i kursen)

### 1. Klona och installera
```bash
git clone https://github.com/NikosKiosses/ny-uppgift-ehandel-sibar.git
cd ny-uppgift-ehandel-sibar
cd Backend && npm install
cd ../frontend && npm install
```

### 2. Miljövariabler
```bash
cd Backend
cp .env.example .env
```
Fyll i `Backend/.env`. **Alla variabler som behövs står i [`Backend/.env.example`](Backend/.env.example)**, grupperade per tjänst:

| Tjänst | Variabler | Var nyckeln finns |
|---|---|---|
| Databas | `DATABASE_URL` | Supabase → Connect → Connection string |
| Leverantör | `SUPPLIER_API_URL`, `SUPPLIER_API_KEY`, `SUPPLIER_BRANSCH`, `SUPPLIER_API_TIMEOUT_MS` | Ges ut i kursen |
| Valuta | `CURRENCY_API_URL`, `CURRENCY_CACHE_SECONDS` | Frankfurter (ingen nyckel) |
| Algolia | `ALGOLIA_APP_ID`, `ALGOLIA_ADMIN_KEY`, `ALGOLIA_SEARCH_KEY`, `ALGOLIA_INDEX`, `ALGOLIA_TIMEOUT_MS`, `ALGOLIA_WAIT_RETRIES`, `SEARCH_MAX_PAGE_SIZE` | Algolia → Settings → API Keys |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TIMEOUT_MS`, `STRIPE_CURRENCY`, `CHECKOUT_EXPIRES_MINUTES`, `CLIENT_URL` | Stripe → Developers → API keys (testläge) |
| Supabase Storage | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`, `SUPABASE_TIMEOUT_MS`, `IMAGE_MAX_MB` | Supabase → Project Settings → API Keys (`sb_secret_…`) |
| PostNord | `POSTNORD_API_URL`, `POSTNORD_API_KEY`, `POSTNORD_TIMEOUT_MS`, `POSTNORD_SERVICE_POINTS`, `SHOP_POSTAL_CODE` | PostNord-sandlådan → din application |
| Frakt (egen prislista) | `SHIPPING_PRICE_SERVICE_POINT`, `SHIPPING_PRICE_HOME`, `FREE_SHIPPING_FROM` | Väljs av shoppen |

`.env` ligger i `.gitignore` och har aldrig committats. I den deployade shoppen ligger samma variabler i Renders *Environment*.
Frontend behöver inga nycklar alls: alla anrop går till den egna servern via `/api`.

### 3. Databasen
Kör [`Backend/schema.sql`](Backend/schema.sql) i Supabase → SQL Editor. Skapa sedan en **publik** bucket `product-images` i Supabase Storage
(tillåtna typer `image/jpeg, image/png`, max 4 MB).

### 4. Starta lokalt – tre terminaler
```bash
# Terminal 1 – backend (http://localhost:3000)
cd Backend && npm run dev

# Terminal 2 – Stripe skickar webhooks till din dator (Stripe kan inte nå localhost)
stripe login   # en gång
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired \
  --forward-to localhost:3000/api/stripe/webhook
# → kopiera whsec_... som skrivs ut till STRIPE_WEBHOOK_SECRET i Backend/.env och starta om backend

# Terminal 3 – frontend (http://localhost:5173, /api proxas till backend)
cd frontend && npm run dev
```

### 5. Första gången
1. Logga in som admin och gå till **Admin – Produkter**.
2. Klicka **Importera CSV** (eller XML) – 44 produkter importeras.
3. Fyll sökindexet: `curl -X POST http://localhost:3000/api/admin/search/reindex`

### Testa integrationerna
- **Testkort (Stripe):** `4242 4242 4242 4242`, valfritt framtida datum, valfri CVC.
  Nekat kort: `4000 0000 0000 0002`.
- **Utgången betalning lokalt:** `stripe checkout sessions expire cs_test_…` (id:t står i backend-loggen).
- **Admin-testkonto:** skickas i kommentaren vid inlämningen (står aldrig i repot).
- **Deployat:** Stripe anropar Render direkt via en webhook-endpoint i Stripe Dashboard
  (`/api/stripe/webhook`) med en egen `whsec_…` – `stripe listen` behövs bara lokalt.

---

## Arkitektur

```
React (Vercel)  ──/api/*──►  Express (Render)  ──►  Supabase Postgres (sanningen)
                                   │
                                   ├── integrations/supplierAdapter.ts  → leverantörens CSV/XML
                                   ├── integrations/searchAdapter.ts    → Algolia
                                   ├── integrations/paymentAdapter.ts   → Stripe
                                   ├── integrations/storageAdapter.ts   → Supabase Storage
                                   ├── integrations/shippingAdapter.ts  → PostNord
                                   └── integrations/currencyAdapter.ts  → Frankfurter
```

De gemensamma kraven gäller alla tjänster:

| Krav | Hur det är löst |
|---|---|
| Anrop via backend | React anropar bara `/api/...` (relativ adress – Vite-proxy lokalt, Vercel-rewrite live). Inga externa nycklar i webbläsaren. |
| En adapter per tjänst | All kod som känner till en tjänst (URL, nycklar, format, felkoder) ligger i `src/integrations/`. Adaptern returnerar shoppens format. |
| Nycklar i `.env` | Inga URL:er, nycklar, gränser eller priser är hårdkodade – allt läses från miljövariabler. |
| Timeout och felhantering | Varje anrop har en timeout från `.env`. Fel ger ett begripligt meddelande (ofta 502) och en generell error handler fångar resten – shoppen kraschar inte. |
| Validera extern data | Zod validerar leverantörens filer, Algolias, Stripes och PostNords svar samt allt användaren skickar in. |

---

## Labb 1 – Import av produktdata

Admin importerar leverantörens katalog med en knapp per format (CSV / XML) på admin-sidan.
Importen visar en rapport: nya, uppdaterade och överhoppade produkter (med orsak).

- **Adapter** (`supplierAdapter.ts`) – hämtar filen, avkodar rätt teckenkodning (CSV är Windows-1252,
  XML är UTF-8 – läses från `Content-Type` / XML-deklarationen) och översätter till vårt format.
  XML valideras med `XMLValidator`; `parseTagValue: false` gör att EAN behåller sin inledande nolla.
- **Validering** (`routes/admin.ts`) – Zod kontrollerar varje produkt. En trasig produkt
  (t.ex. LEV-1037 med priset "ej satt") hoppas över med orsak; resten importeras.
- **Upsert på artikelnummer (`sku`)** – `ON CONFLICT (sku) DO UPDATE`. En andra import skapar inga dubbletter.

**Modellval:** `artNr` → `sku` (unik), `benamning` → `product_beskr`. Nya kolumner: `ean` (text), `kategori`,
`lagersaldo`, `varianter` (`TEXT[]`). `uppdaterad` sparas inte. Tomt lagersaldo tolkas som 0.
Importen uppdaterar bara fält som leverantören äger – bild, benefits och frakt lämnas orörda.

---

## Labb 2 – Sök-API (Algolia)

- **Databasen är sanningen, Algolia är en kopia.** Vid import, skapa, ändra, ta bort – och när en betald
  order minskar lagersaldot – sparas produkten först i databasen och uppdateras sedan i Algolia.
  Svarar inte Algolia är produkten ändå sparad, och admin får en varning (`searchIndexed: false`).
- **objectID = artikelnummer.** Egna produkter utan artikelnummer får `id-<productid>`.
- **Två nycklar:** admin-nyckeln (skriva) och sök-nyckeln (bara söka) finns båda bara på servern.
- `POST /api/admin/search/reindex` skickar alla produkter på nytt. Algolia-inställningarna skickas bara
  om de skiljer sig från de sparade, eftersom en ändring bygger om indexet.

**`GET /api/search`**

| Parameter | Betydelse | Validering |
|---|---|---|
| `q` | fritext (stavfel tillåts) | max 100 tecken |
| `page` | sida, räknas från 1 | heltal ≥ 1 |
| `pageSize` | produkter per sida | 1 – `SEARCH_MAX_PAGE_SIZE` |
| `sort` | `relevance`, `price_asc`, `price_desc` | endast dessa |
| `category` | filtrera på kategori | valfri |
| `inStock` | bara produkter i lager | `true`/`false` |

Ogiltiga värden ger **400**. Svar: `{ data: [...], meta: { page, pageSize, sort, total, totalPages } }`.
Sortering görs med Algolia-replikor (`<index>_price_asc`, `<index>_price_desc`).
Sökfältet ligger i headern; sökresultatet har samma produktkort och "Lägg i varukorg" som Kollektion.

---

## Labb 3 – Betalning (Stripe)

Kunden betalar på Stripes egen betalsida (hosted checkout). Kortuppgifter når aldrig vår server.

1. React skickar bara `{ productid, antal }`, leveransuppgifter och fraktval – **aldrig något pris**.
2. Servern hämtar priserna från databasen, kontrollerar lagersaldot och räknar frakten.
3. Ordern sparas som **Obetald** (order + rader i en transaktion, med priset vid köpet på varje rad).
4. En Checkout Session skapas med orderns id som `client_reference_id`; frakten är en egen rad.
5. `POST /api/stripe/webhook` verifierar signaturen (annars **400**).
   `checkout.session.completed` → **Betald** + lagersaldot minskas, i en transaktion.
   `checkout.session.expired` → **Avbruten**.
6. Bekräftelsesidan **visar** bara statusen – bara webhooken ändrar den.

**Idempotent:** uppdateringen gäller bara ordrar med status `Obetald`. Kommer samma händelse igen händer
ingenting – ordern blir inte betald två gånger, lagret minskas en gång, och en betald order kan aldrig avbrytas.
Webhooken svarar Stripe direkt efter databasen; sökindexet uppdateras efter svaret.

---

## Labb 4 – Produktbilder i molnlagring (Supabase Storage)

Admin laddar upp en bild per produkt (`POST /api/admin/products/:id/image`, multipart). Servern laddar upp
den till en publik bucket med den hemliga nyckeln – React anropar aldrig Supabase.

**Validering i tre lager:**
- Admin-sidan kontrollerar storleken innan uppladdning (reglerna hämtas från `GET /api/admin/image-rules`).
- **Servern** är den riktiga kontrollen: multer stoppar filer över `IMAGE_MAX_MB`, och filtypen avgörs av
  filens första bytes ("magiska nummer") – inte filnamnet. En PDF som döpts om till `.png` avvisas med 400.
- Bucketen har egna gränser (JPEG/PNG, 4 MB) som extra skyddsnät.

**Byte av bild i rätt ordning:** ny bild till en **ny unik sökväg** (`products/<sku>/<uuid>.jpg`) → URL och
sökväg sparas på produkten → **först därefter** raderas den gamla filen. En misslyckad uppladdning lämnar
produkten med sin gamla bild.

---

## Labb 5 – Frakt med PostNord (AI-labb)

I kassan anger kunden sitt postnummer. Servern (`POST /api/shipping/quote`) svarar med:
- **fraktpriser** från shoppens egen prislista (`lib/shippingPrices.ts`): ombud 59 kr, hemleverans 99 kr,
  fri frakt från 500 kr – allt från `.env`. PostNord har inget pris-API för Sverige.
- **ombud** nära postnumret (PostNord Service Points v5)
- **beräknad leverans** per fraktsätt (PostNord Transit Time v2), t.ex. "Beräknad leverans: måndag 2/11"

Vid betalning frågar servern PostNord **igen** och kontrollerar att det valda ombudet finns bland ombuden för
postnumret – annars **400** "Ombudet finns inte bland ombuden för postnummer …". Fraktsätt, fraktpris och ombud
sparas på ordern, och frakten är en egen rad i Stripe (beloppet = varor + frakt).
PostNords svar valideras med Zod. Svarar inte PostNord kan kunden ändå välja hemleverans.
PostNord tar nyckeln i URL:en, därför loggas URL:en aldrig.

### Hur AI användes

Jag byggde frakten tillsammans med Claude (chatt) och kontrollerade sedan varje PostNord-anrop mot
dokumentationen i PostNords sandlådeportal. Jag klistrade aldrig in min API-nyckel i chatten.

**Prompter jag använde (exempel):**
- *"Här är Labb 5 och lärarens shipping-walkthrough. Skriv en adapter i min Express-server som hämtar de
  närmaste PostNord-ombuden för ett postnummer och leveranstiden från shoppens postnummer till kundens.
  Inget får vara hårdkodat och PostNords svar ska valideras med Zod."*
- *"Bygg kassan i React: kunden anger postnummer, väljer ombud eller hemleverans och ser pris och beräknad
  leverans. React får aldrig skicka ett pris."*
- När något inte fungerade klistrade jag in felet från backend-loggen eller dokumentationen och bad om en rättning.

**Vad AI:n föreslog, vad som skilde sig och hur jag löste det:**

| | AI:ns förslag | Vad PostNords dokumentation och sandlåda visade | Lösning |
|---|---|---|---|
| Ombud | `GET /rest/businesslocation/v5/servicepoints/nearest/byaddress` med `countryCode`, `postalCode`, `numberOfServicePoints` | Stämde med "Nearest Service Points" i portalen. Testanrop gav 5 ombud för 113 52. | Ingen ändring behövdes. |
| Leveranstid – endpoint | `GET /rest/transport/v1/transittime/getTransitTimeInformation.json` | PostNord svarade **502**. I portalen ("Transit time calculation V1 and V2") ligger V1 under *Legacy*; rätt endpoint är **`/v2/transittime/addresstoaddress`**. | Bytte till V2. |
| Leveranstid – parametrar | `fromAddressPostalCode`, `toAddressPostalCode` | V2 har bytt namn till `originPostalCode` / `destinationPostalCode`. Sandlådan svarade sedan **400 API-008: "Required request parameter 'startTime' … is not present"**. | Bytte namn och lade till `startTime` (nu, i svensk tid). |
| Leveranstid – svar | Ett objekt med `transitTimes[].deliveryDate` ("20161102") | V2 svarar med en **lista**, en rad per tjänst, med antingen `estimatedTimeOfArrival.timeOfArrival`, `estimatedTimeOfArrival.dayRangeOfArrival` (t.ex. 3–4 dagar) eller `errorMessage`. | Skrev om Zod-schemat efter dokumentationens exempelsvar. Väljer tjänst 19 (Service Point) och 17 (Home) – koderna står i Delivery Options-dokumentationen. |

**Hur jag kontrollerade:** jag läste endpoint-listor, parametrar och exempelsvar i portalen, körde
*Try it out* (portalens förifyllda exempel 17173/Testvägen 3 gav bara `errorMessage` – därför testar shoppen
med sitt eget `SHOP_POSTAL_CODE`), och testade varje anrop med `curl` mot min server tills svaret innehöll
ombud och `deliveryEstimates` med datum.

---

## Kända begränsningar
- Admin-routerna saknar inloggningskontroll på servern; admin-sidan skyddas bara i frontend.
- Render (gratisplan) somnar efter 15 minuter. En extern tjänst pingar `/api/health` var 10:e minut.
- Valutacachen ligger i minnet och töms när servern startar om.
- Fraktpriset är ett fast pris per fraktsätt (ingen vikt eller storlek).

---

## Reflektion

### 1. Vilken integrationsmodell använder varje tjänst, och varför passar den?
- **Leverantören – fil (CSV/XML).** Leverantören exporterar hela katalogen som en fil. Det passar en
  batch-import: admin hämtar allt på en gång, och upsert på artikelnummer gör att importen kan köras om.
- **Algolia – SDK (REST under huven).** Servern skickar produkter och söker via Algolias klient.
  Sökningen måste vara snabb och tåla stavfel, och SDK:n sköter retries mellan Algolias servrar.
- **Stripe – redirect + webhook.** Kunden skickas till Stripes betalsida (redirect) och Stripe berättar för
  servern när betalningen är klar (webhook). Det är rätt eftersom betalningen sker utanför vår sida och
  kunden kan stänga fliken – webhooken kommer ändå, direkt mellan Stripe och servern.
- **Supabase Storage – SDK.** Servern laddar upp och raderar filer; bilderna visas från en publik URL via CDN.
- **PostNord – REST.** Enkla GET-anrop för ombud och leveranstid när kunden fyller i sitt postnummer.
- **Frankfurter – REST** med cache, eftersom kurserna bara ändras en gång per dag.

### 2. Varför går anropen via Express och inte direkt från React?
Allt som skickas till webbläsaren kan läsas av vem som helst. Hade React anropat Stripe, Algolia eller
Supabase direkt hade de hemliga nycklarna legat i JavaScript-koden, och vem som helst kunde ha raderat mitt
sökindex eller mina bilder. Servern är också den enda som kan **lita** på data: priset i min shop räknas på
servern från databasen, så att ändra priset i webbläsaren påverkar inte vad Stripe drar. Dessutom samlas
timeout, felhantering och validering på ett ställe, och React får alltid shoppens eget format.

### 3. Varför integrera i stället för att bygga själv?
- **Betalning:** att ta emot kortnummer kräver PCI DSS-certifiering, bedrägeriskydd, 3D Secure och avtal med
  banker. Stripe ger dessutom Klarna och andra betalsätt utan extra kod.
- **Sök:** att bygga stavfelstolerans, relevansranking och snabb sökning med SQL vore mycket arbete och skulle bli långsamt.
- **Molnlagring:** egen fillagring kräver servrar, backup, CDN och skalning – Render-servern har inte ens en beständig disk.
- **Frakt:** ombud och leveranstider är PostNords egen data, som ändras hela tiden och som jag inte kan ta fram själv.
- **Leverantörsfiler:** produktdata kommer från leverantören – att skriva in 44 produkter för hand vore långsamt och felbenäget.

### 4. Vad händer om tjänsterna är nere?
Varje anrop har en timeout, och shoppen kraschar aldrig:
- **Algolia nere:** sökningen visar "Sökningen är inte tillgänglig just nu", men Kollektion och köp fungerar.
  Ändras en produkt sparas den ändå, och admin får en varning om att sökindexet inte är uppdaterat.
- **Stripe nere:** kunden får ett meddelande om att betaltjänsten inte svarar; ordern förblir obetald och inget dras.
  Missas en webhook skickar Stripe den igen, och koden tål att samma händelse kommer flera gånger. När stripe listen inte var igång 
  blev order #49 betald hos Stripe men stod som Obetald i shoppen, tills du skickade om händelsen. 
  Det visar varför webhooken finns och vad som händer när den inte når fram.
- **Supabase Storage nere:** admin får ett meddelande och produkten behåller sin gamla bild.
- **PostNord nere:** ombud kan inte väljas, men kunden kan välja hemleverans och slutföra köpet.
- **Leverantören nere:** importen svarar med ett fel; befintliga produkter påverkas inte.

### 5. Vilka risker för beroendet med sig?
**Stripe:** varje köp kostar en avgift, och Stripe kan ändra villkor eller stänga ett konto – då kan shoppen inte ta betalt.
Kundens namn och e-post skickas till Stripe, ett amerikanskt företag, vilket är en personuppgiftsöverföring enligt
GDPR som måste stå i integritetspolicyn. **Algolia:** gratisplanen har gränser för antal poster och sökningar; växer
shoppen kostar det pengar, och sökindexet är en kopia som kan hamna efter databasen. **PostNord:** sandlådan och
API:erna kan ändras – i Labb 5 hade det gamla leveranstids-API:et redan ersatts av V2. Adaptermönstret minskar
riskerna: byter jag tjänst behöver bara en fil skrivas om.
