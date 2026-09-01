/**
 * ????????????????????????????????????????????????????????????
 *  Slides.gs ? Google Slides translation handlers
 *  v2.1 ? Run-level formatting preserved after translation
 *  v2.2 ? Merged cell guard added
 *  v2.3 ? Write access check added
 *  v2.4 ? Recursive group traversal (grouped shapes/tables now
 *         translated without needing to ungroup first)
 *  v2.5 ? "Speaker notes only" translation handler added
 * ????????????????????????????????????????????????????????????
 */

// ?? Recursive element collector ???????????????
//
//  Walks a list of page elements and pushes translatable groups
//  into `groups`. If an element is a GROUP, it recurses into its
//  children ? so shapes/tables nested inside one or more levels
//  of grouping (incl. groups mixed with images) are still found.

function collectElementsRecursive_(pageElements, slideNum, groups, isNote) {
  pageElements.forEach(function(el) {
    var type = el.getPageElementType();

    if (type === SlidesApp.PageElementType.SHAPE) {
      var g = buildGroup_(el.asShape().getText(), slideNum, isNote);
      if (g) groups.push(g);

    } else if (type === SlidesApp.PageElementType.TABLE) {
      var table = el.asTable();
      for (var r = 0; r < table.getNumRows(); r++) {
        for (var c = 0; c < table.getNumColumns(); c++) {
          // ?? Merged cell guard ??????????????????????????
          // Only process the head (upper-left) cell of merged regions.
          try {
            var cell = table.getCell(r, c);
            var g2   = buildGroup_(cell.getText(), slideNum, isNote);
            if (g2) groups.push(g2);
          } catch (e) {
            if (e.message && e.message.indexOf("upper left") !== -1) {
              // Skip non-head merged cells silently
            } else {
              console.warn("Table cell [" + r + "," + c + "] slide " + slideNum + ": " + e.message);
            }
          }
        }
      }

    } else if (type === SlidesApp.PageElementType.GROUP) {
      // Grouped shapes/tables/images ? recurse into the group's children.
      try {
        collectElementsRecursive_(el.asGroup().getChildren(), slideNum, groups, isNote);
      } catch (e) {
        console.warn("Group on slide " + slideNum + (isNote ? " (notes)" : "") + ": " + e.message);
      }
    }
    // Other types (IMAGE, LINE, VIDEO, ...) are not translatable ? skipped.
  });
}


// ?? Selection (current slide, selected shapes) ??

function getSlidesSelection_() {
  var pres   = SlidesApp.getActivePresentation();
  var sel    = pres.getSelection();
  var groups = [];

  if (sel && sel.getSelectionType() === SlidesApp.SelectionType.PAGE_ELEMENT) {
    collectElementsRecursive_(sel.getPageElementRange().getPageElements(), 0, groups, false);
  }
  return groups;
}


// ?? Entire presentation (all slides + notes) ????

function getAllPresentationShapes_() {
  var pres   = SlidesApp.getActivePresentation();
  var groups = [];

  pres.getSlides().forEach(function(slide, slideIdx) {
    var slideNum = slideIdx + 1;

    collectElementsRecursive_(slide.getPageElements(), slideNum, groups, false);

    // Speaker notes
    try {
      collectElementsRecursive_(slide.getNotesPage().getPageElements(), slideNum, groups, true);
    } catch (e) {
      console.warn("Notes slide " + slideNum + ": " + e.message);
    }
  });

  return groups;
}


// ?? Speaker notes ONLY (all slides, notes pages only) ??

function getAllNotesOnly_() {
  var pres   = SlidesApp.getActivePresentation();
  var groups = [];

  pres.getSlides().forEach(function(slide, slideIdx) {
    var slideNum = slideIdx + 1;
    try {
      collectElementsRecursive_(slide.getNotesPage().getPageElements(), slideNum, groups, true);
    } catch (e) {
      console.warn("Notes slide " + slideNum + ": " + e.message);
    }
  });

  return groups;
}


// ?? Build group with run-snapshot ?????????????

