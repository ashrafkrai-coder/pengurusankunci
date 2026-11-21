// Ujian UI dashboard (index.html) dalam jsdom.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, DEFAULT_URL } = require('./helpers/page');

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

  test('logo sekolah dirujuk pada skrin log masuk', () => {
    p = loadPage();
    const img = p.$('logoSekolah');
    assert.equal(img.getAttribute('src'), 'logo.png');
    assert.match(img.getAttribute('alt'), /SMK Taman Medan/);
  });

  test('URL lalai diisi dalam Tetapan', async () => {
    p = loadPage();
    p.$('authTetapan').click();
    assert.equal(p.hidden('modal'), false);
    assert.equal(p.$('inpUrl').value, DEFAULT_URL);
    assert.match(DEFAULT_URL, /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
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
    assert.equal(p.calls[0].url, DEFAULT_URL);
    assert.equal(p.calls[0].init.method, 'POST');
    assert.match(p.calls[0].init.headers['Content-Type'], /^text\/plain/);
    assert.deepEqual(p.calls[1].body, { action: 'getDashboard', token: 'tok123' });
    assert.equal(p.w.localStorage.getItem('kunci_token'), 'tok123');
    assert.equal(p.hidden('authScreen'), true);
    assert.equal(p.$('aPass').value, '', 'kata laluan dikosongkan');
    assert.equal(p.$('sumJumlah').textContent, '3');
    assert.match(p.$('kemaskini').textContent, /Ali/);
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

  test('respons bukan JSON (cth halaman log masuk Google) diberi mesej jelas', async () => {
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
    assert.match(p.$('area').firstElementChild.firstElementChild.className, /invbox/);
  });

  test('nama bilik/guru di-escape (tiada XSS)', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    const area = p.$('area');
    assert.equal(area.querySelector('img'), null);
    assert.equal(area.querySelector('b'), null);
    assert.match(area.textContent, /<b>Jahat<\/b>/);
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

  test('Tetapan: URL tidak sah ditolak; URL sah disimpan & digunakan', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    p.$('btnTetapan').click();
    p.$('inpUrl').value = 'https://jahat.com/exec';
    p.$('btnSimpan').click();
    assert.equal(p.alerts.length, 1);
    assert.equal(p.w.localStorage.getItem('kunci_gas_url'), null);

    p.$('inpUrl').value = 'https://script.google.com/macros/s/LAIN/exec';
    p.$('btnSimpan').click();
    await p.wait(120);
    assert.equal(p.w.localStorage.getItem('kunci_gas_url'), 'https://script.google.com/macros/s/LAIN/exec');
    assert.equal(p.calls.at(-1).url, 'https://script.google.com/macros/s/LAIN/exec');

    p.$('btnTetapan').click();
    p.$('inpUrl').value = '';
    p.$('btnSimpan').click();
    assert.equal(p.w.localStorage.getItem('kunci_gas_url'), null, 'kosong = kembali ke URL lalai');
    await p.wait(120);
    assert.equal(p.calls.at(-1).url, DEFAULT_URL);
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

  test('pager: butang Seterusnya/Sebelum', async () => {
    p = loadPage({ ls: login, api: () => DASH });
    await p.wait(120);
    p.w.document.querySelector('[data-tab="log"]').click();
    await p.wait();
    // jsdom tiada layout -> kapasiti 1 baris/halaman
    assert.equal(p.$('pageInfo').textContent, '1 / 2');
    assert.equal(p.$('prev').disabled, true);
    p.$('next').click();
    assert.equal(p.$('pageInfo').textContent, '2 / 2');
    assert.equal(p.$('next').disabled, true);
  });
});
