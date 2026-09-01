/**
 * ????????????????????????????????????????????????????????????
 *  Helpers.gs ? Shared utilities (single definition, no dupes)
 * ????????????????????????????????????????????????????????????
 */

// ?? User settings ?????????????????????????????

function getSetting_(key, fallback) {
  return PropertiesService.getUserProperties().getProperty(key) || fallback || "";
}

function setSetting_(key, value) {
  PropertiesService.getUserProperties().setProperty(key, value);
}

function getAllUserSettings_() {
  return {
    profile:    getSetting_(CONFIG.PROP_PROFILE,     "GENERAL"),
    sourceLang: getSetting_(CONFIG.PROP_SOURCE_LANG, "en"),
    targetLang: getSetting_(CONFIG.PROP_TARGET_LANG, "de")
  };
}

function extractSettings_(e) {
  var f          = (e && e.formInput) || {};
  var profile    = f.profile    || getSetting_(CONFIG.PROP_PROFILE,     "GENERAL");
  var sourceLang = f.sourceLang || getSetting_(CONFIG.PROP_SOURCE_LANG, "en");
  var targetLang = f.targetLang || getSetting_(CONFIG.PROP_TARGET_LANG, "de");
  var mtUid      = getMtUidForProfile_(profile);

  setSetting_(CONFIG.PROP_PROFILE,     profile);
  setSetting_(CONFIG.PROP_SOURCE_LANG, sourceLang);
  setSetting_(CONFIG.PROP_TARGET_LANG, targetLang);

  // `profile` (raw key, e.g. "MARKETING") is included for the admin usage log.
  return { mtUid: mtUid, sourceLang: sourceLang, targetLang: targetLang, profile: profile };
}


// ?? Write access check ????????????????????????
//
//  Call at the start of every translate handler.
//  Throws a user-friendly error if the file is read-only,
//  preventing the generic "Something went wrong" add-on error.

function checkWriteAccess_() {
  try {
    // Docs
    if (typeof DocumentApp !== "undefined") {
      try {
        var doc = DocumentApp.getActiveDocument();
        if (doc) {
          // Try a no-op name set ? throws if read-only
          doc.getBody().getText(); // safe read
          var access = DriveApp.getFileById(doc.getId()).getAccess(Session.getActiveUser());
          if (access === DriveApp.Access.VIEW) {
            throw new Error("?? You don't have edit access to this document. Translation requires editor rights. Please request access from the file owner.");
          }
          return;
        }
      } catch(e) {
        if (e.message && e.message.indexOf("edit access") !== -1) throw e;
      }
    }
  } catch(e) {
    if (e.message && e.message.indexOf("edit access") !== -1) throw e;
  }

  try {
    // Sheets
    if (typeof SpreadsheetApp !== "undefined") {
      try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        if (ss) {
          var access = DriveApp.getFileById(ss.getId()).getAccess(Session.getActiveUser());
          if (access === DriveApp.Access.VIEW) {
            throw new Error("?? You don't have edit access to this spreadsheet. Translation requires editor rights. Please request access from the file owner.");
          }
          return;
        }
      } catch(e) {
        if (e.message && e.message.indexOf("edit access") !== -1) throw e;
      }
    }
  } catch(e) {
    if (e.message && e.message.indexOf("edit access") !== -1) throw e;
  }

  try {
    // Slides
    if (typeof SlidesApp !== "undefined") {
      try {
        var pres = SlidesApp.getActivePresentation();
        if (pres) {
          var access = DriveApp.getFileById(pres.getId()).getAccess(Session.getActiveUser());
          if (access === DriveApp.Access.VIEW) {
            throw new Error("?? You don't have edit access to this presentation. Translation requires editor rights. Please request access from the file owner.");
          }
          return;
        }
      } catch(e) {
        if (e.message && e.message.indexOf("edit access") !== -1) throw e;
      }
    }
  } catch(e) {
    if (e.message && e.message.indexOf("edit access") !== -1) throw e;
  }
}


// ?? Backup copy (safety net before full-document translations) ??
//
//  Creates a timestamped copy of the currently open file BEFORE a
//  full-document/spreadsheet/presentation translation runs, so the
//  original state is always recoverable ? not just via Ctrl+Z.
//  Never throws: a failed backup must not block the actual translation.

