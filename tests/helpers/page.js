// Memuatkan index.html dalam jsdom dengan fetch/localStorage/alert palsu.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SUPABASE_URL = 'https://ckbribtplsmipkrlphgj.supabase.co';
const SUPABASE_KEY = 'kunci-ujian';
// Kunci sebenar ditetapkan dalam index.html; ujian guna kunci palsu
const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8')
  .replace(/var SUPABASE_KEY = '[^']*';/, "var SUPABASE_KEY = '" + SUPABASE_KEY + "';");

/**
 * @param {object} o
 *   ls: { key: value } nilai awal localStorage
 *   api: function(body, url) => objek JSON respons (atau throw untuk ralat rangkaian)
 */
function loadPage(o = {}) {
  const calls = [];
  const alerts = [];
  const sockets = [];
  const confirms = [];
  const dom = new JSDOM(HTML, {
    url: o.url || 'https://contoh.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.entries(o.ls || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.alert = (m) => alerts.push(m);
      w.confirm = (m) => { confirms.push(m); return o.confirm !== false; };
      // WebSocket palsu: tiada sambungan sebenar; ujian mengawal onopen/onmessage/onclose
      w.WebSocket = class {
        constructor(url) { this.url = url; this.sent = []; this.closed = false; sockets.push(this); }
        send(m) { this.sent.push(JSON.parse(m)); }
        close() { this.closed = true; if (this.onclose) this.onclose(); }
        _buka() { if (this.onopen) this.onopen(); }
        _mesej(obj) { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }
      };
      w.scrollTo = () => {};
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body).b : null; // badan RPC: {b: {action, ...}}
        calls.push({ url, init, body });
        const r = o.api ? await o.api(body, url) : { ok: false, error: 'tiada api' };
        return { ok: true, status: 200, text: async () => JSON.stringify(r) };
      };
      // Elak ralat pendaftaran SW dalam jsdom
      Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => Promise.resolve() }, configurable: true });
    }
  });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const hidden = (id) => $(id).classList.contains('hidden');
  const submitAuth = () => $('formAuth').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  const close = () => w.close();
  return { dom, w, $, calls, alerts, sockets, confirms, wait, hidden, submitAuth, close };
}

module.exports = { loadPage, SUPABASE_URL, SUPABASE_KEY };
