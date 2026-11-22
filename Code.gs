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
const FMT_SHEET = 'dd/mm/yyyy h:mm:ss AM/PM'; // format masa 12 jam dalam Google Sheets
const DASHBOARD_URL = 'https://mykey-eta.vercel.app/'; // pautan "Daftar akaun" di halaman imbas
const CACHE_DASH_SAAT = 30; // data dashboard di-cache; dibuang serta-merta setiap kali ada imbasan baharu
const MAX_LOG = 300;        // bilangan rekod sejarah terkini yang dihantar ke dashboard

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
  sh.getRange('A1:F1').setValues([['ID_Kunci', 'Nama_Bilik', 'Status_Semasa', 'Pemegang_Terkini', 'Masa_Terkini', 'URL_Tag_NFC']]);
  if (kosong(sh)) {
    sh.getRange('B2:B4').setValues([['Makmal Komputer 1'], ['Bilik Pendidikan Seni'], ['Bilik Muzik']]);
  }
  // H1:H2 = URL Web App (satu sel input; kolum URL_Tag_NFC merujuknya)
  sh.getRange('H1').setValue('URL_Web_App');
  if (!String(sh.getRange('H2').getValue()).trim()) {
    let url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
    sh.getRange('H2').setValue(url);
  }

  const rows = 100; // formula disediakan untuk baris 2 hingga 101
  const idSedia = sh.getRange(2, 1, rows, 1).getValues();
  const fC = [], fD = [], fE = [], fF = [];
  for (let r = 2; r < 2 + rows; r++) {
    // ID_Kunci: dijana daripada Nama_Bilik jika sel masih kosong (ID yang ditaip tidak diubah)
    if (!String(idSedia[r - 2][0]).trim()) {
      sh.getRange(r, 1).setFormula(formulaId_(r));
    }
    // ARRAYFORMULA wajib: tanpanya LOOKUP(2,1/(...)) hanya membaca baris pertama log
    fC.push(['=IF($A' + r + '="","",IFERROR(ARRAYFORMULA(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A' + r + '),Log_Imbas!$D$2:$D)),"Pulang"))']);
    fD.push(['=IF($A' + r + '="","",IF($C' + r + '="Ambil",IFERROR(ARRAYFORMULA(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A' + r + '),Log_Imbas!$C$2:$C)),"-"),"-"))']);
    fE.push(['=IF($A' + r + '="","",IFERROR(ARRAYFORMULA(LOOKUP(2,1/(Log_Imbas!$B$2:$B=$A' + r + '),Log_Imbas!$A$2:$A)),"-"))']);
    fF.push(['=IF($A' + r + '="","",$H$2&"?kunci="&ENCODEURL($A' + r + '))']);
  }
  sh.getRange(2, 3, rows, 1).setFormulas(fC);
  sh.getRange(2, 4, rows, 1).setFormulas(fD);
  sh.getRange(2, 5, rows, 1).setFormulas(fE);
  sh.getRange(2, 6, rows, 1).setFormulas(fF);
  sh.getRange(2, 5, rows, 1).setNumberFormat(FMT_SHEET);
  styleHeader_(sh, 6);
  sh.setColumnWidths(1, 5, 170);
  sh.setColumnWidth(6, 420);
  sh.setColumnWidth(8, 300);

  // --- Log_Imbas ---
  sh = ss.getSheetByName(SH_LOG) || ss.insertSheet(SH_LOG);
  sh.getRange('A1:D1').setValues([['Masa', 'ID_Kunci', 'Nama_Guru', 'Tindakan']]);
  sh.getRange('A2:A').setNumberFormat(FMT_SHEET);
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

