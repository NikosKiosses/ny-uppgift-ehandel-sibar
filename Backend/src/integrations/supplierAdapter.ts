// Adapter för leverantörens katalogfiler (CSV och XML).
// Det här är den ENDA filen som vet hur leverantörens filer ser ut.
// Den returnerar produkter i VÅRT format – men validerar dem inte.
// Valideringen (våra regler) görs i routen, efter översättningen.

import { parse } from 'csv-parse/sync';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { fetchBytes } from '../lib/fetchJson.ts';

// Allt som kan ändras ligger i .env – inget hårdkodat
const BASE_URL = process.env.SUPPLIER_API_URL;
const API_KEY = process.env.SUPPLIER_API_KEY ?? '';
const BRANSCH = process.env.SUPPLIER_BRANSCH ?? 'klader';
const TIMEOUT_MS = Number(process.env.SUPPLIER_API_TIMEOUT_MS ?? 10000);
// Används bara om leverantören INTE skickar charset i Content-Type
const CSV_FALLBACK_CHARSET = process.env.SUPPLIER_CSV_CHARSET ?? 'windows-1252';

export type CatalogFormat = 'csv' | 'xml';

// En produkt från filen, översatt till VÅRT format men inte validerad än.
// Därför kan price vara NaN – det är Zods jobb i routen att stoppa den.
export type ProductCandidate = {
  sku: string;
  ean: string;          // text! 0735100000000 ska behålla nollan
  name: string;
  category: string;
  price: number;        // kronor, NaN om priset är trasigt
  stock: number;        // tomt/okänt saldo → 0
  variants: string[];   // ["S", "M", "L"]
};

// ─────────────────────────────────────────────
// Små hjälpfunktioner – gemensamma för båda formaten
// ─────────────────────────────────────────────

// "599,00" och "599.00" → 599. "1 299,50" → 1299.5. "ej satt" → NaN.
function parseDecimal(value: unknown): number {
  const text = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  return text === '' ? NaN : Number(text);
}

// "" (okänt) → 0. "28" → 28. "abc" → NaN (stoppas av Zod).
function parseStock(value: unknown): number {
  const text = String(value ?? '').trim();
  return text === '' ? 0 : Number(text);
}

// Läser teckenkodningen ur Content-Type, t.ex.
// "text/csv; charset=windows-1252" → "windows-1252"
function charsetFrom(contentType: string): string | undefined {
  return /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/"/g, '');
}

// Läser kodningen ur XML-deklarationen: <?xml version="1.0" encoding="UTF-8"?>
// De första ~100 bytesen är alltid vanliga ASCII-tecken, så de går att läsa ändå.
function charsetFromXmlDeclaration(bytes: Uint8Array): string | undefined {
  const start = new TextDecoder('ascii').decode(bytes.slice(0, 100));
  return /encoding=["']([^"']+)["']/i.exec(start)?.[1];
}

// ─────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────
type CsvRow = Record<string, string>;

export function parseCsvCatalog(bytes: Uint8Array, contentType: string): ProductCandidate[] {
  // 1. Bytes → text med RÄTT teckenkodning (annars blir "Mössa" → "M�ssa")
  const charset = charsetFrom(contentType) ?? CSV_FALLBACK_CHARSET;
  const text = new TextDecoder(charset).decode(bytes);

  // 2. Text → rader. Ett riktigt CSV-bibliotek klarar "Tröja; blå" inom citattecken.
  const rows = parse<CsvRow>(text, {
    columns: true,          // första raden = kolumnnamn → varje rad blir ett objekt
    delimiter: ';',         // leverantören använder semikolon (decimalkomma kräver det)
    bom: true,              // tar bort en eventuell osynlig BOM i början av filen
    skip_empty_lines: true,
    trim: true,             // " Jacka " → "Jacka"
  });

  // 3. Leverantörens kolumner → VÅRT format
  return rows.map((row) => ({
    sku: row.artNr ?? '',
    ean: row.ean ?? '',
    name: row.benamning ?? '',
    category: row.kategori ?? '',
    price: parseDecimal(row.pris),
    stock: parseStock(row.lagersaldo),
    variants: row.varianter ? row.varianter.split('|').map((v) => v.trim()).filter(Boolean) : [],
  }));
}

// ─────────────────────────────────────────────
// XML
// ─────────────────────────────────────────────
type XmlProduct = {
  '@_artNr'?: string;
  ean?: string;
  benamning?: string;
  kategori?: string;
  pris?: { '#text'?: string } | string;   // har attributet valuta → texten hamnar i '#text'
  lagersaldo?: string;
  varianter?: { variant?: string[] } | string;   // tom <varianter/> blir "" (tom text)
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,   // annars försvinner artNr="LEV-1001"
  attributeNamePrefix: '@_', // attribut får prefixet @_ så de inte krockar med taggnamn
  parseTagValue: false,      // behåll ALLT som text → EAN behåller sin nolla
  trimValues: true,
  // En tagg som bara finns EN gång blir annars ett objekt istället för en lista
  isArray: (name) => name === 'produkt' || name === 'variant',
});

export function parseXmlCatalog(bytes: Uint8Array, contentType: string): ProductCandidate[] {
  // 1. Bytes → text. XML säger själv vilken kodning den har i <?xml ... encoding="...">
  const charset = charsetFrom(contentType) ?? charsetFromXmlDeclaration(bytes) ?? 'utf-8';
  const text = new TextDecoder(charset).decode(bytes);

  // 2. Är det giltig XML? XMLParser klagar inte själv på trasiga filer.
  const valid = XMLValidator.validate(text);
  if (valid !== true) {
    throw new Error(`The supplier's XML file is invalid: ${valid.err.msg} (line ${valid.err.line})`);
  }

  // 3. Text → objekt. Strukturen följer taggarna: <katalog><produkt>...</produkt></katalog>
  const doc = xmlParser.parse(text) as { katalog?: { produkt?: XmlProduct[] } };
  const products = doc.katalog?.produkt;
  if (!Array.isArray(products)) {
    throw new Error('The supplier\'s XML file has no <katalog><produkt> elements');
  }

  // 4. Leverantörens taggar → VÅRT format
  return products.map((p) => ({
    sku: p['@_artNr'] ?? '',
    ean: p.ean ?? '',
    name: p.benamning ?? '',
    category: p.kategori ?? '',
    price: parseDecimal(typeof p.pris === 'object' ? p.pris['#text'] : p.pris),
    stock: parseStock(p.lagersaldo),
    variants: typeof p.varianter === 'object' ? (p.varianter.variant ?? []) : [],
  }));
}

// ─────────────────────────────────────────────
// Det routen anropar: hämta filen och returnera produkter i VÅRT format
// ─────────────────────────────────────────────
export async function getSupplierCatalog(format: CatalogFormat): Promise<ProductCandidate[]> {
  if (!BASE_URL) {
    throw new Error('SUPPLIER_API_URL is missing in .env');
  }

  const url = new URL(`${BASE_URL}/export/products.${format}`);
  url.searchParams.set('bransch', BRANSCH);

  console.log(`[supplier] Fetching ${format.toUpperCase()} catalogue (${BRANSCH})`);
  const { bytes, contentType } = await fetchBytes(url.toString(), {
    headers: { 'X-Api-Key': API_KEY },
    timeoutMs: TIMEOUT_MS,
  });

  return format === 'csv' ? parseCsvCatalog(bytes, contentType) : parseXmlCatalog(bytes, contentType);
}