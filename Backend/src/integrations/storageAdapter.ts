import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';


const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'product-images';
const TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS ?? 10000);


let client: SupabaseClient | undefined;
function storage() {
  if (!SUPABASE_URL || !SECRET_KEY) throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY is missing in .env');
  client ??= createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });
  return client.storage.from(BUCKET);
}

export type ImageType = 'image/jpeg' | 'image/png';
const EXTENSIONS: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function uploadProductImage(folder: string, bytes: Buffer, type: ImageType) {
  const path = `products/${folder}/${randomUUID()}.${EXTENSIONS[type]}`;

  const { error } = await storage().upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error(`Could not upload image to Supabase: ${error.message}`);

  const { data } = storage().getPublicUrl(path);
  console.log(`[storage] Uploaded ${path}`);
  return { path, url: data.publicUrl };
}

export async function removeProductImage(path: string): Promise<void> {
  const { error } = await storage().remove([path]);
  if (error) throw new Error(`Could not delete image in Supabase: ${error.message}`);
  console.log(`[storage] Removed ${path}`);
}