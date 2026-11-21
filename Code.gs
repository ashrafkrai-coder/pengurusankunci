/**
 * SISTEM PENGURUSAN & PEMANTAUAN KUNCI SEKOLAH (TAG NFC)
 * Skrip ini mesti dibuka dari Google Sheets: Extensions > Apps Script
 *
 * Langkah pertama: jalankan fungsi  setupSheets()  untuk menjana 4 tab,
 * tajuk kolum, formula dan data contoh (selamat dijalankan semula).
 */

const SH_BILIK = 'Nama_Bilik';
const SH_LOG   = 'Log_Imbas';
const SH_GURU  = 'Nama_Guru';
const SH_USER  = 'Pengguna';
const TZ       = 'Asia/Kuala_Lumpur';
const SESI_HARI = 7;     // tempoh sah token log masuk (hari)
const SESI_INGAT_HARI = 90; // tempoh sesi jika "Ingat saya" ditanda
const HASH_ITER = 500;   // bilangan ulangan hash kata laluan
const MAX_GAGAL = 5;     // cubaan log masuk gagal sebelum dikunci 15 minit
const DEBOUNCE_SAAT = 60; // imbasan semula oleh guru sama dalam tempoh ini diabaikan

/* ============================================================
 *  SETUP — selamat dijalankan semula: data sedia ada TIDAK dipadam.
 *  Data contoh hanya dimasukkan ke dalam tab yang masih kosong.
 * ============================================================ */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  const kosong = function (s) { return s.getLastRow() < 2; };

  // --- Nama_Bilik ---
  let sh = ss.getSheetByName(SH_BILIK) || ss.insertSheet(SH_BILIK);
  sh.getRange('A1:E1').setValues([['ID_Kunci', 'Nama_Bilik', 'Status_Semasa', 'Pemegang_Terkini', 'Masa_Terkini']]);
  if (kosong(sh)) {
    sh.getRange('A2:B4').setValues([
      ['MAKMAL-1', 'Makmal Komputer 1'],
      ['BILIK-SENI', 'Bilik Pendidikan Seni'],
      ['BILIK-MUZIK', 'Bilik Muzik']
    ]);
  }
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
  sh.getRange('A1:D1').setValues([['Masa', 'ID_Kunci', 'Nama_Guru', 'Tindakan']]);
  sh.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  styleHeader_(sh, 4);
  sh.setColumnWidths(1, 4, 170);

  // --- Nama_Guru ---
  sh = ss.getSheetByName(SH_GURU) || ss.insertSheet(SH_GURU);
  sh.getRange('A1:B1').setValues([['Nama_Guru', 'Jawatan']]);
  if (kosong(sh)) {
    sh.getRange('A2:B3').setValues([
      ['Cikgu Contoh Satu', 'Guru Kanan'],
      ['Cikgu Contoh Dua', 'Guru Disiplin']
    ]);
  }
  styleHeader_(sh, 2);
  sh.setColumnWidths(1, 2, 220);

  // --- Pengguna (tidak dikosongkan jika sudah wujud) ---
  userSheet_();

  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Helaian1');
  if (def && ss.getSheets().length > 4) ss.deleteSheet(def);
  SpreadsheetApp.getUi().alert('Siap! 4 tab telah disediakan. Data sedia ada tidak diubah; data contoh hanya diisi dalam tab yang kosong.');
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
    if (p.action === 'getDashboard') return json_(dashboardAuth_(p.token));
    if (p.kunci) return imbasPage_(String(p.kunci));
  } catch (err) {
    if (p.action) return json_({ ok: false, error: String(err) });
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:20px">Ralat: ' + escHtml_(String(err)) + '</p>');
  }
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:sans-serif;padding:24px"><h2>Sistem Kunci NFC</h2>' +
    '<p>Web App aktif. Gunakan <code>?kunci=ID_KUNCI</code> pada tag NFC atau <code>?action=getDashboard</code> untuk API.</p></div>'
  ).setTitle('Sistem Kunci NFC');
}

/* ============================================================
 *  doPost — API dashboard PWA (daftar, login, logout, getDashboard)
 *  PWA menghantar JSON sebagai text/plain (elak CORS preflight).
 * ============================================================ */
