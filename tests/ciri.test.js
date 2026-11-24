// Ujian ciri: imbasan luar talian, Realtime, padam rekod (Admin), eksport PDF.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, SUPABASE_URL, SUPABASE_KEY } = require('./helpers/page');

const DASH = {
  ok: true,
  dijana: '2026-03-01T10:00:00+08:00',
  pengguna: { username: 'ali', nama: 'Cikgu Ali', peranan: 'Pentadbir' },
  bilik: [
    { idKunci: 'A', nama: 'Bilik A', status: 'Pulang', pemegang: '-', masaAmbil: '' },
    { idKunci: 'B', nama: 'Bilik B', status: 'Ambil', pemegang: 'Cikgu Bala', masaAmbil: '2026-03-01T09:00:00+08:00' }
  ],
  log: [
    { ids: [3], idKunci: 'B', bilik: 'Bilik B', guru: 'Cikgu Bala', masaAmbil: '2026-03-01T09:00:00+08:00', masaPulang: '', guruPulang: '', status: 'Belum Pulang' },
    { ids: [1, 2], idKunci: 'A', bilik: 'Bilik A', guru: 'Cikgu Ali', masaAmbil: '2026-02-28T08:00:00+08:00', masaPulang: '2026-02-28T09:00:00+08:00', guruPulang: 'Cikgu Ali', status: 'Sudah Pulang' }
  ]
};
const USER = { username: 'ali', nama: 'Cikgu Ali' };
const login = (user = USER, extra = {}) => ({ kunci_token: 'tok', kunci_user: JSON.stringify(user), kunci_cache: JSON.stringify(DASH), ...extra });
const AMBIL = { ok: true, bilik: 'Bilik A', tindakan: 'Ambil', guru: 'Cikgu Ali', masa: '01/03/2026 8:05 pagi' };
const aksi = (p, a) => p.calls.filter((c) => c.body && c.body.action === a);

let p;
afterEach(() => { if (p) p.close(); p = null; });

describe('Prestasi: preconnect', () => {
  test('preconnect ke Supabase', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, new RegExp('<link rel="preconnect" href="' + SUPABASE_URL.replace(/\./g, '\\.') + '"'));
  });
});

