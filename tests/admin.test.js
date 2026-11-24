// Ujian UI Admin: urus bilik & urus akaun guru.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadPage } = require('./helpers/page');

const DASH = {
  ok: true,
  dijana: '2026-03-01T10:00:00+08:00',
  pengguna: { username: 'admin', nama: 'Cikgu Admin', peranan: 'Admin' },
  bilik: [
    { idKunci: 'A', nama: 'Bilik A', status: 'Pulang', pemegang: '-', masaAmbil: '' },
    { idKunci: 'B', nama: 'Bilik <b>B</b>', status: 'Pulang', pemegang: '-', masaAmbil: '' }
  ],
  log: []
};
const ADMIN = { username: 'admin', nama: 'Cikgu Admin', peranan: 'Admin' };
const GURU = [
  { username: 'admin', nama: 'Cikgu Admin', peranan: 'Admin', status: 'Aktif', daftar: '2026-01-01T08:00:00+08:00' },
  { username: 'ali', nama: 'Cikgu Ali bin Abu', peranan: 'Pentadbir', status: 'Aktif', daftar: '2026-01-02T08:00:00+08:00' },
  { username: 'siti', nama: 'Puan <i>Siti</i>', peranan: 'Pentadbir', status: 'Digantung', daftar: '2026-01-03T08:00:00+08:00' }
];

let p;
afterEach(() => { if (p) p.close(); p = null; });

const aksi = (a) => p.calls.filter((c) => c.body && c.body.action === a);
const baca = (id) => p.$(id).textContent;

function buka(user, api, o = {}) {
  p = loadPage({
    ls: { kunci_token: 'tok', kunci_user: JSON.stringify(user), kunci_cache: JSON.stringify(DASH) },
    api: (b) => (b.action === 'getDashboard' ? { ...DASH, pengguna: { ...DASH.pengguna, peranan: user.peranan || 'Pentadbir' } } : api(b)),
    ...o
  });
}

describe('Butang admin dalam helaian Akaun', () => {
  test('pengguna biasa: tidak nampak', async () => {
    buka({ username: 'ali', nama: 'Ali' }, () => ({ ok: true }));
    await p.wait(120);
    p.$('navAkaun').click();
    assert.equal(p.hidden('btnUrusBilik'), true);
    assert.equal(p.hidden('btnUrusGuru'), true);
  });

  test('Admin: nampak', async () => {
    buka(ADMIN, () => ({ ok: true }));
    await p.wait(120);
    p.$('navAkaun').click();
    assert.equal(p.hidden('btnUrusBilik'), false);
    assert.equal(p.hidden('btnUrusGuru'), false);
  });
});