/** Formula ID_Kunci untuk baris r: "Bilik PSV" -> "BILIK-PSV" */
function formulaId_(r) {
  return '=IF($B' + r + '="","",REGEXREPLACE(REGEXREPLACE(UPPER(TRIM($B' + r + ')),"[^A-Z0-9]+","-"),"^-+|-+$",""))';
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

/**
 * Tarikh ISO dalam zon Malaysia (+08:00, tiada DST).
 * Dikira terus (bukan Utilities.formatDate) kerana dipanggil untuk setiap rekod log.
 */
function iso_(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 19) + '+08:00';
}

/** Masa untuk paparan, format 12 jam dengan waktu: "21/11/2026 8:05 pagi" */
function masa12_(d) {
  const jam = Number(Utilities.formatDate(d, TZ, 'H'));
  const waktu = jam < 12 ? 'pagi' : jam < 14 ? 'T/hari' : jam < 19 ? 'petang' : 'malam';
  return Utilities.formatDate(d, TZ, 'dd/MM/yyyy h:mm') + ' ' + waktu;
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
    daftar: DASHBOARD_URL
  };
  // Escape supaya selamat dalam <script>
  const safe = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  // Fungsi penggantian: elak corak "$&" / "$'" dalam data ditafsir oleh replace()
  return HtmlService.createHtmlOutput(HTML_IMBAS.replace('__DATA__', function () { return safe; }))
    .setTitle('Imbas Kunci')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * UJIAN DARI EDITOR: pilih fungsi ini > Run. Lihat hasil di Execution log.
 * Merekod imbasan SEBENAR (bilik pertama, akaun Aktif pertama) dalam Log_Imbas,
 * dan memaparkan URL tag NFC bagi setiap kunci.
 */
function ujiImbas() {
  const bm = bilikMap_();
  const akaun = users_().filter(function (u) { return u.status === 'Aktif'; })[0];
  if (!bm.order.length) throw new Error('Tab Nama_Bilik kosong. Jalankan setupSheets() atau isi data bilik dahulu.');
  if (!akaun) throw new Error('Tiada akaun Aktif dalam tab Pengguna. Daftar akaun di dashboard dahulu.');
  const b = bm.map[bm.order[0]];
  const r = rekodImbas_(b.id, akaun.nama);
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

/* ---------- Dipanggil dari halaman imbas melalui google.script.run ---------- */

/** Log masuk di halaman imbas (sesi 90 hari pada peranti itu). */
function loginImbas(username, password) {
  const r = login_({ username: username, password: password, ingat: true });
  return { ok: true, token: r.token, pengguna: { username: r.pengguna.username, nama: r.pengguna.nama } };
}

function logoutImbas(token) {
  return logout_({ token: token });
}

/**
 * Rekod imbasan. HANYA guru berdaftar dengan sesi sah & akaun Aktif.
 * Nama yang direkod diambil daripada akaun, bukan daripada pelayar.
 * (BUKAN untuk dijalankan terus dari editor; guna ujiImbas.)
 */
function prosesImbas(kunci, token) {
  if (kunci === undefined && token === undefined) {
    throw new Error('prosesImbas dipanggil tanpa ID kunci. Fungsi ini dipanggil oleh halaman imbas NFC, ' +
      'bukan dijalankan terus dari editor. Untuk menguji, pilih fungsi ujiImbas > Run.');
  }
  const u = sesi_(token);
  // Awalan "AUTH:" memberitahu halaman imbas supaya memaparkan borang log masuk
  if (!u) throw new Error('AUTH: Hanya guru berdaftar boleh merekod kunci. Sila log masuk.');
  return rekodImbas_(kunci, u.nama);
}

/** Logik rekod Ambil/Pulang (nama guru sudah disahkan oleh pemanggil). */
function rekodImbas_(kunci, namaGuru) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = String(kunci || '').trim().toUpperCase();
    const guru = String(namaGuru || '').trim();
    if (!id) throw new Error('ID kunci kosong. Semak URL tag NFC (mesti berakhir dengan ?kunci=ID_KUNCI).');
    const b = bilikMap_().map[id];
    if (!b) throw new Error('ID kunci "' + kunci + '" tiada dalam tab Nama_Bilik.');
    if (!guru) throw new Error('Nama guru kosong.');

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
        masa: masa12_(last.masa)
      };
    }

    const tindakan = (last && last.tindakan === 'Ambil') ? 'Pulang' : 'Ambil';
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_LOG);
    sh.appendRow([now, b.id, guru, tindakan]);
    buangCacheDash_(); // dashboard terus nampak imbasan ini
    sh.getRange(sh.getLastRow(), 1).setNumberFormat(FMT_SHEET);
    SpreadsheetApp.flush();

    return {
      ok: true,
      bilik: b.nama,
      tindakan: tindakan,
      guru: guru,
      masa: masa12_(now)
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

  // Status bilik dikira daripada seluruh log; hanya sejarah terkini dihantar (data lebih kecil)
  return { ok: true, dijana: iso_(new Date()), bilik: bilik, log: sejarah.slice(0, MAX_LOG), jumlahLog: sejarah.length };
}

