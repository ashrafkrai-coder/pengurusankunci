# Sistem Kunci Sekolah (NFC) – Panduan Pemasangan

## BAHAGIAN 1: Struktur Google Sheets

Buat Google Sheets baharu. Cara paling mudah: lihat Langkah A di bawah, kerana `setupSheets()` menjana semuanya secara automatik.
Jika mahu buat manual, struktur tab ialah:

**Tab `Nama_Bilik`** (baris 1 = tajuk)

| A | B | C | D | E |
|---|---|---|---|---|
| ID_Kunci | Nama_Bilik | Status_Semasa | Pemegang_Terkini | Masa_Terkini |

Formula baris 2 (seret ke bawah):
- C2: `=IF($A2="","",IFERROR(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A2),Log_Imbas!$D$2:$D),"Pulang"))`
- D2: `=IF($A2="","",IF($C2="Ambil",IFERROR(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A2),Log_Imbas!$C$2:$C),"-"),"-"))`
- E2: `=IF($A2="","",IFERROR(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A2),Log_Imbas!$A$2:$A),"-"))` (format: `dd/mm/yyyy hh:mm:ss`)

**Tab `Log_Imbas`**: `Masa | ID_Kunci | Nama_Guru | Tindakan` (diisi automatik oleh skrip)

**Tab `Nama_Guru`**: `Nama_Guru | Jawatan`

## Langkah A: Pasang Apps Script

1. Dalam Google Sheets baharu: **Extensions > Apps Script**.
2. Padam kod lalai, tampal keseluruhan `Code.gs`, tekan **Save**.
3. Pilih fungsi **`setupSheets`** > **Run**. Benarkan kebenaran (Authorize) pada kali pertama.
   Ini menjana 3 tab, tajuk, formula dan data contoh.
4. Isi tab `Nama_Bilik` (ID_Kunci + nama penuh bilik) dan `Nama_Guru` dengan data sebenar.
   `setupSheets` selamat dijalankan semula. Data sedia ada tidak dipadam.
5. **Untuk menguji dari editor**, pilih fungsi **`ujiImbas`** > **Run** (bukan `prosesImbas`). Ia merekod satu imbasan sebenar (bilik pertama, guru pertama) dan memaparkan URL tag NFC bagi setiap kunci dalam *Execution log*. `prosesImbas` hanya dipanggil oleh halaman imbas NFC.

## Langkah B: Deploy sebagai Web App

1. Apps Script > **Deploy > New deployment** > ikon gear > **Web app**.
2. **Execute as: Me** | **Who has access: Anyone** > **Deploy**.
3. Salin **Web app URL** (berakhir `/exec`).
4. Setiap kali ubah `Code.gs`, pilih **Deploy > Manage deployments > Edit > New version** supaya URL kekal sama.

## Langkah C: Tulis URL pada tag NFC

Untuk setiap kunci, tulis URL berikut pada tag NFC (guna aplikasi **NFC Tools** atau **NFC TagWriter**, jenis rekod *URL*):

```
https://mykey-eta.vercel.app/?kunci=MAKMAL-1
```

`MAKMAL-1` mesti sama dengan `ID_Kunci` dalam tab `Nama_Bilik`. Dalam Sheet, isi sel **H2** tab `Nama_Bilik` dengan `https://mykey-eta.vercel.app/` supaya kolum `URL_Tag_NFC` memaparkan URL ini untuk setiap bilik.

**Kenapa URL PWA, bukan URL `/exec`?** URL PWA dibuka serta-merta dari Vercel (atau cache telefon), guna sesi log masuk dashboard yang sedia ada, dan hanya membuat **satu** panggilan ke Apps Script untuk merekod. URL `/exec?kunci=` lama (2–4 saat) masih berfungsi, jadi tag sedia ada tidak rosak; tulis semula tag mengikut masa yang sesuai. URL PWA juga lebih pendek dan muat dalam tag NTAG213.

Nota iPhone: aplikasi yang dipasang di *Home Screen* dan Safari tidak berkongsi log masuk. Kali pertama tap tag, guru log masuk sekali dalam Safari (tanda *Ingat saya*).

**Hanya guru berdaftar boleh merekod.** Guru sentuh telefon pada tag. Kali pertama di telefon itu, guru log masuk dengan nama pengguna dan kata laluan akaun dashboard (sesi diingat 90 hari); selepas itu setiap tap terus direkod. Imbasan seterusnya bertukar automatik Ambil / Pulang.

