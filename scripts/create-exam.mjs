// Explicit, opt-in creation for a fresh database; never runs at install/deploy.
import { readRows, appendRows, cellToEpoch } from '../api/_lib/store.js';

const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) || '';
async function main() {
  const id = arg('id'), title = arg('title'), start = arg('start'), end = arg('end');
  const duration = Number(arg('duration'));
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(id) || !title || title.length > 200 || !Number.isInteger(duration) || duration < 1 || duration > 600) {
    throw new Error('Isi --id=P01 --title="Ujian" --duration=60 --start="2026-10-20 08:00:00" --end="2026-10-20 10:00:00" [--apply]. Waktu WITA.');
  }
  if (cellToEpoch(end) <= cellToEpoch(start)) throw new Error('Selesai harus setelah mulai.');
  const existing = await readRows('UJIAN', { fresh: true });
  if (existing.slice(1).some(row => String(row[0]) === id)) throw new Error('ID ujian sudah digunakan.');
  if (!process.argv.includes('--apply')) { console.log('Validasi OK. Belum menyimpan. Tambahkan --apply untuk membuat ujian berstatus TUTUP.'); return; }
  await appendRows('UJIAN', [[id, title, duration, start, end, 'TUTUP', 'YA', '']]);
  console.log('Ujian dibuat dengan status TUTUP. Tambahkan soal dan atur peserta di dashboard admin sebelum membuka ujian.');
}
main().catch(error => { console.error('Gagal:', error.message); process.exitCode = 1; });
