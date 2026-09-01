/**
 * ????????????????????????????????????????????????????????????
 * Api.gs ? Phrase API wrapper with retry / backoff & Post-Processing
 *          + Gemini fallback when Phrase MT is unavailable (403/429)
 * ????????????????????????????????????????????????????????????
 */

// ?? Translation run statistics ????????????????
//
//  Tracks whether the current translation run fell back to Gemini.
//  Handlers call resetTranslationStats_() at the start of a run and
//  read TRANSLATION_STATS_.usedGeminiFallback afterwards for the
//  admin usage log (see logUsage_() in Helpers.gs).

var TRANSLATION_STATS_ = { usedGeminiFallback: false };

function resetTranslationStats_() {
  TRANSLATION_STATS_.usedGeminiFallback = false;
}


function getToken_() {
  var t = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_TOKEN);
  if (!t) throw new Error("API token missing. Please contact administrator.");
  return t;
}

/**
 * Core API caller with automatic retry on 429 (Too Many Requests).
 * Other 4xx/5xx errors are thrown immediately.
 *
 * NOTE: This function now attaches the HTTP status code to thrown errors
 * (err.phraseCode) so callers can decide whether to fall back to Gemini.
 */
function callApi_(url, method, payload) {
  var token = getToken_();
  var opts  = {
    method:             method || "get",
    headers:            { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  };

  if (payload !== undefined && payload !== null) {
    opts.contentType = "application/json";
    opts.payload     = JSON.stringify(payload);
  }

  var waitMs = RETRY_INITIAL_WAIT;

  for (var attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    var res  = UrlFetchApp.fetch(url, opts);
    var code = res.getResponseCode();

    // ?? Success ?????????????????????????????????
    if (code < 400) {
      var ct = (res.getHeaders()["Content-Type"] || "");
      if (ct.indexOf("application/json") !== -1) {
        try { return JSON.parse(res.getContentText()); }
        catch (_) { return res.getContentText(); }
      }
      return res.getBlob();
    }

    // ?? Rate limit ? retry with backoff ?????????
    if (code === 429) {
      if (attempt < RETRY_MAX_ATTEMPTS) {
        console.warn("Phrase API 429 ? waiting " + waitMs + "ms (attempt " + attempt + "/" + RETRY_MAX_ATTEMPTS + ")");
        Utilities.sleep(waitMs);
        waitMs *= RETRY_BACKOFF_FACTOR;
        continue;
      }
    }

    // ?? Other error ? throw immediately ?????????
    var msg = res.getContentText();
    try {
      var j = JSON.parse(msg);
      msg = j.errorDescription || (j.messages && j.messages.join(", ")) || msg;
    } catch (_) {}

    var err;
    if (code === 429) {
      err = new Error(
        "Phrase API rate limit reached after " + RETRY_MAX_ATTEMPTS +
        " retries. Please wait a moment and try again."
      );
    } else {
      err = new Error("Phrase API error (" + code + "): " + msg);
    }
    err.phraseCode = code;   // ? lets callers detect 403 / 429 etc.
    throw err;
  }
}


// ?? Translation endpoints ?????????????????????

function apiListLanguageAiProfiles_() {
  var data  = callApi_(CONFIG.API_V1 + "/memsourceTranslateProfiles?pageSize=50&includeProjects=false", "get");
  var items = data.content || [];
  return items.map(function(p) {
    return {
      uid:     p.uid,
      name:    p.name,
      engines: (p.engines || []).map(function(e) { return { uid: e.uid, name: e.name }; })
    };
  });
}

function apiTranslateTexts_(profileUid, texts, sourceLang, targetLang) {
  if (!profileUid)             throw new Error("No translation profile selected.");
  if (!targetLang)             throw new Error("No target language selected.");
  if (!texts || !texts.length) throw new Error("No text to translate.");

  var rawTranslations;   // array of strings, same length & order as `texts`

  // ?? 1) Try Phrase first ??????????????????????
  try {
    var body = { sourceTexts: texts, to: targetLang };

    if (sourceLang && sourceLang.trim() && sourceLang !== "auto") {
      body.from = sourceLang;
    }

    var url = CONFIG.API_V1 + "/machineTranslations/" + profileUid + "/translate";
    var res = callApi_(url, "post", body);

    if (!res.translations || !res.translations.length) {
      throw new Error("Phrase returned no translations.");
    }

    rawTranslations = res.translations.map(function(t) {
      // Phrase may return objects or plain strings depending on engine
      if (t && typeof t === "object") return t.translation || t.text || "";
      return t;
    });

  } catch (phraseErr) {
    // ?? 2) Fallback to Gemini on suspension / rate-limit / no-translation ??
    var code = phraseErr.phraseCode;
    var fallbackTriggers =
      code === 403 ||                       // access suspended (your screenshot)
      code === 429 ||                       // quota exhausted after retries
      code === 402 ||                       // payment / quota related
      (code >= 500 && code <= 599) ||       // Phrase server problems
      /no translations/i.test(phraseErr.message || "");

    if (!fallbackTriggers) {
      // Not a fallback-worthy error ? re-throw the original Phrase error
      throw phraseErr;
    }

    console.warn(
      "Phrase MT unavailable (" + (code || "n/a") + ") ? falling back to Gemini. " +
      "Original error: " + phraseErr.message
    );

    TRANSLATION_STATS_.usedGeminiFallback = true;

    rawTranslations = geminiTranslateTexts_(texts, sourceLang, targetLang);
  }

  // ?? 3) Shared post-processing (protected abbreviations) ??
  return postProcessTranslations_(texts, rawTranslations);
}


// ????????????????????????????????????????????????????????????
//  Gemini fallback
// ????????????????????????????????????????????????????????????

/**
 * Reads the Gemini API key from ScriptProperties.
 * Same property as the AutoFix Hub project: GEMINI_API_KEY
 */
function getGeminiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) {
    throw new Error(
      "Phrase machine translation is currently unavailable and no Gemini fallback key " +
      "(GEMINI_API_KEY) is configured. Please contact the administrator."
    );
  }
  return key.trim();
}

