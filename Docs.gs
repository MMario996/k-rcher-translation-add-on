/**
 * ============================================================
 *  Docs.gs — Google Docs translation handlers
 * ============================================================
 *
 *  v2.0 — Performance-Optimierung:
 *    • detectDocRuns_()  — Stepping-Algorithmus (20er-Schritte)
 *    • mergeAdjacentRuns_() — Identische Formatierungen zusammenfassen
 *    • Execution-Time-Guard (25 s) gegen Add-on Timeout
 *    • MAX_BATCH wird in Config.gs gesetzt (empfohlen: 500)
 *  v2.1 — Backup copy created before full-document translation
 *  v2.2 — Admin usage logging added
 *
 *  Formatierung bleibt 1:1 erhalten (bold, italic, underline,
 *  strikethrough, fontSize, fontFamily, foregroundColor).
 * ============================================================
 */


// ⏱️ Execution time guard ======================
var EXEC_START_    = Date.now();
var EXEC_LIMIT_MS_ = 25000;   // 25 s — leaves 5 s buffer before GAS kills at 30 s

function checkTimeLimit_() {
  if (Date.now() - EXEC_START_ > EXEC_LIMIT_MS_) {
    throw new Error(
      "⌛ Translation timed out after " +
      Math.round(EXEC_LIMIT_MS_ / 1000) + " s — the document is too large " +
      "for a single run. Please select a smaller section and translate it individually."
    );
  }
}


// ✏️ Selection translation =====================
//
//  Each selected range element (a whole paragraph/list item, or a partial
//  slice of one) is run-detected and translated as its own text segment,
//  exactly like translateEntireDoc_() does for the whole document. This
//  avoids joining multi-paragraph selections into a single "\n"-delimited
//  string and blindly re-splitting the MT/LLM response by line count
//  (that count is never guaranteed to survive translation), and it means
//  per-run formatting (bold/italic/...) is preserved within a selection
//  too, not just for full-document translation.

function translateDocsSelection_(sel, mtUid, sourceLang, targetLang) {
  var elements = [];

  sel.getRangeElements().forEach(function(re) {
    var el = re.getElement();
    if (!el.editAsText) return;
    var txt      = el.editAsText();
    var fullText = txt.getText();

    var partial = re.isPartial();
    var startOffset, endOffsetInclusive, segmentText;
    if (partial) {
      startOffset        = re.getStartOffset();
      endOffsetInclusive = re.getEndOffsetInclusive();
      segmentText        = fullText.substring(startOffset, endOffsetInclusive + 1);
    } else {
      startOffset        = 0;
      endOffsetInclusive = fullText.length - 1;
      segmentText        = fullText;
    }

    if (!segmentText.trim()) return;

    var runs = mergeAdjacentRuns_(detectDocRuns_(txt, segmentText, startOffset));
    if (runs.length) {
      elements.push({
        txt: txt, partial: partial,
        startOffset: startOffset, endOffsetInclusive: endOffsetInclusive,
        runs: runs
      });
    }
  });

  if (!elements.length) throw new Error("No translatable text found in selection.");

  var totalRuns = elements.reduce(function(n, el) { return n + el.runs.length; }, 0);
  checkSizeLimit_(totalRuns, "text segments");

  var allTexts = [];
  elements.forEach(function(el) {
    el.runs.forEach(function(run) {
      run.batchIdx = allTexts.length;
      allTexts.push(run.text);
    });
  });

  var totalWords       = countWords_(allTexts);
  var allTranslations  = batchTranslateWithTimeGuard_(mtUid, allTexts, sourceLang, targetLang);

  elements.forEach(function(el) {
    checkTimeLimit_();
    applyTranslatedRunsToElement_(el, allTranslations);
  });

  return { count: elements.length, words: totalWords };
}


// 📄 Full-document translation =================

