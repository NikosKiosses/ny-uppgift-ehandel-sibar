// Adapter för Algolia (sök).
// Det här är den ENDA filen som vet hur Algolia fungerar: nycklar, index, format.
// Resten av shoppen pratar bara med funktionerna här och får tillbaka SHOPPENS format.

import { algoliasearch } from 'algoliasearch';
import { z } from 'zod';

// Allt som kan ändras ligger i .env – inget hårdkodat
const APP_ID = process.env.ALGOLIA_APP_ID;
const ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY;   // får SKRIVA – bara på servern
const SEARCH_KEY = process.env.ALGOLIA_SEARCH_KEY; // får bara SÖKA
const INDEX = process.env.ALGOLIA_INDEX;
const TIMEOUT_MS = Number(process.env.ALGOLIA_TIMEOUT_MS ?? 5000);

// Klienterna skapas först när de behövs. Saknas en nyckel kraschar inte hela
// servern vid start – bara sök-anropet får ett tydligt fel.
function client(key: string | undefined) {
  if (!APP_ID || !key || !INDEX) {
    throw new Error('ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY/ALGOLIA_SEARCH_KEY or ALGOLIA_INDEX is missing in .env');
  }
  return algoliasearch(APP_ID, key, {
    // Timeout på varje anrop (ms). write får lite längre tid eftersom vi väntar på indexeringen.
    timeouts: { connect: TIMEOUT_MS, read: TIMEOUT_MS, write: TIMEOUT_MS * 2 },
  });
}
let adminClient: ReturnType<typeof algoliasearch> | undefined;
let searchClient: ReturnType<typeof algoliasearch> | undefined;
const admin = () => (adminClient ??= client(ADMIN_KEY));
const search = () => (searchClient ??= client(SEARCH_KEY));

// ─────────────────────────────────────────────
// Modeller
// ─────────────────────────────────────────────

// En rad i products-tabellen (det pg ger oss). pris är NUMERIC → kommer som TEXT.
export type ProductRow = {
  productid: number;
  sku: string | null;
  product_beskr: string | null;
  kategori: string | null;
  pris: string | number | null;
  lagersaldo: number | null;
  varianter: string[] | null;
  product_img: string | null;
};

// Så ser en produkt ut i SHOPPENS sökresultat
export type SearchProduct = {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  price: number;
  stock: number;
  variants: string[];
  image: string | null;
};

// Så ser en produkt ut i Algolia. objectID = artikelnumret → samma produkt uppdateras, dupliceras inte.
// Egna produkter utan artikelnummer (skapade på admin-sidan) får "id-<productid>".
const AlgoliaRecord = z.object({
  objectID: z.string(),
  id: z.number().int(),
  sku: z.string().nullable(),
  name: z.string(),
  category: z.string().nullable(),
  price: z.number(),
  stock: z.number(),
  variants: z.array(z.string()),
  image: z.string().nullable(),
});
type AlgoliaRecord = z.infer<typeof AlgoliaRecord>;

export function objectIdFor(row: Pick<ProductRow, 'productid' | 'sku'>): string {
  return row.sku ?? `id-${row.productid}`;
}

function toRecord(row: ProductRow): AlgoliaRecord {
  return {
    objectID: objectIdFor(row),
    id: row.productid,
    sku: row.sku,
    name: row.product_beskr ?? '',
    category: row.kategori,
    price: Number(row.pris ?? 0),
    stock: row.lagersaldo ?? 0,
    variants: row.varianter ?? [],
    image: row.product_img,
  };
}

// ─────────────────────────────────────────────
// 1. INDEXERA – skriv till Algolia (admin-nyckeln)
// ─────────────────────────────────────────────

// Sortering i Algolia görs med REPLIKOR: kopior av indexet som rankar efter t.ex. pris.
// Namnen byggs av indexnamnet i .env → products_price_asc osv. Inget hårdkodat index.
export const SORTS = ['relevance', 'price_asc', 'price_desc'] as const;
export type Sort = (typeof SORTS)[number];

function indexFor(sort: Sort): string {
  return sort === 'relevance' ? INDEX! : `${INDEX}_${sort}`;
}

const BASE_SETTINGS = {
  searchableAttributes: ['name', 'category', 'sku'],  // ordningen = viktighet
  attributesForFaceting: ['filterOnly(category)'],     // krävs för category-filtret
};
const DEFAULT_RANKING = ['typo', 'geo', 'words', 'filters', 'proximity', 'attribute', 'exact', 'custom'];

