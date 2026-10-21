import { AsyncLocalStorage } from 'node:async_hooks';
import { unwrap } from './supabase.js';

const colNumber = letters => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

export function parseRange(a1) {
  const m = String(a1).match(/^([A-Z]+)([1-9]\d*)(?::([A-Z]+)([1-9]\d*))?$/);
  if (!m) throw new Error('Rentang sel tidak valid.');
  const start_row = Number(m[2]), start_col = colNumber(m[1]);
  const end_row = Number(m[4] || m[2]), end_col = colNumber(m[3] || m[1]);
  if (!Number.isSafeInteger(end_row) || start_row < 2 || end_row < start_row || end_col < start_col || end_col > 64) throw new Error('Rentang sel di luar batas.');
  return { start_row, start_col, end_row, end_col, bounded: Boolean(m[3]) };
}

function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000 || rows.some(row =>
    !Array.isArray(row) || !row.length || row.length > 64 || row.some(value =>
      value !== null && !['string', 'number', 'boolean'].includes(typeof value) ||
      typeof value === 'number' && !Number.isFinite(value)))) throw new Error('Format baris tidak valid.');
}

// Preserve the original row-array/A1 contract used by exam tickets and services.
export function createRowStore(headers, getClient) {
  const requestScope = new AsyncLocalStorage();
  const assertSheet = sheet => {
    if (!Object.hasOwn(headers, sheet)) throw new Error('Dataset aplikasi tidak dikenal.');
  };
  const invalidate = sheet => requestScope.getStore()?.delete(sheet);
  const withRequestCache = fn => requestScope.run(new Map(), fn);

  async function loadRows(sheet) {
    const rows = [[...headers[sheet]]];
    let cursor = 1;
    // Keyset pagination handles both the default 1000-row limit and lower
    // project limits; never stop just because one page has fewer than 1000.
    for (;;) {
      const page = unwrap(await getClient().from('app_rows').select('row_num,cells')
        .eq('sheet', sheet).gt('row_num', cursor).order('row_num').limit(1000), 'Baca data');
      if (!page.length) break;
      for (const row of page) {
        const number = Number(row.row_num);
        if (!Number.isSafeInteger(number) || number <= cursor || !Array.isArray(row.cells)) throw new Error('Format data Supabase tidak valid.');
        while (rows.length < number - 1) rows.push([]);
        rows[number - 1] = row.cells;
        cursor = number;
      }
    }
    return rows;
  }

  async function readRows(sheet, opts = {}) {
    assertSheet(sheet);
    const cache = requestScope.getStore();
    if (!opts.fresh && cache?.has(sheet)) return cache.get(sheet);
    const promise = loadRows(sheet);
    cache?.set(sheet, promise);
    try { return await promise; }
    catch (error) { if (cache?.get(sheet) === promise) cache.delete(sheet); throw error; }
  }

  async function preload(names) { await Promise.all([...new Set(names)].map(name => readRows(name))); }

  async function appendRows(sheet, rows) {
    assertSheet(sheet);
    if (Array.isArray(rows) && !rows.length) return 0;
    validateRows(rows);
    // No application-level retry of a non-idempotent append.
    try {
      return Number(unwrap(await getClient().rpc('app_append_rows', { p_sheet: sheet, p_rows: rows }), 'Tambah data'));
    } finally { invalidate(sheet); }
  }

  async function writeRanges(sheet, ranges) {
    assertSheet(sheet);
    if (!Array.isArray(ranges)) throw new Error('Format rentang tidak valid.');
    if (!ranges.length) return;
    const patches = ranges.map(({ a1, values }) => {
      const range = parseRange(a1);
      validateRows(values);
      if (range.start_col + Math.max(...values.map(r => r.length)) - 1 > 64 ||
          range.bounded && (values.length > range.end_row - range.start_row + 1 ||
            values.some(row => row.length > range.end_col - range.start_col + 1))) throw new Error('Nilai melebihi rentang sel.');
      return { start_row: range.start_row, start_col: range.start_col, values };
    });
    try {
      unwrap(await getClient().rpc('app_write_ranges', { p_sheet: sheet, p_ranges: patches }), 'Perbarui data');
    } finally { invalidate(sheet); }
  }

  async function writeCells(sheet, a1, values) { return writeRanges(sheet, [{ a1, values }]); }
  async function clearCells(sheet, a1) {
    const r = parseRange(a1);
    if (r.end_row - r.start_row >= 1000) throw new Error('Rentang terlalu besar.');
    return writeCells(sheet, a1, Array.from({ length: r.end_row - r.start_row + 1 }, () => Array(r.end_col - r.start_col + 1).fill('')));
  }
  return { withRequestCache, invalidate, readRows, preload, appendRows, writeCells, writeRanges, clearCells };
}