function doPost(e) {
  let b;
  try {
    b = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {};
  } catch (err) {
    return json_({ ok: false, error: 'Permintaan tidak sah.' });
  }
  try {
    if (b.action === 'daftar') return json_(daftar_(b));
    if (b.action === 'login') return json_(login_(b));
    if (b.action === 'logout') return json_(logout_(b));
    if (b.action === 'getDashboard') return json_(dashboardAuth_(b.token));
    return json_({ ok: false, error: 'Tindakan tidak dikenali.' });
  } catch (err) {
    return json_({ ok: false, error: (err && err.message) || String(err) });
  }
}

function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
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

/**
 * Senarai nama guru untuk halaman imbas NFC:
 * gabungan tab Nama_Guru + Nama_Penuh akaun Aktif dalam tab Pengguna (tanpa pendua).
 */
function guruList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seen = {}, out = [];
  function add(n) {
    n = String(n || '').trim();
    if (!n || /^[=+\-@]/.test(n)) return;
    const k = n.toLowerCase();
    if (seen[k]) return;
    seen[k] = true;
    out.push(n);
  }
  const sg = ss.getSheetByName(SH_GURU);
  if (sg && sg.getLastRow() >= 2) {
    sg.getRange(2, 1, sg.getLastRow() - 1, 1).getValues().forEach(function (r) { add(r[0]); });
  }
  const su = ss.getSheetByName(SH_USER);
  if (su && su.getLastRow() >= 2) {
    su.getRange(2, 1, su.getLastRow() - 1, 6).getValues().forEach(function (r) {
      if (String(r[5]).trim() === 'Aktif') add(r[1]);
    });
  }
  return out.sort(function (a, b) { return a.localeCompare(b); });
}

/** Tambah nama ke tab Nama_Guru jika belum wujud (tidak sensitif huruf). */
function tambahGuru_(nama) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SH_GURU);
  if (!sh) {
    sh = ss.insertSheet(SH_GURU);
    sh.getRange('A1:B1').setValues([['Nama_Guru', 'Jawatan']]);
    styleHeader_(sh, 2);
  }
  if (sh.getLastRow() >= 2) {
    const ada = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().some(function (r) {
      return String(r[0]).trim().toLowerCase() === nama.toLowerCase();
    });
    if (ada) return;
  }
  sh.appendRow([nama, '']);
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

/**
 * UJIAN DARI EDITOR: pilih fungsi ini > Run. Lihat hasil di Execution log.
 * Merekod imbasan SEBENAR (bilik pertama, guru pertama) dalam Log_Imbas,
 * dan memaparkan URL tag NFC bagi setiap kunci.
 */
function ujiImbas() {
  const bm = bilikMap_();
  const guru = guruList_();
  if (!bm.order.length) throw new Error('Tab Nama_Bilik kosong. Jalankan setupSheets() atau isi data bilik dahulu.');
  if (!guru.length) throw new Error('Tab Nama_Guru kosong. Isi nama guru dahulu.');
  const b = bm.map[bm.order[0]];
  const r = prosesImbas(b.id, guru[0]);
  console.log('Hasil ujian: ' + JSON.stringify(r));
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  if (url) {
    bm.order.forEach(function (k) {
      console.log('URL tag NFC ' + bm.map[k].nama + ': ' + url + '?kunci=' + encodeURIComponent(bm.map[k].id));
    });
  } else {
    console.log('Deploy sebagai Web App dahulu untuk mendapatkan URL tag NFC.');
  }
  return r;
}

