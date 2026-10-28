# Kalender dan pengiriman pengingat

## Yang sudah ada

- Kalender Kegiatan dengan tampilan tahun, bulan, minggu, dan hari.
- Pengaturan jenis, nama, keterangan, hak lihat, hak tambah/ubah/hapus event, serta administrasi kalender.
- Event dengan tanggal/jam, pengingat, due date, pengulangan harian/mingguan/bulanan/tahunan, dan beberapa tautan.
- Penerima per kanal: nomor WhatsApp, Telegram Chat ID, serta alamat email.
- Endpoint dispatcher `GET /api/cron/calendar-reminders`. Endpoint ini dilindungi dengan `Authorization: Bearer <CRON_SECRET>`.
- Status pengingat tersimpan di database: menunggu, sedang dikirim, terkirim, gagal, atau belum dikonfigurasi. Pengulangan membuat kejadian berikutnya setelah pengingat saat ini berhasil dikirim.

## Migrasi Supabase

Jalankan `supabase/migrations/024_kalender.sql` sekali di SQL Editor pada proyek Supabase yang benar. Jangan jalankan berulang setelah sukses. Migration ini membuat tabel kalender dan event berikut kebijakan RLS. Migration tersebut mengasumsikan migrasi dasar perusahaan dan tabel cabang sebelumnya sudah diterapkan.

## Environment variables server

Tambahkan variabel di pengaturan Environment Variables Vercel (Production; Preview bila perlu). Jangan beri awalan `NEXT_PUBLIC_` pada rahasia.

- `CRON_SECRET`: rahasia acak panjang, minimal 16 karakter.
- `NEXT_PUBLIC_SUPABASE_URL`: URL proyek Supabase yang sama dengan aplikasi.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key dari Supabase. Simpan sebagai rahasia server; jangan pernah kirim ke browser atau repositori.

### Telegram

- `TELEGRAM_BOT_TOKEN`: token bot dari BotFather.
- Isikan Telegram Chat ID penerima di form event. Penerima harus bisa dijangkau bot; untuk grup, tambahkan bot ke grup terlebih dahulu.

### WhatsApp Business Cloud API

- `WHATSAPP_ACCESS_TOKEN`: access token Business Platform.
- `WHATSAPP_PHONE_NUMBER_ID`: ID nomor pengirim di Meta Business Platform.
- `WHATSAPP_GRAPH_API_VERSION`: versi Graph API yang masih didukung, dengan format seperti `vNN.0`.
- Opsional: `WHATSAPP_TEMPLATE_NAME` dan `WHATSAPP_TEMPLATE_LANGUAGE` (default `id`).

Jika template diatur, kode mengirim template dengan tiga parameter body: judul event, waktu, dan keterangan. Karena itu, gunakan template yang telah disetujui dan memiliki tiga parameter yang sesuai. Jika template tidak diatur, kode mencoba mengirim teks biasa; pengiriman seperti ini hanya diizinkan WhatsApp dalam jendela layanan pelanggan 24 jam yang sesuai. Untuk pengingat proaktif di luar jendela itu, gunakan template yang disetujui.

### Gmail API

- `GMAIL_CLIENT_ID`: OAuth Client ID Google.
- `GMAIL_CLIENT_SECRET`: OAuth Client Secret.
- `GMAIL_REFRESH_TOKEN`: refresh token OAuth yang memiliki scope `https://www.googleapis.com/auth/gmail.send`.
- `GMAIL_SENDER_EMAIL`: alamat akun Gmail yang diberi otorisasi.

Aktifkan Gmail API pada Google Cloud project dan lakukan OAuth consent/authorization untuk akun pengirim sebelum mengisi variabel tersebut. Kode meminta access token baru dari refresh token lalu mengirim email melalui Gmail API.

## Jadwalkan dispatcher

Scheduler eksternal perlu memanggil endpoint produksi `/api/cron/calendar-reminders` dengan metode GET dan header:

```http
Authorization: Bearer <nilai CRON_SECRET>
```

Atur interval setidaknya setiap menit jika ingin pengingat mendekati jam yang dipilih. Endpoint memproses maksimal 50 pengingat yang sudah jatuh waktu per pemanggilan. Jangan menaruh nilai secret pada URL atau kode klien. Scheduler Vercel bawaan di paket Hobby hanya berjalan sekali per hari dengan ketepatan waktu per jam; jadwal itu tidak cocok untuk pengingat menit-ke-menit. Gunakan scheduler eksternal yang mendukung interval tersebut atau paket yang mendukung cron lebih sering.

## Catatan operasi

- Pengingat akan berstatus `pending` sampai dispatcher dijadwalkan dan konfigurasi provider lengkap.
- Jika kanal yang dipilih gagal mengirim, status akan menjadi `failed` atau `not_configured`, dan alasannya ditampilkan di daftar event. Perbaiki konfigurasi lalu simpan ulang event untuk mencoba lagi.
- `Add file/link` saat ini menyimpan URL. Upload berkas langsung belum memakai object storage.
- Hak user saat ini diatur dengan daftar pengguna. Kontrol per cabang ditampilkan sebagai referensi saja sampai identitas akun dipetakan ke cabang secara tegas.
- Uji pertama dengan satu event beberapa menit ke depan dan satu penerima uji sebelum menyalakan pengiriman ke pengguna lain.
