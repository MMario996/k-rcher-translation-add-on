'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');
const { makeFakeText } = require('./lib/gas-stubs');

const ctx = loadGasFiles(['Docs.gs']);

test('detectDocRuns_ finds a single formatting boundary within one 20-char step', () => {
  // 40 chars, bold in [10, 30) -- exercises the stepping algorithm's
  // within-window refinement (RUN_DETECT_STEP_ === 20).
  const text = 'a'.repeat(40);
  const txt = makeFakeText(text, [[10, 30]]);

  const runs = ctx.mergeAdjacentRuns_(ctx.detectDocRuns_(txt, text, 0));

  assert.equal(runs.length, 3);
  assert.equal(runs[0].text, text.slice(0, 10));
  assert.equal(runs[0].attrs.bold, false);
  assert.equal(runs[1].text, text.slice(10, 30));
  assert.equal(runs[1].attrs.bold, true);
  assert.equal(runs[2].text, text.slice(30, 40));
  assert.equal(runs[2].attrs.bold, false);
});

test('detectDocRuns_ honors a non-zero offset for a partial selection', () => {
  // Simulates a paragraph "The quick brown fox jumps" where only the
  // substring starting at absolute index 4 ("quick brown fox jumps") is
  // selected, and formatting is bold starting at absolute index 10
  // ("brown fox jumps") -- i.e. relative index 6 within the segment.
  const fullText = 'The quick brown fox jumps';
  const segment = fullText.slice(4); // "quick brown fox jumps"
  const txt = makeFakeText(fullText, [[10, fullText.length]]);

  const runs = ctx.detectDocRuns_(txt, segment, 4);

  assert.equal(runs.length, 2);
  assert.equal(runs[0].text, 'quick '); // relative [0, 6)
  assert.equal(runs[0].attrs.bold, false);
  assert.equal(runs[1].text, 'brown fox jumps'); // relative [6, end)
  assert.equal(runs[1].attrs.bold, true);
});

test('mergeAdjacentRuns_ merges consecutive runs with identical attributes', () => {
  const attrsA = { bold: false, italic: false, underline: false, strikethrough: false, fontSize: 11, fontFamily: 'Arial', foregroundColor: '#000000' };
  const attrsB = { bold: true, italic: false, underline: false, strikethrough: false, fontSize: 11, fontFamily: 'Arial', foregroundColor: '#000000' };

  const runs = [
    { text: 'foo', attrs: attrsA },
    { text: 'bar', attrs: attrsA },
    { text: 'baz', attrs: attrsB }
  ];

  const merged = ctx.mergeAdjacentRuns_(runs);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].text, 'foobar');
  assert.equal(merged[1].text, 'baz');
});

test('docAttrsEqual_ compares every tracked attribute', () => {
  const base = { bold: true, italic: false, underline: false, strikethrough: false, fontSize: 11, fontFamily: 'Arial', foregroundColor: '#000000' };
  const same = Object.assign({}, base);
  const different = Object.assign({}, base, { fontSize: 12 });

  assert.equal(ctx.docAttrsEqual_(base, same), true);
  assert.equal(ctx.docAttrsEqual_(base, different), false);
});
