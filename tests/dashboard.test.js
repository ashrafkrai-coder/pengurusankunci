// Ujian UI dashboard (index.html) dalam jsdom.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, SUPABASE_URL, SUPABASE_KEY } = require('./helpers/page');

const DASH = {
  ok: true,
  dijana: '2026-03-01T10:00:00+08:00',
  pengguna: { username: 'ali', nama: 'Ali' },
  bilik: [
    { idKunci: 'A', nama: 'Bilik A', status: 'Pulang', pemegang: '-', masaAmbil: '' },
    { idKunci: 'B', nama: 'Bilik <img src=x onerror=alert(1)>', status: 'Ambil', pemegang: '<b>Jahat</b>', masaAmbil: '2026-03-01T09:00:00+08:00' },
    { idKunci: 'C', nama: 'Bilik C', status: 'Pulang', pemegang: '-', masaAmbil: '' }
  ],
  log: [
    { idKunci: 'B', bilik: 'Bilik B', guru: 'Cikgu Bala', masaAmbil: '2026-03-01T09:00:00+08:00', masaPulang: '', status: 'Belum Pulang' },
    { idKunci: 'A', bilik: 'Bilik A', guru: 'Cikgu Ali', masaAmbil: '2026-02-28T08:00:00+08:00', masaPulang: '2026-02-28T09:00:00+08:00', status: 'Sudah Pulang' }
  ]
};

let p;
afterEach(() => { if (p) p.close(); p = null; });

describe('Tanpa log masuk', () => {
  test('skrin log masuk dipaparkan, tiada panggilan API', async () => {
    p = loadPage();
    await p.wait();
    assert.equal(p.hidden('authScreen'), false);
    assert.equal(p.calls.length, 0);
    assert.equal(p.$('btnAuth').textContent, 'Log Masuk');
  });

  test('tagline dipaparkan di skrin log masuk & helaian Akaun', () => {
    p = loadPage();
    const t = [...p.w.document.querySelectorAll('.tagline')];
    assert.equal(t.length, 2);
    for (const el of t) assert.equal(el.textContent, 'Developed & managed by ustazashraf · v1.0');
    assert.ok(p.$('authScreen').contains(t[0]) || p.$('authScreen').contains(t[1]));
    assert.ok(p.$('sheetAkaun').contains(t[0]) || p.$('sheetAkaun').contains(t[1]));
  });

  test('logo sekolah dirujuk pada skrin log masuk', () => {
    p = loadPage();
    const img = p.$('logoSekolah');
    assert.equal(img.getAttribute('src'), 'logo.png');
    assert.match(img.getAttribute('alt'), /SMK Taman Medan/);
  });

  test('cache data lama tidak dipaparkan tanpa token', async () => {
    p = loadPage({ ls: { kunci_cache: JSON.stringify(DASH) } });
    await p.wait();
    assert.equal(p.$('sumJumlah').textContent, '0');
  });
});