function buildGroup_(textRange, slideNum, isNote) {
  var paras = textRange.getParagraphs();
  if (!paras || !paras.length) return null;

  var entries = [];
  paras.forEach(function(para) {
    var range = para.getRange();
    var raw   = range.asString();
    var text  = raw.slice(-1) === "\n" ? raw.slice(0, -1) : raw;
    if (!text.trim()) return;

    var runs = snapshotRuns_(para);

    entries.push({
      text:     text,
      startIdx: range.getStartIndex(),
      endIdx:   range.getEndIndex() - 1,
      runs:     runs,
      batchIdx: -1
    });
  });

  if (!entries.length) return null;
  return { textRange: textRange, entries: entries, slideNum: slideNum || 0, isNote: !!isNote };
}


// ?? Run snapshot ??????????????????????????????

function snapshotRuns_(para) {
  var runs = [];
  try {
    para.getRange().getTextRuns().forEach(function(run) {
      var content = run.asString();
      if (!content) return;
      var style   = run.getTextStyle();
      runs.push({
        text:          content,
        bold:          style.isBold(),
        italic:        style.isItalic(),
        underline:     style.isUnderline(),
        strikethrough: style.isStrikethrough(),
        fontSize:      style.getFontSize(),
        fontFamily:    style.getFontFamily(),
        color:         safeColor_(style)
      });
    });
  } catch(e) {
    console.warn("snapshotRuns_: " + e.message);
  }
  return runs;
}

function safeColor_(style) {
  try {
    var c = style.getForegroundColor();
    if (c && c.getColorType() === SlidesApp.ColorType.RGB) {
      return c.asRgbColor().asHexString();
    }
  } catch(e) {}
  return null;
}


// ?? Re-apply formatting after setText ?????????

function reapplyRunFormatting_(textRange, entry, translatedText) {
  var runs = entry.runs;
  if (!runs || !runs.length) return;

  if (runs.length === 1) {
    try {
      var segRange = textRange.getRange(entry.startIdx, entry.startIdx + translatedText.length - 1);
      applySlideStyle_(segRange, runs[0]);
    } catch(e) {
      console.warn("reapplyRunFormatting_ single run: " + e.message);
    }
    return;
  }

  var origLen   = runs.reduce(function(n, r) { return n + r.text.length; }, 0);
  var transLen  = translatedText.length;
  var pos       = entry.startIdx;
  var remaining = transLen;

  runs.forEach(function(run, i) {
    if (remaining <= 0) return;
    var segLen;
    if (i === runs.length - 1) {
      segLen = remaining;
    } else {
      segLen = Math.max(1, Math.round((run.text.length / origLen) * transLen));
      segLen = Math.min(segLen, remaining);
    }
    var endPos = pos + segLen - 1;
    try {
      var segRange = textRange.getRange(pos, endPos);
      applySlideStyle_(segRange, run);
    } catch(e) {
      console.warn("reapplyRunFormatting_ [" + pos + "-" + endPos + "]: " + e.message);
    }
    pos       += segLen;
    remaining -= segLen;
  });
}

function applySlideStyle_(range, run) {
  var style = range.getTextStyle();
  try { if (run.bold          !== null) style.setBold(run.bold);                   } catch(e) {}
  try { if (run.italic        !== null) style.setItalic(run.italic);               } catch(e) {}
  try { if (run.underline     !== null) style.setUnderline(run.underline);         } catch(e) {}
  try { if (run.strikethrough !== null) style.setStrikethrough(run.strikethrough); } catch(e) {}
  try { if (run.fontSize      !== null) style.setFontSize(run.fontSize);           } catch(e) {}
  try { if (run.fontFamily    !== null) style.setFontFamily(run.fontFamily);       } catch(e) {}
  try { if (run.color         !== null) style.setForegroundColor(run.color);       } catch(e) {}
}


// ?? Core translate ????????????????????????????

