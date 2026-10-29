import { algoliasearch } from 'algoliasearch';
import { z } from 'zod';

const APP_ID = process.env.ALGOLIA_APP_ID;
const ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY;   
const SEARCH_KEY = process.env.ALGOLIA_SEARCH_KEY; 
const INDEX = process.env.ALGOLIA_INDEX;
const TIMEOUT_MS = Number(process.env.ALGOLIA_TIMEOUT_MS ?? 5000);


const WAIT_RETRIES = Number(process.env.ALGOLIA_WAIT_RETRIES ?? 15);



function client(key: string | undefined) {
  if (!APP_ID || !key || !INDEX) {
    throw new Error('ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY/ALGOLIA_SEARCH_KEY or ALGOLIA_INDEX is missing in .env');
  }
  return algoliasearch(APP_ID, key, {
    timeouts: { connect: TIMEOUT_MS, read: TIMEOUT_MS, write: TIMEOUT_MS * 2 },
  });
}
let adminClient: ReturnType<typeof algoliasearch> | undefined;
let searchClient: ReturnType<typeof algoliasearch> | undefined;
const admin = () => (adminClient ??= client(ADMIN_KEY));
const search = () => (searchClient ??= client(SEARCH_KEY));


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


export const SORTS = ['relevance', 'price_asc', 'price_desc'] as const;
export type Sort = (typeof SORTS)[number];

function indexFor(sort: Sort): string {
  return sort === 'relevance' ? INDEX! : `${INDEX}_${sort}`;
}

const BASE_SETTINGS = {
  searchableAttributes: ['name', 'category', 'sku'],  
  attributesForFaceting: ['filterOnly(category)'],    
};
const DEFAULT_RANKING = ['typo', 'geo', 'words', 'filters', 'proximity', 'attribute', 'exact', 'custom'];


async function applySettings(indexName: string, wanted: Record<string, string[]>): Promise<void> {
  const current = (await admin().getSettings({ indexName })) as Record<string, unknown>;
  const changed = Object.keys(wanted).filter(
    (key) => JSON.stringify(current[key] ?? []) !== JSON.stringify(wanted[key]),
  );
  if (changed.length === 0) {
    console.log(`[search] Settings for ${indexName} already up to date`);
    return;
  }
  console.log(`[search] Updating ${changed.join(', ')} for ${indexName}`);
  const task = await admin().setSettings({ indexName, indexSettings: wanted });
  await admin().waitForTask({ indexName, taskID: task.taskID, maxRetries: WAIT_RETRIES });
}


export async function configureIndex(): Promise<void> {
  console.log('[search] Checking index settings');
  await applySettings(INDEX!, {
    ...BASE_SETTINGS,
    replicas: [indexFor('price_asc'), indexFor('price_desc')],
  });

  for (const [sort, rank] of [['price_asc', 'asc(price)'], ['price_desc', 'desc(price)']] as const) {
    await applySettings(indexFor(sort), { ...BASE_SETTINGS, ranking: [rank, ...DEFAULT_RANKING] });
  }
}

export async function indexProducts(rows: ProductRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const records = rows.map(toRecord);
  console.log(`[search] Indexing ${records.length} product(s) in Algolia`);
  await admin().saveObjects({ indexName: INDEX!, objects: records, waitForTasks: true, maxRetries: WAIT_RETRIES });
  return records.length;
}

export async function removeProducts(objectIDs: string[]): Promise<void> {
  if (objectIDs.length === 0) return;
  console.log(`[search] Removing ${objectIDs.join(', ')} from Algolia`);
  await admin().deleteObjects({ indexName: INDEX!, objectIDs, waitForTasks: true, maxRetries: WAIT_RETRIES });
}


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


export type SearchParams = {
  q: string;
  page: number;      // vi räknar från 1
  pageSize: number;
  sort: Sort;
  category?: string | undefined;
  inStock?: boolean | undefined;
};

export async function searchProducts({ q, page, pageSize, sort, category, inStock }: SearchParams) {
  const filters: string[] = [];
  if (category) filters.push(`category:"${category.replace(/"/g, '\\"')}"`);
  if (inStock) filters.push('stock > 0');

  console.log(`[search] q="${q}" page=${page} pageSize=${pageSize} sort=${sort} filters="${filters.join(' AND ')}"`);
  const response = await search().searchSingleIndex<AlgoliaRecord>({
    indexName: indexFor(sort),
    searchParams: {
      query: q,
      page: page - 1,          
      hitsPerPage: pageSize,
      filters: filters.join(' AND '),
    },
  });

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