function translateEntireDoc_(mtUid, sourceLang, targetLang) {
  var doc      = DocumentApp.getActiveDocument();
  var body     = doc.getBody();
  var numItems = body.getNumChildren();

  var PARA      = DocumentApp.ElementType.PARAGRAPH;
  var LIST_ITEM = DocumentApp.ElementType.LIST_ITEM;
  var TABLE     = DocumentApp.ElementType.TABLE;

  var elements = [];

  for (var i = 0; i < numItems; i++) {
    checkTimeLimit_();

    var child = body.getChild(i);
    var type  = child.getType();

    if (type === PARA || type === LIST_ITEM) {
      var txt      = child.editAsText();
      var fullText = txt.getText();
      if (!fullText.trim()) continue;
      var runs = mergeAdjacentRuns_(detectDocRuns_(txt, fullText, 0));
      if (runs.length) elements.push({ txt: txt, partial: false, runs: runs });

    } else if (type === TABLE) {
      var table = child.asTable();
      for (var r = 0; r < table.getNumRows(); r++) {
        var row = table.getRow(r);
        for (var c = 0; c < row.getNumCells(); c++) {
          var cell     = row.getCell(c);
          var cellTxt  = cell.editAsText();
          var cellText = cellTxt.getText();
          if (!cellText.trim()) continue;
          var runs2 = mergeAdjacentRuns_(detectDocRuns_(cellTxt, cellText, 0));
          if (runs2.length) elements.push({ txt: cellTxt, partial: false, runs: runs2 });
        }
      }
    }
  }

  if (!elements.length) throw new Error("No translatable text found in document.");

  var totalRuns = elements.reduce(function(n, el) { return n + el.runs.length; }, 0);
  checkSizeLimit_(totalRuns, "text segments");

  var allTexts = [];
  elements.forEach(function(el) {
    el.runs.forEach(function(run) {
      run.batchIdx = allTexts.length;
      allTexts.push(run.text);
    });
  });

  var totalWords = countWords_(allTexts);

  var allTranslations = batchTranslateWithTimeGuard_(mtUid, allTexts, sourceLang, targetLang);

  elements.forEach(function(el) {
    checkTimeLimit_();
    applyTranslatedRunsToElement_(el, allTranslations);
  });

  return { count: elements.length, words: totalWords };
}


// 🔁 Apply translated runs back to a doc element
//
//  Shared by translateEntireDoc_() and translateDocsSelection_(). `el` is
//  either a whole element (el.partial === false, el.txt gets setText()
//  wholesale) or a partial range within one (el.partial === true, only
//  [startOffset, endOffsetInclusive] is replaced via delete+insert so the
//  untouched rest of the paragraph is left alone).

function applyTranslatedRunsToElement_(el, allTranslations) {
  var runTranslations = el.runs.map(function(run) {
    return allTranslations[run.batchIdx] || run.text;
  });

  for (var ri = 0; ri < runTranslations.length - 1; ri++) {
    var curr     = runTranslations[ri];
    var next     = runTranslations[ri + 1];
    if (!curr || !next) continue;

    var origCurr = el.runs[ri].text;
    var origNext = el.runs[ri + 1].text;

    var hadSpaceBetween = /\s$/.test(origCurr) || /^\s/.test(origNext);
    var hasSpaceNow     = /\s$/.test(curr)     || /^\s/.test(next);

    if (hadSpaceBetween && !hasSpaceNow) {
      runTranslations[ri] = curr + " ";
    } else if (!hasSpaceNow && /\w$/.test(curr) && /^\w/.test(next)) {
      runTranslations[ri] = curr + " ";
    }
  }

  var joined = runTranslations.join("");
  var pos;

  if (el.partial) {
    el.txt.deleteText(el.startOffset, el.endOffsetInclusive);
    el.txt.insertText(el.startOffset, joined);
    pos = el.startOffset;
  } else {
    el.txt.setText(joined);
    pos = 0;
  }

  el.runs.forEach(function(run, idx) {
    var tText = runTranslations[idx];
    if (!tText || !tText.length) return;
    var end = pos + tText.length - 1;
    applyDocAttrs_(el.txt, pos, end, run.attrs);
    pos += tText.length;
  });
}


// ⏱️ Batch translate with time guard ===========

function batchTranslateWithTimeGuard_(mtUid, texts, sourceLang, targetLang) {
  var all = [];
  for (var i = 0; i < texts.length; i += MAX_BATCH) {
    checkTimeLimit_();
    var batch  = texts.slice(i, i + MAX_BATCH);
    var result = apiTranslateTexts_(mtUid, batch, sourceLang, targetLang);
    result.forEach(function(t) { all.push(t); });
  }
  return all;
}


// 🔍 Run detection (stepping algorithm) ========

var RUN_DETECT_STEP_ = 20;

/**
 * Detects formatting runs across `fullText`, a segment of `txt` that starts
 * at absolute character index `offset` within `txt` (0 for a whole
 * paragraph/cell; the selection's startOffset for a partial range).
 */
function detectDocRuns_(txt, fullText, offset) {
  if (!fullText || fullText.length === 0) return [];
  offset = offset || 0;

  var len   = fullText.length;
  var runs  = [];
  var attrs = getDocAttrsAt_(txt, offset + 0);
  var start = 0;
  var i     = RUN_DETECT_STEP_;

  while (i < len) {
    var a = getDocAttrsAt_(txt, offset + i);

    if (!docAttrsEqual_(a, attrs)) {
      var lo = i - RUN_DETECT_STEP_ + 1;
      if (lo < start + 1) lo = start + 1;

      for (var j = lo; j <= i; j++) {
        var b = getDocAttrsAt_(txt, offset + j);
        if (!docAttrsEqual_(b, attrs)) {
          runs.push({ text: fullText.substring(start, j), attrs: attrs });
          start = j;
          attrs = b;

          for (var k = j + 1; k <= i; k++) {
            var c = getDocAttrsAt_(txt, offset + k);
            if (!docAttrsEqual_(c, attrs)) {
              runs.push({ text: fullText.substring(start, k), attrs: attrs });
              start = k;
              attrs = c;
            }
          }
          break;
        }
      }
    }
    i += RUN_DETECT_STEP_;
  }

  var remainder = Math.max(start + 1, len - ((len - 1) % RUN_DETECT_STEP_));
  if (remainder < len) {
    for (var m = remainder; m < len; m++) {
      var d = getDocAttrsAt_(txt, offset + m);
      if (!docAttrsEqual_(d, attrs)) {
        runs.push({ text: fullText.substring(start, m), attrs: attrs });
        start = m;
        attrs = d;
      }
    }
  }

  runs.push({ text: fullText.substring(start), attrs: attrs });
  return runs;
}


