# Panduan aktivasi: aplikasi baru, Supabase + Vercel

Panduan ini hanya untuk repository `mnasgit2007/Ujian-daring-supabase` dan project Vercel `mgl-1/ujian-daring-supabase`. Jangan mengubah project aplikasi lama. Data dimulai kosong; tidak perlu menyalin Spreadsheet.

## 1. Siapkan kode versi Supabase

Pasang Node.js 24 LTS dan Git di komputer. Buka PowerShell di folder kerja. Jika belum memiliki salinan repository baru:

```powershell
git clone https://github.com/mnasgit2007/Ujian-daring-supabase.git
cd Ujian-daring-supabase
git switch migration/supabase-vercel
npm ci
npm test
```

Jika sudah mempunyai folder clone yang benar, gunakan `git remote -v` untuk memastikan URL-nya **Ujian-daring-supabase**, lalu `git status`. Simpan pekerjaan lokal Anda dahulu jika ada perubahan; jangan menjalankan reset untuk menghapusnya. Setelah bersih:

```powershell
git fetch origin
git switch migration/supabase-vercel
git pull --ff-only
npm ci
npm test
```

Sesudah PR digabung, gunakan `main` menggantikan `migration/supabase-vercel`. Hasil `npm test` harus menunjukkan semua test lulus. Test ini belum membuktikan koneksi Supabase/Vercel milik Anda.

## 2. Buat project Supabase baru

1. Buka https://supabase.com/dashboard dan masuk ke akun Anda.
2. Pilih **New project**, pilih organisasi Anda, beri nama misalnya `ujian-daring-supabase`.
3. Buat database password baru dan simpan di pengelola kata sandi. Password database berbeda dari kata sandi admin aplikasi dan berbeda dari secret API.
4. Pilih region yang dekat dengan pengguna; tunggu project siap.
5. Periksa nama project sebelum melanjutkan. Jangan memilih database aplikasi lain.

Jika memakai konektor Supabase di ChatGPT, sambungkan akun/organisasi yang memiliki project ini. Daftar kosong pada konektor berarti project belum dapat diakses dari koneksi tersebut, bukan bukti semua akun Anda tidak mempunyai project.

## 3. Buat schema dan bucket

1. Di project baru, buka **SQL Editor → New query**.
2. Buka file `supabase/schema.sql` dari versi kode ini. Salin seluruh isinya, termasuk `begin;` dan `commit;`.
3. Tempel ke SQL Editor, lalu **Run** sebagai pengguna database pengelola bawaan.
4. Buka **Table Editor → public → app_rows**. Tabel harus ada dan kosong.
5. Buka **Storage**. Harus terdapat `assignment-submissions` dan `exam-images`, keduanya **Private**.

Tidak perlu membuat 20 tabel secara manual. Kolom `sheet` adalah nama dataset internal, bukan koneksi Spreadsheet. Header kolom disediakan kode aplikasi. Schema boleh dijalankan kembali untuk pemasangan yang sama dan tidak menghapus data; skrip tidak akan mengubah bucket yang sudah ada menjadi Private secara otomatis. Jika bucket sudah terlanjur Public, ubah ke Private sebelum menggunakan aplikasi.

Jangan mematikan RLS, memberi akses publik ke `app_rows`, membuat policy upload anonim, atau menghapus baris sesi secara manual. Hak siswa/guru dikelola endpoint aplikasi.

## 4. Ambil dua nilai koneksi baru

Di dashboard Supabase project baru, gunakan panel **Connect** atau **Settings → API/Data API** untuk Project URL, dan **Settings → API Keys** untuk secret key. Nama menu dapat berubah; yang dibutuhkan adalah:

