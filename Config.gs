/**
 * ????????????????????????????????????????????????????????????
 * Config.gs ? K?rcher Translation Add-on (Docs / Sheets / Slides)
 * ????????????????????????????????????????????????????????????
 *
 * Profile UIDs werden aus ScriptProperties geladen,
 * nicht mehr hardcoded. Admins setzen sie via
 * ADMIN_setProfile("MARKETING", "Zpfa4GJsY5rl4J9q070rV5", "Marketing")
 */

var CONFIG = {
  API_V1: "https://cloud.memsource.com/web/api2/v1",
  API_V2: "https://cloud.memsource.com/web/api2/v2",
  API_V3: "https://cloud.memsource.com/web/api2/v3",

  PROP_TOKEN:       "PHRASE_API_TOKEN",
  PROP_PROFILE:     "KAERCHER_PROFILE",
  PROP_SOURCE_LANG: "PHRASE_SOURCE_LANG",
  PROP_TARGET_LANG: "PHRASE_TARGET_LANG",

  // Prefix for profile UIDs in ScriptProperties
  // Stored as: MT_PROFILE_MARKETING = JSON { uid, label }
  PROFILE_PREFIX: "MT_PROFILE_",

  // Admin usage log ? ID of the external Google Sheet that logs every
  // translation run. Set via ADMIN_createUsageLogSheet() or
  // ADMIN_setUsageLogSheetId("SPREADSHEET_ID"). Not shown in the add-on UI.
  PROP_LOG_SHEET_ID: "ADMIN_USAGE_LOG_SHEET_ID",

  // ?? "What's New" one-time popup ??????????????????????
  // Shown once per user until they click through. Bump WHATS_NEW_VERSION
  // whenever you want it to reappear for everyone. State is stored in each
  // user's own UserProperties ? never centrally logged, no admin visibility
  // into who has or hasn't seen it.
  PROP_WHATS_NEW_SEEN: "WHATS_NEW_SEEN_VERSION",
  WHATS_NEW_VERSION:   "1.1",
  WHATS_NEW_ITEMS: [
    {
      title: "?? Translate speaker notes only",
      text:  "A new button in Slides lets you translate just the speaker notes across all slides, without touching the slide content."
    },
    {
      title: "? Grouped objects now supported",
      text:  "Text boxes grouped with each other, or grouped with images and graphics, are now translated automatically in Slides. You no longer need to ungroup them first."
    },
    {
      title: "? Automatic backup copy",
      text:  "A timestamped backup copy is created automatically before a full-document translation as a fallback. "
    },
    {
      title: "? Formulas in G-SHEET are left untouched",
      text:  "Cells containing formulas in Google Sheets are now skipped, so a formula is never overwritten with translated text."
    }
  ],

  // Offizielle Add-on Profile (inklusive hinterlegter K?rcher-Glossare)
  MT_PROFILE_DEFAULTS: {
    MARKETING: { label: "Marketing", uid: "Zpfa4GJsY5rl4J9q070rV5" }, // Add-on Marketing
    TECHNICAL: { label: "Technical", uid: "GrigHtkTDZUF4xYGWFmpI2" }, // Add-on Technical
    GENERAL:   { label: "General",   uid: "gC20LvuraAQGr2lXlrubL4" }  // Add-on General
  },

  LANGUAGES: {
    de: "German",    en: "English",   es: "Spanish",    sv: "Swedish", 
    pt: "Portuguese",
    ru: "Russian",   it: "Italian",   fr: "French",     nl: "Dutch",
    hu: "Hungarian", sk: "Slovak",    hr: "Croatian",   tr: "Turkish",
    pl: "Polish",    fi: "Finnish",   sr: "Serbian",    ar: "Arabic",
    bg: "Bulgarian", el: "Greek",     ko: "Korean",     da: "Danish",
    ja: "Japanese",  vi: "Vietnamese",zh: "Chinese",    lv: "Latvian",
    cs: "Czech",     uk: "Ukrainian", ro: "Romanian",   et: "Estonian",
    sl: "Slovenian", nb: "Norwegian", 
  },

  REPORT_ISSUE_URL: "https://taskbox.karcher.com/plugins/servlet/desk/portal/97/create/4019",
  REPORT_TRANSISSUE_URL: "https://taskbox.karcher.com/plugins/servlet/desk/portal/97/create/4030",

  // ?? Size limits ?????????????????????????????????????
  MAX_ELEMENTS_WARN:  3000,   // Show warning above this
  MAX_ELEMENTS_BLOCK: 8000    // Block translation above this
};

var MAX_BATCH = 500;

// ?? Retry settings ??????????????????????????????????
var RETRY_MAX_ATTEMPTS   = 3;
var RETRY_INITIAL_WAIT   = 2000;  // 2 seconds
var RETRY_BACKOFF_FACTOR = 2;


/**
 * Load MT profiles from ScriptProperties.
 * Falls back to hardcoded defaults if nothing is stored yet.
 * Returns object like { MARKETING: { uid, label }, TECHNICAL: { ? }, ? }
 */
function getMtProfiles_() {
  var props    = PropertiesService.getScriptProperties().getProperties();
  var profiles = {};
  var found    = false;

  Object.keys(props).forEach(function(key) {
    if (key.indexOf(CONFIG.PROFILE_PREFIX) === 0) {
      var profileKey = key.substring(CONFIG.PROFILE_PREFIX.length);
      try {
        profiles[profileKey] = JSON.parse(props[key]);
        found = true;
      } catch (_) {}
    }
  });

  return found ? profiles : CONFIG.MT_PROFILE_DEFAULTS;
}

/**
 * Get the UID for a given profile key (e.g. "MARKETING").
 */
function getMtUidForProfile_(profileKey) {
  var profiles = getMtProfiles_();
  var profile  = profiles[profileKey];
  if (!profile) throw new Error("Unknown profile: " + profileKey);
  return profile.uid;
}