describe('Imbasan luar talian', () => {
  test('tiada internet: simpan di telefon dengan idem & masa, papar mesej, banner', async () => {
    p = loadPage({ url: 'https://contoh.test/?kunci=A', ls: login(), api: (b) => { if (b.action === 'imbas') throw new Error('offline'); return DASH; } });
    await p.wait(150);
    assert.match(p.$('imbasSheet').textContent, /Disimpan di telefon/);
    assert.match(p.$('imbasSheet').textContent, /akan dihantar automatik/);
    const q = JSON.parse(p.w.localStorage.getItem('kunci_tertunda'));
    assert.equal(q.length, 1);
    assert.equal(q[0].kunci, 'A');
    assert.equal(q[0].u, 'ali');
    assert.ok(q[0].idem && !isNaN(Date.parse(q[0].masa)));
    assert.equal(aksi(p, 'imbas')[0].body.idem, q[0].idem, 'idem sama dengan percubaan pertama');
    assert.equal(p.hidden('tertunda'), false);
    assert.match(p.$('tertunda').textContent, /1 imbasan disimpan/);
  });

  test('sambung semula: hantar dengan idem & masa asal, kosongkan giliran', async () => {
    let luar = true;
    p = loadPage({ url: 'https://contoh.test/?kunci=A', ls: login(), api: (b) => { if (b.action === 'imbas') { if (luar) throw new Error('offline'); return AMBIL; } return DASH; } });
    await p.wait(150);
    const asal = JSON.parse(p.w.localStorage.getItem('kunci_tertunda'))[0];
    luar = false;
    p.w.dispatchEvent(new p.w.Event('online'));
    await p.wait(200);
    const hantar = aksi(p, 'imbas').at(-1).body;
    assert.equal(hantar.idem, asal.idem);
    assert.equal(hantar.masa, asal.masa);
    assert.equal(p.w.localStorage.getItem('kunci_tertunda'), null);
    assert.equal(p.hidden('tertunda'), true);
  });

  test('ralat pelayan 5xx dianggap boleh cuba semula; ralat aplikasi (bilik tiada) tidak disimpan', async () => {
    p = loadPage({ url: 'https://contoh.test/?kunci=A', ls: login(), api: (b) => (b.action === 'imbas' ? { ok: false, error: 'ID kunci tiada' } : DASH) });
    await p.wait(150);
    assert.match(p.$('imbasSheet').textContent, /Gagal merekod/);
    assert.equal(p.w.localStorage.getItem('kunci_tertunda'), null);
  });

  test('giliran milik pengguna lain tidak dihantar', async () => {
    const q = [{ kunci: 'A', idem: 'x1', masa: new Date().toISOString(), u: 'orang.lain' }];
    p = loadPage({ ls: login(USER, { kunci_tertunda: JSON.stringify(q) }), api: () => DASH });
    await p.wait(200);
    assert.equal(aksi(p, 'imbas').length, 0);
    assert.equal(JSON.parse(p.w.localStorage.getItem('kunci_tertunda')).length, 1);
  });

  test('giliran dihantar apabila dashboard berjaya dimuat (bukan hanya peristiwa online)', async () => {
    const q = [{ kunci: 'A', idem: 'x2', masa: new Date().toISOString(), u: 'ali' }];
    p = loadPage({ ls: login(USER, { kunci_tertunda: JSON.stringify(q) }), api: (b) => (b.action === 'imbas' ? AMBIL : DASH) });
    await p.wait(250);
    assert.equal(aksi(p, 'imbas').length, 1);
    assert.equal(aksi(p, 'imbas')[0].body.idem, 'x2');
    assert.equal(p.w.localStorage.getItem('kunci_tertunda'), null);
  });

  test('masih tiada internet: giliran kekal dan tidak hilang', async () => {
    const q = [{ kunci: 'A', idem: 'x3', masa: new Date().toISOString(), u: 'ali' }];
    p = loadPage({ ls: login(USER, { kunci_tertunda: JSON.stringify(q) }), api: (b) => { if (b.action === 'imbas') throw new Error('offline'); return DASH; } });
    await p.wait(250);
    assert.equal(JSON.parse(p.w.localStorage.getItem('kunci_tertunda')).length, 1);
  });
});

describe('Realtime', () => {
  test('sambung ke saluran awam kunci-log dan muat semula apabila ada isyarat', async () => {
    p = loadPage({ ls: login(), api: () => DASH });
    await p.wait(100);
    assert.equal(p.sockets.length, 1);
    const s = p.sockets[0];
    assert.match(s.url, new RegExp('^' + SUPABASE_URL.replace('https', 'wss').replace(/\./g, '\\.') + '/realtime/v1/websocket\\?apikey=' + SUPABASE_KEY));
    s._buka();
    assert.equal(s.sent[0].event, 'phx_join');
    assert.equal(s.sent[0].topic, 'realtime:kunci-log');
    assert.equal(s.sent[0].payload.config.private, false);
    const sebelum = aksi(p, 'getDashboard').length;
    s._mesej({ topic: 'realtime:kunci-log', event: 'phx_reply', payload: { status: 'ok' }, ref: '1' });
    s._mesej({ topic: 'realtime:kunci-log', event: 'broadcast', payload: { event: 'lain', type: 'broadcast', payload: {} } });
    await p.wait(450);
    assert.equal(aksi(p, 'getDashboard').length, sebelum, 'mesej lain diabaikan');
    s._mesej({ topic: 'realtime:kunci-log', event: 'broadcast', payload: { event: 'ubah', type: 'broadcast', payload: {} } });
    s._mesej({ topic: 'realtime:kunci-log', event: 'broadcast', payload: { event: 'ubah', type: 'broadcast', payload: {} } });
    await p.wait(450);
    assert.equal(aksi(p, 'getDashboard').length, sebelum + 1, 'beberapa isyarat serentak = satu muat semula');
  });

  test('tanpa log masuk: tiada sambungan; log keluar menutup sambungan', async () => {
    p = loadPage();
    await p.wait(50);
    assert.equal(p.sockets.length, 0);
    p.close();
    p = loadPage({ ls: login(), api: () => DASH });
    await p.wait(100);
    p.sockets[0]._buka();
    p.$('navAkaun').click();
    p.$('btnKeluar').click();
    await p.wait(50);
    assert.equal(p.sockets[0].closed, true);
    assert.equal(p.sockets.length, 1, 'tidak menyambung semula selepas log keluar');
  });
});