/** Dipanggil dari pelayar guru melalui google.script.run (BUKAN untuk dijalankan terus dari editor). */
function prosesImbas(kunci, namaGuru) {
  if (kunci === undefined && namaGuru === undefined) {
    throw new Error('prosesImbas dipanggil tanpa ID kunci. Fungsi ini dipanggil oleh halaman imbas NFC, ' +
      'bukan dijalankan terus dari editor. Untuk menguji, pilih fungsi ujiImbas > Run.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = String(kunci || '').trim().toUpperCase();
    const nama = String(namaGuru || '').trim();
    if (!id) throw new Error('ID kunci kosong. Semak URL tag NFC (mesti berakhir dengan ?kunci=ID_KUNCI).');
    const b = bilikMap_().map[id];
    if (!b) throw new Error('ID kunci "' + kunci + '" tiada dalam tab Nama_Bilik.');
    if (!nama) throw new Error('Nama guru kosong.');

    // Nama mesti wujud dalam tab Nama_Guru. Ini juga menghalang input
    // seperti "=FORMULA()" daripada ditulis ke dalam Sheet.
    const guru = guruList_().filter(function (g) { return g.toLowerCase() === nama.toLowerCase(); })[0];
    if (!guru) throw new Error('Nama "' + nama + '" tiada dalam senarai guru. Sila pilih semula nama anda.');

    // Cari rekod terakhir kunci ini
    const rows = logRows_();
    let last = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].kunci === id) { last = rows[i]; break; }
    }
    const now = new Date();

    // Imbasan berganda (tag NFC terbaca dua kali / guru tekan semula):
    // guru yang sama dalam tempoh DEBOUNCE_SAAT -> pulangkan rekod sedia ada, tiada rekod baharu.
    if (last && last.guru.toLowerCase() === guru.toLowerCase() &&
        now.getTime() - last.masa.getTime() < DEBOUNCE_SAAT * 1000) {
      return {
        ok: true,
        ulang: true,
        bilik: b.nama,
        tindakan: last.tindakan,
        guru: last.guru,
        masa: Utilities.formatDate(last.masa, TZ, 'dd/MM/yyyy HH:mm:ss')
      };
    }

    const tindakan = (last && last.tindakan === 'Ambil') ? 'Pulang' : 'Ambil';
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_LOG);
    sh.appendRow([now, b.id, guru, tindakan]);
    sh.getRange(sh.getLastRow(), 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    SpreadsheetApp.flush();

    return {
      ok: true,
      bilik: b.nama,
      tindakan: tindakan,
      guru: guru,
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
 *  MOD 3: PENGGUNA DASHBOARD (daftar & log masuk)
 *  Akaun baharu terus "Aktif" dan terus log masuk selepas mendaftar.
 *  Admin boleh menyekat akaun dengan menukar kolum Status dalam tab
 *  Pengguna kepada selain "Aktif" (cth "Digantung").
 * ============================================================ */
function userSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SH_USER);
  if (!sh) {
    sh = ss.insertSheet(SH_USER);
    sh.getRange('A1:G1').setValues([['Nama_Pengguna', 'Nama_Penuh', 'Hash', 'Salt', 'Peranan', 'Status', 'Tarikh_Daftar']]);
    sh.getRange('G2:G').setNumberFormat('dd/mm/yyyy hh:mm:ss');
    styleHeader_(sh, 7);
    sh.setColumnWidths(1, 7, 160);
  }
  return sh;
}

function users_() {
  const sh = userSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().map(function (r) {
    return {
      username: String(r[0]).trim().toLowerCase(),
      nama: String(r[1]).trim(),
      hash: String(r[2]),
      salt: String(r[3]),
      peranan: String(r[4]).trim(),
      status: String(r[5]).trim()
    };
  }).filter(function (u) { return u.username; });
}

function findUser_(username) {
  const u = String(username || '').trim().toLowerCase();
  return users_().filter(function (x) { return x.username === u; })[0] || null;
}

function hash_(pw, salt) {
  let h = salt + ':' + pw;
  for (let i = 0; i < HASH_ITER; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, salt + ':' + h, Utilities.Charset.UTF_8));
  }
  return h;
}

