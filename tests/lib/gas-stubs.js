'use strict';

/**
 * Minimal stand-in for the Apps Script DriveApp service ? just enough
 * (the Access enum) for files that reference DriveApp.Access at module-load
 * time (see Helpers.gs: NO_EDIT_ACCESS_LEVELS_).
 */
function makeDriveAppStub() {
  return {
    Access: {
      NONE: 'NONE',
      VIEW: 'VIEW',
      COMMENT: 'COMMENT',
      EDIT: 'EDIT',
      OWNER: 'OWNER',
      ORGANIZER: 'ORGANIZER',
      FILE_ORGANIZER: 'FILE_ORGANIZER'
    }
  };
}

/**
 * Fake Docs Text element (as returned by editAsText()) for testing the
 * run-detection / formatting-preservation logic in Docs.gs without a real
 * Google Doc. `boldRanges` is a list of [start, end) index pairs (absolute
 * character indices into `text`) that are bold; every other attribute is
 * held constant so tests can focus on run boundaries.
 */
function makeFakeText(text, boldRanges) {
  boldRanges = boldRanges || [];

  function isBoldAt(i) {
    return boldRanges.some((r) => i >= r[0] && i < r[1]);
  }

  const ops = [];
  const state = { text: text };

  return {
    ops: ops,

    getText: () => state.text,

    isBold: (i) => isBoldAt(i),
    isItalic: () => false,
    isUnderline: () => false,
    isStrikethrough: () => false,
    getFontSize: () => 11,
    getFontFamily: () => 'Arial',
    getForegroundColor: () => '#000000',

    setText: (t) => { ops.push(['setText', t]); state.text = t; },
    deleteText: (s, e) => {
      ops.push(['deleteText', s, e]);
      state.text = state.text.slice(0, s) + state.text.slice(e + 1);
    },
    insertText: (pos, t) => {
      ops.push(['insertText', pos, t]);
      state.text = state.text.slice(0, pos) + t + state.text.slice(pos);
    },

    setBold: (s, e, v) => ops.push(['setBold', s, e, v]),
    setItalic: (s, e, v) => ops.push(['setItalic', s, e, v]),
    setUnderline: (s, e, v) => ops.push(['setUnderline', s, e, v]),
    setStrikethrough: (s, e, v) => ops.push(['setStrikethrough', s, e, v]),
    setFontSize: (s, e, v) => ops.push(['setFontSize', s, e, v]),
    setFontFamily: (s, e, v) => ops.push(['setFontFamily', s, e, v]),
    setForegroundColor: (s, e, v) => ops.push(['setForegroundColor', s, e, v])
  };
}

/**
 * Minimal stand-in for PropertiesService, backed by a plain object so tests
 * can seed script properties (e.g. GEMINI_API_KEY, GEMINI_PE_ENABLED) and
 * assert on ones the code under test writes.
 */
function makePropertiesServiceStub(initialScriptProps) {
  var scriptProps = Object.assign({}, initialScriptProps || {});

  var store = {
    getProperty: function(key) {
      return Object.prototype.hasOwnProperty.call(scriptProps, key) ? scriptProps[key] : null;
    },
    setProperty: function(key, value) { scriptProps[key] = String(value); },
    deleteProperty: function(key) { delete scriptProps[key]; },
    getProperties: function() { return Object.assign({}, scriptProps); }
  };

  return {
    getScriptProperties: function() { return store; },
    getUserProperties: function() { return store; },
    _scriptProps: scriptProps
  };
}

/**
 * Minimal stand-in for UrlFetchApp.fetchAll(). `handler(request, index)`
 * receives each request object and must return { code, body }; the stub
 * wraps that into the { getResponseCode(), getContentText() } shape the
 * Apps Script HTTPResponse object exposes.
 */
function makeUrlFetchAppStub(handler) {
  function wrap(result) {
    return {
      getResponseCode: function() { return result.code; },
      getContentText:  function() { return result.body; }
    };
  }
  return {
    fetchAll: function(requests) {
      return requests.map(function(req, i) { return wrap(handler(req, i)); });
    },
    fetch: function(req) { return wrap(handler(req, 0)); }
  };
}

module.exports = { makeDriveAppStub, makeFakeText, makePropertiesServiceStub, makeUrlFetchAppStub };
