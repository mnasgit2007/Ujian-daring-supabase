import { createRowStore } from './supabase-store.js';
import { supabaseAdmin } from './supabase.js';

export const SHEETS = Object.freeze({
  SISWA: 'SISWA',
  UJIAN: 'UJIAN',
  SOAL: 'SOAL',
  SESI: 'SESI',
  LOGIN_LIMIT: 'LOGIN_LIMIT',
  KELAS: 'KELAS',
  RIWAYAT_KELAS: 'RIWAYAT_KELAS',
  ABSENSI_SESI: 'ABSENSI_SESI',
  ABSENSI: 'ABSENSI',
  ABSENSI_PESERTA: 'ABSENSI_PESERTA',
  ABSENSI_DETAIL: 'ABSENSI_DETAIL',
  MATERI: 'MATERI',
  TUGAS: 'TUGAS',
  PENGUMPULAN: 'PENGUMPULAN',
  PROFIL: 'PROFIL',
  GURU: 'GURU',
  PESERTA_UJIAN: 'PESERTA_UJIAN',
  JADWAL: 'JADWAL',
  JADWAL_PENGECUALIAN: 'JADWAL_PENGECUALIAN',
  FOTO_PROFIL: 'FOTO_PROFIL'
});

export const HEADERS = Object.freeze({
  FOTO_PROFIL: ['Kunci', 'FotoJPEG', 'WaktuMs'],
  PESERTA_UJIAN: ['UjianID', 'KelasJSON', 'SiswaJSON', 'Pencatat', 'WaktuMs'],
  JADWAL: ['JadwalID', 'KelasID', 'GuruID', 'Mapel', 'Hari', 'JamMulai', 'JamSelesai', 'Ruang', 'BerlakuDari', 'BerlakuSampai', 'Status', 'Pencatat', 'WaktuMs'],
  JADWAL_PENGECUALIAN: ['JadwalID', 'Tanggal', 'Catatan', 'Pencatat', 'WaktuMs'],
  SISWA: ['ID', 'Nama', 'Kelas', 'Kelompok', 'PinHash', 'Aktif', 'KelasID', 'QrToken'],
  UJIAN: ['UjianID', 'Judul', 'DurasiMenit', 'Mulai', 'Selesai', 'Status', 'TampilkanNilai'],
  SOAL: ['UjianID', 'SoalID', 'Pertanyaan', 'A', 'B', 'C', 'D', 'Kunci', 'Bobot', 'StoragePath'],
  SESI: ['AttemptID', 'UjianID', 'SiswaID', 'MulaiMs', 'DeadlineMs', 'Status', 'JawabanJSON', 'Revisi', 'TerakhirSimpanMs', 'DiserahkanMs', 'Nilai', 'NilaiMaks'],
  LOGIN_LIMIT: ['Key', 'Count', 'LastFailMs'],
  KELAS: ['KelasID', 'NamaKelas', 'Tingkat', 'ProgramKeahlian', 'TahunAjaran', 'Semester', 'KelompokBelajar', 'WaliKelas', 'GuruPengampu', 'Aktif'],
  RIWAYAT_KELAS: ['RiwayatID', 'SiswaID', 'NamaSiswa', 'DariKelasID', 'DariKelas', 'KeKelasID', 'KeKelas', 'Kelompok', 'Jenis', 'WaktuMs'],
  ABSENSI_SESI: ['SesiAbsenID', 'KelasID', 'NamaKelas', 'Judul', 'DibukaMs', 'DitutupMs', 'Status'],
  ABSENSI_PESERTA: ['SesiID', 'SiswaID', 'Nama', 'KelasID', 'Kelompok'],
  ABSENSI_DETAIL: ['CatatanID', 'SesiID', 'SiswaID', 'Status', 'Catatan', 'Pencatat', 'WaktuMs'],
  MATERI: ['MateriID', 'KelasID', 'Judul', 'Topik', 'Isi', 'Tautan', 'Status', 'GuruID', 'WaktuMs'],
  TUGAS: ['TugasID', 'KelasID', 'Judul', 'Instruksi', 'BatasMs', 'IzinkanTerlambat', 'Status', 'GuruID', 'WaktuMs'],
  PENGUMPULAN: ['KirimID', 'TugasID', 'SiswaID', 'NamaSiswa', 'Catatan', 'BerkasJSON', 'WaktuMs', 'Terlambat', 'Nilai', 'UmpanBalik', 'Penilai', 'DinilaiMs', 'RequestID'],
  PROFIL: ['Kunci', 'NamaTampilan', 'Email', 'Telepon', 'Tentang', 'Mapel', 'WaktuMs'],
  GURU: ['GuruID', 'Nama', 'PasswordHash', 'Aktif'],
  ABSENSI: ['AbsenID', 'SesiAbsenID', 'SiswaID', 'NamaSiswa', 'KelasID', 'NamaKelas', 'Kelompok', 'WaktuMs', 'Status']
});

const db = createRowStore(HEADERS, supabaseAdmin);
export const { withRequestCache, invalidate, preload, readRows, appendRows, writeCells, writeRanges, clearCells } = db;

const TZ_OFFSET_HOURS = 8; // Asia/Makassar (WITA), tidak ada DST

function naiveToEpoch(y, mo, d, h, mi, s) {
  return Date.UTC(y, mo - 1, d, h, mi, s || 0) - TZ_OFFSET_HOURS * 3600000;
}

// Terima sel tanggal Spreadsheet asli (angka serial) atau string 'yyyy-mm-dd hh:mm:ss'.
export function cellToEpoch(v) {
  if (typeof v === 'number') {
    // Serial Google Sheets: hari sejak 30 Des 1899. 25569 = jumlah hari sampai 1 Jan 1970.
    const msNaive = Math.round((v - 25569) * 86400000);
    const dt = new Date(msNaive);
    return naiveToEpoch(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds());
  }
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?$/);
  if (!m) throw new Error('Format tanggal harus sel tanggal asli, atau yyyy-mm-dd hh:mm:ss.');
  const epoch = naiveToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
  if (Number.isNaN(epoch)) throw new Error('Tanggal tidak valid.');
  return epoch;
}

export function fmtEpoch(ms) {
  if (ms === null || ms === undefined || ms === '') return '';
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Makassar',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(new Date(n)).replace('T', ' ');
}

export function nowMs() {
  return Date.now();
}