// Talar om för Algolia VAD som är sökbart, vad man får filtrera på och hur man sorterar.
// Körs vid full omindexering – inställningarna sparas i indexet.
export async function configureIndex(): Promise<void> {
  const primary = await admin().setSettings({
    indexName: INDEX!,
    indexSettings: { ...BASE_SETTINGS, replicas: [indexFor('price_asc'), indexFor('price_desc')] },
  });
  await admin().waitForTask({ indexName: INDEX!, taskID: primary.taskID });

  // Replikerna: samma inställningar, men priset rankas FÖRST.
  // Vänta tills Algolia är klar, annars kan en sökning direkt efteråt få fel ordning.
  for (const [sort, rank] of [['price_asc', 'asc(price)'], ['price_desc', 'desc(price)']] as const) {
    const replica = await admin().setSettings({
      indexName: indexFor(sort),
      indexSettings: { ...BASE_SETTINGS, ranking: [rank, ...DEFAULT_RANKING] },
    });
    await admin().waitForTask({ indexName: indexFor(sort), taskID: replica.taskID });
  }
}

// Lägger till ELLER uppdaterar produkter (upsert på objectID).
export async function indexProducts(rows: ProductRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const records = rows.map(toRecord);
  console.log(`[search] Indexing ${records.length} product(s) in Algolia`);
  // waitForTasks: vänta tills Algolia är klar → en sökning direkt efteråt hittar ändringen
  await admin().saveObjects({ indexName: INDEX!, objects: records, waitForTasks: true });
  return records.length;
}

// Tar bort produkter ur Algolia – annars hittar sökningen produkter som inte finns.
export async function removeProducts(objectIDs: string[]): Promise<void> {
  if (objectIDs.length === 0) return;
  console.log(`[search] Removing ${objectIDs.join(', ')} from Algolia`);
  await admin().deleteObjects({ indexName: INDEX!, objectIDs, waitForTasks: true });
}

// ─────────────────────────────────────────────
// Synk efter att DATABASEN redan är sparad.
// Ett Algolia-fel får inte stoppa svaret – produkten finns ju i databasen.
// Returnerar true/false så att routen kan tala om för admin om indexet hängde med.
// ─────────────────────────────────────────────
export async function syncProducts(rows: ProductRow[]): Promise<boolean> {
  try {
    await indexProducts(rows);
    return true;
  } catch (err) {
    console.warn('[search] Could not update the search index:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function syncRemoved(rows: Pick<ProductRow, 'productid' | 'sku'>[]): Promise<boolean> {
  try {
    await removeProducts(rows.map(objectIdFor));
    return true;
  } catch (err) {
    console.warn('[search] Could not remove from the search index:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────
// 2. SÖK – läs från Algolia (sök-nyckeln)
// ─────────────────────────────────────────────

export type SearchParams = {
  q: string;
  page: number;      // vi räknar från 1
  pageSize: number;
  sort: Sort;
  category?: string | undefined;
  inStock?: boolean | undefined;
};

export async function searchProducts({ q, page, pageSize, sort, category, inStock }: SearchParams) {
  // Filter byggs av VALIDERADE parametrar. Citattecken i kategorin escapas.
  const filters: string[] = [];
  if (category) filters.push(`category:"${category.replace(/"/g, '\\"')}"`);
  if (inStock) filters.push('stock > 0');

  console.log(`[search] q="${q}" page=${page} pageSize=${pageSize} sort=${sort} filters="${filters.join(' AND ')}"`);
  const response = await search().searchSingleIndex<AlgoliaRecord>({
    indexName: indexFor(sort),
    searchParams: {
      query: q,
      page: page - 1,            // Algolia räknar från 0, vi från 1
      hitsPerPage: pageSize,
      filters: filters.join(' AND '),
    },
  });

  // Extern data → kontrollera innan vi använder den. Trasiga träffar hoppas över.
  const data: SearchProduct[] = [];
  for (const hit of response.hits) {
    const parsed = AlgoliaRecord.safeParse(hit);
    if (!parsed.success) {
      console.warn(`[search] Skipping invalid hit ${hit.objectID}`);
      continue;
    }
    const { objectID: _objectID, ...product } = parsed.data;
    data.push(product);
  }

  const total = response.nbHits ?? 0;
  return {
    data,
    meta: { page, pageSize, sort, total, totalPages: Math.ceil(total / pageSize) },
  };
}