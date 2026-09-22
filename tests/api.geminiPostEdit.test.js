'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');
const { makeDriveAppStub, makePropertiesServiceStub, makeUrlFetchAppStub } = require('./lib/gas-stubs');

// geminiPostEditTexts_ (Api.gs) needs GEMINI_BASE_URL from the Gemini config
// file, langLabel_ from Helpers.gs (which in turn needs Config.gs's CONFIG
// and a DriveApp stub for its module-load-time DriveApp.Access reference),
// plus PropertiesService (for the GEMINI_PE_ENABLED toggle and
// GEMINI_API_KEY) and UrlFetchApp (for the batched fetchAll() call).
function loadCtx(scriptProps, fetchAllHandler) {
  const fetchAllCalls = [];
  const urlFetchApp = makeUrlFetchAppStub((req, i) => {
    fetchAllCalls.push(req);
    return fetchAllHandler(req, i);
  });

  const ctx = loadGasFiles(
    ['Config.gs', 'Config gemini ergaenzung.gs', 'Helpers.gs', 'Api.gs'],
    {
      DriveApp: makeDriveAppStub(),
      PropertiesService: makePropertiesServiceStub(scriptProps),
      UrlFetchApp: urlFetchApp
    }
  );

  return { ctx, fetchAllCalls };
}

function geminiJsonResponse(resultsArray) {
  return {
    code: 200,
    body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ results: resultsArray }) }] } }]
    })
  };
}

test('skips the PE pass entirely when GEMINI_PE_ENABLED is "false" (no network call)', () => {
  const { ctx, fetchAllCalls } = loadCtx(
    { GEMINI_API_KEY: 'test-key', GEMINI_PE_ENABLED: 'false' },
    () => geminiJsonResponse([])
  );

  const translations = ['Die Pumpe ist bereit.'];
  const result = ctx.geminiPostEditTexts_(['The pump is ready.'], translations, 'en', 'de', 'TECHNICAL');

  assert.deepEqual(result, translations);
  assert.equal(fetchAllCalls.length, 0);
});

test('skips the PE pass when no GEMINI_API_KEY is configured (fails open, no throw)', () => {
  const { ctx, fetchAllCalls } = loadCtx({}, () => geminiJsonResponse([]));

  const translations = ['Die Pumpe ist bereit.'];
  const result = ctx.geminiPostEditTexts_(['The pump is ready.'], translations, 'en', 'de', 'TECHNICAL');

  assert.deepEqual(result, translations);
  assert.equal(fetchAllCalls.length, 0);
});

test('applies a corrected segment returned by Gemini', () => {
  const { ctx } = loadCtx(
    { GEMINI_API_KEY: 'test-key' },
    () => geminiJsonResponse([{ id: 0, corrected: 'Die Pumpe ist einsatzbereit.', changed: true }])
  );

  const result = ctx.geminiPostEditTexts_(
    ['The pump is ready.'], ['Die Pumpe ist bereit.'], 'en', 'de', 'TECHNICAL'
  );

  assert.equal(result[0], 'Die Pumpe ist einsatzbereit.');
  assert.equal(ctx.TRANSLATION_STATS_.usedGeminiPostEdit, true);
});

test('leaves a segment untouched when Gemini reports changed=false', () => {
  const { ctx } = loadCtx(
    { GEMINI_API_KEY: 'test-key' },
    () => geminiJsonResponse([{ id: 0, corrected: 'Die Pumpe ist bereit.', changed: false }])
  );

  const result = ctx.geminiPostEditTexts_(
    ['The pump is ready.'], ['Die Pumpe ist bereit.'], 'en', 'de', 'TECHNICAL'
  );

  assert.equal(result[0], 'Die Pumpe ist bereit.');
  assert.equal(ctx.TRANSLATION_STATS_.usedGeminiPostEdit, false);
});