/** Data dashboard dengan cache pelayan. Dibuang oleh rekodImbas_ apabila ada imbasan baharu. */
function dashboardCache_() {
  const c = CacheService.getScriptCache();
  const raw = c.get('dash');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* cache rosak: jana semula */ }
  }
  const d = getDashboard_();
  const s = JSON.stringify(d);
  if (s.length < 90000) c.put('dash', s, CACHE_DASH_SAAT); // had CacheService: 100 KB satu kunci
  return d;
}

function buangCacheDash_() {
  try { CacheService.getScriptCache().remove('dash'); } catch (e) { /* abaikan */ }
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
    sh.getRange('G2:G').setNumberFormat(FMT_SHEET);
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
  const d = dashboardCache_();
  d.pengguna = { username: u.username, nama: u.nama };
  return d;
}

/* ============================================================
 *  HTML halaman imbas (telefon guru)
 * ============================================================ */
const HTML_IMBAS = `<!DOCTYPE html><html lang="ms"><head><base target="_top"><meta charset="utf-8">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;color:#0f172a;border-radius:20px;padding:28px 22px;width:100%;max-width:400px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4);overflow-wrap:anywhere}
.ico{width:84px;height:84px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:42px;color:#fff}
.ok-ambil{background:#ea580c}.ok-pulang{background:#16a34a}.err{background:#dc2626}.wait{background:#1e40af}
h1{font-size:15px;margin:0 0 4px;color:#64748b;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
h2{font-size:22px;margin:0 0 14px}
.badge{display:inline-block;padding:10px 18px;border-radius:999px;font-weight:800;font-size:17px;color:#fff;margin-bottom:14px}
.meta{font-size:14px;color:#475569;line-height:1.6}
.msg{margin-top:12px;padding:10px 12px;border-radius:12px;background:#fee2e2;color:#991b1b;font-size:14px;text-align:left}
input,button{width:100%;padding:14px;border-radius:12px;font-size:16px;margin-top:12px;border:1px solid #cbd5e1;font-family:inherit}
input{background:#f1f5f9;color:#0f172a;outline:none}input:focus{border-color:#1e40af;background:#fff}
button{background:#1e40af;color:#fff;border:0;font-weight:700;cursor:pointer}button:disabled{opacity:.5}
a.tukar{display:inline-block;margin-top:18px;font-size:14px;color:#1e40af;text-decoration:underline;cursor:pointer}
.spin{width:40px;height:40px;border:5px solid #e2e8f0;border-top-color:#1e40af;border-radius:50%;animation:s 1s linear infinite;margin:10px auto}
@keyframes s{to{transform:rotate(360deg)}}
</style></head><body><div class="card" id="app"><div class="spin"></div></div>
<script>
var D = __DATA__;
var KEY_T = "nfc_kunci_token", KEY_N = "nfc_kunci_nama";
var app = document.getElementById("app");
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function lsGet(k){ try { return localStorage.getItem(k) || ""; } catch(e){ return ""; } }
function lsSet(k, v){ try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch(e){} }
function loading(t){ app.innerHTML = '<div class="spin"></div><div class="meta">' + esc(t || "Memproses...") + '</div>'; }
function ralat(m){ app.innerHTML = '<div class="ico err">!</div><h1>Ralat</h1><h2>' + esc(m) + '</h2><a class="tukar" onclick="mula()">Cuba lagi</a>'; }

/* Guru belum log masuk: hanya guru berdaftar boleh merekod */
function borangLogin(msg){
  app.innerHTML = '<div class="ico wait">&#128274;</div><h1>Log masuk guru</h1><h2>' + esc(D.bilik) + '</h2>' +
    '<div class="meta">Hanya guru berdaftar boleh merekod kunci. Log masuk sekali; telefon ini akan mengingati anda.</div>' +
    (msg ? '<div class="msg" id="msg">' + esc(msg) + '</div>' : '') +
    '<form id="f"><input id="u" placeholder="Nama pengguna" autocomplete="username" autocapitalize="none" spellcheck="false">' +
    '<input id="p" type="password" placeholder="Kata laluan" autocomplete="current-password">' +
    '<button id="btn" type="submit">Log Masuk &amp; Rekod</button></form>' +
    '<a class="tukar" id="daftar" href="' + esc(D.daftar) + '" target="_blank" rel="noopener">Belum berdaftar? Daftar akaun di sini</a>';
  document.getElementById("f").onsubmit = function(e){
    e.preventDefault();
    var u = document.getElementById("u").value.trim(), p = document.getElementById("p").value;
    if (!u || !p) { borangLogin("Sila isi nama pengguna dan kata laluan."); return; }
    loading("Log masuk...");
    google.script.run
      .withSuccessHandler(function(r){ lsSet(KEY_T, r.token); lsSet(KEY_N, (r.pengguna && r.pengguna.nama) || u); hantar(); })
      .withFailureHandler(function(err){ borangLogin(err && err.message ? err.message : String(err)); })
      .loginImbas(u, p);
  };
}

function hantar(){
  loading("Merekod...");
  google.script.run
    .withSuccessHandler(papar)
    .withFailureHandler(function(err){
      var m = err && err.message ? err.message : String(err);
      if (m.indexOf("AUTH:") > -1) { lsSet(KEY_T, ""); borangLogin(m.split("AUTH:").pop().trim()); }
      else ralat(m);
    })
    .prosesImbas(D.kunci, lsGet(KEY_T));
}

function papar(r){
  var a = r.tindakan === "Ambil";
  app.innerHTML = '<div class="ico ' + (a ? "ok-ambil" : "ok-pulang") + '">' + (a ? "&#128273;" : "&#10003;") + '</div>' +
    '<h1>' + esc(r.bilik) + '</h1><div class="badge ' + (a ? "ok-ambil" : "ok-pulang") + '">BERJAYA (' + esc(r.tindakan).toUpperCase() + ')</div>' +
    '<div class="meta"><b>' + esc(r.guru) + '</b><br>' + esc(r.masa) +
    (r.ulang ? '<br><i>Imbasan berganda diabaikan. Rekod ini sudah dibuat sebentar tadi.</i>' : '') + '</div>' +
    '<a class="tukar" onclick="keluar()">Bukan anda? Log keluar</a>';
}

function keluar(){
  var t = lsGet(KEY_T);
  lsSet(KEY_T, ""); lsSet(KEY_N, "");
  if (t) google.script.run.logoutImbas(t);
  borangLogin("");
}

function mula(){
  if (!D.valid) { ralat('Kunci "' + D.kunci + '" tidak dijumpai dalam senarai bilik.'); return; }
  try { localStorage.removeItem("nfc_kunci_guru"); } catch(e){} // nama pilihan versi lama: tidak lagi digunakan
  if (lsGet(KEY_T)) hantar(); else borangLogin("");
}
mula();
</script></body></html>`;
