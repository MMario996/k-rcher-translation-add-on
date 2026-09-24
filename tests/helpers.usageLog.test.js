'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');
const { makeDriveAppStub, makePropertiesServiceStub } = require('./lib/gas-stubs');

// Minimal in-memory "Usage Log" sheet: enough of the Sheet API for
// getLogSheet_() / logUsage_() (appendRow, header range writes, sizes).
function makeSheet(initialRows) {
  const rows = (initialRows || []).map((r) => r.slice());
  const lastCol = () => rows.reduce((m, r) => Math.max(m, r.length), 0);
  return {
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => lastCol(),
    appendRow: (r) => { rows.push(r.slice()); },
    setFrozenRows: () => {},
    getRange: (row, col) => {
      const range = {
        setValues: (vals) => {
          vals[0].forEach((v, i) => { rows[row - 1][col - 1 + i] = v; });
          return range;
        },
        setFontWeight: () => range
      };
      return range;
    }
  };
}

function loadCtx(sheet) {
  const ss = { getSheetByName: () => sheet, insertSheet: () => sheet };
  return loadGasFiles(['Config.gs', 'Helpers.gs', 'Api.gs'], {
    DriveApp: makeDriveAppStub(),
    PropertiesService: makePropertiesServiceStub({ ADMIN_USAGE_LOG_SHEET_ID: 'log-id' }),
    SpreadsheetApp: { openById: () => ss },
    Session: { getActiveUser: () => ({ getEmail: () => 'user@example.com' }) }
  });
}

test('a successful run is logged with Status OK and an empty Error cell', () => {
  const sheet = makeSheet();
  const ctx = loadCtx(sheet);
  ctx.logUsage_({ hostApp: 'DOCS', action: 'Selection', segments: 3, words: 10, engine: 'Phrase' });

  assert.deepEqual(Array.from(sheet.rows[0]), Array.from(ctx.LOG_HEADERS_));
  assert.equal(sheet.rows[1][10], 'OK');
  assert.equal(sheet.rows[1][11], '');
  assert.equal(typeof sheet.rows[1][12], 'number'); // Duration (s)
});

test('logFailure_ writes Status ERROR plus the message, even without settings', () => {
  const sheet = makeSheet();
  const ctx = loadCtx(sheet);
  ctx.logFailure_('SHEETS', 'Full Spreadsheet', undefined, new Error('Phrase API error (500): boom'));

  const row = sheet.rows[1];
  assert.equal(row[2], 'SHEETS');
  assert.equal(row[3], 'Full Spreadsheet');
  assert.equal(row[10], 'ERROR');
  assert.equal(row[11], 'Phrase API error (500): boom');
});

test('an existing 10-column log gets the Status/Error/Duration headers added once', () => {
  const oldHeaders = ['Timestamp', 'User', 'App', 'Action', 'Profile',
    'Source Lang', 'Target Lang', 'Segments', 'Words', 'Engine'];
  const sheet = makeSheet([oldHeaders]);
  const ctx = loadCtx(sheet);
  ctx.logUsage_({ hostApp: 'SLIDES', action: 'Selected Shapes' });

  assert.deepEqual(Array.from(sheet.rows[0]), Array.from(ctx.LOG_HEADERS_));
  assert.equal(sheet.rows[1][10], 'OK');
});
