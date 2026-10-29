import { parse } from 'csv-parse/sync';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { fetchBytes } from '../lib/fetchJson.ts';

const BASE_URL = process.env.SUPPLIER_API_URL;
const API_KEY = process.env.SUPPLIER_API_KEY ?? '';
const BRANSCH = process.env.SUPPLIER_BRANSCH ?? 'klader';
const TIMEOUT_MS = Number(process.env.SUPPLIER_API_TIMEOUT_MS ?? 10000);

const CSV_FALLBACK_CHARSET = process.env.SUPPLIER_CSV_CHARSET ?? 'windows-1252';

export type CatalogFormat = 'csv' | 'xml';

export type ProductCandidate = {
  sku: string;
  ean: string;          
  name: string;
  category: string;
  price: number;        
  stock: number;        
  variants: string[];   
};

function parseDecimal(value: unknown): number {
  const text = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  return text === '' ? NaN : Number(text);
}

function parseStock(value: unknown): number {
  const text = String(value ?? '').trim();
  return text === '' ? 0 : Number(text);
}

function charsetFrom(contentType: string): string | undefined {
  return /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/"/g, '');
}

function charsetFromXmlDeclaration(bytes: Uint8Array): string | undefined {
  const start = new TextDecoder('ascii').decode(bytes.slice(0, 100));
  return /encoding=["']([^"']+)["']/i.exec(start)?.[1];
}

type CsvRow = Record<string, string>;

export function parseCsvCatalog(bytes: Uint8Array, contentType: string): ProductCandidate[] {
  const charset = charsetFrom(contentType) ?? CSV_FALLBACK_CHARSET;
  const text = new TextDecoder(charset).decode(bytes);

  const rows = parse<CsvRow>(text, {
    columns: true,          
    delimiter: ';',         
    bom: true,              
    skip_empty_lines: true,
    trim: true,             
  });

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

type XmlProduct = {
  '@_artNr'?: string;
  ean?: string;
  benamning?: string;
  kategori?: string;
  pris?: { '#text'?: string } | string;
  lagersaldo?: string;
  varianter?: { variant?: string[] } | string;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,  
  attributeNamePrefix: '@_',
  parseTagValue: false,     
  trimValues: true,
  isArray: (name) => name === 'produkt' || name === 'variant',
});

export function parseXmlCatalog(bytes: Uint8Array, contentType: string): ProductCandidate[] {
  const charset = charsetFrom(contentType) ?? charsetFromXmlDeclaration(bytes) ?? 'utf-8';
  const text = new TextDecoder(charset).decode(bytes);

  const valid = XMLValidator.validate(text);
  if (valid !== true) {
    throw new Error(`The supplier's XML file is invalid: ${valid.err.msg} (line ${valid.err.line})`);
  }

  const doc = xmlParser.parse(text) as { katalog?: { produkt?: XmlProduct[] } };
  const products = doc.katalog?.produkt;
  if (!Array.isArray(products)) {
    throw new Error('The supplier\'s XML file has no <katalog><produkt> elements');
  }

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