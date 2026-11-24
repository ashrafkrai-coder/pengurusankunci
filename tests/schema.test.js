// Menguji supabase/schema.sql pada Postgres setempat (PGlite). Tiada rangkaian diperlukan.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SQL = path.join(__dirname, '..', 'supabase');
let db;
const call = async (fn, b) => (await db.query(`select public.${fn}($1::jsonb) r`, [JSON.stringify(b)])).rows[0].r;

async function daftar(username, nama = 'Cikgu ' + username) {
  const r = await call('api_daftar', { username, nama, password: 'rahsia123' });
  assert.ok(r.ok, r.error);
  return r.token;
}

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec('create role anon; create role authenticated; create schema extensions; grant usage on schema extensions to anon;');
  const schema = fs.readFileSync(path.join(SQL, 'schema.sql'), 'utf8');
  await db.exec(schema);
  await db.exec(schema); // boleh dijalankan semula
  await db.exec('grant usage on schema public to anon, authenticated;');
  const bilik = fs.readFileSync(path.join(SQL, 'bilik.sql'), 'utf8');
  await db.exec(bilik);
  await db.exec(bilik);
});

describe('Skema Supabase', () => {
  test('26 bilik dimasukkan tanpa pendua', async () => {
    assert.equal((await db.query('select count(*)::int c from bilik')).rows[0].c, 26);
  });

  test('anon tidak boleh baca jadual atau fungsi dalaman', async () => {
    await db.exec('set role anon');
    try {
      for (const t of ['bilik', 'log_imbas', 'pengguna', 'sesi', 'gagal_login']) {
        await assert.rejects(db.query(`select * from public.${t}`), /permission denied/, t);
      }
      await assert.rejects(db.query("select app.buat_sesi('x', true)"), /permission denied/);
      await assert.rejects(db.query('select * from app.entri_log()'), /permission denied/);
    } finally { await db.exec('reset role'); }
  });

  test('anon boleh panggil fungsi API', async () => {
    await db.exec('set role anon');
    try {
      assert.equal((await call('api_ping', {})).ok, true);
      assert.equal((await call('api_login', { username: 'tiada', password: 'x' })).ok, false);
    } finally { await db.exec('reset role'); }
  });

  test('daftar: pengesahan & pendua', async () => {
    assert.match((await call('api_daftar', { username: 'a', nama: 'X', password: '12345678' })).error, /Nama pengguna/);
    assert.match((await call('api_daftar', { username: 'abc', nama: '=cmd', password: '12345678' })).error, /bermula/);
    assert.match((await call('api_daftar', { username: 'abc', nama: 'X', password: '123' })).error, /8 aksara/);
    await daftar('pendua');
    assert.match((await call('api_daftar', { username: 'PENDUA', nama: 'Y', password: 'rahsia123' })).error, /sudah wujud/);
  });

  test('log masuk, kunci 5 cubaan, sekat akaun, logout', async () => {
    await daftar('login1');
    for (let i = 0; i < 5; i++) assert.match((await call('api_login', { username: 'login1', password: 'salah' })).error, /salah/);
    assert.match((await call('api_login', { username: 'login1', password: 'rahsia123' })).error, /Terlalu banyak/);
    await db.exec("delete from gagal_login where username = 'login1'");
    const l = await call('api_login', { username: 'login1', password: 'rahsia123' });
    assert.ok(l.ok && l.token);
    assert.equal((await call('api_dashboard', { token: l.token })).ok, true);
    await db.exec("update pengguna set status = 'Digantung' where username = 'login1'");
    assert.equal((await call('api_dashboard', { token: l.token })).auth, false);
    assert.match((await call('api_login', { username: 'login1', password: 'rahsia123' })).error, /disekat/);
    await db.exec("update pengguna set status = 'Aktif' where username = 'login1'");
    await call('api_logout', { token: l.token });
    assert.equal((await call('api_dashboard', { token: l.token })).auth, false);
  });

  test('imbas: Ambil/Pulang berselang, debounce 60 saat, kunci huruf kecil', async () => {
    const t = await daftar('imbas1');
    assert.equal((await call('api_imbas', { kunci: 'surau', token: 'salah' })).auth, false);
    assert.match((await call('api_imbas', { kunci: 'TIADA', token: t })).error, /tiada dalam senarai/);
    const a = await call('api_imbas', { kunci: 'surau', token: t });
    assert.equal(a.tindakan, 'Ambil');
    const dup = await call('api_imbas', { kunci: 'SURAU', token: t });
    assert.ok(dup.ulang && dup.tindakan === 'Ambil');
    await db.exec("update log_imbas set masa = masa - interval '5 minutes' where id_kunci = 'SURAU'");
    assert.equal((await call('api_imbas', { kunci: 'SURAU', token: t })).tindakan, 'Pulang');
    assert.equal((await db.query("select count(*)::int c from log_imbas where id_kunci = 'SURAU'")).rows[0].c, 2);
  });

  test('idem: penghantaran semula tidak mencipta rekod kedua', async () => {
    const t = await daftar('idem1');
    const a = await call('api_imbas', { kunci: 'DEWAN-LJ', token: t, idem: 'abc-123' });
    assert.equal(a.tindakan, 'Ambil');
    await db.exec("update log_imbas set masa = masa - interval '5 minutes' where id_kunci = 'DEWAN-LJ'");
    const b = await call('api_imbas', { kunci: 'DEWAN-LJ', token: t, idem: 'abc-123' });
    assert.ok(b.ulang);
    assert.equal(b.tindakan, 'Ambil');
    assert.equal((await db.query("select count(*)::int c from log_imbas where id_kunci = 'DEWAN-LJ'")).rows[0].c, 1);
  });

  test('masa luar talian: diterima dalam 24 jam, ditolak jika terlalu lama/masa depan', async () => {
    const t = await daftar('luar1');
    const jam = (j) => new Date(Date.now() - j * 3600e3).toISOString();
    await call('api_imbas', { kunci: 'KOPERASI', token: t, idem: 'o1', masa: jam(3) });
    await call('api_imbas', { kunci: 'BILIK-ICC', token: t, idem: 'o2', masa: jam(48) });
    await call('api_imbas', { kunci: 'BILIK-UBK', token: t, idem: 'o3', masa: new Date(Date.now() + 3600e3).toISOString() });
    await call('api_imbas', { kunci: 'BILIK-SPBT', token: t, idem: 'o4', masa: 'bukan-tarikh' });
    const sel = async (id) => Number((await db.query('select extract(epoch from now() - masa) s from log_imbas where idem = $1', [id])).rows[0].s);
    assert.ok(Math.abs(await sel('o1') - 3 * 3600) < 30, 'masa 3 jam lalu dikekalkan');
    assert.ok(Math.abs(await sel('o2')) < 30, '48 jam lalu -> masa pelayan');
    assert.ok(Math.abs(await sel('o3')) < 30, 'masa depan -> masa pelayan');
    assert.ok(Math.abs(await sel('o4')) < 30, 'format rosak -> masa pelayan');
  });

  test('dashboard: status bilik, pasangan, ids, peranan', async () => {
    const t = await daftar('dash1');
    await db.exec('delete from log_imbas');
    await call('api_imbas', { kunci: 'MAKMAL-1', token: t });
    await db.exec("update log_imbas set masa = masa - interval '10 minutes'");
    await call('api_imbas', { kunci: 'MAKMAL-1', token: t });
    await db.exec("update log_imbas set masa = masa - interval '10 minutes'");
    await call('api_imbas', { kunci: 'MAKMAL-1', token: t });
    const d = await call('api_dashboard', { token: t });
    assert.equal(d.bilik.length, 26);
    const mk = d.bilik.find((b) => b.idKunci === 'MAKMAL-1');
    assert.equal(mk.status, 'Ambil');
    assert.match(mk.pemegang, /dash1/);
    assert.equal(d.jumlahLog, 2);
    assert.equal(d.log[0].status, 'Belum Pulang');
    assert.equal(d.log[1].status, 'Sudah Pulang');
    assert.equal(d.log[1].ids.length, 2);
    assert.equal(d.pengguna.peranan, 'Pentadbir');
  });

  test('padam rekod: hanya Admin', async () => {
    const biasa = await daftar('biasa1');
    const admin = await daftar('admin1');
    await db.exec("update pengguna set peranan = 'Admin' where username = 'admin1'");
    await db.exec('delete from log_imbas');
    await call('api_imbas', { kunci: 'SURAU', token: biasa });
    const d = await call('api_dashboard', { token: biasa });
    const ids = d.log.find((r) => r.idKunci === 'SURAU').ids;
    assert.match((await call('api_padam_log', { token: biasa, ids })).error, /Admin/);
    assert.match((await call('api_padam_log', { token: admin, ids: [] })).error, /tidak sah/);
    assert.match((await call('api_padam_log', { token: admin, ids: ['x'] })).error, /tidak sah/);
    const r = await call('api_padam_log', { token: admin, ids });
    assert.deepEqual([r.ok, r.dipadam], [true, ids.length]);
    assert.equal((await call('api_padam_log', { token: 'x', ids })).auth, false);
  });

  test('eksport: julat tarikh, pengesahan', async () => {
    const t = await daftar('eks1');
    await db.exec('delete from log_imbas');
    await call('api_imbas', { kunci: 'SURAU', token: t });
    await db.exec("update log_imbas set masa = masa - interval '5 minutes'");
    await call('api_imbas', { kunci: 'SURAU', token: t });
    await call('api_imbas', { kunci: 'KOPERASI', token: t });
    const hari = (await db.query("select to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') d")).rows[0].d;
    const r = await call('api_eksport', { token: t, dari: hari, hingga: hari });
    assert.equal(r.ok, true);
    assert.equal(r.jumlah, 2);
    assert.equal(r.rows.length, 2);
    assert.equal(r.dipotong, false);
    assert.equal((await call('api_eksport', { token: t, dari: '2020-01-01', hingga: '2020-01-02' })).rows.length, 0);
    assert.match((await call('api_eksport', { token: t, dari: 'x', hingga: hari })).error, /Tarikh/);
    assert.match((await call('api_eksport', { token: t, dari: hari, hingga: '2000-01-01' })).error, /Tarikh/);
    assert.match((await call('api_eksport', { token: t, dari: '2020-01-01', hingga: hari })).error, /1 tahun/);
    assert.equal((await call('api_eksport', { token: 'x', dari: hari, hingga: hari })).auth, false);
  });

  test('realtime: isyarat dihantar; imbasan tetap berjaya jika Realtime tiada', async () => {
    const t = await daftar('rt1');
    assert.equal((await call('api_imbas', { kunci: 'BILIK-MEDIA', token: t })).ok, true); // tanpa skema realtime
    await db.exec(`create schema realtime; create table public.isyarat_uji(topik text, peristiwa text, awam boolean);
      create function realtime.send(p jsonb, e text, t text, pr boolean default true) returns void language sql as
      $$ insert into public.isyarat_uji values (t, e, not pr) $$;`);
    await call('api_imbas', { kunci: 'BILIK-GKMP', token: t });
    const r = (await db.query('select * from public.isyarat_uji')).rows;
    assert.deepEqual(r.map((x) => [x.topik, x.peristiwa, x.awam]), [['kunci-log', 'ubah', true]]);
  });
});
