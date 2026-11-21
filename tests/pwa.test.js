// Ujian struktur PWA: manifest, ikon, service worker.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f));

function pngSize(buf) {
  assert.equal(buf.toString('hex', 0, 8), '89504e470d0a1a0a', 'bukan PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('manifest.json', () => {
  const m = JSON.parse(read('manifest.json'));

  test('medan wajib untuk boleh dipasang', () => {
    for (const k of ['name', 'short_name', 'start_url', 'display', 'icons']) assert.ok(m[k], k);
    assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(m.display));
  });

  test('ikon wujud dan saiz sepadan', () => {
    for (const ic of m.icons) {
      const [w, h] = pngSize(read(ic.src));
      assert.equal(`${w}x${h}`, ic.sizes, ic.src);
    }
    assert.ok(m.icons.some((i) => i.sizes === '192x192'));
    assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  });

  test('ikon maskable menggunakan fail berasingan (dengan ruang selamat)', () => {
    const anySrc = m.icons.filter((i) => i.purpose === 'any').map((i) => i.src);
    const mask = m.icons.filter((i) => i.purpose === 'maskable');
    assert.ok(mask.every((i) => !anySrc.includes(i.src)));
  });
});

describe('index.html', () => {
  const html = read('index.html').toString();

  test('merujuk manifest, ikon & mendaftar sw.js', () => {
    assert.match(html, /<link rel="manifest" href="manifest.json">/);
    assert.match(html, /serviceWorker\.register\('sw\.js'\)/);
    assert.match(html, /<meta name="viewport"/);
  });

  test('tidak menyekat zoom (aksesibiliti)', () => {
    assert.doesNotMatch(html, /maximum-scale|user-scalable=no/);
  });

  test('tiada pustaka CDN tidak dipin; Tailwind & Lucide dihos sendiri', () => {
    assert.doesNotMatch(html, /@latest/);
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com|unpkg\.com/);
    assert.match(html, /<link rel="stylesheet" href="tailwind\.css">/);
    assert.match(html, /<script src="vendor\/lucide\.min\.js"><\/script>/);
    assert.match(read('vendor/lucide.min.js').toString(), /createIcons/);
  });

  test('tailwind.css terkini (jalankan "npm run build:css" selepas ubah index.html)', () => {
    const { execFileSync } = require('node:child_process');
    const os = require('node:os');
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-')), 'out.css');
    execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', 'src/tailwind.css', '-o', out, '--minify'],
      { cwd: ROOT, stdio: 'ignore' });
    assert.equal(fs.readFileSync(out, 'utf8'), read('tailwind.css').toString());
  });
});

describe('logo.png', () => {
  test('fail logo sekolah wujud', { todo: 'simpan logo sekolah sebagai logo.png dalam folder projek' }, () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'logo.png')));
  });
});

/* ---------- Service worker dalam sandbox ---------- */
function loadSW({ network } = {}) {
  const handlers = {};
  const stores = new Map();
  const log = { skipWaiting: 0, claim: 0, put: [] };
  const mkCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const s = stores.get(name);
    return {
      addAll: async (urls) => urls.forEach((u) => s.set(u, { body: 'shell:' + u })),
      put: async (req, res) => { log.put.push(req.url || req); s.set(req.url || req, res); },
      match: async (req) => s.get(req.url || req)
    };
  };
  const caches = {
    open: async (n) => mkCache(n),
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    match: async (req) => {
      for (const s of stores.values()) { const r = s.get(req.url || req); if (r) return r; }
      return undefined;
    }
  };
  const self = {
    location: { origin: 'https://contoh.test' },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: () => { log.skipWaiting++; },
    clients: { claim: () => { log.claim++; } }
  };
  const ctx = vm.createContext({
    self, caches, URL,
    fetch: async (req) => {
      if (!network) throw new Error('offline');
      return network(req);
    }
  });
  vm.runInContext(read('sw.js').toString(), ctx);
  const CACHE = vm.runInContext('CACHE', ctx);
  const SHELL = vm.runInContext('SHELL', ctx);

  async function dispatch(type, extra = {}) {
    let waited, responded;
    const e = Object.assign({ waitUntil: (p) => { waited = p; }, respondWith: (p) => { responded = p; } }, extra);
    handlers[type](e);
    if (waited) await waited;
    return responded === undefined ? undefined : await responded;
  }
  const req = (url, method = 'GET') => ({ url, method });
  return { stores, log, dispatch, req, CACHE, SHELL };
}

