// Adapter för molnlagring (Supabase Storage).
// Det här är den ENDA filen som vet hur Supabase Storage fungerar: nyckel, bucket, sökvägar, URL:er.
// Resten av shoppen ger en bild in och får { path, url } tillbaka.

import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Allt som kan ändras ligger i .env – inget hårdkodat
const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;   // får skriva och radera – bara på servern
const BUCKET = process.env.SUPABASE_BUCKET ?? 'product-images';
const TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS ?? 10000);

// Klienten skapas först när den behövs → saknas nyckeln kraschar inte hela servern vid start
let client: SupabaseClient | undefined;
function storage() {
  if (!SUPABASE_URL || !SECRET_KEY) throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY is missing in .env');
  client ??= createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false },
    // Timeout på VARJE anrop till Supabase
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });
  return client.storage.from(BUCKET);
}

export type ImageType = 'image/jpeg' | 'image/png';
const EXTENSIONS: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// Laddar upp en bild och returnerar BÅDE sökvägen (för att kunna radera den senare)
// och den publika URL:en (för att visa den).
export async function uploadProductImage(folder: string, bytes: Buffer, type: ImageType) {
  // En NY, unik sökväg varje gång – aldrig admins filnamn, och vi skriver aldrig över en fil.
  // Ny sökväg = ny URL → ingen gammal bild som ligger kvar i CDN-cachen.
  const path = `products/${folder}/${randomUUID()}.${EXTENSIONS[type]}`;

  // supabase-js kastar inte – den returnerar { error }. Vi gör om det till ett riktigt fel.
  const { error } = await storage().upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error(`Could not upload image to Supabase: ${error.message}`);

  // getPublicUrl BYGGER bara URL:en (bucketen är publik) – inget anrop till Supabase
  const { data } = storage().getPublicUrl(path);
  console.log(`[storage] Uploaded ${path}`);
  return { path, url: data.publicUrl };
}

export async function removeProductImage(path: string): Promise<void> {
  const { error } = await storage().remove([path]);
  if (error) throw new Error(`Could not delete image in Supabase: ${error.message}`);
  console.log(`[storage] Removed ${path}`);
}