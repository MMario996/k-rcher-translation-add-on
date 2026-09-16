'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');
const { makeDriveAppStub } = require('./lib/gas-stubs');

// Helpers.gs references DriveApp.Access at module-load time (see
// NO_EDIT_ACCESS_LEVELS_), and CONFIG.* inside several functions, so both
// need to be present before the file can even be loaded.
const ctx = loadGasFiles(['Config.gs', 'Helpers.gs'], { DriveApp: makeDriveAppStub() });

test('countWords_ counts whitespace-separated words across multiple texts', () => {
  const total = ctx.countWords_(['Hello world', 'Kaercher cleans professionally']);
  assert.equal(total, 5);
});

test('countWords_ ignores empty, whitespace-only and null entries', () => {
  const total = ctx.countWords_(['  ', '', null, undefined, 'one two']);
  assert.equal(total, 2);
});

test('countWords_ collapses multiple internal spaces', () => {
  const total = ctx.countWords_(['one    two\tthree']);
  assert.equal(total, 3);
});

test('checkSizeLimit_ does not throw below the warn threshold', () => {
  assert.doesNotThrow(() => ctx.checkSizeLimit_(10, 'cells'));
});

test('checkSizeLimit_ does not throw between warn and block thresholds', () => {
  const between = ctx.CONFIG.MAX_ELEMENTS_WARN + 1;
  assert.ok(between <= ctx.CONFIG.MAX_ELEMENTS_BLOCK);
  assert.doesNotThrow(() => ctx.checkSizeLimit_(between, 'cells'));
});

test('checkSizeLimit_ throws above the block threshold', () => {
  const tooMany = ctx.CONFIG.MAX_ELEMENTS_BLOCK + 1;
  assert.throws(
    () => ctx.checkSizeLimit_(tooMany, 'cells'),
    /Too many cells/
  );
});

test('langLabel_ resolves a known language code', () => {
  assert.equal(ctx.langLabel_('de'), 'German');
});

test('langLabel_ has a dedicated label for "auto"', () => {
  assert.equal(ctx.langLabel_('auto'), 'Auto-detect');
});

test('langLabel_ passes through an unknown code unchanged', () => {
  assert.equal(ctx.langLabel_('xx'), 'xx');
});

// Regression test for the write-access check: comment-only Drive access must
// be treated the same as view-only access (neither allows editing content),
// otherwise a comment-only user passes checkWriteAccess_ and only hits a
// generic Apps Script error once the translation tries to write.
test('hasNoEditAccess_ rejects NONE, VIEW and COMMENT access', () => {
  assert.equal(ctx.hasNoEditAccess_(ctx.DriveApp.Access.NONE), true);
  assert.equal(ctx.hasNoEditAccess_(ctx.DriveApp.Access.VIEW), true);
  assert.equal(ctx.hasNoEditAccess_(ctx.DriveApp.Access.COMMENT), true);
});

test('hasNoEditAccess_ accepts EDIT and OWNER access', () => {
  assert.equal(ctx.hasNoEditAccess_(ctx.DriveApp.Access.EDIT), false);
  assert.equal(ctx.hasNoEditAccess_(ctx.DriveApp.Access.OWNER), false);
});
