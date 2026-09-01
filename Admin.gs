/**
 * ????????????????????????????????????????????????????????????
 *  Admin.gs ? Admin & debug functions
 * ????????????????????????????????????????????????????????????
 *
 *  Profile management:
 *    ADMIN_setProfile("MARKETING", "QWh4eGGS2qV81G0YmgE5f7", "Marketing")
 *    ADMIN_removeProfile("MARKETING")
 *    ADMIN_listStoredProfiles()
 *
 *  Usage log (admin-only, separate Google Sheet, not shown in the add-on):
 *    ADMIN_createUsageLogSheet()          ? creates the log sheet & wires it up
 *    ADMIN_setUsageLogSheetId("id")       ? point to an existing sheet instead
 *    ADMIN_getUsageLogSheetUrl()          ? print the current log sheet URL
 *    ADMIN_clearUsageLogSheetId()         ? disable logging
 */

// ?? Token management ??????????????????????????

function ADMIN_setApiToken() {
  // 1) Paste token here, run, then remove it from code
  var MY_TOKEN = "VE7ITYTIRgeNlCuyI1mFo9Vv0FQhdO41fapVfihLFtn7dfkWBGx4hjU0QEln81Jxf";

  if (!MY_TOKEN || MY_TOKEN === "PASTE_YOUR_PHRASE_API_TOKEN_HERE") {
    throw new Error("? Please paste your Phrase API token into MY_TOKEN first.");
  }

  PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_TOKEN, MY_TOKEN);

  var saved = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_TOKEN);
  if (!saved)          throw new Error("? Token was not saved.");
  if (saved.length < 10) throw new Error("? Saved token looks too short.");

  console.log("? Token saved. Now REMOVE it from code.");
}

function ADMIN_clearApiToken() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROP_TOKEN);
  console.log("? Token deleted.");
}

function ADMIN_debugTokenLocation() {
  var sp = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_TOKEN);
  var up = PropertiesService.getUserProperties().getProperty(CONFIG.PROP_TOKEN);
  console.log("ScriptProperties token present:", !!sp, sp ? ("len=" + sp.length) : "");
  console.log("UserProperties token present:",   !!up, up ? ("len=" + up.length) : "");
}


// ?? Profile management (ScriptProperties) ?????

/**
 * Set or update a translation profile.
 * @param {string} key   ? Profile key, e.g. "MARKETING", "TECHNICAL", "GENERAL"
 * @param {string} uid   ? Phrase profile UID
 * @param {string} label ? Display label shown in the UI
 *
 * Example:
 *   ADMIN_setProfile("MARKETING", "QWh4eGGS2qV81G0YmgE5f7", "Marketing")
 */
function ADMIN_setProfile(key, uid, label) {
  if (!key || !uid || !label) {
    throw new Error('Usage: ADMIN_setProfile("MARKETING", "uid-here", "Marketing")');
  }
  key = key.toUpperCase();
  var data = JSON.stringify({ uid: uid, label: label });
  PropertiesService.getScriptProperties().setProperty(CONFIG.PROFILE_PREFIX + key, data);
  console.log("? Profile saved: " + key + " ? " + label + " (" + uid.substring(0, 18) + "?)");
}

/**
 * Remove a profile.
 */
function ADMIN_removeProfile(key) {
  if (!key) throw new Error('Usage: ADMIN_removeProfile("MARKETING")');
  key = key.toUpperCase();
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROFILE_PREFIX + key);
  console.log("? Profile removed: " + key);
}

/**
 * List all stored profiles.
 */
function ADMIN_listStoredProfiles() {
  var profiles = getMtProfiles_();
  var keys     = Object.keys(profiles);

  if (!keys.length) {
    console.log("No profiles stored. Using hardcoded defaults.");
    return;
  }

  console.log("=== Stored Translation Profiles ===");
  keys.forEach(function(key) {
    var p = profiles[key];
    console.log(key + " ? " + p.label + "\n  UID: " + p.uid);
  });
}

/**
 * Seed default profiles into ScriptProperties.
 * Run once after initial setup to migrate from hardcoded values.
 */
function ADMIN_seedDefaultProfiles() {
  var defaults = CONFIG.MT_PROFILE_DEFAULTS;
  Object.keys(defaults).forEach(function(key) {
    var p = defaults[key];
    var propKey = CONFIG.PROFILE_PREFIX + key;
    var existing = PropertiesService.getScriptProperties().getProperty(propKey);
    if (!existing) {
      PropertiesService.getScriptProperties().setProperty(propKey, JSON.stringify(p));
      console.log("Seeded: " + key + " ? " + p.label);
    } else {
      console.log("Skipped (already exists): " + key);
    }
  });
  console.log("? Done. Run ADMIN_listStoredProfiles() to verify.");
}


// ?? Phrase API diagnostics ????????????????????

function ADMIN_listLanguageAiProfiles() {
  console.log("=== Language AI Profiles (from Phrase API) ===");
  try {
    var profiles = apiListLanguageAiProfiles_();
    if (!profiles.length) { console.log("No profiles found."); return; }
    profiles.forEach(function(p, i) {
      console.log((i + 1) + ". " + p.name + "  |  Profile UID: " + p.uid);
      if (p.engines.length) {
        p.engines.forEach(function(e) {
          console.log("   ?? Engine: " + e.name + "  |  MT UID: " + e.uid);
        });
      } else {
        console.log("   ?? ??  No engine configured!");
      }
    });
  } catch (err) {
    console.error("? " + err.message);
  }
}

