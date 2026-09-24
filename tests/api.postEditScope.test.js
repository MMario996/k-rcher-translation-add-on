'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');
const { makeDriveAppStub, makePropertiesServiceStub, makeUrlFetchAppStub } = require('./lib/gas-stubs');

// apiTranslateTexts_ must only run the Gemini post-edit pass when the caller
// explicitly opts in (Slides). Phrase answers via fetch(), the PE pass via
// fetchAll(), so counting fetchAll() calls tells us whether PE ran.
function loadCtx() {
  const calls = { fetch: 0, fetchAll: 0 };
  const phraseOk = {
    code: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ translations: [{ translation: 'Die Pumpe ist bereit.' }] })
  };
  const peOk = {
    code: 200,
    body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        results: [{ id: 0, corrected: 'Die Pumpe ist einsatzbereit.', changed: true }]
      }) }] } }]
    })
  };

  const stub = makeUrlFetchAppStub(() => phraseOk);
  const urlFetchApp = {
    fetch: (url, opts) => { calls.fetch++; return stub.fetch(url, opts); },
    fetchAll: (reqs) => { calls.fetchAll++; return makeUrlFetchAppStub(() => peOk).fetchAll(reqs); }
  };

  const ctx = loadGasFiles(
    ['Config.gs', 'Config gemini ergaenzung.gs', 'Helpers.gs', 'Api.gs'],
    {
      DriveApp: makeDriveAppStub(),
      PropertiesService: makePropertiesServiceStub({ PHRASE_API_TOKEN: 'tok-1234567890', GEMINI_API_KEY: 'k' }),
      UrlFetchApp: urlFetchApp
    }
  );
  ctx.resetTranslationStats_();
  return { ctx, calls };
}

test('Docs/Sheets path (no usePostEdit flag) skips the Gemini post-edit pass', () => {
  const { ctx, calls } = loadCtx();
  const out = ctx.apiTranslateTexts_('uid', ['The pump is ready.'], 'en', 'de', 'TECHNICAL');
  assert.deepEqual(Array.from(out), ['Die Pumpe ist bereit.']);
  assert.equal(calls.fetchAll, 0);
  assert.equal(ctx.TRANSLATION_STATS_.usedGeminiPostEdit, false);
});

test('Slides path (usePostEdit=true) runs the Gemini post-edit pass', () => {
  const { ctx, calls } = loadCtx();
  const out = ctx.apiTranslateTexts_('uid', ['The pump is ready.'], 'en', 'de', 'TECHNICAL', true);
  assert.deepEqual(Array.from(out), ['Die Pumpe ist einsatzbereit.']);
  assert.equal(calls.fetchAll, 1);
});

test('post-edit is skipped once the run has used up its time budget', () => {
  const { ctx, calls } = loadCtx();
  ctx.RUN_START_MS_ = Date.now() - ctx.GEMINI_PE_TIME_BUDGET_MS_ - 1;
  const out = ctx.apiTranslateTexts_('uid', ['The pump is ready.'], 'en', 'de', 'TECHNICAL', true);
  assert.deepEqual(Array.from(out), ['Die Pumpe ist bereit.']);
  assert.equal(calls.fetchAll, 0);
});
