/**
 * ============================================================
 *  Config.gs — ERGÄNZUNG für Gemini-Fallback
 * ============================================================
 *
 *  Diese drei Zeilen einfach unten in deine bestehende Config.gs
 *  einfügen (z.B. direkt nach "var MAX_BATCH = 500;").
 *
 *  Der Gemini-Key wird aus denselben ScriptProperties gelesen wie
 *  beim AutoFix-Hub-Projekt:  GEMINI_API_KEY
 *  (Setzen via Apps Script Editor → Project Settings → Script Properties,
 *   oder per Code: PropertiesService.getScriptProperties()
 *                    .setProperty("GEMINI_API_KEY", "DEIN_KEY");)
 * ============================================================
 */

// 🤖 Gemini fallback settings ========================
//
//  MODELL-HINWEIS: Der Gateway (34-111-99-134.nip.io/gemini) unterstützt
//  nicht alle offiziellen Gemini-Modellnamen — ältere/andere Modelle
//  liefern 404 "not found". Laut autofix-hub-Projekt (gleicher Gateway,
//  gleicher Key) ist aktuell nur "gemini-3.6-flash" freigeschaltet.
var GEMINI_BASE_URL       = "https://34-111-99-134.nip.io/gemini";
var GEMINI_FALLBACK_MODEL = "gemini-3.6-flash";
var GEMINI_BATCH_SIZE     = 25;   // Texte pro Gemini-Request