import { supabaseAdmin } from "./supabase.js";

export async function downloadText(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Ne mogu da preuzmem ${bucket}/${path}: ${error?.message}`);
  return await data.text();
}

export async function uploadText(bucket: string, path: string, content: string, contentType = "image/svg+xml"): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, new Blob([content], { type: contentType }), { upsert: true, contentType });
  if (error) throw new Error(`Ne mogu da sačuvam ${bucket}/${path}: ${error.message}`);
}

export async function signedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Ne mogu da napravim link za ${bucket}/${path}: ${error?.message}`);
  return data.signedUrl;
}

export async function uploadBuffer(bucket: string, path: string, buffer: Buffer, contentType: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, { upsert: true, contentType });
  if (error) throw new Error(`Ne mogu da sačuvam ${bucket}/${path}: ${error.message}`);
}

/** Direct public URL for a file in a public bucket (e.g. "slike") — no signing needed. */
export function publicUrl(bucket: string, path: string): string {
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
