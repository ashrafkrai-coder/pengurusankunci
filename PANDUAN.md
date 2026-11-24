# Sistem Kunci Sekolah (NFC) – Panduan Pemasangan

PWA dashboard (dihos di Vercel) + backend Supabase. Setiap tap NFC atau muat dashboard ialah satu panggilan RPC terus ke Supabase.

## Langkah A: Sediakan Supabase

1. Supabase Dashboard > **SQL Editor** > tampal keseluruhan `supabase/schema.sql` > **Run** (selamat dijalankan semula).
2. Masukkan bilik: jalankan `supabase/bilik.sql` (ubah mengikut bilik anda), atau guna **Table Editor > `bilik`**.
   `id_kunci` mesti sama dengan `?kunci=ID` pada tag NFC (huruf besar automatik, cth `MAKMAL-1`).
3. Dalam `index.html`, `SUPABASE_URL` dan `SUPABASE_KEY` mesti ditetapkan. Gunakan kunci **publishable** (Project Settings > API Keys).
   Kunci ini memang untuk klien; jadual dilindungi RLS dan hanya 5 fungsi `api_*` boleh dipanggil. **Jangan** letak kunci `secret`/`service_role`.

## Langkah B: Tulis URL pada tag NFC

Untuk setiap kunci, tulis URL berikut (jenis rekod *URL*) dengan **NFC Tools** atau **NFC TagWriter**:

```text
https://mykey-eta.vercel.app/?kunci=MAKMAL-1
```

`MAKMAL-1` mesti sama dengan `id_kunci` dalam jadual `bilik`.

Hanya guru berdaftar boleh merekod. Kali pertama di sesuatu telefon, guru log masuk dengan akaun dashboard (sesi diingat 90 hari); selepas itu setiap tap terus direkod dan bertukar automatik Ambil / Pulang. Nama yang direkod diambil daripada akaun. Imbasan berganda oleh guru yang sama dalam 60 saat diabaikan.

Nota iPhone: aplikasi yang dipasang di *Home Screen* dan Safari tidak berkongsi log masuk. Kali pertama tap tag, guru log masuk sekali dalam Safari (tanda *Ingat saya*).

## Langkah C: Host Dashboard PWA

Fail yang dimuat naik: `index.html`, `manifest.json`, `sw.js`, `tailwind.css`, folder `vendor/`, `icon-*.png`, `logo.png`.
Tailwind CSS dan ikon Lucide dihos sendiri. Jika mengubah kelas dalam `index.html`, jana semula CSS dengan `npm run build:css`.
Hos di HTTPS (Vercel dsb). Pasang: *Add to Home Screen* (telefon) atau *Install App* (Chrome komputer).

## Akaun

- Pendaftaran terbuka: tab **Daftar** > Nama Penuh, Nama Pengguna, Kata Laluan (min. 8 aksara). Akaun terus **Aktif**.
- **Ingat saya** (lalai): sesi 90 hari; jika tidak, 7 hari.
- Selepas 5 kata laluan salah, akaun dikunci 15 minit.
- Menyekat akaun: Table Editor > `pengguna` > tukar `status` kepada selain `Aktif` (cth `Digantung`). Sesi sedia ada terus ditolak.
- Kata laluan disimpan sebagai hash bcrypt, tidak pernah dalam bentuk asal.

## Ujian Automatik

Perlu Node.js 20+:

```text
npm install
npm test
```

## Nota

- Telefon guru mesti menyokong NFC dan membuka pautan dalam pelayar (Chrome/Safari).
- Kad kunci menunjukkan label **lewat** jika belum dipulangkan lebih 4 jam.
- Dashboard dimuat semula setiap 30 saat dan selepas setiap imbasan.