describe('Padam rekod (Admin)', () => {
  const bukaLog = async (user, dash, o = {}) => {
    dash = dash || { ...DASH, pengguna: { ...DASH.pengguna, peranan: user.peranan || 'Pentadbir' } }; // pelayan sentiasa mengesahkan peranan
    p = loadPage({ ls: login(user), api: (b) => (b.action === 'padam' ? { ok: true, dipadam: 2 } : dash), ...o });
    await p.wait(150);
    p.w.document.querySelector('[data-tab="log"]').click();
  };

  test('pengguna biasa: tiada butang padam', async () => {
    await bukaLog(USER);
    assert.equal(p.w.document.querySelectorAll('[data-padam]').length, 0);
  });

  test('Admin: butang padam, pengesahan, panggilan RPC dengan ids', async () => {
    await bukaLog({ ...USER, peranan: 'Admin' });
    const btns = [...p.w.document.querySelectorAll('[data-padam]')];
    assert.equal(btns.length, 2);
    assert.deepEqual(btns.map((b) => b.dataset.padam), ['3', '1,2']);
    btns[1].click();
    await p.wait(120);
    assert.equal(p.confirms.length, 1);
    assert.deepEqual(aksi(p, 'padam')[0].body, { action: 'padam', token: 'tok', ids: [1, 2] });
  });

  test('batal pengesahan: tiada panggilan', async () => {
    await bukaLog({ ...USER, peranan: 'Admin' }, undefined, { confirm: false });
    p.w.document.querySelector('[data-padam]').click();
    await p.wait(80);
    assert.equal(aksi(p, 'padam').length, 0);
  });

  test('peranan Admin daripada pelayan dikemas kini tanpa log masuk semula', async () => {
    await bukaLog(USER, { ...DASH, pengguna: { ...DASH.pengguna, peranan: 'Admin' } });
    await p.wait(100);
    assert.equal(p.w.document.querySelectorAll('[data-padam]').length, 2);
    assert.equal(JSON.parse(p.w.localStorage.getItem('kunci_user')).peranan, 'Admin');
    assert.equal(JSON.parse(p.w.localStorage.getItem('kunci_user')).nama, 'Cikgu Ali', 'nama tidak ditimpa');
  });

  test('ralat pelayan dipaparkan', async () => {
    await bukaLog({ ...USER, peranan: 'Admin' });
    p.w.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: 'Hanya Admin boleh memadam rekod.' }) });
    p.w.document.querySelector('[data-padam]').click();
    await p.wait(100);
    assert.match(p.$('amaran').textContent, /Hanya Admin/);
  });
});

