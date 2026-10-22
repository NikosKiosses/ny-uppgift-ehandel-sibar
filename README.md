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
