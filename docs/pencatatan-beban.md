# Pencatatan Beban

## Fungsi

Pencatatan Beban mencatat pengakuan beban sebelum dibayar. Dokumen diberi nomor otomatis `BEBAN/YYYY/0001`, tanggal, jatuh tempo, akun Hutang Beban, rincian satu atau lebih akun beban, mata uang, cabang (opsional), dan catatan. Templat formulir dapat disimpan dan dipakai lagi dari Transaksi Favorit.

Status dihitung dari pembayaran terkait:
- **Sedang Diproses**: belum ada pembayaran.
- **Sebagian Dibayar**: sudah dibayar sebagian, masih ada saldo.
- **Terbayar**: total pembayaran mencapai total pencatatan beban.

Nomor pembayaran otomatis menggunakan pola `PBEBAN/YYYY/0001`. Setiap pembayaran terhubung ke transaksi Kas Keluar dan muncul di riwayat nomor pembayaran pada Pencatatan Beban.

## Jurnal otomatis

Saat pencatatan disimpan:
- Debit: akun beban pada setiap baris.
- Kredit: akun Hutang Beban (akun kelompok Kewajiban, tipe detail OCLY / Kewajiban Jangka Pendek).

Saat pembayaran dilakukan:
- Debit: Hutang Beban.
- Kredit: Kas dan Bank.

Dengan demikian, pelunasan tidak membukukan beban yang sama untuk kedua kalinya. Pembayaran parsial mengurangi saldo terutang dan memperbarui status.

## Kalender

Dokumen dengan sisa yang belum dibayar membuat event **Jadwal Pembayaran Beban** otomatis di kalender `Jadwal Transaksi`, memakai tanggal jatuh tempo dan pengaturan pengingat default kalender. Event dihapus ketika beban sudah lunas. Pengiriman WA, Telegram, atau Gmail tetap bergantung pada konfigurasi provider dan scheduler kalender.

## Pemasangan

Jalankan `supabase/migrations/028_pencatatan_beban.sql` satu kali di Supabase SQL Editor setelah migration `001–027` yang diperlukan sudah berhasil diterapkan, termasuk COA (`027_struktur_coa.sql`) dan kalender (`024`, `025`). Jangan jalankan ulang setelah sukses.

Setelah deployment berhasil, buka **Akuntansi → Pencatatan Beban**. Untuk pelunasan, pengguna perlu izin lihat dan buat pada Kas & Bank serta izin buat pada Akuntansi; rekening aktif harus memakai mata uang yang sama dengan beban.

## Catatan

- Akun **2210 · Hutang Beban** ditambahkan sebagai akun sistem default jika kode tersebut belum digunakan. Nomor sistem lainnya tidak diubah.
- Pencatatan yang telah memiliki pembayaran tidak dapat diedit atau dihapus; ini menjaga jejak jurnal dan pembayaran tetap konsisten.
- Akun beban dan Hutang Beban harus aktif dan menggunakan mata uang yang sama. Jurnal buku besar saat ini mencatat nilai nominal, bukan komponen kurs/selisih kurs.
