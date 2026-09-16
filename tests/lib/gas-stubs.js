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

module.exports = { makeDriveAppStub, makeFakeText };