// 🔀 Merge adjacent runs with identical formatting

function mergeAdjacentRuns_(runs) {
  if (runs.length <= 1) return runs;

  var merged = [{ text: runs[0].text, attrs: runs[0].attrs }];

  for (var i = 1; i < runs.length; i++) {
    var last = merged[merged.length - 1];
    if (docAttrsEqual_(last.attrs, runs[i].attrs)) {
      last.text += runs[i].text;
    } else {
      merged.push({ text: runs[i].text, attrs: runs[i].attrs });
    }
  }

  return merged;
}


// 🏷️ Attribute helpers =========================

function getDocAttrsAt_(txt, i) {
  return {
    bold:            txt.isBold(i),
    italic:          txt.isItalic(i),
    underline:       txt.isUnderline(i),
    strikethrough:   txt.isStrikethrough(i),
    fontSize:        txt.getFontSize(i),
    fontFamily:      txt.getFontFamily(i),
    foregroundColor: txt.getForegroundColor(i)
  };
}

function docAttrsEqual_(a, b) {
  return a.bold            === b.bold            &&
         a.italic          === b.italic          &&
         a.underline       === b.underline       &&
         a.strikethrough   === b.strikethrough   &&
         a.fontSize        === b.fontSize         &&
         a.fontFamily      === b.fontFamily       &&
         a.foregroundColor === b.foregroundColor;
}

function applyDocAttrs_(txt, start, end, attrs) {
  try {
    if (attrs.bold            !== null) txt.setBold(start, end, attrs.bold);
    if (attrs.italic          !== null) txt.setItalic(start, end, attrs.italic);
    if (attrs.underline       !== null) txt.setUnderline(start, end, attrs.underline);
    if (attrs.strikethrough   !== null) txt.setStrikethrough(start, end, attrs.strikethrough);
    if (attrs.fontSize        !== null) txt.setFontSize(start, end, attrs.fontSize);
    if (attrs.fontFamily      !== null) txt.setFontFamily(start, end, attrs.fontFamily);
    if (attrs.foregroundColor !== null) txt.setForegroundColor(start, end, attrs.foregroundColor);
  } catch (e) {
    console.warn("applyDocAttrs_ at [" + start + "–" + end + "]: " + e.message);
  }
}


// 🎛️ Handlers =================================

function handleDocsSelectionTranslate(e) {
  EXEC_START_ = Date.now();
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s   = extractSettings_(e);
    var sel = DocumentApp.getActiveDocument().getSelection();
    if (!sel) return notify_("⚠️ Please select text first, or use Ctrl+A to select all.");

    var result = translateDocsSelection_(sel, s.mtUid, s.sourceLang, s.targetLang);

    logUsage_({
      hostApp:    "DOCS",
      action:     "Selection",
      profile:    s.profile,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      segments:   result.count,
      words:      result.words,
      engine:     TRANSLATION_STATS_.usedGeminiFallback ? "Gemini (Fallback)" : "Phrase"
    });

    return notify_("✅ " + result.count + " text block(s) translated to " + langLabel_(s.targetLang));
  } catch (err) {
    console.error(err.stack || err.message);
    return notify_("❌ " + err.message);
  }
}

function handleDocsFullTranslate(e) {
  EXEC_START_ = Date.now();
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s      = extractSettings_(e);
    var backup = createBackupCopy_("DOCS");

    var result = translateEntireDoc_(s.mtUid, s.sourceLang, s.targetLang);

    var msg = "✅ " + result.count + " text blocks translated to " + langLabel_(s.targetLang) +
              (backup ? " (Backup: " + backup.name + ")" : "");

    logUsage_({
      hostApp:    "DOCS",
      action:     "Full Document",
      profile:    s.profile,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      segments:   result.count,
      words:      result.words,
      engine:     TRANSLATION_STATS_.usedGeminiFallback ? "Gemini (Fallback)" : "Phrase"
    });

    return notify_(msg);
  } catch (err) {
    console.error(err.stack || err.message);
    return notify_("❌ " + err.message);
  }
}