function daftar_(b) {
  const username = String(b.username || '').trim().toLowerCase();
  const nama = String(b.nama || '').trim();
  const pw = String(b.password || '');
  if (!/^[a-z0-9._@-]{3,60}$/.test(username)) throw new Error('Nama pengguna mesti 3-60 aksara (huruf, nombor, . _ @ -).');
  if (!nama || nama.length > 80) throw new Error('Nama penuh diperlukan (maksimum 80 aksara).');
  if (/^[=+\-@]/.test(nama)) throw new Error('Nama penuh tidak boleh bermula dengan = + - @');
  if (pw.length < 8) throw new Error('Kata laluan mesti sekurang-kurangnya 8 aksara.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (findUser_(username)) throw new Error('Nama pengguna sudah wujud.');
    const salt = Utilities.getUuid();
    userSheet_().appendRow([username, nama, hash_(pw, salt), salt, 'Pentadbir', 'Aktif', new Date()]);
    tambahGuru_(nama); // nama terus tersedia di halaman imbas NFC
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  // Terus log masuk selepas pendaftaran
  const s = buatSesi_({ username: username, nama: nama, peranan: 'Pentadbir' }, !!b.ingat);
  s.mesej = 'Pendaftaran berjaya.';
  return s;
}

function buatSesi_(u, ingat) {
  const props = PropertiesService.getScriptProperties();
  buangSesiLuput_(props);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const hari = ingat ? SESI_INGAT_HARI : SESI_HARI;
  props.setProperty('sesi_' + token, JSON.stringify({ u: u.username, exp: Date.now() + hari * 864e5 }));
  return { ok: true, token: token, pengguna: { username: u.username, nama: u.nama, peranan: u.peranan } };
}

function login_(b) {
  const username = String(b.username || '').trim().toLowerCase();
  const pw = String(b.password || '');
  if (!username || !pw) throw new Error('Sila isi nama pengguna dan kata laluan.');

  const cache = CacheService.getScriptCache();
  const ck = 'gagal_' + username;
  const gagal = Number(cache.get(ck) || 0);
  if (gagal >= MAX_GAGAL) throw new Error('Terlalu banyak cubaan gagal. Cuba lagi selepas 15 minit.');

  const u = findUser_(username);
  if (!u || hash_(pw, u.salt) !== u.hash) {
    cache.put(ck, String(gagal + 1), 900);
    throw new Error('Nama pengguna atau kata laluan salah.');
  }
  cache.remove(ck);
  if (u.status !== 'Aktif') throw new Error('Akaun anda telah disekat. Sila hubungi admin.');
  return buatSesi_(u, !!b.ingat);
}

function logout_(b) {
  const t = String(b.token || '');
  if (t) PropertiesService.getScriptProperties().deleteProperty('sesi_' + t);
  return { ok: true };
}

/** Pulangkan pengguna jika token sah & akaun masih Aktif, jika tidak null. */
function sesi_(token) {
  const t = String(token || '');
  if (!t) return null;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('sesi_' + t);
  if (!raw) return null;
  let s = null;
  try { s = JSON.parse(raw); } catch (e) { s = null; }
  if (!s || !(s.exp > Date.now())) { props.deleteProperty('sesi_' + t); return null; }
  const u = findUser_(s.u);
  return (u && u.status === 'Aktif') ? u : null;
}

function buangSesiLuput_(props) {
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sesi_') !== 0) return;
    let s = null;
    try { s = JSON.parse(all[k]); } catch (e) { s = null; }
    if (!s || !(s.exp > now)) props.deleteProperty(k);
  });
}

function dashboardAuth_(token) {
  const u = sesi_(token);
  if (!u) return { ok: false, auth: false, error: 'Sesi tamat atau tidak sah. Sila log masuk semula.' };
  const d = getDashboard_();
  d.pengguna = { username: u.username, nama: u.nama };
  return d;
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
'function papar(r){var a=r.tindakan==="Ambil";app.innerHTML=\'<div class="ico \'+(a?"ok-ambil":"ok-pulang")+\'">\'+(a?"&#128273;":"&#10003;")+\'</div><h1>\'+esc(r.bilik)+\'</h1><div class="badge \'+(a?"ok-ambil":"ok-pulang")+\'">BERJAYA (\'+r.tindakan.toUpperCase()+\')</div><div class="meta"><b>\'+esc(r.guru)+\'</b><br>\'+esc(r.masa)+(r.ulang?\'<br><i>Imbasan berganda diabaikan. Rekod ini sudah dibuat sebentar tadi.</i>\':\'\')+\'</div><a class="tukar" onclick="tukar()">Bukan anda? Tukar Pengguna</a>\';}' +
'function tukar(){clrNama();modTukar=true;borang();}' +
'function mula(){if(!D.valid){ralat("Kunci \\""+D.kunci+"\\" tidak dijumpai dalam senarai bilik.");return;}if(!D.guru.length){ralat("Senarai guru kosong (tab Nama_Guru).");return;}var n=getNama();if(n&&D.guru.indexOf(n)>-1){hantar(n);}else{clrNama();borang();}}' +
'mula();' +
'</script></body></html>';