describe('Log masuk', () => {
  test('berjaya: simpan token, sembunyi skrin, muat dashboard', async () => {
    p = loadPage({
      api: (b) => (b.action === 'login'
        ? { ok: true, token: 'tok123', pengguna: { username: 'ali', nama: 'Ali' } }
        : DASH)
    });
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.submitAuth();
    await p.wait(120);
    assert.deepEqual(p.calls[0].body, { action: 'login', username: 'ali', password: 'rahsia123', ingat: true });
assert.equal(p.calls[0].url, SUPABASE_URL + '/rest/v1/rpc/api_login');    assert.equal(p.calls[0].init.method, 'POST');    assert.equal(p.calls[0].init.headers['Content-Type'], 'application/json');    assert.equal(p.calls[0].init.headers.apikey, SUPABASE_KEY);    assert.equal(p.calls[0].init.headers.Authorization, 'Bearer ' + SUPABASE_KEY);    assert.equal(p.calls[1].url, SUPABASE_URL + '/rest/v1/rpc/api_dashboard');
    assert.deepEqual(p.calls[1].body, { action: 'getDashboard', token: 'tok123' });
    assert.equal(p.w.localStorage.getItem('kunci_token'), 'tok123');
    assert.equal(p.hidden('authScreen'), true);
    assert.equal(p.$('aPass').value, '', 'kata laluan dikosongkan');
    assert.equal(p.$('sumJumlah').textContent, '3');
    assert.match(p.$('namaSalam').textContent, /Ali/);
  });

  test('Ingat saya: nama pengguna diingat & diisi semula; kata laluan TIDAK disimpan', async () => {
    p = loadPage({
      api: (b) => (b.action === 'login' ? { ok: true, token: 't1', pengguna: { username: 'ali', nama: 'Ali' } } : DASH)
    });
    assert.equal(p.$('aIngat').checked, true, 'ditanda secara lalai');
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.submitAuth();
    await p.wait(120);
    assert.equal(p.w.localStorage.getItem('kunci_ingat_user'), 'ali');
    const semua = JSON.stringify(Object.assign({}, p.w.localStorage));
    assert.ok(!semua.includes('rahsia123'), 'kata laluan tiada dalam localStorage');

    p.$('btnKeluar').click();
    await p.wait();
    assert.equal(p.$('aUser').value, 'ali', 'nama pengguna diisi semula selepas log keluar');
  });

  test('nama pengguna diingat diisi semasa buka app', async () => {
    p = loadPage({ ls: { kunci_ingat_user: 'cikgu.ali' } });
    await p.wait();
    assert.equal(p.$('aUser').value, 'cikgu.ali');
  });

  test('Ingat saya tidak ditanda: nama tidak diingat', async () => {
    p = loadPage({
      ls: { kunci_ingat_user: 'lama' },
      api: (b) => (b.action === 'login' ? { ok: true, token: 't1' } : DASH)
    });
    p.$('aIngat').checked = false;
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.submitAuth();
    await p.wait(120);
    assert.equal(p.calls[0].body.ingat, false);
    assert.equal(p.w.localStorage.getItem('kunci_ingat_user'), null);
  });

  test('gagal: mesej ralat dipaparkan', async () => {
    p = loadPage({ api: () => ({ ok: false, error: 'Nama pengguna atau kata laluan salah.' }) });
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'x';
    p.submitAuth();
    await p.wait();
    assert.equal(p.hidden('authMsg'), false);
    assert.match(p.$('authMsg').textContent, /salah/);
    assert.equal(p.hidden('authScreen'), false);
    assert.equal(p.$('btnAuth').disabled, false);
  });

  test('medan kosong: tiada panggilan API', async () => {
    p = loadPage();
    p.submitAuth();
    await p.wait();
    assert.equal(p.calls.length, 0);
    assert.match(p.$('authMsg').textContent, /Sila isi/);
  });

  test('respons bukan JSON (cth halaman ralat) diberi mesej jelas', async () => {
    p = loadPage();
    p.w.fetch = async () => ({ ok: true, status: 200, text: async () => '<html>Sign in</html>' });
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.submitAuth();
    await p.wait();
    assert.match(p.$('authMsg').textContent, /bukan JSON/);
  });
});