function ADMIN_testTranslation() {
  var profiles = getMtProfiles_();
  var key      = Object.keys(profiles)[0];
  if (!key) { console.error("? No profile configured."); return; }

  var p = profiles[key];
  console.log("Testing profile: " + p.label + " (" + p.uid + ")");

  var result = apiTranslateTexts_(p.uid, ["K?rcher cleans.", "Power for professionals."], "en", "de");
  console.log("? Result:");
  result.forEach(function(t, i) { console.log("  [" + i + "] " + t); });
}
function ADMIN_updateToOfficialAddonProfiles() {
  // Wir nutzen deine ADMIN_setProfile Funktion, um die neuen UIDs in die ScriptProperties zu pushen
  ADMIN_setProfile("MARKETING", "Zpfa4GJsY5rl4J9q070rV5", "Marketing");
  ADMIN_setProfile("TECHNICAL", "GrigHtkTDZUF4xYGWFmpI2", "Technical");
  ADMIN_setProfile("GENERAL", "gC20LvuraAQGr2lXlrubL4", "General");
  
  console.log("? Fertig! Die Profile 'Add-on Marketing', 'Add-on Technical' und 'Add-on General' sind jetzt live aktiv.");
}


// ?? Usage log administration ??????????????????
//
//  The add-on logs every translation run (user email, app, action, profile,
//  source/target language, segment count, word count, engine used) as a
//  row in a separate Google Sheet. That sheet is NEVER shown inside the
//  add-on itself ? only admins who have access to it can see the usage data.
//
//  IMPORTANT: the add-on runs in the context of whoever clicks the button,
//  not in your context. For logging to work for all users, this sheet
//  must be shared with at least "Editor" rights for everyone who uses
//  the add-on (e.g. shared with your whole Google Workspace domain).
//
//  NOTE ON PRIVACY: this logs each user's email address together with
//  their translation activity. Please confirm this is compatible with
//  your organization's data protection policy (GDPR) before rolling it
//  out ? e.g. by informing users that usage is logged for admin purposes.

/**
 * Creates a brand-new Google Sheet for usage logging and stores its ID
 * in ScriptProperties. Run this once during setup.
 */
function ADMIN_createUsageLogSheet() {
  var ss = SpreadsheetApp.create("K?rcher Translation Add-on ? Usage Log");
  PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_LOG_SHEET_ID, ss.getId());

  console.log("? Log-Sheet erstellt: " + ss.getUrl());
  console.log("??  Wichtig: Teile dieses Sheet jetzt mit 'Bearbeiter'-Rechten f?r alle Nutzer " +
              "des Add-ons (z.B. deine gesamte Domain) ? sonst k?nnen nur du selbst Log-Eintr?ge schreiben.");
  return ss.getUrl();
}

/**
 * Points logging to an existing Google Sheet instead of creating a new one.
 * @param {string} id ? the Spreadsheet ID (from its URL)
 */
function ADMIN_setUsageLogSheetId(id) {
  if (!id) throw new Error('Usage: ADMIN_setUsageLogSheetId("SPREADSHEET_ID_HIER")');
  PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_LOG_SHEET_ID, id);
  console.log("? Log-Sheet-ID gespeichert: " + id);
}

/**
 * Prints the URL of the currently configured usage log sheet.
 */
function ADMIN_getUsageLogSheetUrl() {
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_LOG_SHEET_ID);
  if (!id) {
    console.log("? Noch kein Log-Sheet konfiguriert. F?hre ADMIN_createUsageLogSheet() aus.");
    return null;
  }
  var url = "https://docs.google.com/spreadsheets/d/" + id + "/edit";
  console.log(url);
  return url;
}

/**
 * Disables usage logging (removes the link to the log sheet; the sheet
 * itself, if any, is not deleted).
 */
function ADMIN_clearUsageLogSheetId() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROP_LOG_SHEET_ID);
  console.log("? Log-Sheet-Verkn?pfung entfernt ? Logging ist damit deaktiviert.");
}

/**
 * One-time migration: if you already ran ADMIN_createUsageLogSheet() before
 * the "User" column was added, the header row won't update automatically
 * (it's only written once, when the sheet is empty). Run this once to
 * insert a "User" column as column B into an existing log sheet.
 * Safe to run multiple times ? does nothing if the column already exists.
 */
function ADMIN_addUserColumnToLog() {
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_LOG_SHEET_ID);
  if (!id) { console.log("? Kein Log-Sheet konfiguriert. F?hre ADMIN_createUsageLogSheet() aus."); return; }

  var ss    = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName("Usage Log");
  if (!sheet) { console.log("? Tab 'Usage Log' nicht gefunden."); return; }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (header[1] === "User") {
    console.log("? Spalte 'User' existiert bereits ? keine ?nderung n?tig.");
    return;
  }

  sheet.insertColumnAfter(1);
  sheet.getRange(1, 2).setValue("User").setFontWeight("bold");
  console.log("? Spalte 'User' als Spalte B eingef?gt. Bestehende Zeilen bleiben dort leer " +
              "(keine r?ckwirkende E-Mail-Zuordnung), neue ?bersetzungen werden ab sofort mit E-Mail geloggt.");
}


// ?? "What's New" popup administration ?????????

/**
 * Resets the "What's New" popup for YOUR account only (UserProperties),
 * so you can preview it again after editing CONFIG.WHATS_NEW_ITEMS.
 * Does not affect other users.
 */
function ADMIN_resetWhatsNewForMe() {
  PropertiesService.getUserProperties().deleteProperty(CONFIG.PROP_WHATS_NEW_SEEN);
  console.log("? 'What's New' wird dir beim n?chsten ?ffnen des Add-ons wieder angezeigt.");
}
