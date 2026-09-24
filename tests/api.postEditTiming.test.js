'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');
const { makeDriveAppStub, makePropertiesServiceStub, makeUrlFetchAppStub } = require('./lib/gas-stubs');

// apiTranslateTexts_ (used by Docs, Sheets and Slides) runs the Gemini
// post-edit pass, but only within the run's time budget, in small parallel
// batches and with Gemini's "thinking" switched off. Phrase answers via
// fetch(), the PE pass via fetchAll().
function loadCtx(extraProps, peHandler) {
  const calls = { fetchAll: [] };
  const phraseStub = makeUrlFetchAppStub((req) => ({
    code: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ translations: JSON.parse(req.__payload).sourceTexts.map(() => 'Die Pumpe ist bereit.') })
  }));
  const defaultPe = () => ({
    code: 200,
    body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        results: [{ id: 0, corrected: 'Die Pumpe ist einsatzbereit.', changed: true }]
      }) }] } }]
    })
  });
  const props = makePropertiesServiceStub(Object.assign(
    { PHRASE_API_TOKEN: 'tok-1234567890', GEMINI_API_KEY: 'k' }, extraProps || {}
  ));

  const ctx = loadGasFiles(
    ['Config.gs', 'Config gemini ergaenzung.gs', 'Helpers.gs', 'Api.gs'],
    {
      DriveApp: makeDriveAppStub(),
      PropertiesService: props,
      UrlFetchApp: {
        fetch: (url, opts) => phraseStub.fetch({ __payload: opts.payload }),
        fetchAll: (reqs) => {
          calls.fetchAll.push(reqs);
          return makeUrlFetchAppStub(peHandler || defaultPe).fetchAll(reqs);
        }
      }
    }
  );
  ctx.resetTranslationStats_();
  return { ctx, calls, props };
}

test('post-edit runs for every host (no opt-in flag needed)', () => {
  const { ctx, calls } = loadCtx();
  const out = ctx.apiTranslateTexts_('uid', ['The pump is ready.'], 'en', 'de', 'TECHNICAL');
  assert.deepEqual(Array.from(out), ['Die Pumpe ist einsatzbereit.']);
  assert.equal(calls.fetchAll.length, 1);
});

test('post-edit is skipped once the run has used up its time budget', () => {
  const { ctx, calls } = loadCtx();
  ctx.RUN_START_MS_ = Date.now() - ctx.GEMINI_PE_TIME_BUDGET_MS_ - 1;
  const out = ctx.apiTranslateTexts_('uid', ['The pump is ready.'], 'en', 'de', 'TECHNICAL');
  assert.deepEqual(Array.from(out), ['Die Pumpe ist bereit.']);
  assert.equal(calls.fetchAll.length, 0);
});

test('segments go out in parallel batches of 10 with thinking switched off', () => {
  const { ctx, calls } = loadCtx();
  const texts = Array.from({ length: 25 }, (_, i) => 'Text ' + i);
  ctx.apiTranslateTexts_('uid', texts, 'en', 'de', 'TECHNICAL');

  const reqs = calls.fetchAll[0];
  assert.equal(reqs.length, 3);
  const cfg = JSON.parse(reqs[0].payload).generationConfig;
  assert.deepEqual(cfg.thinkingConfig, { thinkingLevel: 'minimal' });
});

test('a 400 about thinkingConfig disables the field for later runs (and keeps the translation)', () => {
  const { ctx, calls, props } = loadCtx({}, () => ({
    code: 400, body: '{"error":{"message":"Unknown name \\"thinkingConfig\\""}}'
  }));
  const out = ctx.apiTranslateTexts_('uid', ['The pump is ready.'], 'en', 'de', 'TECHNICAL');
  assert.deepEqual(Array.from(out), ['Die Pumpe ist bereit.']);
  assert.equal(props._scriptProps.GEMINI_PE_THINKING_UNSUPPORTED, 'true');

  ctx.apiTranslateTexts_('uid', ['The pump is ready.'], 'en', 'de', 'TECHNICAL');
  const cfg = JSON.parse(calls.fetchAll[1][0].payload).generationConfig;
  assert.equal(cfg.thinkingConfig, undefined);
});
