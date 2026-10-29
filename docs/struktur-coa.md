# Struktur Akun Perkiraan / Chart of Accounts (COA)

Workbook `akun-perkiraan.xlsx` dipakai sebagai **referensi struktur**, bukan sebagai data yang diimpor seluruhnya ke setiap perusahaan.

## Keputusan untuk ERP kosong

- Jangan membuat akun khusus Jakarta/Surabaya, piutang direksi, cabang, rekening BCA/Mandiri, atau subakun lain yang hanya berasal dari perusahaan contoh.
- Jangan mengimpor saldo awal, tanggal saldo, kurs historis, dan cabang saldo dari workbook contoh. Saldo awal perlu dicatat sebagai jurnal saldo awal yang seimbang agar masuk ke buku besar dan laporan keuangan.
- Pertahankan 13 akun sistem bawaan yang dipakai otomatis oleh jurnal kas, penjualan, dan pembelian. Kode-kode sistem lama tetap sama agar pemetaan otomatis tidak rusak.
- Akun tambahan dibuat atau dipilih sesuai kebutuhan perusahaan setelah struktur usaha, mata uang, dan cabang benar-benar dikonfigurasi.

## Struktur field akun

| Field di ERP | Acuan dari workbook | Fungsi |
|---|---|---|
| Kode perkiraan | Kode Perkiraan | Kode unik dalam satu perusahaan |
| Nama akun | Nama | Nama akun yang dimengerti pengguna |
| Kelompok utama | Pemetaan tipe akuntansi | Aset, kewajiban, modal/ekuitas, pendapatan, atau beban |
| Tipe akun detail | Tipe Akun | Subtipe seperti BANK, AREC, OCAS, FASS, APAY, EQTY, REVE, COGS, dan lainnya |
| Akun induk | Akun Induk | Hierarki akun; boleh kosong untuk akun akar |
| Mata uang | Mata Uang | Mata uang yang telah diaktifkan pada perusahaan |
| Saldo normal | Ditentukan dari kelompok, bisa diubah | Debit atau kredit; akun kontra bisa memakai sisi normal yang berlawanan |
| Catatan | Catatan | Catatan penggunaan akun |

## Yang tidak diimpor sebagai master COA

Kolom saldo awal, tanggal saldo, kurs saldo, dan cabang saldo tidak diisi dari workbook contoh. Cabang bukan nama akun; jika perusahaan kelak mempunyai cabang, cabang seharusnya menjadi data master tersendiri dan dipakai sebagai dimensi transaksi/laporan, bukan membuat semua akun digandakan menjadi “... Jakarta” dan “... Surabaya”.

Mata uang asing hanya dapat dipilih jika mata uang tersebut sudah aktif di Pengaturan Mata Uang perusahaan. Menambahkan kode mata uang ke akun tidak otomatis membuat rekening bank atau saldo multi-mata-uang.

## Migration dan UI

Jalankan `supabase/migrations/027_struktur_coa.sql` satu kali setelah migration sebelumnya telah diterapkan. Migration ini menambah metadata COA, menetapkan subtipe pada akun sistem yang sudah ada, dan menjaga seed akun perusahaan baru tetap kompatibel. Tidak ada 315 baris akun dari workbook yang diimpor.

Setelah deployment berhasil, menu **Akuntansi → Akun Perkiraan** menyediakan form kode/nama akun, kelompok utama, tipe detail, akun induk, mata uang, saldo normal, dan catatan. Akun sistem bawaan tidak dapat diubah atau dihapus dari form supaya jurnal otomatis tetap konsisten.