/**
 * Translates an array of texts via Gemini and returns an array of the same
 * length / order. Uses JSON mode so each input maps cleanly to one output.
 *
 * Batches to keep prompts small and reliable.
 */
function geminiTranslateTexts_(texts, sourceLang, targetLang) {
  var key   = getGeminiKey_();
  var model = GEMINI_FALLBACK_MODEL;
  var url   = GEMINI_BASE_URL + "/v1beta/models/" + model + ":generateContent";

  var srcLabel = (sourceLang && sourceLang !== "auto")
    ? langLabel_(sourceLang)
    : "the source language (auto-detect)";
  var tgtLabel = langLabel_(targetLang);

  var out = [];

  for (var i = 0; i < texts.length; i += GEMINI_BATCH_SIZE) {
    var batch = texts.slice(i, i + GEMINI_BATCH_SIZE);

    // Build an indexed item list so we can re-map answers exactly.
    var items = batch.map(function(t, idx) {
      return { id: idx, text: String(t == null ? "" : t) };
    });

    var prompt =
      "You are a professional translator for Alfred K?rcher SE & Co. KG.\n" +
      "Translate each item's \"text\" from " + srcLabel + " into " + tgtLabel + ".\n\n" +
      "STRICT RULES:\n" +
      "1. Translate ONLY the text. Do not add, remove, explain or comment.\n" +
      "2. Keep numbers, measurement units (bar, ?C, l/h, kW), product names " +
         "(e.g. \"K 2\", \"HD 6/13\") and product codes UNCHANGED.\n" +
      "3. Keep any placeholders or tags ({0}, %s, <x/>, <g> etc.) exactly as-is.\n" +
      "4. \"K?rcher\" always keeps its umlaut.\n" +
      "5. If a text is already in " + tgtLabel + ", return it unchanged.\n" +
      "6. Preserve leading/trailing whitespace and line breaks of each text.\n\n" +
      "Return ONLY valid JSON, no markdown, in this exact shape:\n" +
      "{ \"translations\": [ { \"id\": <number>, \"text\": \"<translation>\" } ] }\n\n" +
      "ITEMS:\n" +
      JSON.stringify(items);

    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:      0.2,
        responseMimeType: "application/json",
        maxOutputTokens:  8192
      }
    };

    var batchResult = geminiCallWithRetry_(url, key, payload, batch.length);

    // Re-map by id; fall back to original text if an id is missing.
    var byId = {};
    batchResult.forEach(function(r) {
      if (r && typeof r.id === "number") byId[r.id] = (r.text != null ? r.text : "");
    });

    for (var j = 0; j < batch.length; j++) {
      out.push(byId.hasOwnProperty(j) ? byId[j] : batch[j]);
    }
  }

  return out;
}