describe('Daftar', () => {
  test('tab Daftar memaparkan medan tambahan', () => {
    p = loadPage();
    p.w.document.querySelector('[data-auth="daftar"]').click();
    assert.equal(p.hidden('wrapNama'), false);
    assert.equal(p.hidden('wrapPass2'), false);
    assert.equal(p.$('btnAuth').textContent, 'Daftar Akaun');
  });

  test('validasi klien: kata laluan pendek / tidak sepadan', async () => {
    p = loadPage();
    p.w.document.querySelector('[data-auth="daftar"]').click();
    p.$('aNama').value = 'Ali';
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'pendek';
    p.submitAuth();
    assert.match(p.$('authMsg').textContent, /8 aksara/);
    p.$('aPass').value = 'rahsia123';
    p.$('aPass2').value = 'lain12345';
    p.submitAuth();
    assert.match(p.$('authMsg').textContent, /tidak sepadan/);
    await p.wait();
    assert.equal(p.calls.length, 0);
  });

  test('berjaya: terus masuk ke dashboard tanpa log masuk semula', async () => {
    p = loadPage({
      api: (b) => (b.action === 'daftar'
        ? { ok: true, token: 'tokBaru', pengguna: { username: 'ali', nama: 'Ali bin Abu' }, mesej: 'Pendaftaran berjaya.' }
        : DASH)
    });
    p.w.document.querySelector('[data-auth="daftar"]').click();
    p.$('aNama').value = 'Ali bin Abu';
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.$('aPass2').value = 'rahsia123';
    p.submitAuth();
    await p.wait(120);
    assert.deepEqual(p.calls[0].body, { action: 'daftar', username: 'ali', nama: 'Ali bin Abu', password: 'rahsia123', ingat: true });
    assert.deepEqual(p.calls[1].body, { action: 'getDashboard', token: 'tokBaru' });
    assert.equal(p.w.localStorage.getItem('kunci_token'), 'tokBaru');
    assert.equal(p.hidden('authScreen'), true);
    assert.equal(p.$('aPass').value, '');
    assert.equal(p.$('aPass2').value, '');
    assert.equal(p.$('sumJumlah').textContent, '3');
  });

  test('gagal (cth nama pengguna wujud): kekal di borang Daftar', async () => {
    p = loadPage({ api: () => ({ ok: false, error: 'Nama pengguna sudah wujud.' }) });
    p.w.document.querySelector('[data-auth="daftar"]').click();
    p.$('aNama').value = 'Ali';
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.$('aPass2').value = 'rahsia123';
    p.submitAuth();
    await p.wait();
    assert.match(p.$('authMsg').textContent, /sudah wujud/);
    assert.equal(p.$('btnAuth').textContent, 'Daftar Akaun');
    assert.equal(p.hidden('authScreen'), false);
  });
});