| Nama variabel aplikasi | Nilai yang disalin |
| --- | --- |
| `SUPABASE_URL` | Project URL `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Secret key baru dengan awalan `sb_secret_` |

Jangan gunakan database password, personal access token, `sb_publishable_`, atau key aplikasi lama sebagai `SUPABASE_SECRET_KEY`. Kode versi ini sengaja meminta secret key baru. Jangan kirim nilai secret ke chat/GitHub.

## 5. Buat konfigurasi lokal yang terpisah

Di folder **Ujian-daring-supabase**:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Jika `.env.local` sudah ada, buka dan periksa dulu; jangan menimpanya. Isi URL dan secret key baru. Buat dua secret aplikasi berbeda dengan menjalankan perintah ini **dua kali**:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Salin hasil pertama ke `APP_HASH_SECRET`, hasil kedua ke `APP_SESSION_SECRET`. Simpan file. Biarkan `APP_ADMIN_HASH` kosong untuk sementara. Jalankan:

```powershell
npm run hash-admin
```

Ketik kata sandi admin baru, minimal 12 karakter, lalu Enter. Karakter tidak ditampilkan saat diketik. Simpan kata sandinya; inilah yang dipakai untuk login admin, bukan nilai hash. Salin hasil `APP_ADMIN_HASH=...` ke baris dengan nama yang sama di `.env.local`. Simpan kembali.

```dotenv
SUPABASE_URL=https://PROJECT-REF-BARU.supabase.co
SUPABASE_SECRET_KEY=sb_secret_ISI_DARI_PROJECT_BARU
APP_HASH_SECRET=ISI_SECRET_ACAK_PERTAMA
APP_SESSION_SECRET=ISI_SECRET_ACAK_KEDUA
APP_ADMIN_HASH=ISI_HASIL_HASH_ADMIN
APP_SESSION_TTL_SECONDS=21600
APP_SHUFFLE_QUESTIONS=NO
```

Contoh di atas berisi placeholder, bukan nilai siap pakai. `APP_SHUFFLE_QUESTIONS=YA` mengaktifkan pengacakan soal; `NO` mempertahankan urutan. Masa sesi default 6 jam.

Periksa file tidak ikut Git:

```powershell
git check-ignore .env.local
git status
```

Perintah pertama harus menampilkan `.env.local`. Status Git boleh tetap **working tree clean** karena file tersebut diabaikan. Jangan menggunakan `git add -f .env.local`. Setelah mulai membuat akun siswa/guru, simpan `APP_HASH_SECRET` secara tetap; menggantinya membuat hash kata sandi/PIN lama tidak cocok. Mengganti `APP_SESSION_SECRET` mengakhiri sesi login yang sudah diterbitkan.

## 6. Uji konfigurasi Supabase

```powershell
npm run check-supabase
```

Hasil yang diharapkan:

```text
OK: konfigurasi, database, RPC, RLS, dan dua bucket Private siap. Tidak ada data yang diubah.
```

Perintah ini memeriksa variabel, fungsi SQL, hak akses tabel, RLS, dan bucket Private. Jika gagal, perbaiki penyebabnya sebelum deploy. Tidak perlu menjalankan setup Google, OAuth, service account, atau mengisi `SPREADSHEET_ID`.

## 7. Atur hanya project Vercel baru

Buka https://vercel.com/mgl-1/ujian-daring-supabase. Periksa **Settings → Git**: repository harus `mnasgit2007/Ujian-daring-supabase`. Pastikan folder root project adalah root repository, bukan `public/` karena folder `api/` harus ikut deploy.

Pengaturan build yang sesuai kode:

| Pengaturan | Nilai |
| --- | --- |
| Framework Preset | Other |
| Node.js Version | 24.x |
| Root Directory | Root repository, kosong atau `.` |
| Install Command | Default npm, atau `npm ci` |
| Build Command | Kosong; tidak perlu `npm run build` |
| Output Directory | `public` |

`vercel.json` sudah menetapkan framework, output, dan build command. Tidak perlu mengonversi frontend menjadi Next.js/Vite. Function berada di `api/*.js` dan dipasang oleh Vercel.

Jika Vercel menampilkan 403, masuk dengan akun yang mempunyai akses ke tim `mgl-1`. Jika lewat konektor, sambungkan konektor ke akun/tim tersebut; perubahan kode tidak dapat memperbaiki izin akun Vercel.

## 8. Isi Environment Variables pada project baru

Buka **Settings → Environment Variables** pada `ujian-daring-supabase`. Tambahkan kelima variabel wajib dari `.env.local`, dengan nilai persis sama. Jangan salin konfigurasi project lama.

| Wajib | Opsional |
| --- | --- |
| `SUPABASE_URL` | `APP_SESSION_TTL_SECONDS` |
| `SUPABASE_SECRET_KEY` | `APP_SHUFFLE_QUESTIONS` |
| `APP_HASH_SECRET` | |
| `APP_SESSION_SECRET` | |
| `APP_ADMIN_HASH` | |

Untuk tahap pertama, pilih lingkungan **Preview** dan branch `migration/supabase-vercel` jika pilihan branch tersedia. Nilai key tanpa tanda kutip atau spasi tambahan. Jangan menambahkan awalan `NEXT_PUBLIC_` atau `VITE_`. Semua secret hanya dipakai server.

Variabel Production dan Preview boleh memiliki nama sama. Lingkungannya menentukan nilai yang dipakai. Jika keduanya memakai URL/key Supabase yang sama, keduanya membaca dan mengubah database yang sama. Untuk pengujian setelah aplikasi dipakai sungguhan, buat project Supabase Preview terpisah dengan schema yang sama. Jangan menganggap branch Preview otomatis membuat salinan database.

Variabel Google/Drive lama tidak dibaca kode baru. Biarkan project lama tetap utuh. Pada project clone, variabel lama tidak perlu dihapus untuk menjalankan versi ini; jangan mengubah nilai variabel bersama tingkat tim yang juga dipakai project lain.

## 9. Buat deployment Preview

Jika integrasi GitHub aktif, push branch/PR memicu Preview. Setelah mengisi variabel, buka **Deployments**, pilih deployment branch ini, lalu **Redeploy** dengan environment Preview. Perubahan variabel tidak memperbarui deployment yang sudah berjalan.

Tunggu status **Ready**, lalu **Visit**. Jika gagal, periksa Build Logs terlebih dahulu. Jangan memilih Promote ke Production sebelum uji berikut selesai. Untuk menjalankan seluruh API secara lokal, gunakan Vercel CLI yang terhubung ke project baru; membuka `index.html` langsung atau memakai server static saja tidak menjalankan endpoint `/api`.

## 10. Isi dan uji aplikasi kosong

1. Buka halaman aplikasi Preview, pilih login admin. ID guru dibiarkan kosong; isi kata sandi yang dipakai pada tahap hash-admin.
2. Dashboard kosong adalah hasil yang benar. Buat kelas melalui fitur Kelas, lalu buat satu siswa uji dan simpan PIN yang ditampilkan.
3. Sebagai admin utama, buka menu **Tambah Guru**, klik **Tambah Guru**, isi ID/nama/password dan konfirmasinya, lalu **Buat akun guru**. Guru login melalui **Guru / Admin** menggunakan ID Guru + password. Untuk reset password dan status akun, lihat [panduan pengelolaan guru](PENGELOLAAN_GURU.md).
4. Buat materi dan tugas untuk kelas uji. Terbitkan, masuk sebagai siswa, lalu pastikan hanya materi/tugas kelasnya yang muncul.
5. Kirim foto JPG/PNG/WEBP atau PDF melalui tugas. Batas total 2 MiB, maksimal 5 berkas, seperti alur lama. Pastikan bukti pengumpulan muncul, guru dapat mengunduh, memberi nilai/umpan balik, dan siswa melihat hasilnya.
6. Uji jadwal mengajar, absensi QR, koreksi Hadir/Izin/Sakit/Alpa, profil, kalender, dan rangkuman dashboard.

Untuk sesi ujian pertama, aplikasi lama menggunakan pengisian data dari luar dashboard. Penggantinya adalah perintah lokal berikut (ubah tanggal sesuai waktu uji, semuanya **WITA**):

```powershell
npm run create-exam -- --id=P01 --title="Ujian Percobaan" --duration=60 --start="2026-10-20 08:00:00" --end="2026-10-20 10:00:00"
```

Perintah pertama hanya memvalidasi. Setelah nilai benar, ulangi dengan tambahan `--apply` di akhir. Ujian dibuat berstatus **TUTUP**. Di dashboard admin, buka editor soal, buat minimal satu soal, tentukan peserta kelas/siswa melalui fitur peserta ujian, lalu buka sesi. Bagikan PIN sesi kepada siswa uji.

Uji masuk ujian, isi jawaban, tunggu autosave, muat ulang, pastikan jawaban tetap ada, lalu serahkan dan periksa nilai. Monitoring harus menghitung peserta yang dipilih. Jangan membuka ujian tanpa memastikan peserta dan waktu aktifnya.

Jika perlu impor soal lokal:

```powershell
npm run import-questions -- --file=soal.xlsx --exam-id=P01
npm run import-questions -- --file=soal.xlsx --exam-id=P01 --apply
```

Header: `SoalID`, `Pertanyaan`, `A`, `B`, `C`, `D`, `Kunci`, `Bobot`, dan opsional `StoragePath`. Maksimal total 80 soal per ujian; ujian harus TUTUP. CSV/TSV/XLSX boleh dipakai sebagai file impor tanpa Google API.

Untuk gambar soal, unggah gambar JPG/PNG/WEBP maksimal 220.000 byte melalui Supabase **Storage → exam-images**. Gunakan nama object seperti `P01/q01.jpg`, lalu isi path tersebut di kolom Gambar Soal editor atau `StoragePath` impor. Jangan isi ID Google Drive, URL public, atau URL bertanda tangan. Gambar diakses aplikasi hanya selama sesi siswa masih aktif.

## 11. Aktifkan Production setelah uji berhasil

1. Siapkan database Production baru yang akan dipakai sekolah. Jika Preview berisi data percobaan dan Production harus kosong, buat project Supabase baru lagi, jalankan schema, dan buat konfigurasi Production tersendiri. Tidak perlu menghapus database percobaan atau data project lama.
2. Tambahkan kelima variabel wajib untuk lingkungan **Production** pada project Vercel yang sama. Jika memakai secret aplikasi berbeda, hitung ulang `APP_ADMIN_HASH` memakai `APP_HASH_SECRET` Production.
3. Jalankan pemeriksaan konfigurasi menggunakan file environment Production yang disimpan lokal dan diabaikan Git, misalnya `node --env-file=.env.production.local scripts/check-supabase.mjs`.
4. Setelah review kode dan uji Preview selesai, gabungkan PR ke production branch yang diatur Vercel, biasanya `main`.
5. Biarkan Vercel membuat deployment Production baru dengan variabel Production. Jangan hanya mempromosikan artefak Preview lalu menganggap variabelnya berubah.
6. Uji login admin, akses siswa, autosave, pengumpulan tugas, dan absensi pada URL Production sebelum membagikannya ke kelas.

## 12. Jika ada error

| Gejala | Pemeriksaan |
| --- | --- |
| `.env.local` tidak ditemukan | Jalankan dari root repository; pastikan ekstensi bukan `.env.local.txt`. |
| `SUPABASE_URL`/secret belum diatur | Isi file lokal untuk CLI dan Environment Variables Vercel untuk deployment; keduanya terpisah. |
| `Schema Supabase belum lengkap` | Jalankan seluruh schema di project yang cocok dengan URL/key. Pastikan SQL sukses dan Data API mengakses schema `public`. |
| RPC/permission denied | Pastikan memakai `sb_secret_` project yang benar, schema/grant sudah selesai, dan project Supabase aktif. Jangan mengatasi dengan membuka akses publik. |
| Bucket harus privat | Buka kedua bucket dan nonaktifkan Public; pastikan project yang dipilih benar. |
| Admin gagal login | Gunakan kata sandi asli, bukan hash. Hash harus dibuat memakai `APP_HASH_SECRET` pada environment yang sedang dibuka. |
| Halaman muncul, `/api` 404 | Root Directory harus root repository; folder `api/` ikut deploy, framework Other, output public. |
| Build mencari script `build` | Pastikan deployment berisi `vercel.json` baru dan override build lama di Settings dinonaktifkan. |
| Preview berhasil, Production gagal | Periksa kelima variabel di Production, lalu buat deployment Production baru. |
| Upload gagal | Periksa bucket, tipe/ukuran berkas, key server, serta batas Storage project Anda. |
| Gambar soal tidak tampil | Periksa path exact/case-sensitive, bucket exam-images, format/ukuran, dan sesi siswa masih aktif. |
| Vercel 403 / Supabase project tidak terlihat | Perbaiki akun, tim/organisasi, atau izin konektor; jangan membagikan secret di chat. |

Saat meminta bantuan, kirim pesan error dan nama deployment/project tanpa menampilkan nilai secret. `npm test` dan pengecekan SQL lokal bukan pengganti uji pada deployment sebenarnya.

Referensi resmi: [API keys Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [konfigurasi Vercel](https://vercel.com/docs/project-configuration/vercel-json), [Environment Variables Vercel](https://vercel.com/docs/environment-variables).