/**
 * Single Gemini call with retry on 429/5xx. Returns the parsed
 * translations array ([{id, text}, ...]).
 */
function geminiCallWithRetry_(url, key, payload, expectedCount) {
  var opts = {
    method:             "post",
    contentType:        "application/json",
    muteHttpExceptions: true,
    headers:            { "x-api-key": key, "Accept": "application/json" },
    payload:            JSON.stringify(payload)
  };

  var waitMs = RETRY_INITIAL_WAIT;

  for (var attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    var res  = UrlFetchApp.fetch(url, opts);
    var code = res.getResponseCode();
    var body = res.getContentText();

    if (code < 400) {
      try {
        var json    = JSON.parse(body);
        var rawText = json.candidates[0].content.parts[0].text;
        rawText     = rawText.replace(/^```(json)?\s*/gi, "").replace(/```\s*$/gi, "").trim();
        var parsed  = JSON.parse(rawText);
        return parsed.translations || [];
      } catch (parseErr) {
        throw new Error("Gemini fallback returned an unreadable response: " + parseErr.message);
      }
    }

    if ((code === 429 || (code >= 500 && code <= 599)) && attempt < RETRY_MAX_ATTEMPTS) {
      console.warn("Gemini " + code + " ? waiting " + waitMs + "ms (attempt " +
                   attempt + "/" + RETRY_MAX_ATTEMPTS + ")");
      Utilities.sleep(waitMs);
      waitMs *= RETRY_BACKOFF_FACTOR;
      continue;
    }

    throw new Error("Gemini fallback error (" + code + "): " + body.substring(0, 300));
  }
}


// ????????????????????????????????????????????????????????????
//  Post-processing (protected abbreviations) ? engine-agnostic
// ????????????????????????????????????????????????????????????