describe('Dashboard (sudah log masuk)', () => {
  const login = { kunci_token: 'tok', kunci_user: JSON.stringify({ username: 'ali', nama: 'Ali' }) };

  test('ringkasan & susunan: kunci digunakan dipaparkan dahulu', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    assert.equal(p.hidden('authScreen'), true);
    assert.equal(p.$('sumJumlah').textContent, '3');
    assert.equal(p.$('sumLuar').textContent, '1');
    assert.equal(p.$('sumKotak').textContent, '2');
    const kad = [...p.$('areaStatus').querySelectorAll('.kad')];
    assert.equal(kad.length, 3);
    assert.equal(kad[0].dataset.status, 'Ambil', 'kunci digunakan di atas');
    assert.equal(p.$('bilBilik').textContent, '3 bilik');
  });

  test('semua masa dipapar 12 jam dengan pagi / T/hari / petang / malam', async () => {
    const d = JSON.parse(JSON.stringify(DASH));
    const jam = (h, m) => { const x = new Date(); x.setHours(h, m, 0, 0); return x.toISOString(); };
    d.dijana = jam(21, 30);
    d.bilik[1].masaAmbil = jam(8, 5);
    d.log = [
      { idKunci: 'A', bilik: 'Bilik A', guru: 'Cikgu Ali', masaAmbil: jam(8, 5), masaPulang: jam(21, 30), status: 'Sudah Pulang' },
      { idKunci: 'C', bilik: 'Bilik C', guru: 'Cikgu Bala', masaAmbil: jam(12, 15), masaPulang: jam(15, 40), status: 'Sudah Pulang' }
    ];
    p = loadPage({ ls: login, api: () => d });
    await p.wait(120);
    assert.equal(p.$('kemaskini').textContent, '9:30 malam');
    assert.match(p.$('areaStatus').textContent, /Diambil 8:05 pagi/);
    p.w.document.querySelector('[data-tab="log"]').click();
    assert.match(p.$('area').textContent, /Ambil 8:05 pagi.*Pulang 9:30 malam/);
    assert.match(p.$('area').textContent, /Ambil 12:15 T\/hari.*Pulang 3:40 petang/);
    assert.doesNotMatch(p.$('area').textContent + p.$('areaStatus').textContent, /\b(2[0-3]|1[3-9]):\d{2}\b/, 'tiada masa 24 jam');
  });

  test('helaian Akaun: avatar tidak mengecut, nama penuh tidak dipotong satu baris', async () => {
    const panjang = 'MUHAMMAD ASHRAF B. KAMARULZAMAN KPM-Guru';
    p = loadPage({ ls: { kunci_token: 'tok', kunci_user: JSON.stringify({ username: 'ustazashraf', nama: panjang }) }, api: () => DASH });
    await p.wait(120);
    p.$('navAkaun').click();
    assert.equal(p.$('akNama').textContent, panjang, 'nama penuh dipaparkan');
    assert.doesNotMatch(p.$('akNama').className, /\btruncate\b/);
    assert.match(p.$('akNama').className, /\bbreak-words\b/);
    assert.match(p.$('akAvatar').className, /\bflex-none\b/, 'avatar tidak mengecut');
    assert.match(p.$('btnAvatar').className, /\bflex-none\b/);
    assert.match(p.$('btnRefresh').className, /\bflex-none\b/);
  });

  test('salam, avatar inisial & helaian Akaun', async () => {
    p = loadPage({ ls: { kunci_token: 'tok', kunci_user: JSON.stringify({ username: 'ali', nama: 'Cikgu Ali bin Abu' }) }, api: () => DASH });
    await p.wait(120);
    assert.match(p.$('salam').textContent, /^Selamat (pagi|tengah hari|petang|malam),$/);
    assert.equal(p.$('namaSalam').textContent, 'Cikgu Ali', 'nama tanpa bin ...');
    assert.equal(p.$('namaSalam').title, 'Cikgu Ali bin Abu', 'nama penuh dalam title');
    assert.match(p.$('namaSalam').className, /\bline-clamp-2\b/, 'nama panjang turun ke 2 baris, tidak terpotong satu baris');
    assert.equal(p.w.document.querySelector('header #salam'), null, 'salam tidak lagi berkongsi bar atas dengan butang');
    assert.equal(p.$('btnAvatar').textContent, 'A', 'gelaran Cikgu & "bin" diabaikan');
    assert.equal(p.hidden('sheetAkaun'), true);
    p.$('navAkaun').click();
    assert.equal(p.hidden('sheetAkaun'), false);
    assert.equal(p.$('akUser').textContent, '@ali');
    p.$('tutupAkaun').click();
    assert.equal(p.hidden('sheetAkaun'), true);
  });

  test('penapis status: Digunakan / Tersedia', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    p.w.document.querySelector('[data-sf="Ambil"]').click();
    assert.equal(p.$('areaStatus').querySelectorAll('.kad').length, 1);
    p.w.document.querySelector('[data-sf="Pulang"]').click();
    assert.equal(p.$('areaStatus').querySelectorAll('.kad').length, 2);
    p.w.document.querySelector('[data-sf=""]').click();
    assert.equal(p.$('areaStatus').querySelectorAll('.kad').length, 3);
  });

  test('kunci lewat (> 4 jam) dikira & ditanda', async () => {
    const lama = new Date(Date.now() - 5 * 3600e3).toISOString();
    const d = JSON.parse(JSON.stringify(DASH));
    d.bilik[0] = { idKunci: 'A', nama: 'Bilik A', status: 'Ambil', pemegang: 'Cikgu Ali', masaAmbil: lama };
    d.bilik[1].masaAmbil = new Date(Date.now() - 10 * 60e3).toISOString(); // baru 10 minit: tidak lewat
    p = loadPage({ ls: login, api: () => d });
    await p.wait(120);
    assert.equal(p.$('sumLewat').textContent, '1');
    const pertama = p.$('areaStatus').querySelector('.kad');
    assert.match(pertama.textContent, /Bilik A/, 'kunci lewat paling atas');
    assert.match(pertama.textContent, /Lewat · 5j/);
  });

  test('nama panjang dipotong dalam kad (tidak melimpah); nama penuh dalam title', async () => {
    const panjang = 'Cikgu Muhammad Nur Ikmal Hakimi bin Abdul Rahman';
    const d = JSON.parse(JSON.stringify(DASH));
    d.bilik[1].pemegang = panjang;
    p = loadPage({ ls: login, api: () => d });
    await p.wait(120);
    const grid = p.$('areaStatus').firstElementChild;
    assert.match(grid.className, /\bgrid-cols-1\b/, 'lajur grid dihadkan (minmax(0,1fr))');
    const kad = p.$('areaStatus').querySelector('.kad[data-status="Ambil"]');
    assert.match(kad.className, /\bmin-w-0\b/);
    assert.match(kad.className, /\boverflow-hidden\b/);
    const nama = kad.querySelector('.pemegang');
    assert.match(nama.className, /\bline-clamp-2\b/, 'nama turun ke 2 baris, kemudian dipotong');
    assert.match(nama.className, /\bbreak-words\b/);
    assert.match(nama.className, /\bmin-w-0\b/);
    assert.equal(nama.getAttribute('title'), panjang);
  });

  test('tanda petikan dalam nama tidak boleh menyuntik atribut', async () => {
    const d = JSON.parse(JSON.stringify(DASH));
    d.bilik[1].pemegang = 'x" onmouseover="alert(1)';
    p = loadPage({ ls: login, api: () => d });
    await p.wait(120);
    const nama = p.$('areaStatus').querySelector('.pemegang');
    assert.equal(nama.getAttribute('onmouseover'), null);
    assert.equal(nama.getAttribute('title'), 'x" onmouseover="alert(1)');
  });

  test('nama bilik/guru di-escape (tiada XSS)', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    p.w.document.querySelector('[data-tab="log"]').click();
    for (const area of [p.$('areaStatus'), p.$('area')]) {
      assert.equal(area.querySelector('img'), null);
      assert.equal(area.querySelector('b'), null);
    }
    assert.match(p.$('areaStatus').textContent, /<b>Jahat<\/b>/);
  });

  test('sesi tamat (auth:false): log keluar dan buang cache', async () => {
    p = loadPage({ ls: Object.assign({ kunci_cache: JSON.stringify(DASH) }, login), api: () => ({ ok: false, auth: false, error: 'Sesi tamat.' }) });
    await p.wait(120);
    assert.equal(p.hidden('authScreen'), false);
    assert.match(p.$('authMsg').textContent, /Sesi tamat/);
    assert.equal(p.w.localStorage.getItem('kunci_token'), null);
    assert.equal(p.w.localStorage.getItem('kunci_cache'), null);
    assert.equal(p.$('sumJumlah').textContent, '0');
  });

  test('rangkaian gagal: amaran + data cache dikekalkan', async () => {
    p = loadPage({ ls: Object.assign({ kunci_cache: JSON.stringify(DASH) }, login), api: () => { throw new Error('offline'); } });
    await p.wait(120);
    assert.equal(p.hidden('amaran'), false);
    assert.match(p.$('amaran').textContent, /Gagal memuatkan data/);
    assert.equal(p.$('sumJumlah').textContent, '3');
  });

  test('Log Keluar: hantar logout & buang token', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    p.$('btnKeluar').click();
    await p.wait();
    assert.deepEqual(p.calls.at(-1).body, { action: 'logout', token: 'tok' });
    assert.equal(p.w.localStorage.getItem('kunci_token'), null);
    assert.equal(p.hidden('authScreen'), false);
  });

  test('tab Log: penapis status & carian', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    p.w.document.querySelector('[data-tab="log"]').click();
    await p.wait();
    assert.equal(p.hidden('filterBar'), false);
    assert.equal(p.$('bilRekod').textContent, '2 rekod');

    p.w.document.querySelector('[data-st="Sudah Pulang"]').click();
    assert.equal(p.$('bilRekod').textContent, '1 rekod');

    p.$('resetFilter').click();
    p.$('cari').value = 'bala';
    p.$('cari').dispatchEvent(new p.w.Event('input'));
    assert.equal(p.$('bilRekod').textContent, '1 rekod');
    assert.match(p.$('area').textContent, /Cikgu Bala/);
  });

  test('nota "rekod terkini" apabila pelayan memotong sejarah', async () => {
    const d = JSON.parse(JSON.stringify(DASH));
    d.jumlahLog = 512;
    p = loadPage({ ls: login, api: () => d });
    await p.wait(120);
    p.w.document.querySelector('[data-tab="log"]').click();
    assert.match(p.$('notaLog').textContent, /Memaparkan 2 rekod terkini daripada 512/);
  });

  test('tiada nota apabila semua sejarah dihantar', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    p.w.document.querySelector('[data-tab="log"]').click();
    assert.equal(p.$('notaLog'), null);
  });

  test('tab bertukar: Status ↔ Log', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    assert.equal(p.hidden('tabStatus'), false);
    assert.equal(p.hidden('tabLog'), true);
    p.w.document.querySelector('[data-tab="log"]').click();
    assert.equal(p.hidden('tabStatus'), true);
    assert.equal(p.hidden('tabLog'), false);
    assert.ok(p.w.document.querySelector('[data-tab="log"]').classList.contains('on'));
  });

  test('log dikumpul ikut hari + butang Muat lagi (30 setiap kali)', async () => {
    const d = JSON.parse(JSON.stringify(DASH));
    const kini = Date.now();
    d.log = Array.from({ length: 45 }, (_, i) => ({
      idKunci: 'A', bilik: 'Bilik ' + i, guru: 'Cikgu ' + i,
      masaAmbil: new Date(kini - i * 3600e3).toISOString(), masaPulang: new Date(kini - i * 3600e3 + 60e3).toISOString(),
      status: 'Sudah Pulang'
    }));
    p = loadPage({ ls: login, api: () => d });
    await p.wait(120);
    p.w.document.querySelector('[data-tab="log"]').click();
    const baris = () => p.$('area').querySelectorAll('.divide-y > div').length;
    assert.equal(p.$('bilRekod').textContent, '45 rekod');
    assert.equal(baris(), 30);
    assert.match(p.$('area').textContent, /Hari ini/);
    assert.equal(p.hidden('muatLagi'), false);
    p.$('muatLagi').click();
    assert.equal(baris(), 45);
    assert.equal(p.hidden('muatLagi'), true);
    p.$('cari').value = 'Bilik 44';
    p.$('cari').dispatchEvent(new p.w.Event('input'));
    assert.equal(baris(), 1, 'penapis menetapkan semula had');
  });
});

