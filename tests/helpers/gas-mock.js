// Mock ringkas untuk servis Google Apps Script supaya Code.gs boleh diuji dalam Node.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const CODE = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.gs'), 'utf8');

function colToNum(s) {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseA1(a1) {
  const m = /^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(a1);
  if (!m) throw new Error('A1 tidak disokong: ' + a1);
  const c1 = colToNum(m[1]);
  const r1 = Number(m[2] || 1);
  const c2 = m[3] ? colToNum(m[3]) : c1;
  const r2 = m[4] ? Number(m[4]) : (m[3] ? 1000 : r1);
  return { row: r1, col: c1, nr: r2 - r1 + 1, nc: c2 - c1 + 1 };
}

class Range {
  constructor(sheet, row, col, nr, nc) {
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setFormulas(vals) { return this.setValues(vals); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class Sheet {
  constructor(name, data) { this.name = name; this.data = data || []; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const p = parseA1(a);
      return new Range(this, p.row, p.col, p.nr, p.nc);
    }
    return new Range(this, a, b, c || 1, d || 1);
  }
  appendRow(arr) { this.data.push(arr.slice()); }
  clear() { this.data = []; }
  setFrozenRows() {}
  setColumnWidths() {}
}

class Spreadsheet {
  constructor(sheets) { this.sheets = sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  setSpreadsheetTimeZone() {}
}

// Format tarikh ala Java SimpleDateFormat, zon tetap +08:00 (Asia/Kuala_Lumpur, tiada DST)
function formatDate(d, _tz, fmt) {
  const s = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const map = {
    yyyy: p(s.getUTCFullYear(), 4), MM: p(s.getUTCMonth() + 1), dd: p(s.getUTCDate()),
    HH: p(s.getUTCHours()), H: String(s.getUTCHours()), h: String(s.getUTCHours() % 12 || 12), mm: p(s.getUTCMinutes()), ss: p(s.getUTCSeconds()), XXX: '+08:00'
  };
  return fmt.replace(/yyyy|MM|dd|HH|H|h|mm|ss|XXX|'[^']*'/g, (t) => (t[0] === "'" ? t.slice(1, -1) : map[t]));
}

/**
 * Muatkan Code.gs ke dalam konteks VM dengan mock.
 * @param {object} opts
 *   bilik: [[id, nama], ...]   guru: [nama, ...]   log: [[masaISO, id, guru, tindakan], ...]
 *   extraSheets: [nama tab lain]   throwOnOpen: Error
 */
function loadGas(opts = {}) {
  const calls = { alerts: [], lock: [] };
  const cache = {};
  const props = {};
  const sandbox = { console };
  const ctx = vm.createContext(sandbox);
  // Date mesti dari realm konteks supaya `instanceof Date` dalam Code.gs berfungsi
  const CtxDate = vm.runInContext('Date', ctx);
  const D = (iso) => new CtxDate(iso);

  const sheets = [];
  (opts.extraSheets || []).forEach((n) => sheets.push(new Sheet(n)));
  if (opts.bilik) {
    sheets.push(new Sheet('Nama_Bilik', [['ID_Kunci', 'Nama_Bilik', 'Status_Semasa', 'Pemegang_Terkini', 'Masa_Terkini'], ...opts.bilik.map((r) => r.slice())]));
  }
  if (opts.guru) {
    sheets.push(new Sheet('Nama_Guru', [['Nama_Guru', 'Jawatan'], ...opts.guru.map((g) => [g, ''])]));
  }
  if (opts.log) {
    sheets.push(new Sheet('Log_Imbas', [['Masa', 'ID_Kunci', 'Nama_Guru', 'Tindakan'], ...opts.log.map((r) => [typeof r[0] === 'string' && /^\d{4}-/.test(r[0]) ? D(r[0]) : r[0], r[1], r[2], r[3]])]));
  }
  const ss = new Spreadsheet(sheets);

  Object.assign(sandbox, {
    SpreadsheetApp: {
      getActiveSpreadsheet() { if (opts.throwOnOpen) throw opts.throwOnOpen; return ss; },
      flush() {},
      getUi() { return { alert: (m) => calls.alerts.push(m) }; }
    },
    Utilities: {
      formatDate,
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64')
    },
    CacheService: {
      getScriptCache() {
        return {
          get: (k) => (k in cache ? cache[k] : null),
          put: (k, v) => { cache[k] = String(v); },
          remove: (k) => { delete cache[k]; }
        };
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty: (k) => (k in props ? props[k] : null),
          setProperty: (k, v) => { props[k] = String(v); },
          deleteProperty: (k) => { delete props[k]; },
          getProperties: () => Object.assign({}, props)
        };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock: (ms) => calls.lock.push('wait:' + ms),
          releaseLock: () => calls.lock.push('release')
        };
      }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput(html) {
        return {
          content: html, title: '', xfo: null,
          setTitle(t) { this.title = t; return this; },
          addMetaTag() { return this; },
          setXFrameOptionsMode(m) { this.xfo = m; return this; },
          getContent() { return this.content; }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(s) {
        return {
          content: s, mime: null,
          setMimeType(m) { this.mime = m; return this; },
          getContent() { return this.content; }
        };
      }
    }
  });

  vm.runInContext(CODE, ctx, { filename: 'Code.gs' });
  const get = (expr) => vm.runInContext(expr, ctx);
  // Panggil fungsi Code.gs dan tukar hasil ke objek realm hos (untuk deepStrictEqual)
  const call = (fn, ...args) => {
    const r = ctx[fn](...args);
    return r === undefined ? r : JSON.parse(JSON.stringify(r));
  };
  return { ctx, ss, calls, cache, props, D, get, call, sheet: (n) => ss.getSheetByName(n) };
}

module.exports = { loadGas, formatDate };
