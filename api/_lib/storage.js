import { unwrap } from './supabase.js';

export async function requirePrivateBucket(client, bucket) {
  const data = unwrap(await client.storage.getBucket(bucket), 'Periksa penyimpanan');
  if (!data || data.public !== false) throw new Error('Bucket penyimpanan harus privat.');
}

export async function downloadPrivateFile(client, bucket, path, maxBytes) {
  await requirePrivateBucket(client, bucket);
  const blob = unwrap(await client.storage.from(bucket).download(path), 'Unduh berkas');
  if (!blob || !blob.size || blob.size > maxBytes) throw new Error('Berkas kosong atau melebihi batas ukuran.');
  return Buffer.from(await blob.arrayBuffer());
}

export function validateImagePath(path) {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,190}\.(jpg|jpeg|png|webp)$/i.test(path) || path.includes('..') || path.includes('//')) throw new Error('Path gambar tidak valid. Isi path object pada bucket exam-images.');
  return path;
}

export function imageMime(bytes) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255,216,255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new Error('Isi gambar tidak valid. Gunakan JPG, PNG, atau WEBP.');
}
