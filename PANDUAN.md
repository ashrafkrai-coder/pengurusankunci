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
https://script.google.com/macros/s/XXXXXXXX/exec?kunci=MAKMAL-1
```

`MAKMAL-1` mesti sama dengan `ID_Kunci` dalam tab `Nama_Bilik`.

Guru: sentuh telefon pada tag. Kali pertama pilih nama, selepas itu terus direkod. Imbasan seterusnya bertukar automatik Ambil / Pulang.

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
3. Seterusnya guna **Log Masuk**. Sesi sah selama 7 hari.
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
- `localStorage` terikat pada pelayar. Jika guru bertukar pelayar atau kosongkan data pelayar, mereka perlu pilih nama sekali lagi.
- Pautan **Tukar Pengguna** hanya menukar nama untuk imbasan akan datang, dan tidak mencipta rekod baharu.
- Kad kunci menunjukkan label **lewat** (teks kuning) jika belum dipulangkan lebih 4 jam.
- Jika ada ralat selepas deploy semula, pastikan versi Web App dikemas kini (Langkah B ayat 4).