function createBackupCopy_(hostApp) {
  try {
    var file;
    if (hostApp === "DOCS") {
      file = DriveApp.getFileById(DocumentApp.getActiveDocument().getId());
    } else if (hostApp === "SHEETS") {
      file = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
    } else if (hostApp === "SLIDES") {
      file = DriveApp.getFileById(SlidesApp.getActivePresentation().getId());
    } else {
      return null;
    }

    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Europe/Berlin", "yyyy-MM-dd HH:mm");
    var copy  = file.makeCopy("[Backup " + stamp + "] " + file.getName());

    return { name: copy.getName(), url: copy.getUrl() };
  } catch (e) {
    console.warn("createBackupCopy_: " + e.message);
    return null;
  }
}


// ?? Admin usage logging ???????????????????????
//
//  Writes one row per translation run to an EXTERNAL Google Sheet
//  (configured via ADMIN_createUsageLogSheet() / ADMIN_setUsageLogSheetId()
//  in Admin.gs) ? never shown inside the add-on itself. Failures here
//  are always swallowed so logging can never break a translation.
//
//  Columns: Timestamp, User, App, Action, Profile, Source Lang, Target Lang,
//  Segments, Words, Engine.

function getLogSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_LOG_SHEET_ID);
  if (!id) return null; // Logging not configured ? silently skip

  try {
    var ss    = SpreadsheetApp.openById(id);
    var sheet = ss.getSheetByName("Usage Log") || ss.insertSheet("Usage Log");

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp", "User", "App", "Action", "Profile",
        "Source Lang", "Target Lang", "Segments", "Words", "Engine"
      ]);
      sheet.getRange(1, 1, 1, 10).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    return sheet;
  } catch (e) {
    console.warn("getLogSheet_: " + e.message);
    return null;
  }
}

/**
 * @param {Object} details
 *   hostApp:    "DOCS" | "SHEETS" | "SLIDES"
 *   action:     e.g. "Selection", "Full Document", "Speaker Notes Only"
 *   profile:    profile key, e.g. "MARKETING"
 *   sourceLang, targetLang: language codes
 *   segments:   number of translated text segments/cells/paragraphs
 *   words:      total word count of the translated source text
 *   engine:     "Phrase" or "Gemini (Fallback)"
 */
function logUsage_(details) {
  try {
    var sheet = getLogSheet_();
    if (!sheet) return;

    var email = "";
    try { email = Session.getActiveUser().getEmail(); } catch (e) {}

    sheet.appendRow([
      new Date(),
      email || "(unbekannt)",
      details.hostApp    || "",
      details.action     || "",
      details.profile    || "",
      details.sourceLang || "",
      details.targetLang || "",
      details.segments   || 0,
      details.words      || 0,
      details.engine     || "Phrase"
    ]);
  } catch (e) {
    console.warn("logUsage_: " + e.message);
  }
}

/**
 * Counts words across an array of source texts (whitespace-separated).
 * Used to log translation volume alongside segment counts.
 */
function countWords_(texts) {
  var total = 0;
  (texts || []).forEach(function(t) {
    var s = String(t || "").trim();
    if (!s) return;
    total += s.split(/\s+/).filter(Boolean).length;
  });
  return total;
}


// ?? Batch translation with size guard ?????????

/**
 * Checks element count against configured limits.
 * Throws user-friendly error if too large, returns warning string if borderline.
 */
function checkSizeLimit_(count, entityLabel) {
  if (count > CONFIG.MAX_ELEMENTS_BLOCK) {
    throw new Error(
      "Too many " + entityLabel + " (" + count + "). " +
      "Maximum is " + CONFIG.MAX_ELEMENTS_BLOCK + ". " +
      "Please split the document or select a smaller range."
    );
  }
  if (count > CONFIG.MAX_ELEMENTS_WARN) {
    console.warn(
      "Large translation: " + count + " " + entityLabel +
      " (warning threshold: " + CONFIG.MAX_ELEMENTS_WARN + ")"
    );
  }
}

function batchTranslate_(mtUid, texts, sourceLang, targetLang) {
  var all = [];
  for (var i = 0; i < texts.length; i += MAX_BATCH) {
    var batch  = texts.slice(i, i + MAX_BATCH);
    var result = apiTranslateTexts_(mtUid, batch, sourceLang, targetLang);
    result.forEach(function(t) { all.push(t); });
  }
  return all;
}


// ?? UI helpers ????????????????????????????????

function langLabel_(code) {
  if (code === "auto") return "Auto-detect";
  return CONFIG.LANGUAGES[code] || code;
}

function notify_(msg) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(msg))
    .build();
}