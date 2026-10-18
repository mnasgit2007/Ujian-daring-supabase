# Ujian Daring — Supabase + Vercel

Versi untuk aplikasi baru dengan database kosong, terpisah dari aplikasi Google Sheets sebelumnya.

- Frontend HTML/CSS/JavaScript tetap di `public/`; endpoint Node.js tetap di `api/`.
- Supabase PostgreSQL menyimpan data akademik; Supabase Storage menyimpan foto/PDF tugas dan gambar soal.
- Login siswa memakai ID/PIN, guru memakai ID/kata sandi, admin memakai kata sandi seperti sebelumnya. Tidak perlu membuat akun siswa di Supabase Auth.
- Ujian, PIN sesi, autosave, penilaian, QR absensi, materi, tugas, profil, kelas, jadwal, dan dashboard memakai alur aplikasi yang sama.
- Tidak ada koneksi Google Sheets/Drive, seed otomatis, atau penyalinan data lama.

**Mulai dari [Panduan aktivasi Supabase dan Vercel](docs/AKTIVASI_SUPABASE_VERCEL.md).** Ikuti urutannya sebelum deploy.

## Konfigurasi

Node.js **24.x**. Salin `.env.example` menjadi `.env.local` dan isi hanya nilai dari proyek baru:

```dotenv
SUPABASE_URL=
SUPABASE_SECRET_KEY=
APP_HASH_SECRET=
APP_SESSION_SECRET=
APP_ADMIN_HASH=
```

Secret key `sb_secret_...` hanya dipakai API server. Jangan menaruhnya di `public/`, kode frontend, GitHub, atau variabel `NEXT_PUBLIC_`/`VITE_`.

```sh
npm ci
npm test
npm run check-supabase
```

`npm test` menggunakan fixture lokal dan PostgreSQL PGlite; tidak menghubungi proyek lama/baru. `check-supabase` membaca proyek yang dikonfigurasi tanpa mengubah data. Pemeriksaan live tetap wajib sebelum dipakai siswa.

## Database dan Storage

Jalankan `supabase/schema.sql` sekali melalui SQL Editor pada proyek Supabase **baru**. Skrip membuat tabel `app_rows`, fungsi transaksi, RLS, serta dua bucket Private. Tidak membuat siswa, guru, kelas, soal, ujian, ataupun tugas.

`app_rows` menyimpan 20 dataset sebagai array kolom JSONB dengan alamat baris stabil. Kontrak ini mempertahankan nomor baris yang dipakai tiket autosave dan format data layanan lama. Penulisan batch berjalan dalam satu transaksi dan append memakai lock per dataset. Pembacaan dipaginasi dan cache hanya berlaku dalam satu request.

RLS aktif dan hak tabel/RPC dicabut dari `anon`/`authenticated`. API Vercel memeriksa identitas/peran, lalu memakai secret server. Jangan membuat kebijakan akses publik untuk tabel atau bucket. Jangan menghapus atau mengubah `row_num` secara manual.

| Bucket | Isi | Batas aplikasi |
| --- | --- | --- |
| `assignment-submissions` | Foto/PDF pengumpulan tugas | 1–5 berkas, total 2 MiB |
| `exam-images` | JPG/PNG/WEBP soal | 220.000 byte per gambar |

## Perintah tambahan

- `npm run hash-admin`: membuat hash kata sandi admin dengan input tersembunyi.
- `npm run create-exam -- ...`: membuat sesi ujian secara eksplisit, default hanya validasi; butuh `--apply` untuk menyimpan.
- `npm run import-questions -- --file=soal.xlsx --exam-id=P01`: validasi impor; tambahkan `--apply` untuk menyimpan.
- `npm run generate-pins -- --apply`: hanya untuk siswa hasil impor manual yang belum memiliki PIN; distribusi disimpan di file lokal privat `qa-output/`.

Jangan menjalankan dua perintah impor/penyiapan untuk ID yang sama secara bersamaan. File CSV/XLSX hanya format impor lokal, bukan database Google.

Skrip `setup-sheet.mjs` dan `setup-assignment-drive.mjs` dihentikan pada versi ini. Panduan lama di `docs/` ditandai arsip; gunakan panduan Supabase di atas.
