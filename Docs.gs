/**
 * ????????????????????????????????????????????????????????????
 *  Docs.gs ? Google Docs translation handlers
 * ????????????????????????????????????????????????????????????
 *
 *  v2.0 ? Performance-Optimierung:
 *    ? detectDocRuns_()  ? Stepping-Algorithmus (20er-Schritte)
 *    ? mergeAdjacentRuns_() ? Identische Formatierungen zusammenfassen
 *    ? Execution-Time-Guard (25 s) gegen Add-on Timeout
 *    ? MAX_BATCH wird in Config.gs gesetzt (empfohlen: 500)
 *  v2.1 ? Backup copy created before full-document translation
 *  v2.2 ? Admin usage logging added
 *
 *  Formatierung bleibt 1:1 erhalten (bold, italic, underline,
 *  strikethrough, fontSize, fontFamily, foregroundColor).
 * ????????????????????????????????????????????????????????????
 */


// ?? Execution time guard ??????????????????????
var EXEC_START_    = Date.now();
var EXEC_LIMIT_MS_ = 25000;   // 25 s ? leaves 5 s buffer before GAS kills at 30 s

function checkTimeLimit_() {
  if (Date.now() - EXEC_START_ > EXEC_LIMIT_MS_) {
    throw new Error(
      "? Translation timed out after " +
      Math.round(EXEC_LIMIT_MS_ / 1000) + " s ? the document is too large " +
      "for a single run. Please select a smaller section and translate it individually."
    );
  }
}


// ?? Selection helpers ?????????????????????????

function getDocsSelection_() {
  var sel = DocumentApp.getActiveDocument().getSelection();
  if (!sel) return { text: "", empty: true };

  var parts = [];
  sel.getRangeElements().forEach(function(re) {
    var el = re.getElement();
    if (!el.editAsText) return;
    var txt = el.editAsText();
    parts.push(
      re.isPartial()
        ? txt.getText().substring(re.getStartOffset(), re.getEndOffsetInclusive() + 1)
        : txt.getText()
    );
  });

  var text = parts.join("\n").trim();
  return { text: text, empty: text.length === 0 };
}

function replaceDocsSelection_(translatedText) {
  var doc = DocumentApp.getActiveDocument();
  var sel = doc.getSelection();
  if (!sel) throw new Error("No text selection found.");

  var lines   = translatedText.split("\n");
  var lineIdx = 0;

  sel.getRangeElements().forEach(function(re) {
    var el = re.getElement();
    if (!el.editAsText) return;
    var txt         = el.editAsText();
    var replacement = lines[lineIdx] || "";

    if (re.isPartial()) {
      txt.deleteText(re.getStartOffset(), re.getEndOffsetInclusive());
      txt.insertText(re.getStartOffset(), replacement);
    } else {
      txt.setText(replacement);
    }
    lineIdx++;
  });
}


// ?? Full-document translation ?????????????????

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
      var runs = mergeAdjacentRuns_(detectDocRuns_(txt, fullText));
      if (runs.length) elements.push({ txt: txt, runs: runs });

    } else if (type === TABLE) {
      var table = child.asTable();
      for (var r = 0; r < table.getNumRows(); r++) {
        var row = table.getRow(r);
        for (var c = 0; c < row.getNumCells(); c++) {
          var cell     = row.getCell(c);
          var cellTxt  = cell.editAsText();
          var cellText = cellTxt.getText();
          if (!cellText.trim()) continue;
          var runs2 = mergeAdjacentRuns_(detectDocRuns_(cellTxt, cellText));
          if (runs2.length) elements.push({ txt: cellTxt, runs: runs2 });
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

    el.txt.setText(runTranslations.join(""));

    var pos = 0;
    el.runs.forEach(function(run, idx) {
      var tText = runTranslations[idx];
      if (!tText || !tText.length) return;
      var end = pos + tText.length - 1;
      applyDocAttrs_(el.txt, pos, end, run.attrs);
      pos += tText.length;
    });
  });

  return { count: elements.length, words: totalWords };
}


// ?? Batch translate with time guard ???????????

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


// ?? Run detection (stepping algorithm) ????????

var RUN_DETECT_STEP_ = 20;

function detectDocRuns_(txt, fullText) {
  if (!fullText || fullText.length === 0) return [];

  var len   = fullText.length;
  var runs  = [];
  var attrs = getDocAttrsAt_(txt, 0);
  var start = 0;
  var i     = RUN_DETECT_STEP_;

  while (i < len) {
    var a = getDocAttrsAt_(txt, i);

    if (!docAttrsEqual_(a, attrs)) {
      var lo = i - RUN_DETECT_STEP_ + 1;
      if (lo < start + 1) lo = start + 1;

      for (var j = lo; j <= i; j++) {
        var b = getDocAttrsAt_(txt, j);
        if (!docAttrsEqual_(b, attrs)) {
          runs.push({ text: fullText.substring(start, j), attrs: attrs });
          start = j;
          attrs = b;

          for (var k = j + 1; k <= i; k++) {
            var c = getDocAttrsAt_(txt, k);
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
      var d = getDocAttrsAt_(txt, m);
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


// ?? Merge adjacent runs with identical formatting ??

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


// ?? Attribute helpers ?????????????????????????

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
    console.warn("applyDocAttrs_ at [" + start + "?" + end + "]: " + e.message);
  }
}


// ?? Handlers ?????????????????????????????????

function handleDocsSelectionTranslate(e) {
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s   = extractSettings_(e);
    var sel = getDocsSelection_();
    if (sel.empty) return notify_("?? Please select text first, or use Ctrl+A to select all.");

    var translations = apiTranslateTexts_(s.mtUid, [sel.text], s.sourceLang, s.targetLang);
    replaceDocsSelection_(translations[0]);

    logUsage_({
      hostApp:    "DOCS",
      action:     "Selection",
      profile:    s.profile,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      segments:   1,
      words:      countWords_([sel.text]),
      engine:     TRANSLATION_STATS_.usedGeminiFallback ? "Gemini (Fallback)" : "Phrase"
    });

    return notify_("? Selection translated to " + langLabel_(s.targetLang));
  } catch (err) {
    console.error(err.stack || err.message);
    return notify_("? " + err.message);
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

    var msg = "? " + result.count + " text blocks translated to " + langLabel_(s.targetLang) +
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
    return notify_("? " + err.message);
  }
}