describe('Urus Bilik', () => {
  let senarai;
  const api = (b) => {
    if (b.action !== 'adminBilik') return { ok: true };
    if (b.op === 'tambah') senarai = [...senarai, { idKunci: b.id.toUpperCase(), nama: b.nama }];
    if (b.op === 'namakan') senarai = senarai.map((x) => (x.idKunci === b.id ? { ...x, nama: b.nama } : x));
    if (b.op === 'padam') senarai = senarai.filter((x) => x.idKunci !== b.id);
    return { ok: true, bilik: senarai };
  };
  const bukaSheet = async (o) => {
    senarai = DASH.bilik.map((b) => ({ idKunci: b.idKunci, nama: b.nama }));
    buka(ADMIN, api, o);
    await p.wait(120);
    p.$('navAkaun').click();
    p.$('btnUrusBilik').click();
  };
  const kad = (id) => p.w.document.querySelector('[data-bid="' + id + '"]');

  test('papar senarai bilik (HTML di-escape), helaian Akaun ditutup', async () => {
    await bukaSheet();
    assert.equal(p.hidden('sheetBilik'), false);
    assert.equal(p.hidden('sheetAkaun'), true);
    assert.equal(p.w.document.querySelectorAll('[data-bid]').length, 2);
    assert.equal(kad('B').querySelector('input').value, 'Bilik <b>B</b>');
    assert.equal(p.$('bilikSenarai').querySelector('b'), null);
  });

  test('tambah: ID dijana daripada nama, panggilan RPC, bilik muncul, borang dikosongkan', async () => {
    await bukaSheet();
    p.$('bNama').value = 'Bilik Muzik #2';
    p.$('bNama').dispatchEvent(new p.w.Event('input'));
    assert.equal(p.$('bId').value, 'BILIK-MUZIK-2');
    p.$('bilikTambah').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true }));
    await p.wait(150);
    assert.deepEqual(aksi('adminBilik')[0].body, { action: 'adminBilik', token: 'tok', op: 'tambah', id: 'BILIK-MUZIK-2', nama: 'Bilik Muzik #2' });
    assert.ok(kad('BILIK-MUZIK-2'));
    assert.match(baca('bilikMsg'), /\?kunci=BILIK-MUZIK-2/);
    assert.equal(p.$('bNama').value, '');
    assert.equal(p.$('bId').value, '');
    assert.ok(aksi('getDashboard').length >= 2, 'dashboard dimuat semula');
  });

  test('tambah: ID yang ditaip sendiri tidak ditimpa oleh nama', async () => {
    await bukaSheet();
    p.$('bId').value = 'ID-SAYA';
    p.$('bId').dispatchEvent(new p.w.Event('input'));
    p.$('bNama').value = 'Nama Lain';
    p.$('bNama').dispatchEvent(new p.w.Event('input'));
    assert.equal(p.$('bId').value, 'ID-SAYA');
  });

  test('tambah: medan kosong ditolak tanpa panggilan; ralat pelayan dipaparkan', async () => {
    await bukaSheet();
    p.$('bilikTambah').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true }));
    await p.wait(50);
    assert.match(baca('bilikMsg'), /Sila isi/);
    assert.equal(aksi('adminBilik').length, 0);
    p.w.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: 'ID kunci "A" sudah wujud.' }) });
    p.$('bNama').value = 'X'; p.$('bId').value = 'A';
    p.$('bilikTambah').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true }));
    await p.wait(100);
    assert.match(baca('bilikMsg'), /sudah wujud/);
    assert.equal(p.$('bNama').value, 'X', 'input dikekalkan apabila gagal');
  });

  test('namakan semula', async () => {
    await bukaSheet();
    kad('A').querySelector('input').value = 'Makmal Baharu';
    kad('A').querySelector('[data-bsimpan]').click();
    await p.wait(120);
    assert.deepEqual(aksi('adminBilik')[0].body, { action: 'adminBilik', token: 'tok', op: 'namakan', id: 'A', nama: 'Makmal Baharu' });
    assert.equal(kad('A').querySelector('input').value, 'Makmal Baharu');
  });

  test('padam: perlu pengesahan; batal = tiada panggilan; sahkan = bilik hilang', async () => {
    await bukaSheet({ confirm: false });
    kad('A').querySelector('[data-bpadam]').click();
    await p.wait(60);
    assert.equal(aksi('adminBilik').length, 0);
    p.close();
    await bukaSheet();
    kad('A').querySelector('[data-bpadam]').click();
    await p.wait(150);
    assert.equal(p.confirms.length, 1);
    assert.match(p.confirms[0], /Padam bilik A/);
    assert.equal(kad('A'), null);
  });

  test('sesi tamat: helaian ditutup dan skrin log masuk dipaparkan', async () => {
    await bukaSheet();
    p.w.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, auth: false, error: 'Sesi tamat' }) });
    kad('A').querySelector('[data-bsimpan]').click();
    await p.wait(100);
    assert.equal(p.hidden('sheetBilik'), true);
    assert.equal(p.hidden('authScreen'), false);
  });
});