describe('Eksport PDF', () => {
  const ROWS = [
    { ids: [1, 2], idKunci: 'A', bilik: 'Bilik A', guru: 'Cikgu Ali', masaAmbil: '2026-02-28T08:00:00+08:00', masaPulang: '2026-02-28T09:30:00+08:00', guruPulang: 'Cikgu Ali', status: 'Sudah Pulang' },
    { ids: [3], idKunci: 'B', bilik: 'Bilik B', guru: 'Cikgu Bala', masaAmbil: '2026-03-01T09:00:00+08:00', masaPulang: '', guruPulang: '', status: 'Belum Pulang' }
  ];
  const vendor = (f) => fs.readFileSync(path.join(__dirname, '..', 'vendor', f), 'utf8');

  async function sedia(eksport) {
    p = loadPage({ ls: login(), api: (b) => (b.action === 'eksport' ? eksport(b) : DASH) });
    await p.wait(120);
    // Muatkan pustaka sebenar dalam tetingkap (jsdom tidak memuat skrip luar dan tiada TextEncoder)
    p.w.TextEncoder = TextEncoder; p.w.TextDecoder = TextDecoder;
    p.w.eval(vendor('jspdf.umd.min.js'));
    p.w.eval(vendor('jspdf.plugin.autotable.min.js'));
    const simpan = [];
    p.w.jspdf.jsPDF.API.save = function (nama) { simpan.push({ nama, byte: Buffer.from(this.output('arraybuffer')) }); };
    p.w.document.querySelector('[data-tab="log"]').click();
    return simpan;
  }

  test('fail vendor wujud dan butang PDF ada di tab Log', async () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'vendor', 'jspdf.umd.min.js')));
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'vendor', 'jspdf.plugin.autotable.min.js')));
    p = loadPage({ ls: login(), api: () => DASH });
    assert.ok(p.$('btnPdf'));
    await p.wait(100);
  });

  test('jana PDF sebenar: nama fail, panggilan RPC, kandungan sah', async () => {
    const simpan = await sedia(() => ({ ok: true, jumlah: 2, dipotong: false, rows: ROWS }));
    p.$('btnPdf').click();
    assert.equal(p.hidden('sheetPdf'), false);
    p.$('pdfDari').value = '2026-02-28'; p.$('pdfHingga').value = '2026-03-01';
    p.$('pdfJana').click();
    await p.wait(400);
    assert.deepEqual(aksi(p, 'eksport')[0].body, { action: 'eksport', token: 'tok', dari: '2026-02-28', hingga: '2026-03-01' });
    assert.equal(simpan.length, 1);
    assert.equal(simpan[0].nama, 'laporan-kunci_2026-02-28_hingga_2026-03-01.pdf');
    assert.equal(simpan[0].byte.subarray(0, 5).toString(), '%PDF-');
    assert.ok(simpan[0].byte.length > 2000);
    assert.equal(p.hidden('sheetPdf'), true, 'helaian ditutup selepas berjaya');
    assert.equal(p.$('pdfJana').disabled, false);
  });

  test('pengesahan tarikh & tiada rekod: mesej, tiada PDF', async () => {
    const simpan = await sedia(() => ({ ok: true, jumlah: 0, dipotong: false, rows: [] }));
    p.$('btnPdf').click();
    p.$('pdfDari').value = '2026-03-02'; p.$('pdfHingga').value = '2026-03-01';
    p.$('pdfJana').click();
    await p.wait(50);
    assert.match(p.$('pdfMsg').textContent, /selepas tarikh/);
    assert.equal(aksi(p, 'eksport').length, 0);
    p.$('pdfHingga').value = '2026-03-03';
    p.$('pdfJana').click();
    await p.wait(300);
    assert.match(p.$('pdfMsg').textContent, /Tiada rekod/);
    assert.equal(simpan.length, 0);
    assert.equal(p.hidden('sheetPdf'), false);
  });

  test('ralat pelayan dipaparkan dalam helaian; sesi tamat melog keluar', async () => {
    await sedia(() => ({ ok: false, error: 'Julat tarikh maksimum 1 tahun.' }));
    p.$('btnPdf').click();
    p.$('pdfJana').click();
    await p.wait(300);
    assert.match(p.$('pdfMsg').textContent, /1 tahun/);
    p.close();
    await sedia(() => ({ ok: false, auth: false, error: 'Sesi tamat' }));
    p.$('btnPdf').click();
    p.$('pdfJana').click();
    await p.wait(300);
    assert.equal(p.hidden('authScreen'), false);
    assert.equal(p.hidden('sheetPdf'), true);
  });

  test('pilihan pantas menetapkan tarikh', async () => {
    p = loadPage({ ls: login(), api: () => DASH });
    p.$('btnPdf').click();
    const hari = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    assert.equal(p.$('pdfDari').value, hari(6), 'lalai 7 hari');
    p.w.document.querySelector('[data-pdf-hari="29"]').click();
    assert.equal(p.$('pdfDari').value, hari(29));
    assert.equal(p.$('pdfHingga').value, hari(0));
    p.w.document.querySelector('[data-pdf-hari="0"]').click();
    assert.equal(p.$('pdfDari').value, hari(0));
    await p.wait(100);
  });
});
