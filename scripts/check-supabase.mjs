import { supabaseAdmin, unwrap } from '../api/_lib/supabase.js';

export async function checkSetup(client = supabaseAdmin()) {
  for (const key of ['APP_HASH_SECRET', 'APP_SESSION_SECRET']) {
    if ((process.env[key] || '').length < 32) throw new Error(`${key} wajib minimal 32 karakter acak baru.`);
  }
  if (process.env.APP_HASH_SECRET === process.env.APP_SESSION_SECRET) throw new Error('Gunakan dua secret berbeda.');
  if (!/^[a-f0-9]{64}$/.test(process.env.APP_ADMIN_HASH || '')) throw new Error('APP_ADMIN_HASH harus hasil perintah hash-admin.');
  const data = unwrap(await client.rpc('app_check_setup'), 'Pemeriksaan schema');
  if (data?.version !== 1 || !data.rls || !data.server_write || data.client_access || data.private_buckets !== 2) {
    throw new Error('Schema/izin/bucket belum sesuai. Jalankan supabase/schema.sql pada proyek BARU; kedua bucket harus Private.');
  }
  unwrap(await client.from('app_rows').select('row_num', { head: true }).limit(1), 'Pemeriksaan tabel');
  return data;
}

if (process.argv[1]?.endsWith('check-supabase.mjs')) {
  checkSetup().then(() => console.log('OK: konfigurasi, database, RPC, RLS, dan dua bucket Private siap. Tidak ada data yang diubah.'))
    .catch(error => { console.error('Gagal:', error.message); process.exitCode = 1; });
}
