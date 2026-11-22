// Ujian untuk Code.gs (Google Apps Script) menggunakan mock dalam tests/helpers/gas-mock.js
// Ujian bertanda { todo } mendokumentasikan pepijat/penambahbaikan yang dicadangkan:
// ia dijalankan tetapi tidak menggagalkan suite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadGas, formatDate } = require('./helpers/gas-mock');

const BILIK = [['MAKMAL-1', 'Makmal Komputer 1'], ['BILIK-SENI', 'Bilik Seni'], ['BILIK-MUZIK', 'Bilik Muzik']];
const GURU = ['Cikgu Ali', 'Cikgu Bala', 'Cikgu Chong'];

function gas(log = [], extra = {}) {
  return loadGas(Object.assign({ bilik: BILIK, guru: GURU, log }, extra));
}

describe('mock: formatDate', () => {
  test('ISO dengan zon +08:00', () => {
    assert.equal(formatDate(new Date('2026-01-01T00:00:00Z'), 'x', "yyyy-MM-dd'T'HH:mm:ssXXX"), '2026-01-01T08:00:00+08:00');
  });
});

describe('setupSheets', () => {
  test('menjana 4 tab, tajuk, 100 formula dan memadam Sheet1', () => {
    const g = loadGas({ extraSheets: ['Sheet1'] });
    g.ctx.setupSheets();
    const names = g.ss.getSheets().map((s) => s.name).sort();
    assert.deepEqual(names, ['Log_Imbas', 'Nama_Bilik', 'Nama_Guru', 'Pengguna']);
    const bilik = g.sheet('Nama_Bilik');
    assert.deepEqual([...bilik.data[0]].slice(0, 6), ['ID_Kunci', 'Nama_Bilik', 'Status_Semasa', 'Pemegang_Terkini', 'Masa_Terkini', 'URL_Tag_NFC']);
    assert.equal(bilik.data[0][7], 'URL_Web_App');
    assert.equal(bilik.data.length, 101);
    assert.match(bilik.data[1][2], /^=IF\(\$A2=""/);
    assert.match(bilik.data[100][4], /\$A101/);
    assert.match(bilik.data[1][5], /^=IF\(\$A2="","",\$H\$2&"\?kunci="&ENCODEURL\(\$A2\)\)$/, 'formula URL tag');
    assert.deepEqual(g.sheet('Log_Imbas').data[0], ['Masa', 'ID_Kunci', 'Nama_Guru', 'Tindakan']);
    assert.equal(g.calls.alerts.length, 1);
  });

  test('formula status C–E dibalut ARRAYFORMULA (baca rekod TERAKHIR, bukan pertama)', () => {
    const g = loadGas({});
    g.ctx.setupSheets();
    const row = g.sheet('Nama_Bilik').data[1];
    for (const col of [2, 3, 4]) assert.match(row[col], /ARRAYFORMULA\(LOOKUP\(2,1\/\(Log_Imbas!\$B\$2:\$B=\$A2\)/);
  });

  test('ID_Kunci: formula dijana daripada Nama_Bilik untuk sel kosong; ID ditaip tidak diubah', () => {
    const g = loadGas({ bilik: [['MAKMAL-1', 'Makmal Komputer 1'], ['', 'BILIK PSV']], guru: GURU, log: [] });
    g.ctx.setupSheets();
    const data = g.sheet('Nama_Bilik').data;
    assert.equal(data[1][0], 'MAKMAL-1', 'ID manual dikekalkan');
    assert.equal(data[2][0], '=IF($B3="","",REGEXREPLACE(REGEXREPLACE(UPPER(TRIM($B3)),"[^A-Z0-9]+","-"),"^-+|-+$",""))');
  });

  test('URL Web App diisi automatik di H2 jika kosong, tidak ditimpa jika sudah ada', () => {
    const g = loadGas({});
    g.ctx.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) };
    g.ctx.setupSheets();
    assert.equal(g.sheet('Nama_Bilik').data[1][7], 'https://script.google.com/macros/s/X/exec');
    g.sheet('Nama_Bilik').data[1][7] = 'https://script.google.com/macros/s/LAIN/exec';
    g.ctx.setupSheets();
    assert.equal(g.sheet('Nama_Bilik').data[1][7], 'https://script.google.com/macros/s/LAIN/exec');
  });

  test('tidak memadam tab Pengguna sedia ada', () => {
    const g = loadGas({});
    g.ctx.setupSheets();
    g.sheet('Pengguna').appendRow(['ali', 'Ali', 'h', 's', 'Pentadbir', 'Aktif', '']);
    g.ctx.setupSheets();
    assert.equal(g.sheet('Pengguna').data.length, 2);
  });

  test('menjalankan semula tidak memadam log, bilik atau guru sebenar', () => {
    const g = gas([['2026-01-01T00:00:00Z', 'MAKMAL-1', 'Cikgu Ali', 'Ambil']]);
    g.ctx.setupSheets();
    assert.equal(g.sheet('Log_Imbas').data.length, 2);
    assert.equal(g.sheet('Log_Imbas').data[1][2], 'Cikgu Ali');
    assert.deepEqual(g.sheet('Nama_Bilik').data.slice(1, 4).map((r) => r[0]), ['MAKMAL-1', 'BILIK-SENI', 'BILIK-MUZIK']);
    assert.equal(g.sheet('Nama_Bilik').data[2][1], 'Bilik Seni', 'nama sebenar tidak ditimpa data contoh');
    assert.deepEqual(g.sheet('Nama_Guru').data.slice(1).map((r) => r[0]), GURU);
  });

  test('tab kosong diisi data contoh', () => {
    const g = loadGas({});
    g.ctx.setupSheets();
    assert.equal(g.sheet('Nama_Guru').data[1][0], 'Cikgu Contoh Satu');
    assert.equal(g.sheet('Nama_Bilik').data[1][1], 'Makmal Komputer 1');
    assert.match(g.sheet('Nama_Bilik').data[1][0], /^=IF\(\$B2=""/, 'ID contoh dijana oleh formula');
  });
});

describe('doGet', () => {
  test('tanpa parameter: halaman info', () => {
    const out = gas().ctx.doGet({ parameter: {} });
    assert.match(out.getContent(), /Web App aktif/);
  });

  test('action=getDashboard tanpa token: ditolak (auth:false), tiada data bocor', () => {
    const out = gas([['2026-01-01T00:00:00Z', 'MAKMAL-1', 'Cikgu Ali', 'Ambil']]).ctx.doGet({ parameter: { action: 'getDashboard' } });
    const j = JSON.parse(out.getContent());
    assert.equal(j.ok, false);
    assert.equal(j.auth, false);
    assert.equal(j.bilik, undefined);
    assert.equal(out.mime, 'application/json');
  });

  test('?kunci= memaparkan halaman imbas dengan data bilik', () => {
    const out = gas().ctx.doGet({ parameter: { kunci: 'makmal-1' } });
    const html = out.getContent();
    assert.match(html, /"bilik":"Makmal Komputer 1"/);
    assert.match(html, /"valid":true/);
    assert.equal(out.xfo, 'ALLOWALL');
  });

  test('ralat pelayan dalam doPost dipulangkan sebagai JSON', () => {
    const g = gas([], { throwOnOpen: new Error('rosak') });
    const body = { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123' };
    const j = JSON.parse(g.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
    assert.deepEqual(j, { ok: false, error: 'rosak' });
  });

  test('mesej ralat HTML di-escape', () => {
    const g = gas([], { throwOnOpen: new Error('<img src=x onerror=alert(1)>') });
    const html = g.ctx.doGet({ parameter: { kunci: 'X' } }).getContent();
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});

describe('imbasPage_', () => {
  test('kunci tidak sah: valid=false', () => {
    const html = gas().ctx.imbasPage_('TIADA').getContent();
    assert.match(html, /"valid":false/);
  });

  test('escape </script> dalam kunci (cegah XSS)', () => {
    const html = gas().ctx.imbasPage_('</script><script>alert(1)</script>').getContent();
    assert.doesNotMatch(html, /<\/script><script>alert/);
    assert.match(html, /\\u003c\/script\\u003e/);
  });

  test('senarai nama guru TIDAK lagi didedahkan; pautan daftar disertakan', () => {
    const html = gas().ctx.imbasPage_('MAKMAL-1').getContent();
    assert.doesNotMatch(html, /"guru":/);
    assert.doesNotMatch(html, /Cikgu Ali/);
    assert.match(html, /"daftar":"https:\/\/mykey-eta\.vercel\.app\/"/);
  });

  test('corak $& dalam nama bilik tidak merosakkan halaman', () => {
    const g = loadGas({ bilik: [['A', "Bilik $& $' A"]], guru: [], log: [] });
    const html = g.ctx.imbasPage_('A').getContent();
    assert.match(html, /"bilik":"Bilik \$\\u0026 \$' A"/);
    const js = html.split('<script>')[1].split('</script>')[0];
    assert.doesNotThrow(() => new Function(js), 'skrip halaman imbas sah');
  });
});

// Undurkan masa semua rekod log (meniru masa berlalu antara imbasan)
function undur(g, saat = 120) {
  g.sheet('Log_Imbas').data.slice(1).forEach((r) => { r[0] = g.D(r[0].getTime() - saat * 1000); });
}

// Daftar akaun (terus Aktif) dan pulangkan token sesi
function akaun(g, username, nama) {
  const body = { action: 'daftar', username, nama, password: 'rahsia123' };
  return JSON.parse(g.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()).token;
}

describe('prosesImbas: hanya guru berdaftar', () => {
  test('tanpa token: DISEKAT (AUTH), tiada rekod, tiada lock', () => {
    const g = gas();
    assert.throws(() => g.ctx.prosesImbas('MAKMAL-1', ''), /^Error: AUTH: Hanya guru berdaftar/);
    assert.equal(g.sheet('Log_Imbas').data.length, 1, 'tiada rekod ditulis');
    assert.deepEqual(g.calls.lock, []);
  });

  test('token palsu / nama dihantar sebagai token: DISEKAT', () => {
    const g = gas();
    assert.throws(() => g.ctx.prosesImbas('MAKMAL-1', 'Cikgu Ali'), /AUTH:/);
    assert.throws(() => g.ctx.prosesImbas('MAKMAL-1', 'abc123'), /AUTH:/);
    assert.equal(g.sheet('Log_Imbas').data.length, 1);
  });

  test('guru berdaftar: direkod dengan nama AKAUN', () => {
    const g = gas();
    const t = akaun(g, 'ali', 'Cikgu Ali Berdaftar');
    const r = g.ctx.prosesImbas('MAKMAL-1', t);
    assert.equal(r.tindakan, 'Ambil');
    assert.equal(r.guru, 'Cikgu Ali Berdaftar');
    assert.equal(g.sheet('Log_Imbas').data[1][2], 'Cikgu Ali Berdaftar');
  });

  test('akaun disekat (Digantung): DISEKAT walaupun token pernah sah', () => {
    const g = gas();
    const t = akaun(g, 'ali', 'Cikgu Ali');
    g.sheet('Pengguna').data[1][5] = 'Digantung';
    assert.throws(() => g.ctx.prosesImbas('MAKMAL-1', t), /AUTH:/);
    assert.equal(g.sheet('Log_Imbas').data.length, 1);
  });

  test('selepas log keluar: token tidak lagi sah', () => {
    const g = gas();
    const t = akaun(g, 'ali', 'Cikgu Ali');
    g.ctx.logoutImbas(t);
    assert.throws(() => g.ctx.prosesImbas('MAKMAL-1', t), /AUTH:/);
  });

  test('loginImbas: sesi 90 hari; kata laluan salah & akaun disekat ditolak', () => {
    const g = gas();
    akaun(g, 'ali', 'Cikgu Ali');
    const r = g.call('loginImbas', 'ALI', 'rahsia123');
    assert.deepEqual(r.pengguna, { username: 'ali', nama: 'Cikgu Ali' });
    const hari = (JSON.parse(g.props['sesi_' + r.token]).exp - Date.now()) / 864e5;
    assert.ok(Math.abs(hari - 90) < 0.01);
    assert.equal(g.ctx.prosesImbas('MAKMAL-1', r.token).guru, 'Cikgu Ali');
    assert.throws(() => g.ctx.loginImbas('ali', 'salah1234'), /salah/);
    g.sheet('Pengguna').data[1][5] = 'Digantung';
    assert.throws(() => g.ctx.loginImbas('ali', 'rahsia123'), /disekat/);
  });

  test('dijalankan dari editor tanpa argumen: mesej jelas, tiada lock diambil', () => {
    const g = gas();
    assert.throws(() => g.ctx.prosesImbas(), /ujiImbas/);
    assert.deepEqual(g.calls.lock, []);
  });

  test('ujiImbas: rekod bilik pertama oleh akaun Aktif pertama, papar URL tag', () => {
    const g = gas();
    akaun(g, 'ali', 'Cikgu Ali');
    const logs = [];
    g.ctx.console = { log: (m) => logs.push(m) };
    g.ctx.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) };
    const r = g.call('ujiImbas');
    assert.equal(r.tindakan, 'Ambil');
    assert.equal(r.bilik, 'Makmal Komputer 1');
    assert.equal(r.guru, 'Cikgu Ali');
    assert.ok(logs.some((l) => l.endsWith('/exec?kunci=MAKMAL-1')));
    assert.equal(logs.filter((l) => l.startsWith('URL tag NFC')).length, 3);
  });

  test('ujiImbas tanpa akaun Aktif: mesej jelas', () => {
    assert.throws(() => gas().ctx.ujiImbas(), /Tiada akaun Aktif/);
  });
});

describe('rekodImbas_ (logik Ambil/Pulang)', () => {
  test('imbasan pertama = Ambil, kedua = Pulang, ketiga = Ambil', () => {
    const g = gas();
    assert.equal(g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Ali').tindakan, 'Ambil');
    undur(g);
    assert.equal(g.ctx.rekodImbas_('makmal-1', 'Cikgu Ali').tindakan, 'Pulang');
    assert.equal(g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Bala').tindakan, 'Ambil');
    const log = g.sheet('Log_Imbas').data;
    assert.equal(log.length, 4);
    assert.equal(log[1][1], 'MAKMAL-1', 'ID asal disimpan');
  });

  test('setiap kunci ditogol secara berasingan', () => {
    const g = gas();
    g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Ali');
    assert.equal(g.ctx.rekodImbas_('BILIK-SENI', 'Cikgu Ali').tindakan, 'Ambil');
  });

  test('pulangan mengandungi bilik, guru dan masa berformat', () => {
    const r = gas().ctx.rekodImbas_('MAKMAL-1', '  Cikgu Ali ');
    assert.equal(r.ok, true);
    assert.equal(r.bilik, 'Makmal Komputer 1');
    assert.equal(r.guru, 'Cikgu Ali');
    assert.match(r.masa, /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (pagi|T\/hari|petang|malam)$/, 'format 12 jam');
  });

  test('masa12_: 12 jam dengan waktu pagi / T/hari / petang / malam (zon +08:00)', () => {
    const g = gas();
    const m = (iso) => g.ctx.masa12_(g.D(iso));
    assert.equal(m('2026-11-20T16:30:00Z'), '21/11/2026 12:30 pagi');   // 00:30 MYT
    assert.equal(m('2026-11-21T00:05:00Z'), '21/11/2026 8:05 pagi');    // 08:05
    assert.equal(m('2026-11-21T03:59:00Z'), '21/11/2026 11:59 pagi');   // 11:59
    assert.equal(m('2026-11-21T04:00:00Z'), '21/11/2026 12:00 T/hari'); // 12:00
    assert.equal(m('2026-11-21T05:59:00Z'), '21/11/2026 1:59 T/hari');  // 13:59
    assert.equal(m('2026-11-21T06:00:00Z'), '21/11/2026 2:00 petang');  // 14:00
    assert.equal(m('2026-11-21T10:59:00Z'), '21/11/2026 6:59 petang');  // 18:59
    assert.equal(m('2026-11-21T11:00:00Z'), '21/11/2026 7:00 malam');   // 19:00
    assert.equal(m('2026-11-21T13:45:00Z'), '21/11/2026 9:45 malam');   // 21:45
  });

  test('format masa Google Sheets ialah 12 jam (AM/PM)', () => {
    assert.match(gas().get('FMT_SHEET'), /h:mm:ss AM\/PM/);
  });

  test('kunci tidak wujud / ID kosong / nama kosong: ralat', () => {
    assert.throws(() => gas().ctx.rekodImbas_('X', 'Cikgu Ali'), /tiada dalam tab Nama_Bilik/);
    assert.throws(() => gas().ctx.rekodImbas_('', 'Cikgu Ali'), /ID kunci kosong/);
    assert.throws(() => gas().ctx.rekodImbas_('MAKMAL-1', '  '), /Nama guru kosong/);
  });

  test('lock sentiasa dilepaskan walaupun ralat', () => {
    const g = gas();
    assert.throws(() => g.ctx.rekodImbas_('X', 'A'));
    assert.deepEqual(g.calls.lock, ['wait:20000', 'release']);
  });

  test('imbasan berganda oleh guru sama < 60 saat diabaikan', () => {
    const g = gas();
    const r1 = g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Ali');
    const r2 = g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Ali');
    assert.equal(g.sheet('Log_Imbas').data.length, 2, 'hanya satu rekod');
    assert.equal(r2.ulang, true);
    assert.equal(r2.tindakan, 'Ambil', 'pulangkan rekod sedia ada');
    assert.equal(r2.masa, r1.masa);
    assert.equal(r1.ulang, undefined);
  });

  test('guru lain dalam tempoh 60 saat tetap direkod', () => {
    const g = gas();
    g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Ali');
    assert.equal(g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Bala').tindakan, 'Pulang');
    assert.equal(g.sheet('Log_Imbas').data.length, 3);
  });

  test('guru sama selepas 60 saat: direkod seperti biasa', () => {
    const g = gas();
    g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Ali');
    undur(g, 61);
    assert.equal(g.ctx.rekodImbas_('MAKMAL-1', 'Cikgu Ali').tindakan, 'Pulang');
  });
});

describe('Halaman imbas (pelayar guru, jsdom)', () => {
  const { JSDOM } = require('jsdom');
  // Muat halaman imbas dengan google.script.run palsu
  function halaman(server, ls = {}) {
    const g = gas();
    const html = g.ctx.imbasPage_('MAKMAL-1').getContent();
    const panggilan = [];
    const dom = new JSDOM(html, {
      url: 'https://n-abc.googleusercontent.com/', runScripts: 'dangerously',
      beforeParse(w) {
        Object.entries(ls).forEach(([k, v]) => w.localStorage.setItem(k, v));
        const run = () => {
          let ok = () => {}, gagal = () => {};
          const r = {
            withSuccessHandler(f) { ok = f; return r; },
            withFailureHandler(f) { gagal = f; return r; }
          };
          ['loginImbas', 'prosesImbas', 'logoutImbas'].forEach((fn) => {
            r[fn] = (...args) => {
              panggilan.push([fn, ...args]);
              try { ok(server[fn](...args)); } catch (e) { gagal(e); }
            };
          });
          return r;
        };
        w.google = { script: { get run() { return run(); } } };
      }
    });
    const $ = (id) => dom.window.document.getElementById(id);
    return { w: dom.window, $, panggilan, teks: () => $('app').textContent };
  }
  const BERJAYA = { ok: true, bilik: 'Makmal Komputer 1', tindakan: 'Ambil', guru: 'Cikgu Ali', masa: '22/11/2026 8:05 pagi' };

  test('belum log masuk: papar borang log masuk + pautan daftar, TIADA rekod dibuat', () => {
    const h = halaman({ prosesImbas: () => BERJAYA });
    assert.match(h.teks(), /Hanya guru berdaftar boleh merekod kunci/);
    assert.ok(h.$('u') && h.$('p'), 'medan nama pengguna & kata laluan');
    assert.equal(h.$('daftar').getAttribute('href'), 'https://mykey-eta.vercel.app/');
    assert.deepEqual(h.panggilan, []);
  });

  test('log masuk berjaya: token disimpan dan imbasan terus direkod', () => {
    const h = halaman({
      loginImbas: () => ({ ok: true, token: 'tok1', pengguna: { username: 'ali', nama: 'Cikgu Ali' } }),
      prosesImbas: () => BERJAYA
    });
    h.$('u').value = 'ali'; h.$('p').value = 'rahsia123';
    h.$('f').dispatchEvent(new h.w.Event('submit', { cancelable: true }));
    assert.deepEqual(h.panggilan, [['loginImbas', 'ali', 'rahsia123'], ['prosesImbas', 'MAKMAL-1', 'tok1']]);
    assert.equal(h.w.localStorage.getItem('nfc_kunci_token'), 'tok1');
    assert.match(h.teks(), /BERJAYA \(AMBIL\)/);
    assert.match(h.teks(), /Cikgu Ali/);
  });

  test('log masuk gagal: mesej ralat dalam borang', () => {
    const h = halaman({ loginImbas: () => { throw new Error('Nama pengguna atau kata laluan salah.'); } });
    h.$('u').value = 'ali'; h.$('p').value = 'x';
    h.$('f').dispatchEvent(new h.w.Event('submit', { cancelable: true }));
    assert.match(h.$('msg').textContent, /salah/);
    assert.equal(h.w.localStorage.getItem('nfc_kunci_token'), null);
  });

  test('sudah log masuk: tap terus direkod tanpa borang', () => {
    const h = halaman({ prosesImbas: () => BERJAYA }, { nfc_kunci_token: 'tokLama' });
    assert.deepEqual(h.panggilan, [['prosesImbas', 'MAKMAL-1', 'tokLama']]);
    assert.match(h.teks(), /BERJAYA/);
  });

  test('sesi tidak sah / akaun disekat: token dibuang, borang log masuk dipapar', () => {
    const h = halaman({ prosesImbas: () => { throw new Error('AUTH: Hanya guru berdaftar boleh merekod kunci. Sila log masuk.'); } },
      { nfc_kunci_token: 'tokLama' });
    assert.equal(h.w.localStorage.getItem('nfc_kunci_token'), null);
    assert.ok(h.$('f'), 'borang log masuk');
    assert.equal(h.$('msg').textContent, 'Hanya guru berdaftar boleh merekod kunci. Sila log masuk.');
  });

  test('Log keluar: token dibuang & logoutImbas dipanggil', () => {
    const h = halaman({ prosesImbas: () => BERJAYA, logoutImbas: () => ({ ok: true }) }, { nfc_kunci_token: 'tokLama' });
    h.w.keluar();
    assert.deepEqual(h.panggilan.at(-1), ['logoutImbas', 'tokLama']);
    assert.equal(h.w.localStorage.getItem('nfc_kunci_token'), null);
    assert.ok(h.$('f'));
  });

  test('nama pilihan versi lama (nfc_kunci_guru) tidak lagi membenarkan rekod', () => {
    const h = halaman({ prosesImbas: () => BERJAYA }, { nfc_kunci_guru: 'Cikgu Ali' });
    assert.deepEqual(h.panggilan, []);
    assert.equal(h.w.localStorage.getItem('nfc_kunci_guru'), null);
    assert.ok(h.$('f'));
  });
});

describe('getDashboard_', () => {
  test('memasangkan Ambil & Pulang serta status bilik', () => {
    const g = gas([
      ['2026-03-01T01:00:00Z', 'MAKMAL-1', 'Cikgu Ali', 'Ambil'],
      ['2026-03-01T02:00:00Z', 'MAKMAL-1', 'Cikgu Bala', 'Pulang'],
      ['2026-03-01T03:00:00Z', 'bilik-seni', 'Cikgu Chong', 'Ambil']
    ]);
    const d = g.call('getDashboard_');
    assert.equal(d.ok, true);
    assert.deepEqual(d.bilik.map((b) => [b.idKunci, b.status, b.pemegang]), [
      ['MAKMAL-1', 'Pulang', '-'], ['BILIK-SENI', 'Ambil', 'Cikgu Chong'], ['BILIK-MUZIK', 'Pulang', '-']
    ]);
    assert.equal(d.log.length, 2);
    assert.equal(d.log[0].status, 'Belum Pulang', 'terbaru dahulu');
    assert.equal(d.log[0].masaAmbil, '2026-03-01T11:00:00+08:00');
    assert.deepEqual(
      [d.log[1].guru, d.log[1].guruPulang, d.log[1].status, d.log[1].masaPulang],
      ['Cikgu Ali', 'Cikgu Bala', 'Sudah Pulang', '2026-03-01T10:00:00+08:00']
    );
  });

  test('Ambil berganda: rekod lama kekal Belum Pulang dalam sejarah', () => {
    const d = gas([
      ['2026-03-01T01:00:00Z', 'MAKMAL-1', 'Cikgu Ali', 'Ambil'],
      ['2026-03-01T02:00:00Z', 'MAKMAL-1', 'Cikgu Bala', 'Ambil']
    ]).call('getDashboard_');
    assert.equal(d.log.length, 2);
    assert.equal(d.bilik[0].pemegang, 'Cikgu Bala');
  });

  test('Pulang tanpa Ambil (yatim) masih direkod', () => {
    const d = gas([['2026-03-01T01:00:00Z', 'MAKMAL-1', 'Cikgu Ali', 'Pulang']]).call('getDashboard_');
    assert.equal(d.log.length, 1);
    assert.equal(d.log[0].masaAmbil, '');
    assert.equal(d.bilik[0].status, 'Pulang');
  });

  test('kunci tidak dikenali memakai ID sebagai nama; baris tanpa tarikh diabaikan', () => {
    const d = gas([
      ['2026-03-01T01:00:00Z', 'LAMA-9', 'Cikgu Ali', 'Ambil'],
      ['bukan tarikh', 'MAKMAL-1', 'Cikgu Ali', 'Ambil']
    ]).call('getDashboard_');
    assert.equal(d.log.length, 1);
    assert.equal(d.log[0].bilik, 'LAMA-9');
    assert.equal(d.bilik.length, 3);
  });

  test('tanpa tab: pulangan kosong, tiada ralat', () => {
    const d = loadGas({}).call('getDashboard_');
    assert.deepEqual([d.bilik, d.log], [[], []]);
  });
});

describe('Pengguna: daftar & login', () => {
  const post = (g, body) => JSON.parse(g.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  const aktifkan = (g, username) => {
    const row = g.sheet('Pengguna').data.find((r) => r[0] === username);
    row[5] = 'Aktif';
  };

  test('daftar: akaun terus Aktif, terus dapat token & boleh buka dashboard', () => {
    const g = gas();
    const r = post(g, { action: 'daftar', username: 'Ali.Admin', nama: 'Ali bin Abu', password: 'rahsia123' });
    assert.equal(r.ok, true);
    assert.match(r.token, /^[0-9a-f]{64}$/);
    assert.deepEqual(r.pengguna, { username: 'ali.admin', nama: 'Ali bin Abu', peranan: 'Pentadbir' });
    assert.equal(post(g, { action: 'getDashboard', token: r.token }).ok, true);
    assert.equal(post(g, { action: 'login', username: 'ali.admin', password: 'rahsia123' }).ok, true);
  });

  test('daftar: nama guru auto ditambah ke Nama_Guru & boleh terus imbas NFC selepas log masuk', () => {
    const g = loadGas({ bilik: BILIK, guru: [], log: [] });
    post(g, { action: 'daftar', username: 'ali', nama: 'Cikgu Ali Baru', password: 'rahsia123' });
    assert.deepEqual([...g.sheet('Nama_Guru').data[1]], ['Cikgu Ali Baru', '']);
    const { token } = g.call('loginImbas', 'ali', 'rahsia123');
    assert.equal(g.ctx.prosesImbas('MAKMAL-1', token).guru, 'Cikgu Ali Baru');
  });

  test('nama dalam Nama_Guru TANPA akaun tidak boleh imbas', () => {
    const g = loadGas({ bilik: BILIK, guru: ['Cikgu Tanpa Akaun'], log: [] });
    assert.throws(() => g.ctx.prosesImbas('MAKMAL-1', 'Cikgu Tanpa Akaun'), /AUTH:/);
    assert.equal(g.sheet('Log_Imbas').data.length, 1);
  });

  test('daftar: tab Nama_Guru dicipta jika tiada; tiada pendua (tidak sensitif huruf)', () => {
    const g = loadGas({ bilik: BILIK, log: [] });
    post(g, { action: 'daftar', username: 'ali', nama: 'Cikgu Ali', password: 'rahsia123' });
    post(g, { action: 'daftar', username: 'ali2', nama: 'CIKGU ALI', password: 'rahsia123' });
    assert.equal(g.sheet('Nama_Guru').data.length, 2);
    assert.deepEqual(g.sheet('Nama_Guru').data[0], ['Nama_Guru', 'Jawatan']);
  });

  test('senarai imbas termasuk akaun Aktif sedia ada; akaun disekat tidak', () => {
    const g = loadGas({ bilik: BILIK, guru: ['Cikgu Zara'], log: [] });
    g.ctx.userSheet_().appendRow(['lama', 'Cikgu Lama', 'h', 's', 'Pentadbir', 'Aktif', '']);
    g.ctx.userSheet_().appendRow(['sekat', 'Cikgu Sekat', 'h', 's', 'Pentadbir', 'Digantung', '']);
    g.ctx.userSheet_().appendRow(['zara', 'cikgu zara', 'h', 's', 'Pentadbir', 'Aktif', '']);
    assert.deepEqual(g.call('guruList_'), ['Cikgu Lama', 'Cikgu Zara']);
  });

  test('daftar menyimpan hash (bukan kata laluan asal)', () => {
    const g = gas();
    post(g, { action: 'daftar', username: 'Ali.Admin', nama: 'Ali bin Abu', password: 'rahsia123' });
    const row = g.sheet('Pengguna').data[1];
    assert.equal(row[0], 'ali.admin', 'username disimpan huruf kecil');
    assert.equal(row[5], 'Aktif');
    assert.notEqual(row[2], 'rahsia123');
    assert.ok(row[2].length > 20 && row[3].length > 20, 'hash & salt wujud');
    assert.ok(!JSON.stringify(g.sheet('Pengguna').data).includes('rahsia123'));
  });

  test('daftar: validasi input', () => {
    const g = gas();
    assert.match(post(g, { action: 'daftar', username: 'a', nama: 'A', password: 'rahsia123' }).error, /3-60 aksara/);
    assert.match(post(g, { action: 'daftar', username: 'ali', nama: '', password: 'rahsia123' }).error, /Nama penuh/);
    assert.match(post(g, { action: 'daftar', username: 'ali', nama: '=HACK()', password: 'rahsia123' }).error, /tidak boleh bermula/);
    assert.match(post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'pendek' }).error, /8 aksara/);
    const sh = g.sheet('Pengguna');
    assert.ok(!sh || sh.data.length === 1, 'tiada baris ditambah');
  });

  test('daftar: nama pengguna pendua ditolak (tidak sensitif huruf)', () => {
    const g = gas();
    post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123' });
    assert.match(post(g, { action: 'daftar', username: 'ALI', nama: 'Ali 2', password: 'rahsia123' }).error, /sudah wujud/);
  });

  test('login ditolak jika admin sekat akaun', () => {
    const g = gas();
    post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123' });
    g.sheet('Pengguna').data[1][5] = 'Digantung';
    const r = post(g, { action: 'login', username: 'ali', password: 'rahsia123' });
    assert.equal(r.ok, false);
    assert.match(r.error, /disekat/);
  });

  test('login berjaya selepas Aktif; token membuka dashboard', () => {
    const g = gas([['2026-03-01T01:00:00Z', 'MAKMAL-1', 'Cikgu Ali', 'Ambil']]);
    post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123' });
    aktifkan(g, 'ali');
    const r = post(g, { action: 'login', username: ' ALI ', password: 'rahsia123' });
    assert.equal(r.ok, true);
    assert.match(r.token, /^[0-9a-f]{64}$/);
    assert.deepEqual(r.pengguna, { username: 'ali', nama: 'Ali', peranan: 'Pentadbir' });

    const d = post(g, { action: 'getDashboard', token: r.token });
    assert.equal(d.ok, true);
    assert.equal(d.bilik[0].status, 'Ambil');
    assert.equal(d.pengguna.nama, 'Ali');

    const viaGet = JSON.parse(g.ctx.doGet({ parameter: { action: 'getDashboard', token: r.token } }).getContent());
    assert.equal(viaGet.ok, true);
  });

  test('kata laluan salah ditolak; dikunci selepas 5 cubaan', () => {
    const g = gas();
    post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123' });
    aktifkan(g, 'ali');
    for (let i = 0; i < 5; i++) {
      assert.match(post(g, { action: 'login', username: 'ali', password: 'salah1234' }).error, /salah/);
    }
    assert.match(post(g, { action: 'login', username: 'ali', password: 'rahsia123' }).error, /Terlalu banyak/);
  });

  test('pengguna tidak wujud: mesej sama seperti kata laluan salah', () => {
    const g = gas();
    assert.match(post(g, { action: 'login', username: 'tiada', password: 'apa-apa-123' }).error, /Nama pengguna atau kata laluan salah/);
  });

  test('logout membatalkan token', () => {
    const g = gas();
    post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123' });
    aktifkan(g, 'ali');
    const { token } = post(g, { action: 'login', username: 'ali', password: 'rahsia123' });
    assert.equal(post(g, { action: 'logout', token }).ok, true);
    assert.equal(post(g, { action: 'getDashboard', token }).auth, false);
  });

  test('token luput atau akaun dinyahaktif: auth:false', () => {
    const g = gas();
    post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123' });
    aktifkan(g, 'ali');
    const { token } = post(g, { action: 'login', username: 'ali', password: 'rahsia123' });
    g.sheet('Pengguna').data[1][5] = 'Digantung';
    assert.equal(post(g, { action: 'getDashboard', token }).auth, false);

    g.sheet('Pengguna').data[1][5] = 'Aktif';
    const key = 'sesi_' + token;
    g.props[key] = JSON.stringify({ u: 'ali', exp: Date.now() - 1 });
    assert.equal(post(g, { action: 'getDashboard', token }).auth, false);
    assert.equal(g.props[key], undefined, 'sesi luput dibuang');
  });

  test('Ingat saya: sesi 90 hari; tanpa: 7 hari', () => {
    const g = gas();
    const hari = (token) => (JSON.parse(g.props['sesi_' + token]).exp - Date.now()) / 864e5;
    const a = post(g, { action: 'daftar', username: 'ali', nama: 'Ali', password: 'rahsia123', ingat: true });
    assert.ok(Math.abs(hari(a.token) - 90) < 0.01);
    const b = post(g, { action: 'login', username: 'ali', password: 'rahsia123' });
    assert.ok(Math.abs(hari(b.token) - 7) < 0.01);
    const c = post(g, { action: 'login', username: 'ali', password: 'rahsia123', ingat: true });
    assert.ok(Math.abs(hari(c.token) - 90) < 0.01);
  });

  test('token palsu ditolak', () => {
    assert.equal(post(gas(), { action: 'getDashboard', token: 'palsu' }).auth, false);
  });

  test('doPost: JSON rosak & tindakan tidak dikenali', () => {
    const g = gas();
    assert.equal(JSON.parse(g.ctx.doPost({ postData: { contents: '{rosak' } }).getContent()).error, 'Permintaan tidak sah.');
    assert.equal(post(g, { action: 'hapus' }).error, 'Tindakan tidak dikenali.');
  });
});
