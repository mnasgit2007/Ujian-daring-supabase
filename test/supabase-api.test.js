import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('real API handlers and Supabase SDK preserve login, roster, exam autosave, resume and grading', async () => {
  process.env.SUPABASE_URL = 'https://offline-fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_offline_fixture';
  process.env.APP_HASH_SECRET = 'offline-hash-secret-for-integration';
  process.env.APP_SESSION_SECRET = 'offline-session-secret-for-integration';
  const pg = new PGlite(), originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
      grant usage on schema storage to service_role; grant select on storage.buckets to service_role;`);
    await pg.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    await pg.exec('set role service_role');
    // The actual SDK serializes REST requests; an offline transport executes
    // the real PostgreSQL schema. This does not simulate hosted Storage/network.
    globalThis.fetch = async (input, options = {}) => {
      const request = new Request(input, options), url = new URL(request.url);
      assert.equal(url.origin, process.env.SUPABASE_URL, 'no other network allowed');
      assert.equal(request.headers.get('apikey'), process.env.SUPABASE_SECRET_KEY);
      requests++;
      try {
        let data;
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          const name = url.pathname.split('/').at(-1), args = await request.json();
          assert.ok(['app_append_rows', 'app_write_ranges'].includes(name));
          const result = await pg.query(`select public.${name}($1, $2::jsonb) as value`, [args.p_sheet, JSON.stringify(args.p_rows || args.p_ranges)]);
          data = result.rows[0].value;
        } else {
          assert.equal(url.pathname, '/rest/v1/app_rows');
          assert.equal(request.method, 'GET');
          const sheet = url.searchParams.get('sheet').slice(3), cursor = Number(url.searchParams.get('row_num').slice(3));
          data = (await pg.query('select row_num,cells from public.app_rows where sheet=$1 and row_num>$2 order by row_num limit 1000', [sheet,cursor])).rows;
        }
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (error) {
        return new Response(JSON.stringify({ code: error.code, message: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    };
    const { hashAdmin } = await import('../api/_lib/auth.js');
    const { appendRows, readRows, fmtEpoch } = await import('../api/_lib/store.js');
    const { default: login } = await import('../api/login.js');
    const { default: admin } = await import('../api/admin.js');
    const { default: learning } = await import('../api/learning.js');
    const { default: attempt } = await import('../api/attempt.js');
    const { default: dashboard } = await import('../api/dashboard.js');
    process.env.APP_ADMIN_HASH = hashAdmin('offline-admin-password');
    async function call(handler, body) {
      let code, data;
      await handler({ method: 'POST', body }, { status(value) { code=value; return this; }, json(value) { data=value; } });
      assert.equal(code, 200, JSON.stringify(data));
      return data;
    }
    const owner = await call(login, { role:'admin', password:'offline-admin-password' });
    assert.deepEqual(owner.students, []);
    assert.deepEqual(owner.exams, []);
    const withClass = await call(admin, { token:owner.token, action:'createClass', name:'XI DKV', grade:'XI', program:'DKV', year:'2026/2027', semester:'Ganjil' });
    const classId = withClass.classes[0].id;
    const created = await call(admin, { token:owner.token, action:'createStudent', studentId:'S1', name:'Ani', classId });
    assert.match(created.createdStudent.pin, /^\d{8}$/);
    await appendRows('UJIAN', [['P1','Ujian',60,fmtEpoch(Date.now()-60000),fmtEpoch(Date.now()+3600000),'TUTUP','YA']]);
    await call(admin, { token:owner.token, action:'createQuestion', examId:'P1', questionId:'Q1', text:'Pilih A', a:'A', b:'B', c:'C', d:'D', key:'A', weight:1 });
    await call(learning, { token:owner.token, action:'saveRoster', examId:'P1', classIds:[classId], studentIds:['S1'] });
    const opened = await call(admin, { token:owner.token, action:'setStatus', examId:'P1', status:'BUKA' });
    const student = await call(login, { role:'student', id:'S1', pin:created.createdStudent.pin });
    assert.equal(student.exams[0].assigned, true);
    assert.ok(!JSON.stringify(student).includes('PinHash'));
    const started = await call(attempt, { token:student.token, action:'start', examId:'P1', sessionPin:opened.exams[0].sessionPin });
    assert.equal(started.done, false);
    assert.equal(started.questions[0].key, undefined, 'answer key is never returned');
    const beforeSave = requests;
    await call(attempt, { token:student.token, action:'save', examId:'P1', ticket:started.ticket, answers:{Q1:'A'}, revision:1 });
    assert.equal(requests-beforeSave, 1, 'ticket autosave remains one database request');
    const resumed = await call(attempt, { token:student.token, action:'start', examId:'P1', sessionPin:opened.exams[0].sessionPin });
    assert.deepEqual(resumed.answers, {Q1:'A'});
    assert.equal(resumed.attemptId, started.attemptId);
    assert.equal((await readRows('SESI')).length, 2);
    const submitted = await call(attempt, { token:student.token, action:'submit', examId:'P1', answers:{Q1:'A'}, revision:2 });
    assert.equal(submitted.done, true);
    assert.equal(submitted.score, submitted.maxScore);
    const progress = await call(dashboard, { token:student.token });
    assert.equal(progress.exams[0].score, submitted.score);
    const monitoring = await call(admin, { token:owner.token });
    assert.equal(monitoring.attempts.length, 1);
    assert.equal(monitoring.attempts[0].studentId, 'S1');
  } finally {
    globalThis.fetch = originalFetch;
    await pg.close();
  }
});
