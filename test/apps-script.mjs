// Runs apps-script/Code.gs in a Node VM with mocked Google services, against the
// captured MS Holdings API responses. Run: node test/apps-script.mjs
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { handle, calls } from './fixtures.mjs';

/* ---- Utilities (subset of Java SimpleDateFormat used by Code.gs) ---- */
function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
    weekday: 'short', hour12: true, timeZoneName: 'short',
  });
  return Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const Utilities = {
  formatDate(date, tz, pattern) {
    const p = partsIn(date, tz);
    const map = {
      yyyy: p.year, MMM: MONTHS[p.month - 1], MM: String(p.month).padStart(2, '0'), dd: String(p.day).padStart(2, '0'),
      d: String(p.day), EEE: p.weekday, h: String(p.hour), mm: p.minute, a: p.dayPeriod, z: p.timeZoneName,
    };
    return pattern.replace(/yyyy|MMM|MM|dd|EEE|d|h|mm|a|z/g, (t) => map[t]);
  },
  parseDate(str, tz, pattern) {
    assert.equal(pattern, 'yyyy-MM-dd');
    const [y, m, d] = str.split('-').map(Number);
    // midnight in tz: start from UTC midnight and shift by that zone's offset
    const guess = new Date(Date.UTC(y, m - 1, d));
    const p = partsIn(guess, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 12 + (p.dayPeriod === 'PM' ? 12 : 0), Number(p.minute));
    return new Date(guess.getTime() + (guess.getTime() - asUtc));
  },
  sleep() {},
};

/* ---- UrlFetchApp backed by the fixtures ---- */
const UrlFetchApp = {
  fetch(url, opts) {
    const { status, json } = handle(opts.method.toUpperCase(), url, opts.payload ? JSON.parse(opts.payload) : null, opts.headers.Authorization);
    return { getResponseCode: () => status, getContentText: () => JSON.stringify(json) };
  },
};
const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k === 'HUBSPOT_ACCESS_TOKEN' ? 'test-token' : null) }) };

/* ---- SpreadsheetApp: record cell values/links; everything else is a chainable no-op ---- */
function chain(onCall) {
  const p = new Proxy(function () {}, { get: (_, name) => (...args) => (onCall?.(name, args), p) });
  return p;
}
const sheets = [];
function makeSheet(name) {
  const cells = {};
  const sheet = {
    name, cells, ops: [],
    getName: () => name,
    getLastRow: () => Object.keys(cells).length ? Math.max(...Object.keys(cells).map((k) => +k.split(',')[0])) : 0,
    getRange(r, c, nr = 1, nc = 1) {
      return chain((op, args) => {
        sheet.ops.push(op);
        if (op === 'setValue') cells[`${r},${c}`] = args[0];
        if (op === 'setValues' || op === 'setRichTextValues') {
          assert.equal(args[0].length, nr, `${op} row count`);
          args[0].forEach((row, i) => { assert.equal(row.length, nc, `${op} col count`); row.forEach((v, j) => { cells[`${r + i},${c + j}`] = v; }); });
        }
      });
    },
  };
  for (const m of ['setFrozenRows', 'setColumnWidth', 'activate']) sheet[m] = () => sheet;
  return sheet;
}
const ss = {
  setSpreadsheetTimeZone() {},
  getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
  getSheets: () => sheets,
  insertSheet(name, idx) { const s = makeSheet(name); sheets.splice(idx, 0, s); return s; },
  deleteSheet(s) { sheets.splice(sheets.indexOf(s), 1); },
};
sheets.push(makeSheet('Sheet1'));
const SpreadsheetApp = {
  getActive: () => ss,
  newRichTextValue() {
    const v = {};
    const b = { setText: (t) => ((v.text = t), b), setLinkUrl: (u) => ((v.url = u), b), build: () => ({ rich: true, ...v }) };
    return b;
  },
};

/* ---- run ---- */
const ctx = vm.createContext({ Utilities, UrlFetchApp, PropertiesService, SpreadsheetApp, console });
vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx, { filename: 'Code.gs' });

// Friday Nov 27 2026, 4:30pm ET — the first scheduled run
vm.runInContext("updateWeeklyTasks(new Date('2026-11-27T21:30:00Z'))", ctx);

// Re-run the same week: must replace, not duplicate, the tab
vm.runInContext("updateWeeklyTasks(new Date('2026-11-27T22:00:00Z'))", ctx);

/* ---- checks ---- */
assert.deepEqual(sheets.map((s) => s.name), ['Week of Nov 30, 2026'], 'one weekly tab, starter Sheet1 removed');
const tab = sheets[0];
const cell = (r, c) => tab.cells[`${r},${c}`];
const show = (v) => (v && v.rich ? `${v.text}${v.url ? ' ⟶ ' + v.url.replace(/^https:\/\/app-na2\.hubspot\.com/, '') : ''}` : v?.constructor?.name === 'Date' ? v.toISOString() : String(v ?? ''));

console.log(`Tab: ${tab.name}`);
console.log(cell(1, 1));
console.log(cell(2, 1));
const headers = Array.from({ length: 15 }, (_, i) => cell(4, i + 1));
console.log(headers.join(' | '));
let r = 5;
while (cell(r, 1) !== undefined) {
  const row = headers.map((h, i) => [h, show(cell(r, i + 1))]);
  console.log(`\nRow ${r}:`);
  row.filter(([, v]) => v).forEach(([h, v]) => console.log(`  ${h.padEnd(13)} ${v.replace(/\n/g, ' ⏎ ').slice(0, 140)}`));
  r++;
}

// Spot checks
assert.match(cell(1, 1), /Edward Sarkisyan/);
assert.equal(cell(5, 1), 'Upcoming');
assert.equal(show(cell(5, 7)).startsWith('Brad Williamson'), true);
assert.equal(cell(5, 10), "'+17866462580", 'phone protected from formula parsing');
assert.match(cell(5, 13), /^Nov 3, 2026 — Dianne Marie Araneta\nEd's note/);
assert.equal(cell(5, 14), '', 'shared contact/company note de-duplicated');
assert.equal(cell(7, 1), 'Overdue');
assert.equal(cell(7, 3), 196, 'days overdue counted from run time');
assert.equal(cell(5, 5), '', 'NONE priority shown blank');
assert.equal(cell(7, 5), 'High');
const athena = Object.keys(tab.cells).find((k) => show(tab.cells[k]).startsWith('Follow up with Athena'));
const aRow = +athena.split(',')[0];
assert.equal(Utilities.formatDate(cell(aRow, 2), 'America/New_York', 'yyyy-MM-dd'), '2026-04-02', 'date-only due shows the right day');
assert.ok(tab.ops.includes('createFilter'));
console.log(`\n✓ all checks passed (${calls.length} API calls over 2 runs)`);
