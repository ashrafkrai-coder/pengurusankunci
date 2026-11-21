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

Folder `pwa/` mengandungi `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`.
Muat naik kesemuanya ke **hosting HTTPS** (Vercel, Netlify, GitHub Pages atau Cloudflare Pages). PWA tidak boleh dipasang jika dibuka terus dari fail (`file://`).

1. Buka dashboard > ikon **⚙ Tetapan** > tampal URL Web App (`.../exec`) > **Simpan**.
2. URL disimpan dalam `localStorage`, jadi tidak perlu edit kod.
3. Pasang: *Add to Home Screen* (telefon) atau *Install App* (Chrome komputer).

## Nota

- Telefon guru mesti menyokong NFC dan membuka pautan dalam pelayar (Chrome/Safari). Jika guru log masuk akaun Google lain dalam pelayar, Web App "Anyone" tetap boleh dibuka tanpa log masuk.
- `localStorage` terikat pada pelayar. Jika guru bertukar pelayar atau kosongkan data pelayar, mereka perlu pilih nama sekali lagi.
- Pautan **Tukar Pengguna** hanya menukar nama untuk imbasan akan datang, dan tidak mencipta rekod baharu.
- Kad kunci bertukar merah jika belum dipulangkan lebih 4 jam.
- Jika ada ralat selepas deploy semula, pastikan versi Web App dikemas kini (Langkah B ayat 4).