describe('Urus Akaun Guru', () => {
  let senarai;
  const api = (b) => {
    if (b.action === 'adminGuru') return { ok: true, saya: 'admin', pengguna: senarai };
    if (b.action === 'adminGuruUbah') {
      senarai = senarai.map((g) => {
        if (g.username !== b.sasaran) return g;
        if (b.op === 'status') return { ...g, status: b.nilai };
        if (b.op === 'peranan') return { ...g, peranan: b.nilai };
        return g;
      });
      return { ok: true, saya: 'admin', pengguna: senarai };
    }
    return { ok: true };
  };
  const bukaSheet = async (o) => {
    senarai = GURU.map((g) => ({ ...g }));
    buka(ADMIN, api, o);
    await p.wait(120);
    p.$('navAkaun').click();
    p.$('btnUrusGuru').click();
    await p.wait(80);
  };
  const kad = (u) => p.w.document.querySelector('[data-gu="' + u + '"]');

  test('senarai guru dengan lencana; HTML di-escape; akaun sendiri tidak boleh disekat/diturunkan', async () => {
    await bukaSheet();
    assert.equal(aksi('adminGuru').length, 1);
    assert.equal(p.w.document.querySelectorAll('[data-gu]').length, 3);
    assert.match(kad('admin').textContent, /Admin/);
    assert.match(kad('admin').textContent, /Anda/);
    assert.match(kad('siti').textContent, /Disekat/);
    assert.equal(kad('siti').querySelector('i'), null, 'nama di-escape');
    assert.equal(kad('admin').querySelector('[data-gstatus]').disabled, true);
    assert.equal(kad('admin').querySelector('[data-gperanan]').disabled, true);
    assert.equal(kad('admin').querySelector('[data-gpw]').disabled, false, 'boleh tukar kata laluan sendiri');
    assert.equal(kad('ali').querySelector('[data-gstatus]').textContent, 'Sekat');
    assert.equal(kad('siti').querySelector('[data-gstatus]').textContent, 'Aktifkan');
  });

  test('carian menapis senarai', async () => {
    await bukaSheet();
    p.$('gCari').value = 'abu';
    p.$('gCari').dispatchEvent(new p.w.Event('input'));
    assert.equal(p.w.document.querySelectorAll('[data-gu]').length, 1);
    assert.ok(kad('ali'));
    p.$('gCari').value = 'tiada';
    p.$('gCari').dispatchEvent(new p.w.Event('input'));
    assert.match(baca('guruSenarai'), /Tiada akaun sepadan/);
  });

  test('sekat: pengesahan, panggilan RPC, lencana dikemas kini', async () => {
    await bukaSheet();
    kad('ali').querySelector('[data-gstatus]').click();
    await p.wait(120);
    assert.match(p.confirms[0], /Sekat akaun @ali/);
    assert.deepEqual(aksi('adminGuruUbah')[0].body, { action: 'adminGuruUbah', token: 'tok', op: 'status', sasaran: 'ali', nilai: 'Digantung' });
    assert.match(kad('ali').textContent, /Disekat/);
    assert.match(baca('guruMsg'), /disekat/);
  });

  test('aktifkan semula tidak perlu pengesahan', async () => {
    await bukaSheet();
    kad('siti').querySelector('[data-gstatus]').click();
    await p.wait(120);
    assert.equal(p.confirms.length, 0);
    assert.equal(aksi('adminGuruUbah')[0].body.nilai, 'Aktif');
    assert.doesNotMatch(kad('siti').textContent, /Disekat/);
  });

  test('batal pengesahan sekat: tiada panggilan', async () => {
    await bukaSheet({ confirm: false });
    kad('ali').querySelector('[data-gstatus]').click();
    await p.wait(60);
    assert.equal(aksi('adminGuruUbah').length, 0);
  });

  test('jadikan Admin (dengan pengesahan) dan jadikan biasa', async () => {
    await bukaSheet();
    kad('ali').querySelector('[data-gperanan]').click();
    await p.wait(120);
    assert.match(p.confirms[0], /Jadikan @ali Admin/);
    assert.equal(aksi('adminGuruUbah')[0].body.nilai, 'Admin');
    assert.equal(kad('ali').querySelector('[data-gperanan]').textContent, 'Jadikan biasa');
    kad('ali').querySelector('[data-gperanan]').click();
    await p.wait(120);
    assert.equal(p.confirms.length, 1, 'menurunkan tidak perlu pengesahan');
    assert.equal(aksi('adminGuruUbah')[1].body.nilai, 'Pentadbir');
  });

  test('kata laluan: baris input, pengesahan panjang, hantar, mesej', async () => {
    await bukaSheet();
    const baris = kad('ali').querySelector('.gPwBaris');
    assert.equal(baris.classList.contains('hidden'), true);
    kad('ali').querySelector('[data-gpw]').click();
    assert.equal(baris.classList.contains('hidden'), false);
    kad('ali').querySelector('.gPwInp').value = 'pendek';
    kad('ali').querySelector('[data-gpwsimpan]').click();
    await p.wait(40);
    assert.match(baca('guruMsg'), /8 aksara/);
    assert.equal(aksi('adminGuruUbah').length, 0);
    kad('ali').querySelector('.gPwInp').value = 'KataBaharu99';
    kad('ali').querySelector('[data-gpwsimpan]').click();
    await p.wait(120);
    assert.deepEqual(aksi('adminGuruUbah')[0].body, { action: 'adminGuruUbah', token: 'tok', op: 'katalaluan', sasaran: 'ali', nilai: 'KataBaharu99' });
    assert.match(baca('guruMsg'), /Kata laluan @ali ditukar/);
  });

  test('bukan Admin di pelayan (peranan diturunkan): ralat dipaparkan, bukan ranap', async () => {
    await bukaSheet();
    p.w.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: 'Hanya Admin boleh mengurus akaun.' }) });
    kad('ali').querySelector('[data-gstatus]').click();
    await p.wait(100);
    assert.match(baca('guruMsg'), /Hanya Admin/);
  });
});
