/**
 * SISTEM PENGURUSAN & PEMANTAUAN KUNCI SEKOLAH (TAG NFC)
 * Skrip ini mesti dibuka dari Google Sheets: Extensions > Apps Script
 *
 * Langkah pertama: jalankan fungsi  setupSheets()  SEKALI sahaja
 * untuk menjana 3 tab, tajuk kolum, formula dan data contoh.
 */

const SH_BILIK = 'Nama_Bilik';
const SH_LOG   = 'Log_Imbas';
const SH_GURU  = 'Nama_Guru';
const TZ       = 'Asia/Kuala_Lumpur';

/* ============================================================
 *  SETUP (jalankan sekali)
 * ============================================================ */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);

  // --- Nama_Bilik ---
  let sh = ss.getSheetByName(SH_BILIK) || ss.insertSheet(SH_BILIK);
  sh.clear();
  sh.getRange('A1:E1').setValues([['ID_Kunci', 'Nama_Bilik', 'Status_Semasa', 'Pemegang_Terkini', 'Masa_Terkini']]);
  sh.getRange('A2:B4').setValues([
    ['MAKMAL-1', 'Makmal Komputer 1'],
    ['BILIK-SENI', 'Bilik Pendidikan Seni'],
    ['BILIK-MUZIK', 'Bilik Muzik']
  ]);
  const rows = 100; // formula disediakan untuk baris 2 hingga 101
  const fC = [], fD = [], fE = [];
  for (let r = 2; r < 2 + rows; r++) {
    fC.push(['=IF($A' + r + '="","",IFERROR(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A' + r + '),Log_Imbas!$D$2:$D),"Pulang"))']);
    fD.push(['=IF($A' + r + '="","",IF($C' + r + '="Ambil",IFERROR(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A' + r + '),Log_Imbas!$C$2:$C),"-"),"-"))']);
    fE.push(['=IF($A' + r + '="","",IFERROR(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A' + r + '),Log_Imbas!$A$2:$A),"-"))']);
  }
  sh.getRange(2, 3, rows, 1).setFormulas(fC);
  sh.getRange(2, 4, rows, 1).setFormulas(fD);
  sh.getRange(2, 5, rows, 1).setFormulas(fE);
  sh.getRange(2, 5, rows, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  styleHeader_(sh, 5);
  sh.setColumnWidths(1, 5, 170);

  // --- Log_Imbas ---
  sh = ss.getSheetByName(SH_LOG) || ss.insertSheet(SH_LOG);
  sh.clear();
  sh.getRange('A1:D1').setValues([['Masa', 'ID_Kunci', 'Nama_Guru', 'Tindakan']]);
  sh.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  styleHeader_(sh, 4);
  sh.setColumnWidths(1, 4, 170);

  // --- Nama_Guru ---
  sh = ss.getSheetByName(SH_GURU) || ss.insertSheet(SH_GURU);
  sh.clear();
  sh.getRange('A1:B1').setValues([['Nama_Guru', 'Jawatan']]);
  sh.getRange('A2:B3').setValues([
    ['Cikgu Contoh Satu', 'Guru Kanan'],
    ['Cikgu Contoh Dua', 'Guru Disiplin']
  ]);
  styleHeader_(sh, 2);
  sh.setColumnWidths(1, 2, 220);

  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Helaian1');
  if (def && ss.getSheets().length > 3) ss.deleteSheet(def);
  SpreadsheetApp.getUi().alert('Siap! 3 tab telah disediakan. Gantikan data contoh dengan data sebenar sekolah anda.');
}

function styleHeader_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

/* ============================================================
 *  doGet — pintu masuk utama
 * ============================================================ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'getDashboard') return json_(getDashboard_());
    if (p.kunci) return imbasPage_(String(p.kunci));
  } catch (err) {
    if (p.action) return json_({ ok: false, error: String(err) });
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:20px">Ralat: ' + String(err) + '</p>');
  }
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:sans-serif;padding:24px"><h2>Sistem Kunci NFC</h2>' +
    '<p>Web App aktif. Gunakan <code>?kunci=ID_KUNCI</code> pada tag NFC atau <code>?action=getDashboard</code> untuk API.</p></div>'
  ).setTitle('Sistem Kunci NFC');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function iso_(d) {
  return (d instanceof Date && !isNaN(d)) ? Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") : '';
}

/* ============================================================
 *  Pembaca data
 * ============================================================ */
function bilikMap_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_BILIK);
  const map = {}, order = [];
  if (!sh || sh.getLastRow() < 2) return { map: map, order: order };
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    const id = String(r[0]).trim();
    if (!id) return;
    map[id.toUpperCase()] = { id: id, nama: String(r[1]).trim() || id };
    order.push(id.toUpperCase());
  });
  return { map: map, order: order };
}

