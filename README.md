# ERP Multi-Perusahaan (Next.js + Supabase + Vercel)

## Setup
1. Buat project di Supabase. Buka SQL Editor, lalu jalankan `supabase/migrations/001_foundation.sql`.
2. (Opsional, untuk uji coba) Supabase > Authentication > Providers > Email: matikan "Confirm email".
3. Salin `.env.example` menjadi `.env.local` dan isi URL serta anon key dari Supabase > Project Settings > API.
4. `npm install` lalu `npm run dev`.
5. Deploy: push ke GitHub, import repo di Vercel, lalu isi 2 environment variable yang sama.

## Cara kerja
- **Multi-perusahaan:** semua tabel punya `company_id`. Keamanan dijaga RLS di database, bukan hanya di tampilan.
- **Peran:** `owner` dan `admin` punya akses penuh. `member` hanya ke modul yang dicentang di Pengaturan > Anggota & Akses (Lihat, Tambah, Ubah, Hapus). Tanpa centang berarti tidak ada akses.
- **Menu:** semua menu dan submenu didaftarkan di `src/config/modules.ts`.

## Menambah modul baru (misal Kas)
1. SQL baru: `supabase/migrations/002_kas.sql`. Tabel dengan `company_id` dan policy `has_perm(company_id, 'kas', 'view')` (lihat template di akhir 001).
2. Kode modul di `src/modules/kas/` (komponen, aksi, tipe).
3. Halaman di `src/app/(app)/kas/masuk/page.tsx` dan seterusnya. Folder statis menggantikan halaman sementara.
