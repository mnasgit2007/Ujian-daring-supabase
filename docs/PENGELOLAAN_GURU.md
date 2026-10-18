# Mengelola akun guru

Fitur ini memakai dataset GURU yang sudah ada. Tidak perlu menjalankan SQL tambahan, membuat akun di Supabase Auth, atau mengubah environment variable.

## 1. Masuk sebagai admin utama

1. Buka aplikasi yang sudah menggunakan deployment terbaru branch `migration/supabase-vercel`.
2. Pilih **Guru / Admin** pada halaman login.
3. Kosongkan **ID Guru**, lalu isi password admin utama.
4. Setelah dashboard selesai dimuat, pilih menu **Tambah Guru**. Di HP, buka menu navigasi admin jika tertutup.

Menu hanya tersedia untuk admin utama. Login menggunakan ID Guru tidak memberikan akses untuk membuat/mengubah akun guru lain.

## 2. Membuat guru

1. Pada halaman Kelola akun guru, klik **Tambah Guru**.
2. Isi ID unik, misalnya `GURU-DKV-01`. Gunakan 2–40 karakter: huruf, angka, titik, garis bawah, atau tanda hubung. Jangan memakai spasi atau ID `ADMIN`.
3. Isi nama lengkap guru.
4. Isi password awal sepanjang 10–80 karakter, lalu ulangi password yang sama. Jangan tambahkan spasi di awal/akhir.
5. Klik **Buat akun guru**. Tunggu pesan berhasil dan nama muncul dengan status Aktif.
6. Bagikan ID dan password secara pribadi kepada guru. Password tidak ditampilkan kembali dalam daftar akun.

Daftar dapat dicari berdasarkan nama/ID dan difilter menurut status. Akun guru tetap memiliki akses pengelolaan pembelajaran seperti sebelumnya; fitur ini tidak mempersempitnya menjadi hanya mata pelajaran/kelas tertentu.

## 3. Guru login

1. Guru membuka aplikasi dan memilih **Guru / Admin**.
2. Isi **ID Guru** persis seperti yang dibuat admin, termasuk huruf besar/kecil.
3. Isi password akun guru, lalu klik tombol masuk.

Admin utama menggunakan kolom ID Guru kosong. Siswa tetap memakai tab Siswa dengan ID siswa dan PIN.

## 4. Mengganti password guru

1. Cari nama guru di menu **Tambah Guru**.
2. Klik **Atur password** pada akun yang benar.
3. Isi password baru dan konfirmasinya, lalu **Simpan password**.
4. Bagikan password baru secara pribadi. Password lama tidak bisa digunakan untuk login. Sesi yang dibuat dengan password lama ditolak pada permintaan berikutnya jika password berubah.

Admin tidak perlu mengetahui password lama. Mengganti password tidak mengaktifkan akun yang berstatus Nonaktif. Setelah pembaruan fitur ini pertama kali dipasang, guru yang sudah login perlu keluar dan masuk kembali; sesi admin utama dan siswa tidak berubah.

## 5. Menonaktifkan atau mengaktifkan kembali

1. Cari akun guru yang dituju.
2. Klik **Nonaktifkan** dan periksa nama/ID pada konfirmasi.
3. Akun tidak dapat login; sesi yang sedang terbuka ditolak saat mengakses API berikutnya. Halaman yang sudah terbuka mungkin masih menampilkan data yang sebelumnya dimuat.
4. Untuk memulihkan akses, klik **Aktifkan**. Guru dapat login kembali dengan password akun tersebut. Jika perlu menghentikan penggunaan kredensial lama, ganti password sebelum mengaktifkan kembali.

Penonaktifan tidak menghapus akun, profil, materi, tugas, nilai, atau jadwal guru. Jadwal yang sudah diterbitkan tetap tersimpan dan dapat diatur melalui fitur jadwal seperti sebelumnya.

## Jika menu belum terlihat

- Pastikan login sebagai admin utama, bukan guru bernama.
- Pastikan URL yang dibuka menggunakan commit terbaru branch Supabase. Merge ke main belum otomatis dilakukan oleh perubahan ini.
- Tunggu dashboard selesai dimuat; jika ada error koneksi, gunakan Muat ulang setelah koneksi pulih.
- Setelah deployment baru siap, lakukan refresh paksa browser (`Ctrl+F5`).

Untuk memperbarui folder VS Code yang bersih:

```powershell
git status
git switch migration/supabase-vercel
git pull --ff-only origin migration/supabase-vercel
npm.cmd test
```

Jika `git status` menunjukkan perubahan lokal, simpan pekerjaan tersebut terlebih dahulu. File `.env.local` tetap digunakan dan tidak perlu diganti.
