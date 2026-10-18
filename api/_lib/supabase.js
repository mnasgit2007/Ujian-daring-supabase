import { createClient } from '@supabase/supabase-js';

let client;

export function supabaseConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) throw new Error('Isi SUPABASE_URL dan SUPABASE_SECRET_KEY pada proyek aplikasi baru.');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) throw new Error('SUPABASE_URL harus berupa Project URL https://<project-ref>.supabase.co.');
  if (!key.startsWith('sb_secret_')) throw new Error('SUPABASE_SECRET_KEY harus secret key sb_secret_..., bukan publishable key.');
  return { url, key };
}

// Server-only: never import this module from public/ or pass user tokens here.
export function supabaseAdmin() {
  if (!client) {
    const { url, key } = supabaseConfig();
    client = createClient(url, key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false
    } });
  }
  return client;
}

export function unwrap(result, operation = 'Supabase') {
  if (result.error) {
    // Do not return 400/404: legacy optional-data helpers treat them as absent
    // datasets. A missing Supabase schema must fail closed, including rosters.
    const message = ['PGRST202', 'PGRST205', '42P01', '42883'].includes(result.error.code)
      ? 'Schema Supabase belum lengkap. Jalankan supabase/schema.sql pada proyek baru.'
      : `${operation} gagal. Periksa konfigurasi dan akses Supabase.`;
    const error = new Error(message);
    error.status = 503;
    error.code = 'SUPABASE_UNAVAILABLE';
    throw error;
  }
  return result.data;
}
