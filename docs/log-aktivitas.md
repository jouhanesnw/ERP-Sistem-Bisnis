# Log Aktivitas — Audit Trail

## Cakupan yang dicatat

Migration `026_log_aktivitas.sql` memasang trigger `AFTER INSERT OR UPDATE OR DELETE` pada semua tabel data perusahaan di schema `public` yang saat migration dijalankan memiliki kolom `company_id` dan primary key. Perubahan perusahaan, profil, serta hak akses modul juga dipantau melalui pemetaan company terkait.

Untuk setiap perubahan database, log menyimpan waktu, pelaku, email pelaku, aksi, modul/tabel, kunci record, ringkasan, field yang berubah, nilai lengkap sebelum dan sesudah, serta metadata request bila tersedia. UPDATE yang benar-benar tidak mengubah nilai tidak menghasilkan log baru. Perubahan teks membandingkan karakter persis; perubahan tanda baca seperti titik menjadi tanda seru tetap dicatat dan divisualisasikan sebagai karakter yang dihapus/ditambahkan.

Tracker UI mencatat navigasi halaman ERP, sementara tombol Ekspor CSV mencatat aktivitas ekspor. Log aktivitas hanya dapat dibaca oleh owner/admin karena data sebelum–sesudah dapat memuat informasi sensitif. Log bersifat append-only bagi pengguna aplikasi.

## Cara memasang

1. Pastikan migration sebelumnya sudah diterapkan, khususnya `024_kalender.sql` dan `025_kalender_otomatis_transaksi.sql` jika mengikuti rangkaian modul kalender ini.
2. Jalankan `supabase/migrations/026_log_aktivitas.sql` satu kali pada Supabase SQL Editor untuk proyek yang digunakan aplikasi.
3. Tunggu deployment Next.js selesai, lalu buka **Pengaturan → Log Aktivitas** sebagai owner/admin.
4. Lakukan uji: ubah satu field teks pada data uji, misalnya `Catatan.` menjadi `Catatan!`, simpan, lalu cari record dan buka bagian **Detail**. Log seharusnya menunjukkan nilai sebelum/sesudah dan perbedaan karakter.

Jangan jalankan ulang migration setelah sukses karena kebijakan dan objek audit dibuat sebagai migration sekali jalan.

## Catatan cakupan

- Trigger menangkap perubahan data yang benar-benar dilakukan pada database, termasuk melalui RPC dan proses otomatis yang mengubah tabel yang diaudit. Log tidak menyimpan setiap ketikan sebelum pengguna menekan Simpan; detail yang diaudit adalah nilai yang benar-benar berubah di database.
- Tracker mencatat halaman yang dibuka, bukan setiap klik, gerakan mouse, atau pengetikan di halaman.
- Tabel yang dibuat pada migration baru setelah 026 tidak otomatis memperoleh trigger. Migration pembuat tabel baru harus memasang trigger audit dengan pola yang sama atau menjalankan ulang pemasang trigger yang dikelola khusus.
- Operasi internal di schema Supabase `auth` tidak diaudit oleh trigger ini. Aksi autentikasi, kegagalan login, dan aktivitas yang gagal sebelum mengubah database memerlukan audit khusus dari jalur autentikasi.
- Log tidak menyediakan pembatasan retensi otomatis. Rencanakan retensi/arsip bila jumlah log tumbuh sangat besar.