Guru yang belum mendaftar akan nampak borang log masuk dan pautan **Daftar akaun** ke dashboard; tiada rekod dibuat. Nama yang direkod diambil daripada akaun, jadi guru tidak boleh merekod atas nama orang lain. Akaun yang disekat (Status bukan `Aktif`) juga ditolak semasa imbas.

## Langkah D: Host Dashboard PWA

Fail dashboard yang perlu dimuat naik: `index.html`, `manifest.json`, `sw.js`, `tailwind.css`, folder `vendor/`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `logo.png` (logo sekolah untuk halaman Log Masuk).

Tailwind CSS dan ikon Lucide dihos sendiri (tiada CDN). Jika anda mengubah kelas dalam `index.html`, jana semula CSS dengan `npm run build:css`.
Muat naik kesemuanya ke **hosting HTTPS** (Vercel, Netlify, GitHub Pages atau Cloudflare Pages). PWA tidak boleh dipasang jika dibuka terus dari fail (`file://`).

1. URL Web App lalai sudah dimasukkan dalam kod (`DEFAULT_URL` dalam `index.html`). Untuk guna URL lain: ikon **⚙ Tetapan** > tampal URL > **Simpan**. Kosongkan medan untuk kembali ke URL lalai.
2. Pasang: *Add to Home Screen* (telefon) atau *Install App* (Chrome komputer).

## Langkah E: Daftar & Log Masuk Pentadbir

Dashboard kini memerlukan log masuk. Data kunci tidak lagi boleh dibaca tanpa token.

1. Buka dashboard > tab **Daftar** > isi Nama Penuh, Nama Pengguna, Kata Laluan (min. 8 aksara).
2. Akaun terus **Aktif** dan pengguna terus masuk ke dashboard. Tiada kelulusan admin diperlukan.
   **Nama Penuh** guru juga ditambah ke tab `Nama_Guru` sebagai rujukan admin. Nama inilah yang direkod setiap kali guru tap tag NFC.
3. Seterusnya guna **Log Masuk**. Dengan **Ingat saya** (ditanda secara lalai), sesi kekal 90 hari dan nama pengguna diisi automatik. Tanpanya, sesi sah 7 hari.
   Kata laluan tidak disimpan oleh app. Pilih **Simpan kata laluan** apabila pelayar (Chrome/Safari) menawarkannya.
4. Untuk menyekat akaun: buka tab **`Pengguna`** > tukar kolum **Status** kepada apa-apa selain `Aktif` (cth `Digantung`). Sesi sedia ada terus ditolak.
5. Selepas 5 cubaan kata laluan salah, akaun dikunci 15 minit.

> **Perhatian:** sesiapa yang tahu alamat dashboard boleh mendaftar dan melihat status kunci. Semak tab `Pengguna` dari semasa ke semasa dan sekat akaun yang tidak dikenali.

Kolum `Hash` dan `Salt` dalam tab `Pengguna` dijana automatik. Jangan ubah. Kata laluan tidak disimpan dalam bentuk asal.

## Ujian Automatik

Perlu Node.js 20+:

```
npm install
npm test
```

Ujian bertanda TODO ialah cadangan penambahbaikan yang belum dilaksanakan.

## Nota

- Telefon guru mesti menyokong NFC dan membuka pautan dalam pelayar (Chrome/Safari). Jika guru log masuk akaun Google lain dalam pelayar, Web App "Anyone" tetap boleh dibuka tanpa log masuk.
- Sesi log masuk halaman imbas disimpan dalam pelayar telefon. Jika guru bertukar pelayar atau kosongkan data pelayar, mereka perlu log masuk sekali lagi.
- Pautan **Bukan anda? Log keluar** pada halaman imbas membuang sesi di telefon itu, dan tidak mencipta rekod baharu.
- Untuk menguji dari editor Apps Script, jalankan `ujiImbas` (perlu sekurang-kurangnya satu akaun Aktif).
- Kad kunci menunjukkan label **lewat** (teks kuning) jika belum dipulangkan lebih 4 jam.
- Jika ada ralat selepas deploy semula, pastikan versi Web App dikemas kini (Langkah B ayat 4).
