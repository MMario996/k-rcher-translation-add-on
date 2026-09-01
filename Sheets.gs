/**
 * ????????????????????????????????????????????????????????????
 *  Sheets.gs ? Google Sheets translation handlers
 *  v2.1 ? Formula cells are now skipped (never overwritten)
 *  v2.2 ? Backup copy created before full-spreadsheet translation
 *  v2.3 ? Admin usage logging added
 * ????????????????????????????????????????????????????????????
 */

function getSheetsSelection_() {
  var range = SpreadsheetApp.getActiveSheet().getActiveRange();
  if (!range) return { cells: [], range: null };

  var vals     = range.getValues();
  var formulas = range.getFormulas();
  var cells    = [];

  for (var r = 0; r < vals.length; r++) {
    for (var c = 0; c < vals[r].length; c++) {
      if (formulas[r][c]) continue; // Skip formula cells ? never overwrite a formula with translated text
      var v = String(vals[r][c]).trim();
      if (v && isNaN(vals[r][c])) cells.push({ row: r, col: c, text: v });
    }
  }
  return { cells: cells, range: range };
}

function applySheetsTranslation_(selection, translations) {
  var vals = selection.range.getValues();
  selection.cells.forEach(function(cell, idx) {
    vals[cell.row][cell.col] = translations[idx] || cell.text;
  });
  selection.range.setValues(vals);
}

function translateEntireSpreadsheet_(mtUid, sourceLang, targetLang) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var total  = 0;
  var totalWords = 0;

  var allCells  = [];
  var sheetData = [];

  sheets.forEach(function(sheet) {
    var dataRange = sheet.getDataRange();
    var vals      = dataRange.getValues();
    var formulas  = dataRange.getFormulas();
    var cells     = [];

    for (var r = 0; r < vals.length; r++) {
      for (var c = 0; c < vals[r].length; c++) {
        if (formulas[r][c]) continue; // Skip formula cells ? never overwrite a formula with translated text
        var v = String(vals[r][c]).trim();
        if (v && isNaN(vals[r][c])) {
          cells.push({ row: r, col: c, text: v });
        }
      }
    }

    sheetData.push({ sheet: sheet, dataRange: dataRange, vals: vals, cells: cells });
    total += cells.length;
  });

  checkSizeLimit_(total, "cells");

  if (!total) throw new Error("No translatable text found in spreadsheet.");

  sheetData.forEach(function(sd) {
    if (!sd.cells.length) return;

    var texts        = sd.cells.map(function(cell) { return cell.text; });
    totalWords       += countWords_(texts);
    var translations = batchTranslate_(mtUid, texts, sourceLang, targetLang);

    sd.cells.forEach(function(cell, idx) {
      sd.vals[cell.row][cell.col] = translations[idx] || cell.text;
    });
    sd.dataRange.setValues(sd.vals);
  });

  return { count: total, words: totalWords };
}


// ?? Handlers ?????????????????????????????????

function handleSheetsSelectionTranslate(e) {
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s   = extractSettings_(e);
    var sel = getSheetsSelection_();
    if (!sel.cells.length) return notify_("?? Please select cells with text first, or use Ctrl+A to select all.");

    checkSizeLimit_(sel.cells.length, "cells");

    var texts        = sel.cells.map(function(c) { return c.text; });
    var translations = batchTranslate_(s.mtUid, texts, s.sourceLang, s.targetLang);
    applySheetsTranslation_(sel, translations);

    logUsage_({
      hostApp:    "SHEETS",
      action:     "Selection",
      profile:    s.profile,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      segments:   sel.cells.length,
      words:      countWords_(texts),
      engine:     TRANSLATION_STATS_.usedGeminiFallback ? "Gemini (Fallback)" : "Phrase"
    });

    return notify_("? " + sel.cells.length + " cells translated to " + langLabel_(s.targetLang));
  } catch (err) {
    console.error(err.stack || err.message);
    return notify_("? " + err.message);
  }
}

function handleSheetsFullTranslate(e) {
  try {
    checkWriteAccess_();
    resetTranslationStats_();
    var s      = extractSettings_(e);
    var backup = createBackupCopy_("SHEETS");

    var result = translateEntireSpreadsheet_(s.mtUid, s.sourceLang, s.targetLang);

    var msg = "? " + result.count + " cells translated to " + langLabel_(s.targetLang) +
              (backup ? " (Backup: " + backup.name + ")" : "");

    logUsage_({
      hostApp:    "SHEETS",
      action:     "Full Spreadsheet",
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