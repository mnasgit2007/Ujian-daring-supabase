import { randomUUID } from 'node:crypto';
import { supabaseAdmin, unwrap } from './supabase.js';
import { requirePrivateBucket, downloadPrivateFile } from './storage.js';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 5;
const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

export function validateUploads(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_UPLOAD_FILES) throw new Error('Pilih 1–5 foto atau PDF.');
  let total = 0;
  return files.map((file, i) => {
    const mime = String(file?.mime || '');
    const base64 = String(file?.base64 || '');
    if (!extensions[mime] || base64.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Berkas tidak valid. Gunakan JPG, PNG, WEBP, atau PDF.');
    const bytes = Buffer.from(base64, 'base64');
    const valid = mime === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) :
      mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
      mime === 'image/webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' : bytes.subarray(0, 5).toString() === '%PDF-';
    total += bytes.length;
    if (!valid || !bytes.length) throw new Error('Isi berkas tidak cocok dengan formatnya.');
    if (total > MAX_UPLOAD_BYTES) throw new Error('Total berkas maksimal 2 MB setelah foto diperkecil.');
    const stem = String(file.name || `tugas-${i+1}`).replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _.-]/gu, '_').slice(0, 80) || 'tugas';
    return { name: stem + extensions[mime], mime, bytes, size: bytes.length };
  });
}

export function uploadConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

const BUCKET = 'assignment-submissions';

export function createAssignmentFiles(getClient = supabaseAdmin) {
  return {
    async checkFolder() {
      await requirePrivateBucket(getClient(), BUCKET);
      return { ok: true };
    },
    async put(file, prefix) {
      if (!/^[A-Za-z0-9_-]+$/.test(prefix) || !extensions[file.mime]) throw new Error('Nama unggahan tidak valid.');
      const id = prefix + '/' + randomUUID() + extensions[file.mime];
      await requirePrivateBucket(getClient(), BUCKET);
      unwrap(await getClient().storage.from(BUCKET).upload(id, file.bytes, {
        contentType: file.mime, upsert: false
      }), 'Unggah tugas');
      return { id, name: file.name, mime: file.mime, size: file.size };
    },
    async remove(id) {
      if (!validId(id)) throw new Error('ID berkas tidak valid.');
      unwrap(await getClient().storage.from(BUCKET).remove([id]), 'Hapus unggahan');
    },
    async get(file) {
      if (!validId(file.id) || !extensions[file.mime] || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_UPLOAD_BYTES) throw new Error('Berkas tidak valid.');
      const bytes = await downloadPrivateFile(getClient(), BUCKET, file.id, MAX_UPLOAD_BYTES);
      if (bytes.length !== file.size) throw new Error('Ukuran berkas tidak sesuai.');
      const base64 = bytes.toString('base64');
      validateUploads([{ name: file.name, mime: file.mime, base64 }]);
      return { name: file.name, mime: file.mime, base64 };
    }
  };
}
function validId(id) {
  return /^[A-Za-z0-9_-]+\/[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/.test(id || '');
}
export const assignmentFiles = createAssignmentFiles();
