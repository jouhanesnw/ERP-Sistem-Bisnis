# ERP Multi-Perusahaan (Next.js + Supabase + Vercel)

## Setup
1. Buat project di Supabase.
2. Di Supabase SQL Editor, jalankan file migrasi berurutan: `001_foundation.sql`, `002_kas.sql`, `003_penjualan.sql`, `004_pembelian.sql`, `005_reminder.sql`, lalu `006_kendaraan.sql`, dan terakhir `007_produk.sql`, lalu `008_multi_gudang.sql`, dan terakhir `009_akuntansi.sql`, lalu `010_company_onboarding.sql` untuk detail data usaha dan upload logo, serta `011_authenticated_table_grants.sql` untuk memberikan izin tabel kepada pengguna login sambil tetap mempertahankan RLS. **Jangan jalankan ulang migrasi yang sudah berhasil diterapkan**, karena beberapa perintah membuat tabel dan policy yang sudah ada.
3. Salin `.env.example` menjadi `.env.local`, lalu isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` dari Supabase > Project Settings > API.
4. Untuk fitur pelacakan sopir/GPS, isi `SUPABASE_SERVICE_ROLE_KEY` di environment server (misalnya Vercel). **Jangan pernah menamainya `NEXT_PUBLIC_...` atau memasukkan nilainya ke kode browser.**
5. Untuk tampilan peta interaktif, isi `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` dan batasi API key berdasarkan domain di Google Cloud Console. `NEXT_PUBLIC_GOOGLE_MAP_ID` opsional.
6. Jalankan `npm install`, lalu `npm run dev`.
7. Untuk deploy, import repo di Vercel dan atur environment variable yang diperlukan.

## Cara kerja
- **Multi-perusahaan:** tabel bisnis memisahkan data menggunakan `company_id`. Keamanan dijaga melalui Row Level Security (RLS) di database.
- **Peran:** `owner` dan `admin` memiliki akses penuh. `member` mengikuti hak akses modul yang diberikan di Pengaturan > Anggota & Akses.
- **Menu:** semua menu dan submenu didaftarkan di `src/config/modules.ts`.

## Modul Kendaraan
- Daftar kendaraan dan status aktif/nonaktif.
- Catatan servis, odometer, rencana servis berikutnya, dan biaya.
- Catatan BBM, liter, biaya, dan perkiraan efisiensi km/l jika data odometer memadai.
- Pajak tahunan, STNK, KIR, dan asuransi; tanggal jatuh tempo disinkronkan menjadi data pengingat.
- Lokasi tersimpan dan peta armada live setelah Google Maps dikonfigurasi.
- Link pelacakan untuk sopir melalui browser HP atau perangkat GPS yang mengirim koordinat ke `/api/lokasi`. Bagikan link/token hanya kepada pihak yang berwenang.

Migrasi `005_reminder.sql` merupakan fondasi tabel Reminder yang dipakai integrasi jadwal servis/pajak kendaraan; antarmuka Reminder khusus dapat dikembangkan terpisah.

## Modul Produk & Stok
- Master produk dengan SKU/kode, satuan dasar retail, harga beli/jual, status aktif, stok minimum, dan stok awal.
- Kartu stok: stok awal, pembelian, penjualan, dan penyesuaian.
- Faktur penjualan yang diterbitkan membuat mutasi stok keluar; faktur pembelian yang diterbitkan membuat mutasi stok masuk.
- Penjualan dan Pembelian dapat memilih produk dari master, atau tetap memakai teks bebas.
- Tahap ini menggunakan stok per perusahaan (belum multi-gudang). Multi-gudang perlu ditambahkan dalam tahap berikutnya.

Migrasi 007_produk.sql bergantung pada migrasi fondasi, Kas, Penjualan, dan Pembelian yang sudah berhasil diterapkan. Jangan jalankan ulang migrasi lama.

## Multi-Gudang
- Setiap perusahaan otomatis mendapat Gudang Utama. Saldo stok lama ditempatkan di sana saat migrasi.
- Tambahkan gudang melalui Produk & Stok > Daftar Gudang.
- Transfer stok antar gudang dilakukan langsung dan atomik melalui Produk & Stok > Transfer Gudang.
- Pilih gudang pengeluaran/penerimaan pada formulir Penjualan/Pembelian. Mutasi stok terjadi ketika faktur diterbitkan.
- Stok dan penyesuaian dapat dilihat per gudang; satuan grosir belum diaktifkan.

## Modul Akuntansi
- Daftar akun (Chart of Accounts), jurnal manual double-entry, buku besar, laporan laba-rugi dan neraca.
- Jurnal otomatis dari faktur penjualan/pembelian ketika berstatus terbit dan dari transaksi Kas.
- Penerimaan/pembayaran faktur dicatat sebagai pelunasan piutang/utang, bukan pendapatan/beban kedua kali.
- Migrasi 009 membuat jurnal saldo awal berdasarkan saldo Kas, persediaan, piutang, dan utang yang tercatat saat modul diaktifkan.
- Biaya pokok penjualan memakai harga beli pada master produk sebagai estimasi; metode biaya persediaan lebih lengkap (FIFO/weighted average) belum diterapkan.
- Setelah menjalankan migrasi, petakan kategori Kas pada Akuntansi > Daftar Akun untuk klasifikasi pengeluaran/pemasukan yang benar.