function guruList_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_GURU);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (n) { return n; })
    .sort(function (a, b) { return a.localeCompare(b); });
}

function logRows_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().map(function (r) {
    return { masa: r[0], kunci: String(r[1]).trim().toUpperCase(), guru: String(r[2]).trim(), tindakan: String(r[3]).trim() };
  }).filter(function (r) { return r.kunci && r.masa instanceof Date; });
}

/* ============================================================
 *  MOD 1: IMBAS NFC GURU
 * ============================================================ */
function imbasPage_(kunci) {
  const b = bilikMap_().map[kunci.trim().toUpperCase()];
  const data = {
    kunci: kunci.trim(),
    bilik: b ? b.nama : '',
    valid: !!b,
    guru: guruList_()
  };
  // Escape supaya selamat dalam <script>
  const safe = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return HtmlService.createHtmlOutput(HTML_IMBAS.replace('__DATA__', safe))
    .setTitle('Imbas Kunci')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Dipanggil dari pelayar guru melalui google.script.run */
function prosesImbas(kunci, namaGuru) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = String(kunci || '').trim().toUpperCase();
    const nama = String(namaGuru || '').trim();
    const b = bilikMap_().map[id];
    if (!b) throw new Error('ID kunci "' + kunci + '" tiada dalam tab Nama_Bilik.');
    if (!nama) throw new Error('Nama guru kosong.');

    // Cari rekod terakhir kunci ini
    const rows = logRows_();
    let last = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].kunci === id) { last = rows[i]; break; }
    }
    const tindakan = (last && last.tindakan === 'Ambil') ? 'Pulang' : 'Ambil';

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_LOG);
    const now = new Date();
    sh.appendRow([now, b.id, nama, tindakan]);
    sh.getRange(sh.getLastRow(), 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    SpreadsheetApp.flush();

    return {
      ok: true,
      bilik: b.nama,
      tindakan: tindakan,
      guru: nama,
      masa: Utilities.formatDate(now, TZ, 'dd/MM/yyyy HH:mm:ss')
    };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 *  MOD 2: API DASHBOARD
 * ============================================================ */
function getDashboard_() {
  const bm = bilikMap_();
  const rows = logRows_(); // susunan kronologi (lama -> baru)

  // Pasangkan Ambil & Pulang bagi setiap kunci
  const open = {};      // kunci -> rekod belum pulang
  const sejarah = [];
  rows.forEach(function (r) {
    const b = bm.map[r.kunci];
    const namaBilik = b ? b.nama : r.kunci;
    if (r.tindakan === 'Ambil') {
      if (open[r.kunci]) sejarah.push(open[r.kunci]); // jaga-jaga: ambil berganda
      open[r.kunci] = { idKunci: r.kunci, bilik: namaBilik, guru: r.guru, masaAmbil: iso_(r.masa), masaPulang: '', guruPulang: '', status: 'Belum Pulang' };
    } else if (r.tindakan === 'Pulang') {
      const o = open[r.kunci];
      if (o) {
        o.masaPulang = iso_(r.masa);
        o.guruPulang = r.guru;
        o.status = 'Sudah Pulang';
        sejarah.push(o);
        delete open[r.kunci];
      } else {
        sejarah.push({ idKunci: r.kunci, bilik: namaBilik, guru: r.guru, masaAmbil: '', masaPulang: iso_(r.masa), guruPulang: r.guru, status: 'Sudah Pulang' });
      }
    }
  });
  Object.keys(open).forEach(function (k) { sejarah.push(open[k]); });
  sejarah.sort(function (a, b) {
    return (b.masaAmbil || b.masaPulang).localeCompare(a.masaAmbil || a.masaPulang);
  });

  // Status semasa setiap bilik
  const bilik = bm.order.map(function (k) {
    const b = bm.map[k];
    const o = open[k];
    return {
      idKunci: b.id,
      nama: b.nama,
      status: o ? 'Ambil' : 'Pulang',
      pemegang: o ? o.guru : '-',
      masaAmbil: o ? o.masaAmbil : ''
    };
  });

  return { ok: true, dijana: iso_(new Date()), bilik: bilik, log: sejarah };
}

/* ============================================================
 *  HTML halaman imbas (telefon guru)
 * ============================================================ */
const HTML_IMBAS = '<!DOCTYPE html><html lang="ms"><head><base target="_top"><meta charset="utf-8">' +
'<style>' +
'*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}' +
'.card{background:#fff;color:#0f172a;border-radius:20px;padding:28px 22px;width:100%;max-width:400px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4)}' +
'.ico{width:84px;height:84px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:46px;color:#fff}' +
'.ok-ambil{background:#ea580c}.ok-pulang{background:#16a34a}.err{background:#dc2626}.wait{background:#64748b}' +
'h1{font-size:15px;margin:0 0 4px;color:#64748b;font-weight:600;letter-spacing:.5px;text-transform:uppercase}' +
'h2{font-size:24px;margin:0 0 14px}' +
'.badge{display:inline-block;padding:10px 18px;border-radius:999px;font-weight:800;font-size:17px;color:#fff;margin-bottom:14px}' +
'.meta{font-size:14px;color:#475569;line-height:1.6}' +
'select,button{width:100%;padding:14px;border-radius:12px;font-size:16px;margin-top:12px;border:1px solid #cbd5e1}' +
'button{background:#1e40af;color:#fff;border:0;font-weight:700;cursor:pointer}button:disabled{opacity:.5}' +
'a.tukar{display:inline-block;margin-top:18px;font-size:13px;color:#64748b;text-decoration:underline;cursor:pointer}' +
'.spin{width:40px;height:40px;border:5px solid #e2e8f0;border-top-color:#1e40af;border-radius:50%;animation:s 1s linear infinite;margin:10px auto}@keyframes s{to{transform:rotate(360deg)}}' +
'</style></head><body><div class="card" id="app"><div class="spin"></div></div>' +
'<script>' +
'var D=__DATA__;var KEY="nfc_kunci_guru";var app=document.getElementById("app");var modTukar=false;' +
'function esc(s){var d=document.createElement("div");d.textContent=s==null?"":s;return d.innerHTML;}' +
'function getNama(){try{return localStorage.getItem(KEY)||"";}catch(e){return "";}}' +
'function setNama(n){try{localStorage.setItem(KEY,n);}catch(e){}}' +
'function clrNama(){try{localStorage.removeItem(KEY);}catch(e){}}' +
'function loading(t){app.innerHTML=\'<div class="spin"></div><div class="meta">\'+esc(t||"Memproses...")+\'</div>\';}' +
'function ralat(m){app.innerHTML=\'<div class="ico err">!</div><h1>Ralat</h1><h2>\'+esc(m)+\'</h2><a class="tukar" onclick="mula()">Cuba lagi</a>\';}' +
'function borang(){var o=\'<option value="">-- Pilih nama anda --</option>\';D.guru.forEach(function(g){o+=\'<option>\'+esc(g)+\'</option>\';});' +
' var tajuk=modTukar?"Tukar Pengguna":"Pendaftaran Peranti";var info=modTukar?"Pilih nama baharu. Tiada rekod dibuat; imbas semula tag selepas ini.":"Pilih nama anda sekali sahaja. Peranti ini akan mengingatinya.";var btn=modTukar?"Simpan Nama":"Simpan & Rekod";' +
' app.innerHTML=\'<div class="ico wait">&#128100;</div><h1>\'+tajuk+\'</h1><h2>\'+esc(D.bilik)+\'</h2><div class="meta">\'+info+\'</div><select id="sel">\'+o+\'</select><button id="btn">\'+btn+\'</button>\';' +
' document.getElementById("btn").onclick=function(){var n=document.getElementById("sel").value;if(!n){alert("Sila pilih nama anda.");return;}setNama(n);if(modTukar){modTukar=false;app.innerHTML=\'<div class="ico ok-pulang">&#10003;</div><h1>Disimpan</h1><h2>\'+esc(n)+\'</h2><div class="meta">Sila imbas semula tag NFC pada kunci.</div>\';}else{hantar(n);}};}' +
'function hantar(n){loading("Merekod...");google.script.run.withSuccessHandler(papar).withFailureHandler(function(e){ralat(e.message||e);}).prosesImbas(D.kunci,n);}' +
'function papar(r){var a=r.tindakan==="Ambil";app.innerHTML=\'<div class="ico \'+(a?"ok-ambil":"ok-pulang")+\'">\'+(a?"&#128273;":"&#10003;")+\'</div><h1>\'+esc(r.bilik)+\'</h1><div class="badge \'+(a?"ok-ambil":"ok-pulang")+\'">BERJAYA (\'+r.tindakan.toUpperCase()+\')</div><div class="meta"><b>\'+esc(r.guru)+\'</b><br>\'+esc(r.masa)+\'</div><a class="tukar" onclick="tukar()">Bukan anda? Tukar Pengguna</a>\';}' +
'function tukar(){clrNama();modTukar=true;borang();}' +
'function mula(){if(!D.valid){ralat("Kunci \\""+D.kunci+"\\" tidak dijumpai dalam senarai bilik.");return;}if(!D.guru.length){ralat("Senarai guru kosong (tab Nama_Guru).");return;}var n=getNama();if(n&&D.guru.indexOf(n)>-1){hantar(n);}else{clrNama();borang();}}' +
'mula();' +
'</script></body></html>';
