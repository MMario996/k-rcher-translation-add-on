'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');
const { makeFakeText } = require('./lib/gas-stubs');

const ctx = loadGasFiles(['Docs.gs']);

function attrs(bold) {
  // Every other attribute left null so applyDocAttrs_ skips those setters
  // and tests can assert on setBold alone.
  return { bold: bold, italic: null, underline: null, strikethrough: null, fontSize: null, fontFamily: null, foregroundColor: null };
}

test('applyTranslatedRunsToElement_ replaces a whole (non-partial) element via setText', () => {
  const txt = makeFakeText('Hello world', []);
  const el = {
    txt: txt,
    partial: false,
    runs: [
      { text: 'Hello ', attrs: attrs(false), batchIdx: 0 },
      { text: 'world', attrs: attrs(true), batchIdx: 1 }
    ]
  };

  ctx.applyTranslatedRunsToElement_(el, ['Hallo ', 'Welt']);

  assert.equal(txt.getText(), 'Hallo Welt');
  assert.deepEqual(txt.ops[0], ['setText', 'Hallo Welt']);
  assert.deepEqual(txt.ops.find((o) => o[0] === 'setBold' && o[3] === false), ['setBold', 0, 5, false]);
  assert.deepEqual(txt.ops.find((o) => o[0] === 'setBold' && o[3] === true), ['setBold', 6, 9, true]);
});

// Regression test for the selection-translate bug fix: a partial range
// selected inside a longer paragraph must only replace that range (via
// delete+insert at the correct absolute offsets), never the whole
// paragraph -- otherwise text outside the selection would be destroyed.
test('applyTranslatedRunsToElement_ replaces only the selected range for a partial element', () => {
  const txt = makeFakeText('The quick brown fox', []);
  const el = {
    txt: txt,
    partial: true,
    startOffset: 4,
    endOffsetInclusive: 8, // "quick"
    runs: [
      { text: 'quick', attrs: attrs(true), batchIdx: 0 }
    ]
  };

  ctx.applyTranslatedRunsToElement_(el, ['schnell']);

  assert.equal(txt.getText(), 'The schnell brown fox');
  assert.ok(txt.ops.some((o) => o[0] === 'deleteText' && o[1] === 4 && o[2] === 8));
  assert.ok(txt.ops.some((o) => o[0] === 'insertText' && o[1] === 4 && o[2] === 'schnell'));
  assert.ok(!txt.ops.some((o) => o[0] === 'setText'), 'must not overwrite the whole paragraph');
  assert.deepEqual(txt.ops.find((o) => o[0] === 'setBold'), ['setBold', 4, 10, true]);
});

test('applyTranslatedRunsToElement_ falls back to the original text for a missing translation', () => {
  const txt = makeFakeText('Hello world', []);
  const el = {
    txt: txt,
    partial: false,
    runs: [
      { text: 'Hello ', attrs: attrs(null), batchIdx: 0 },
      { text: 'world', attrs: attrs(null), batchIdx: 1 }
    ]
  };

  // Simulate a translation response that is missing the 2nd segment.
  ctx.applyTranslatedRunsToElement_(el, ['Hallo ']);

  assert.equal(txt.getText(), 'Hallo world');
});
