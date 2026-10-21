import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createRowStore, parseRange } from '../api/_lib/supabase-store.js';
import { HEADERS } from '../api/_lib/store.js';
import { supabaseConfig, unwrap } from '../api/_lib/supabase.js';
import { optionalAcademicRows } from '../api/_lib/academic.js';

let pg, store, reads = 0;
// Execute the production SQL, not a JS reimplementation of its mutations.
const client = {
  from(table) {
    assert.equal(table, 'app_rows');
    let sheet, cursor;
    const q = {
      select() { return q; }, eq(_key, value) { sheet = value; return q; },
      gt(_key, value) { cursor = value; return q; }, order() { return q; }, limit() { return q; },
      then(resolve, reject) {
        reads++;
        // Deliberately cap pages at two to verify project limits below 1000.
        return pg.query('select row_num, cells from public.app_rows where sheet=$1 and row_num>$2 order by row_num limit 2', [sheet, cursor])
          .then(result => ({ data: result.rows, error: null }), error => ({ data: null, error }))
          .then(resolve, reject);
      }
    };
    return q;
  },
  async rpc(name, args) {
    assert.ok(['app_append_rows', 'app_write_ranges'].includes(name));
    try {
      const result = await pg.query(`select public.${name}($1, $2::jsonb) as value`, [args.p_sheet, JSON.stringify(args.p_rows || args.p_ranges)]);
      return { data: result.rows[0].value, error: null };
    } catch (error) { return { data: null, error }; }
  }
};
before(async () => {
  pg = new PGlite();
  // Supabase creates these roles and the Storage schema itself.
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
    grant usage on schema storage to service_role;
    grant select on storage.buckets to service_role;`);
  await pg.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  store = createRowStore(HEADERS, () => client);
});
beforeEach(async () => {
  await pg.exec('reset role; delete from public.app_rows; set role service_role;');
  reads = 0;
});
after(async () => { await pg?.close(); });

test('bootstrap creates no application data and verifies private server-only access', async () => {
  const { rows } = await pg.query('select public.app_check_setup() as result');
  assert.deepEqual(rows[0].result, { version: 1, rls: true, server_write: true, client_access: false, private_buckets: 2 });
  for (const dataset of Object.keys(HEADERS)) assert.deepEqual(await store.readRows(dataset), [HEADERS[dataset]]);
  for (const role of ['anon', 'authenticated']) {
    await pg.exec('reset role; set role ' + role);
    await assert.rejects(pg.query('select * from public.app_rows'), /permission denied/);
    await assert.rejects(pg.query("select public.app_append_rows('SISWA', '[[\"intruder\"]]')"), /permission denied/);
    await assert.rejects(pg.query("select public.app_write_ranges('SISWA', '[]')"), /permission denied/);
  }
});

test('append returns first row and paginates all records without changing scalar values', async () => {
  const data = [['S1', 'Ani', 1, true, null], ['S2'], ['S3'], ['S4'], ['S5']];
  assert.equal(await store.appendRows('SISWA', data), 2);
  assert.equal(await store.appendRows('SISWA', [['S6']]), 7);
  assert.deepEqual(await store.readRows('SISWA'), [HEADERS.SISWA, ...data, ['S6']]);
  assert.equal(reads, 4);
});

test('A1 updates preserve neighbors and pad the optional exam PIN column', async () => {
  await store.appendRows('UJIAN', [['P1', 'Ujian', 60, 'start', 'end', 'TUTUP', 'YA']]);
  await store.writeCells('UJIAN', 'H2', [['123456']]);
  await store.writeRanges('UJIAN', [{ a1: 'B2:C2', values: [['Baru', 90]] }, { a1: 'F2', values: [['BUKA']] }]);
  assert.deepEqual((await store.readRows('UJIAN'))[1], ['P1', 'Baru', 90, 'start', 'end', 'BUKA', 'YA', '123456']);
});

test('a failed batch rolls back earlier writes and never creates phantom attempt rows', async () => {
  await store.appendRows('SESI', [['attempt', 'P1', 'S1', 100, 1000, 'AKTIF']]);
  await assert.rejects(store.writeRanges('SESI', [
    { a1: 'F2', values: [['SELESAI']] }, { a1: 'F99', values: [['SELESAI']] }
  ]), error => error.status === 503);
  assert.equal((await store.readRows('SESI'))[1][5], 'AKTIF');
  assert.equal((await store.readRows('SESI')).length, 2);
});

test('clearing rows preserves ticket positions and appends do not reuse a cleared row', async () => {
  await store.appendRows('SESI', [['a', 'P1', 'S1'], ['b', 'P1', 'S2']]);
  await store.clearCells('SESI', 'A2:C2');
  assert.equal(await store.appendRows('SESI', [['c', 'P1', 'S3']]), 4);
  const rows = await store.readRows('SESI');
  assert.deepEqual(rows[1], ['', '', '']);
  assert.equal(rows[2][0], 'b');
  // Even maintenance gaps must not shift the row numbers held in tickets.
  await pg.exec("reset role; delete from public.app_rows where sheet='SESI' and row_num=2; set role service_role;");
  assert.deepEqual((await store.readRows('SESI'))[1], []);
  assert.equal((await store.readRows('SESI'))[2][0], 'b');
});

test('request caches deduplicate reads, refresh after writes, and never cross requests', async () => {
  await store.withRequestCache(async () => {
    await Promise.all([store.readRows('SISWA'), store.readRows('SISWA')]);
    assert.equal(reads, 1);
    await store.appendRows('SISWA', [['S1']]);
    assert.equal((await store.readRows('SISWA')).length, 2);
    const before = reads;
    await store.readRows('SISWA'); assert.equal(reads, before);
    await store.readRows('SISWA', { fresh: true }); assert.ok(reads > before);
  });
  const before = reads;
  await store.withRequestCache(() => store.readRows('SISWA'));
  assert.ok(reads > before);
});

test('SQL validates direct RPC payloads and rolls back partially valid appends', async () => {
  await assert.rejects(pg.query("select public.app_append_rows('SISWA', '[[\"S1\"],[{}]]')"), /Invalid cells/);
  assert.equal((await store.readRows('SISWA')).length, 1);
  await assert.rejects(pg.query("select public.app_append_rows('UNKNOWN', '[[\"S1\"]]')"), /check constraint/);
  await assert.rejects(store.writeCells('SISWA', 'A1', [['x']]), /batas/);
  await assert.rejects(store.appendRows('SISWA', [[{}]]), /Format/);
  assert.throws(() => parseRange('A2;DROP'), /valid/);
});

test('missing Supabase schema fails closed instead of bypassing exam roster restrictions', async () => {
  const db = { readRows() { unwrap({ error: { code: 'PGRST205', message: 'private detail' } }); } };
  await assert.rejects(optionalAcademicRows(db, 'PESERTA_UJIAN'), error => error.status === 503 && !error.message.includes('private detail'));
});

test('configuration accepts only a new server secret and never falls back to Google variables', () => {
  assert.throws(() => supabaseConfig({ SPREADSHEET_ID: 'old' }), /SUPABASE_URL/);
  assert.throws(() => supabaseConfig({ SUPABASE_URL: 'https://new.supabase.co', SUPABASE_SECRET_KEY: 'sb_publishable_public' }), /secret key/);
  assert.equal(supabaseConfig({ SUPABASE_URL: 'https://new.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }).key, 'sb_secret_test');
});