describe('Imbasan NFC melalui PWA (?kunci=ID)', () => {
  const LOGIN = { kunci_token: 'tok', kunci_user: JSON.stringify({ username: 'ali', nama: 'Cikgu Ali' }), kunci_cache: JSON.stringify(DASH) };
  const AMBIL = { ok: true, bilik: 'Bilik A', tindakan: 'Ambil', guru: 'Cikgu Ali', masa: '01/03/2026 8:05 pagi' };
  const URL_TAG = 'https://contoh.test/?kunci=A';
  const teks = () => p.$('imbasSheet').textContent;

  test('sudah log masuk: SATU panggilan imbas, papar hasil, URL dibersihkan, dashboard dimuat', async () => {
    p = loadPage({ url: URL_TAG, ls: LOGIN, api: (b) => (b.action === 'imbas' ? AMBIL : DASH) });
    assert.equal(p.hidden('imbasSheet'), false, 'helaian dibuka serta-merta');
    assert.match(teks(), /Merekod kunci/);
    assert.match(teks(), /Bilik A/, 'nama bilik daripada cache sebelum pelayan menjawab');
    await p.wait(120);
    assert.deepEqual(p.calls[0].body, { action: 'imbas', kunci: 'A', token: 'tok' });
    assert.deepEqual(p.calls[1].body, { action: 'getDashboard', token: 'tok' });
    assert.equal(p.calls.filter((c) => c.body.action === 'imbas').length, 1);
    assert.match(teks(), /Kunci DIAMBIL/);
    assert.match(teks(), /Cikgu Ali/);
    assert.match(teks(), /8:05 pagi/);
    assert.equal(p.w.location.search, '', '?kunci= dibuang: muat semula tidak merekod lagi');
    p.$('imButang').querySelector('[data-im="tutup"]').click();
    assert.equal(p.hidden('imbasSheet'), true);
  });

  test('Pulang & imbasan berulang dipaparkan dengan betul', async () => {
    p = loadPage({ url: URL_TAG, ls: LOGIN, api: (b) => (b.action === 'imbas' ? { ...AMBIL, tindakan: 'Pulang', ulang: true } : DASH) });
    await p.wait(120);
    assert.match(teks(), /Kunci DIPULANGKAN/);
    assert.match(teks(), /Imbasan berulang/);
  });

  test('belum log masuk: tiada panggilan, borang log masuk; selepas log masuk kunci terus direkod', async () => {
    p = loadPage({
      url: URL_TAG,
      api: (b) => (b.action === 'login' ? { ok: true, token: 't9', pengguna: { username: 'ali', nama: 'Cikgu Ali' } }
        : b.action === 'imbas' ? AMBIL : DASH)
    });
    await p.wait();
    assert.equal(p.calls.length, 0);
    assert.equal(p.hidden('authScreen'), false);
    assert.match(p.$('authMsg').textContent, /merekod kunci A/);
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.submitAuth();
    await p.wait(150);
    assert.equal(p.calls[0].body.action, 'login');
    assert.deepEqual(p.calls[1].body, { action: 'imbas', kunci: 'A', token: 't9' });
    assert.match(teks(), /Kunci DIAMBIL/);
  });

  test('sesi tamat (auth:false): log keluar, kemudian rekod selepas log masuk semula', async () => {
    let sesiSah = false;
    p = loadPage({
      url: URL_TAG, ls: LOGIN,
      api: (b) => {
        if (b.action === 'login') { sesiSah = true; return { ok: true, token: 'baru', pengguna: { username: 'ali', nama: 'Cikgu Ali' } }; }
        if (b.action === 'imbas') return sesiSah ? AMBIL : { ok: false, auth: false, error: 'Hanya guru berdaftar boleh merekod kunci. Sila log masuk.' };
        return DASH;
      }
    });
    await p.wait(120);
    assert.equal(p.hidden('authScreen'), false);
    assert.equal(p.hidden('imbasSheet'), true);
    assert.equal(p.w.localStorage.getItem('kunci_token'), null);
    p.$('aUser').value = 'ali';
    p.$('aPass').value = 'rahsia123';
    p.submitAuth();
    await p.wait(150);
    assert.deepEqual(p.calls.at(-2).body, { action: 'imbas', kunci: 'A', token: 'baru' });
    assert.match(teks(), /Kunci DIAMBIL/);
  });

  test('ralat pelayan: papar mesej + Cuba lagi menghantar semula', async () => {
    let n = 0;
    p = loadPage({ url: URL_TAG, ls: LOGIN, api: (b) => (b.action === 'imbas' ? (++n === 1 ? { ok: false, error: 'Rangkaian sibuk' } : AMBIL) : DASH) });
    await p.wait(120);
    assert.match(teks(), /Gagal merekod/);
    assert.match(teks(), /Rangkaian sibuk/);
    p.$('imButang').querySelector('[data-im="ulang"]').click();
    await p.wait(120);
    assert.equal(n, 2);
    assert.match(teks(), /Kunci DIAMBIL/);
  });

  test('data daripada pelayan di-escape (tiada XSS)', async () => {
    p = loadPage({ url: URL_TAG, ls: LOGIN, api: (b) => (b.action === 'imbas' ? { ...AMBIL, guru: '<img src=x onerror=alert(1)>' } : DASH) });
    await p.wait(120);
    assert.equal(p.$('imbasSheet').querySelector('img'), null);
    assert.match(teks(), /<img src=x/);
  });

  test('tanpa ?kunci=: tiada panggilan imbas', async () => {
    p = loadPage({ ls: LOGIN, api: () => DASH });
    await p.wait(120);
    assert.equal(p.calls.filter((c) => c.body.action === 'imbas').length, 0);
    assert.equal(p.hidden('imbasSheet'), true);
  });
});
