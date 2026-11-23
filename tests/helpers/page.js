// Memuatkan index.html dalam jsdom dengan fetch/localStorage/alert palsu.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const DEFAULT_URL = /var DEFAULT_URL = '([^']+)'/.exec(HTML)[1];

/**
 * @param {object} o
 *   ls: { key: value } nilai awal localStorage
 *   api: function(body, url) => objek JSON respons (atau throw untuk ralat rangkaian)
 */
function loadPage(o = {}) {
  const calls = [];
  const alerts = [];
  const dom = new JSDOM(HTML, {
    url: o.url || 'https://contoh.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.entries(o.ls || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.alert = (m) => alerts.push(m);
      w.scrollTo = () => {};
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : null;
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
  return { dom, w, $, calls, alerts, wait, hidden, submitAuth, close };
}

module.exports = { loadPage, DEFAULT_URL };