function translateGroups_(groups, mtUid, sourceLang, targetLang) {
  if (!groups.length) return 0;

  var totalParas = groups.reduce(function(n, g) { return n + g.entries.length; }, 0);
  checkSizeLimit_(totalParas, "paragraphs");

  var allTexts = [];
  groups.forEach(function(group) {
    group.entries.forEach(function(entry) {
      entry.batchIdx = allTexts.length;
      allTexts.push(entry.text);
    });
  });

  var totalWords = countWords_(allTexts);

  var allTranslations = batchTranslate_(mtUid, allTexts, sourceLang, targetLang);

  // Apply ? REVERSE order so indices stay valid
  groups.forEach(function(group) {
    var entries = group.entries.slice().reverse();
    entries.forEach(function(entry) {
      var translated = allTranslations[entry.batchIdx];
      if (!translated) return;
      try {
        group.textRange.getRange(entry.startIdx, entry.endIdx).setText(translated);
        reapplyRunFormatting_(group.textRange, entry, translated);
      } catch (e) {
        if (e.message && e.message.indexOf("upper left") !== -1) {
          // Merged cell ? skip silently
        } else {
          console.warn("setText slide " + group.slideNum +
                       " [" + entry.startIdx + "-" + entry.endIdx + "]: " + e.message);
        }
      }
    });
  });

  return totalWords;
}


// ?? Handlers ?????????????????????????????????

function handleSlidesSelectionTranslate(e) {
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s      = extractSettings_(e);
    var groups = getSlidesSelection_();
    if (!groups.length) return notify_("?? Please click on a text box to select it first.");

    var words = translateGroups_(groups, s.mtUid, s.sourceLang, s.targetLang);

    var count = groups.reduce(function(n, g) { return n + g.entries.length; }, 0);
    logUsage_({
      hostApp:    "SLIDES",
      action:     "Selected Shapes",
      profile:    s.profile,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      segments:   count,
      words:      words,
      engine:     TRANSLATION_STATS_.usedGeminiFallback ? "Gemini (Fallback)" : "Phrase"
    });

    return notify_("? " + count + " paragraph(s) translated to " + langLabel_(s.targetLang));
  } catch (err) {
    console.error(err.stack || err.message);
    return notify_("? " + err.message);
  }
}

function handleSlidesFullTranslate(e) {
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s      = extractSettings_(e);
    var backup = createBackupCopy_("SLIDES");

    var groups = getAllPresentationShapes_();
    if (!groups.length) return notify_("No text found in presentation.");

    var words = translateGroups_(groups, s.mtUid, s.sourceLang, s.targetLang);

    var slideCount = SlidesApp.getActivePresentation().getSlides().length;
    var paraCount  = groups.reduce(function(n, g) { return n + g.entries.length; }, 0);
    var noteCount  = groups.filter(function(g) { return g.isNote; })
                          .reduce(function(n, g) { return n + g.entries.length; }, 0);

    var msg = "? " + paraCount + " paragraph(s) on " + slideCount + " slide(s) translated to " +
      langLabel_(s.targetLang) +
      (noteCount ? " (incl. " + noteCount + " note paragraph(s))" : "") + "." +
      (backup ? " (Backup: " + backup.name + ")" : "");

    logUsage_({
      hostApp:    "SLIDES",
      action:     "All Slides + Notes",
      profile:    s.profile,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      segments:   paraCount,
      words:      words,
      engine:     TRANSLATION_STATS_.usedGeminiFallback ? "Gemini (Fallback)" : "Phrase"
    });

    return notify_(msg);
  } catch (err) {
    console.error(err.stack || err.message);
    return notify_("? " + err.message);
  }
}

function handleSlidesNotesOnlyTranslate(e) {
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s      = extractSettings_(e);
    var groups = getAllNotesOnly_();
    if (!groups.length) return notify_("No speaker notes found in presentation.");

    var words = translateGroups_(groups, s.mtUid, s.sourceLang, s.targetLang);

    var slideCount = SlidesApp.getActivePresentation().getSlides().length;
    var paraCount  = groups.reduce(function(n, g) { return n + g.entries.length; }, 0);

    logUsage_({
      hostApp:    "SLIDES",
      action:     "Speaker Notes Only",
      profile:    s.profile,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      segments:   paraCount,
      words:      words,
      engine:     TRANSLATION_STATS_.usedGeminiFallback ? "Gemini (Fallback)" : "Phrase"
    });

    return notify_(
      "? " + paraCount + " speaker note paragraph(s) across " + slideCount +
      " slide(s) translated to " + langLabel_(s.targetLang) + "."
    );
  } catch (err) {
    console.error(err.stack || err.message);
    return notify_("? " + err.message);
  }
}