test('fails open on a non-2xx Gemini response — keeps the original translation', () => {
  const { ctx } = loadCtx(
    { GEMINI_API_KEY: 'test-key' },
    () => ({ code: 500, body: 'Internal Server Error' })
  );

  const translations = ['Die Pumpe ist bereit.'];
  const result = ctx.geminiPostEditTexts_(['The pump is ready.'], translations, 'en', 'de', 'TECHNICAL');

  assert.deepEqual(result, translations);
});

test('fails open on an unparsable Gemini response — keeps the original translation', () => {
  const { ctx } = loadCtx(
    { GEMINI_API_KEY: 'test-key' },
    () => ({ code: 200, body: 'not json at all' })
  );

  const translations = ['Die Pumpe ist bereit.'];
  const result = ctx.geminiPostEditTexts_(['The pump is ready.'], translations, 'en', 'de', 'TECHNICAL');

  assert.deepEqual(result, translations);
});

test('fails open when UrlFetchApp.fetchAll itself throws (e.g. network error)', () => {
  const { ctx } = loadCtx({ GEMINI_API_KEY: 'test-key' }, () => {
    throw new Error('network unreachable');
  });

  const translations = ['Die Pumpe ist bereit.'];
  const result = ctx.geminiPostEditTexts_(['The pump is ready.'], translations, 'en', 'de', 'TECHNICAL');

  assert.deepEqual(result, translations);
});

test('ignores a corrected id that falls outside the batch bounds', () => {
  const { ctx } = loadCtx(
    { GEMINI_API_KEY: 'test-key' },
    () => geminiJsonResponse([{ id: 5, corrected: 'Should not apply.', changed: true }])
  );

  const translations = ['Die Pumpe ist bereit.'];
  const result = ctx.geminiPostEditTexts_(['The pump is ready.'], translations, 'en', 'de', 'TECHNICAL');

  assert.deepEqual(result, translations);
});

test('splits segments into parallel batches of GEMINI_PE_BATCH_SIZE and fires them via fetchAll', () => {
  const { ctx, fetchAllCalls } = loadCtx(
    { GEMINI_API_KEY: 'test-key' },
    () => geminiJsonResponse([])
  );

  const count = ctx.GEMINI_PE_BATCH_SIZE * 2 + 3; // spans 3 batches
  const sourceTexts = Array.from({ length: count }, (_, i) => 'source ' + i);
  const translations = Array.from({ length: count }, (_, i) => 'target ' + i);

  ctx.geminiPostEditTexts_(sourceTexts, translations, 'en', 'de', 'TECHNICAL');

  assert.equal(fetchAllCalls.length, 3);
});

test('picks the matching PE prompt per profile: MARKETING, TECHNICAL, GENERAL', () => {
  const cases = [
    { profile: 'MARKETING', expect: /KÄRCHER MARKETING/ },
    { profile: 'TECHNICAL', expect: /TECHNISCHE DOKUMENTATION/ },
    { profile: 'GENERAL',   expect: /KÄRCHER ALLGEMEIN/ }
  ];

  cases.forEach(({ profile, expect }) => {
    const { ctx, fetchAllCalls } = loadCtx({ GEMINI_API_KEY: 'test-key' }, () => geminiJsonResponse([]));
    ctx.geminiPostEditTexts_(['Clean power.'], ['Saubere Kraft.'], 'en', 'de', profile);
    const payload = JSON.parse(fetchAllCalls[0].payload);
    const prompt = payload.contents[0].parts[0].text;
    assert.match(prompt, expect, `profile ${profile} should use its own PE prompt`);
  });
});

test('falls back to the TECHNICAL PE prompt for an unknown/unset profile', () => {
  const { ctx, fetchAllCalls } = loadCtx({ GEMINI_API_KEY: 'test-key' }, () => geminiJsonResponse([]));
  ctx.geminiPostEditTexts_(['Clean power.'], ['Saubere Kraft.'], 'en', 'de', 'SOME_UNKNOWN_PROFILE');
  const payload = JSON.parse(fetchAllCalls[0].payload);
  const prompt = payload.contents[0].parts[0].text;
  assert.match(prompt, /TECHNISCHE DOKUMENTATION/);
});