function postProcessTranslations_(texts, translations) {
  var protectedAbbrs = [
    "FSG-PS", "FTC-OA", "MMK-SP", "AK-BLX", "AK-KAZ", "AK-SGP", "CDO-M", "CEB-E", "CHR-S", "CHT-P",
    "CHT-R", "CHT-T", "FRI-A", "FSG-F", "FSG-M", "FSG-S", "FTC-D", "FTC-S", "FTC-V", "MBP-G",
    "MBS-C", "MEC-C", "MMK-S", "MMR-M", "MMT-M", "MMV-P", "MPX-C", "MRE-E", "MRP-C", "OFC-I",
    "OFF-T", "OQH-S", "OQQ-P", "TFP-S", "TFT-T", "TIN-P", "TOG-O", "TOM-P", "AK-AE", "AK-AM",
    "AK-AR", "AK-AT", "AK-AU", "AK-AZ", "AK-BD", "AK-BG", "AK-BR", "AK-BY", "AK-CA", "AK-CH",
    "AK-CL", "AK-CN", "AK-CO", "AK-CZ", "AK-DA", "AK-DK", "AK-EC", "AK-EE", "AK-EG", "AK-ES",
    "AK-FI", "AK-FR", "AK-GE", "AK-GR", "AK-HK", "AK-HR", "AK-HU", "AK-ID", "AK-IE", "AK-IN",
    "AK-IT", "AK-JA", "AK-KE", "AK-KH", "AK-KR", "AK-KZ", "AK-LT", "AK-LV", "AK-MA", "AK-MD",
    "AK-MX", "AK-MY", "AK-NG", "AK-NL", "AK-NO", "AK-NZ", "AK-PA", "AK-PE", "AK-PH", "AK-PL",
    "AK-PT", "AK-RO", "AK-RS", "AK-RU", "AK-SE", "AK-SI", "AK-SK", "AK-SV", "AK-TH", "AK-TN",
    "AK-TR", "AK-TW", "AK-UA", "AK-UK", "AK-US", "AK-UZ", "AK-VN", "AK-ZA", "WOMA", "CDN",
    "CDP", "CDS", "CFB", "CHC", "CHD", "CHG", "CHH", "CHI", "CHM", "CHT", "CMS", "FCC",
    "FCG", "FCI", "FCM", "FCO", "FCT", "FRG", "FRL", "FRX", "FSG", "FTC", "FXV", "FXW",
    "FXY", "GBV", "MAA", "MAB", "MAS", "MAT", "MBA", "MBD", "MMC", "MMP", "MMV", "MPY",
    "MPZ", "MRH", "MXM", "MXP", "MXS", "OEI", "OFB", "OFE", "OFO", "OFP", "OFW", "OPC",
    "OPE", "OPF", "OPG", "OPP", "OQD", "OQM", "OQS", "OSC", "OSE", "OSP", "OSW", "SWT",
    "TFD", "TFE", "TFF", "TFR", "TFS", "TIA", "TIC", "TIF", "TIS", "TIV", "TIW", "TOE",
    "TOH", "TOO", "TOP", "TPC", "TPE", "TPH", "TPP", "TPS", "TPT", "TPV", "TRA", "TRC",
    "TRE", "TRF", "TRP", "TRS", "AKW", "CF", "CH", "CM", "EE", "FC", "FR", "FX", "MA",
    "MB", "ME", "MM", "MP", "MR", "MX", "OF", "OP", "OQ", "OS", "TF", "TI", "TO", "TP", "TR"
  ];

  // Performance-Booster: Regex-Ausdr?cke einmalig vorab kompilieren, statt tausendfach in der Schleife!
  var compiledRules = protectedAbbrs.map(function(abbr) {
    var escapedAbbr = abbr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return {
      abbr: abbr,
      upperRegex:  new RegExp('\\b' + escapedAbbr.toUpperCase() + '\\b'),
      lowerRegex:  new RegExp('\\b' + escapedAbbr.toLowerCase() + '\\b'),
      targetRegex: new RegExp('\\b' + escapedAbbr + '\\b', 'gi')
    };
  });

  // ?? Post-Processing-Schleife f?r alle Texte im aktuellen Batch ??
  var finalizedTranslations = translations.map(function(translatedText, index) {
    if (!translatedText || typeof translatedText !== "string") return translatedText;

    var originalText  = texts[index];
    var correctedText = translatedText;

    compiledRules.forEach(function(rule) {
      // Pr?fen, welche Schreibweise im Originaltext exakt vorlag
      var hasUpper = rule.upperRegex.test(originalText);
      var hasLower = rule.lowerRegex.test(originalText);

      if (hasUpper || hasLower) {

        // A) SONDERLOGIK F?R "AKW": Falls die Engine es komplett ?bersetzt hat (z.B. zu NPP oder Nuclear Power Plant)
        if (rule.abbr === "AKW") {
          if (hasUpper) {
            correctedText = correctedText.replace(/NPP|Nuclear Power Plant|nuclear power plant/g, "AKW");
          } else if (hasLower) {
            correctedText = correctedText.replace(/NPP|Nuclear Power Plant|nuclear power plant/gi, "akw");
          }
        }

        // B) ALLGEMEINE ERZWUNGENE KORREKTUR: ?berschreibt falsche Schreibweisen im Zieltext mit der Originalform
        if (hasUpper) {
          correctedText = correctedText.replace(rule.targetRegex, rule.abbr.toUpperCase());
        } else if (hasLower) {
          correctedText = correctedText.replace(rule.targetRegex, rule.abbr.toLowerCase());
        }
      }
    });

    return correctedText;
  });

  return finalizedTranslations;
}