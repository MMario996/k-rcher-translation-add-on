'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./lib/load-gs');

// Api.gs's postProcessTranslations_ doesn't touch any Apps Script service
// directly, so it can be loaded on its own with no stubs.
const ctx = loadGasFiles(['Api.gs']);
const postProcessTranslations_ = ctx.postProcessTranslations_;

test('restores an uppercase protected abbreviation the MT engine lower-cased', () => {
  const texts = ['Die FSG-PS Maschine ist zuverlaessig.'];
  const translations = ['The fsg-ps machine is reliable.'];

  const result = postProcessTranslations_(texts, translations);

  assert.equal(result[0], 'The FSG-PS machine is reliable.');
});

test('restores a lowercase protected abbreviation the MT engine upper-cased', () => {
  const texts = ['das cf geraet ist neu'];
  const translations = ['the CF device is new'];

  const result = postProcessTranslations_(texts, translations);

  assert.equal(result[0], 'the cf device is new');
});

test('does not touch abbreviation-like substrings inside longer words', () => {
  const texts = ['We will CHANGE the plan.'];
  const translations = ['We will CHANGE the plan.'];

  const result = postProcessTranslations_(texts, translations);

  // "CH" is a protected abbreviation, but \b...\b must not match inside CHANGE.
  assert.equal(result[0], 'We will CHANGE the plan.');
});

test('rewrites a spelled-out AKW translation back to the abbreviation', () => {
  const texts = ['Das AKW wurde abgeschaltet.'];
  const translations = ['The Nuclear Power Plant was shut down.'];

  const result = postProcessTranslations_(texts, translations);

  assert.equal(result[0], 'The AKW was shut down.');
});

test('passes non-string translations through unchanged', () => {
  const texts = ['FSG-PS'];
  const translations = [null];

  const result = postProcessTranslations_(texts, translations);

  assert.equal(result[0], null);
});
