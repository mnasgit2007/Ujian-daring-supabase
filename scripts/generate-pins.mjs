// Maintenance for manually imported students without a PIN hash.
// Normal student creation in the admin dashboard already generates a PIN.
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { readRows, writeRanges } from '../api/_lib/store.js';
import { hashSiswa } from '../api/_lib/auth.js';

async function main() {
  const rows = await readRows('SISWA', { fresh: true });
  const seen = new Set(), made = [], updates = [];
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0] || '').trim(), name = String(rows[i][1] || '').trim();
    if (!id && !name) continue;
    if (!id || !name || seen.has(id)) throw new Error('ID/nama kosong atau ID duplikat pada baris ' + (i + 1));
    seen.add(id);
    if (String(rows[i][4] || '').trim()) continue;
    const pin = crypto.randomInt(0, 100000000).toString().padStart(8, '0');
    made.push([id, name, pin]);
    updates.push({ a1: 'E' + (i + 1), values: [[hashSiswa(id, pin)]] });
  }
  if (!updates.length) { console.log('Tidak ada siswa yang memerlukan PIN baru.'); return; }
  if (updates.length > 1000) throw new Error('Maksimal 1000 siswa per proses. Gunakan penambahan siswa dari dashboard.');
  if (!process.argv.includes('--apply')) { console.log(made.length + ' siswa memerlukan PIN. Tambahkan --apply untuk menyimpan.'); return; }
  await mkdir('qa-output', { recursive: true, mode: 0o700 });
  const file = 'qa-output/pin-distribusi-' + crypto.randomUUID() + '.csv';
  const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
  const csv = [['ID', 'Nama', 'PIN'], ...made].map(row => row.map(quote).join(',')).join('\n');
  // Save distribution first; a disk error must not leave inaccessible PINs.
  await writeFile(file, csv, { flag: 'wx', mode: 0o600 });
  try { await writeRanges('SISWA', updates); }
  catch (error) {
    // Keep this private file: a network timeout can happen after a committed RPC.
    throw new Error('Penyimpanan belum terkonfirmasi. Simpan ' + file + ' dan periksa database sebelum mengulang. ' + error.message);
  }
  console.log(made.length + ' PIN dibuat. Bagikan isi ' + file + ' secara pribadi, lalu hapus file tersebut.');
}
main().catch(error => { console.error('Gagal:', error.message); process.exitCode = 1; });
