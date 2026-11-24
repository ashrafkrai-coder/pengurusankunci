# Sistem Kunci Sekolah (NFC) – Panduan Pemasangan

PWA dashboard (dihos di Vercel) + backend Supabase. Setiap tap NFC atau muat dashboard ialah satu panggilan RPC terus ke Supabase.

## Langkah A: Sediakan Supabase

1. Supabase Dashboard > **SQL Editor** > tampal keseluruhan `supabase/schema.sql` > **Run** (selamat dijalankan semula; jalankan semula selepas setiap kemas kini skema).
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

## Ciri tambahan

- **Imbasan luar talian:** jika tiada internet semasa tap, imbasan disimpan di telefon (maksimum 50) bersama masa tap sebenar, dan dihantar automatik apabila sambungan pulih. Setiap imbasan ada ID unik, jadi penghantaran semula tidak mencipta rekod berganda. Masa luar talian hanya diterima jika dalam 24 jam lepas. Imbasan hanya dihantar apabila pemilik akaun yang sama log masuk.
- **Realtime:** dashboard dikemas kini serta-merta apabila guru lain tap (Supabase Broadcast, saluran awam `kunci-log` tanpa data peribadi). Jika sambungan realtime gagal, dashboard dimuat semula setiap 30 saat. Jika tidak berfungsi, semak Supabase > Realtime > Settings > *Allow public access*.
- **Eksport PDF:** tab **Log** > butang **PDF** > pilih tempoh (Hari ini / 7 hari / 30 hari / tarikh sendiri, maksimum 1 tahun) > **Muat Turun PDF**. Pustaka PDF hanya dimuat apabila butang ditekan.
- **Padam rekod (Admin sahaja):** butang tong sampah muncul pada setiap rekod log untuk akaun berperanan `Admin`. Jadikan akaun anda Admin dengan SQL Editor:

  ```sql
  update public.pengguna set peranan = 'Admin' where username = 'nama.pengguna';
  ```

- **Urus bilik (Admin):** Akaun > **Urus Bilik**. Tambah bilik (ID dijana daripada nama, boleh diubah), namakan semula, atau padam. ID kunci tidak boleh diubah kerana tag NFC merujuknya. Bilik yang kuncinya sedang diambil tidak boleh dipadam; sejarah lama kekal selepas bilik dipadam.
- **Urus akaun guru (Admin):** Akaun > **Urus Akaun Guru**. Cari guru, **Sekat/Aktifkan** akaun, **Jadikan Admin/biasa**, atau tetapkan **kata laluan baharu** (guru dilog keluar daripada semua peranti dan kunci 15 minit dibuka; beritahu guru kata laluan itu). Admin tidak boleh menyekat atau menurunkan akaunnya sendiri, jadi sentiasa ada sekurang-kurangnya seorang Admin.
- **Keepalive:** `.github/workflows/keepalive.yml` memanggil `api_ping` setiap 3 hari supaya projek percuma tidak dijeda. Jika repo tiada aktiviti 60 hari, GitHub menghentikan jadual itu; tekan *Enable workflow* di tab Actions.

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