const res = (body, ok = true) => ({ body, ok, status: ok ? 200 : 404, clone() { return { body, ok, status: this.status }; } });

describe('sw.js', () => {
  test('semua fail SHELL wujud (jika tidak, install gagal)', () => {
    const { SHELL } = loadSW();
    for (const f of SHELL) {
      const p = f === './' ? 'index.html' : f.replace('./', '');
      assert.ok(fs.existsSync(path.join(ROOT, p)), f);
    }
  });

  test('install: cache SHELL + skipWaiting', async () => {
    const sw = loadSW();
    await sw.dispatch('install');
    assert.equal(sw.stores.get(sw.CACHE).size, sw.SHELL.length);
    assert.equal(sw.log.skipWaiting, 1);
  });

  test('activate: buang cache versi lama', async () => {
    const sw = loadSW();
    sw.stores.set('kunci-sekolah-v1', new Map());
    await sw.dispatch('install');
    await sw.dispatch('activate');
    assert.deepEqual([...sw.stores.keys()], [sw.CACHE]);
    assert.equal(sw.log.claim, 1);
  });

  test('POST & Google Apps Script tidak dipintas', async () => {
    const sw = loadSW();
    assert.equal(await sw.dispatch('fetch', { request: sw.req('https://contoh.test/x', 'POST') }), undefined);
    assert.equal(await sw.dispatch('fetch', { request: sw.req('https://script.google.com/macros/s/X/exec') }), undefined);
    assert.equal(await sw.dispatch('fetch', { request: sw.req('https://script.googleusercontent.com/x') }), undefined);
  });

  test('fail sendiri: network-first, fallback ke cache bila offline', async () => {
    const online = loadSW({ network: () => res('baru') });
    const r = await online.dispatch('fetch', { request: online.req('https://contoh.test/index.html') });
    assert.equal(r.body, 'baru');

    const offline = loadSW();
    await offline.dispatch('install');
    const r2 = await offline.dispatch('fetch', { request: offline.req('https://contoh.test/laluan-tiada') });
    assert.equal(r2.body, 'shell:./index.html', 'fallback ke index.html');
  });

  test('CDN: stale-while-revalidate', async () => {
    const sw = loadSW({ network: () => res('cdn-baru') });
    const r1 = await sw.dispatch('fetch', { request: sw.req('https://unpkg.com/lucide') });
    assert.equal(r1.body, 'cdn-baru');
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await sw.dispatch('fetch', { request: sw.req('https://unpkg.com/lucide') });
    assert.equal(r2.body, 'cdn-baru');
  });

  test('respons ralat (404/500) tidak di-cache — fail sendiri & CDN', async () => {
    const sw = loadSW({ network: () => res('tiada', false) });
    await sw.dispatch('fetch', { request: sw.req('https://contoh.test/logo.png') });
    await sw.dispatch('fetch', { request: sw.req('https://unpkg.com/lucide') });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(sw.log.put.length, 0);
  });

  test('respons berjaya di-cache', async () => {
    const sw = loadSW({ network: () => res('ok') });
    await sw.dispatch('fetch', { request: sw.req('https://contoh.test/logo.png') });
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(sw.log.put, ['https://contoh.test/logo.png']);
  });

  test('CDN opaque (tanpa CORS) di-cache supaya boleh luar talian; opaque sendiri tidak', async () => {
    const opaque = () => ({ body: 'x', ok: false, status: 0, type: 'opaque', clone() { return this; } });
    const sw = loadSW({ network: opaque });
    await sw.dispatch('fetch', { request: sw.req('https://cdn.tailwindcss.com/') });
    await sw.dispatch('fetch', { request: sw.req('https://contoh.test/x') });
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(sw.log.put, ['https://cdn.tailwindcss.com/']);
  });
});
