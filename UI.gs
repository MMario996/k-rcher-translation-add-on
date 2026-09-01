/**
 * ????????????????????????????????????????????????????????????
 *  Ui.gs ? Card UI (Docs / Sheets / Slides only, no Drive)
 * ????????????????????????????????????????????????????????????
 */

function onHomepage(e) {
  try { getToken_(); } catch (_) { return buildSetupCard_(); }

  if (!hasSeenWhatsNew_()) {
    return buildWhatsNewCard_(e);
  }
  return buildMainCard_(e);
}

function onSettings(e) {
  return buildSettingsCard_();
}

function onHelp(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildManualCard_()))
    .build();
}


// ?? "What's New" one-time popup ???????????????
//
//  Shown once per user (tracked in that user's own UserProperties ? never
//  centrally logged, no admin visibility into who has/hasn't seen it).
//  Bump CONFIG.WHATS_NEW_VERSION to make it reappear for everyone.

function hasSeenWhatsNew_() {
  return getSetting_(CONFIG.PROP_WHATS_NEW_SEEN, "") === CONFIG.WHATS_NEW_VERSION;
}

function buildWhatsNewCard_(e) {
  // Host app is detected here (while `e` still has full trigger context)
  // and passed along as a button parameter, so the follow-up click handler
  // doesn't need to rely on host context being present on the click event.
  var hostApp = detectHostApp_(e);

  var card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle("K?RCHER TRANSLATION")
        .setSubtitle("? What's New")
        .setImageUrl("https://i.imgur.com/ZcTRAu7.png")
        .setImageStyle(CardService.ImageStyle.SQUARE)
    );

  var section = CardService.newCardSection().setCollapsible(false);
  CONFIG.WHATS_NEW_ITEMS.forEach(function(item) {
    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel(item.title)
        .setText(item.text)
        .setWrapText(true)
    );
  });
  section.addWidget(CardService.newDivider());
  section.addWidget(
    CardService.newTextParagraph().setText(
      "<i>This is a one-time message. You won't see it again after clicking below.</i>"
    )
  );
  card.addSection(section);

  card.addSection(
    CardService.newCardSection()
      .addWidget(
        CardService.newTextParagraph().setText("Click below to continue to the add-on.")
      )
      .addWidget(
        CardService.newTextButton()
          .setText("GOT IT - CLICK TO CONTINUE")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("handleWhatsNewContinue")
              .setParameters({ hostApp: hostApp })
          )
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      )
  );

  return card.build();
}

function handleWhatsNewContinue(e) {
  setSetting_(CONFIG.PROP_WHATS_NEW_SEEN, CONFIG.WHATS_NEW_VERSION);

  var hostApp  = (e.parameters && e.parameters.hostApp) || "UNKNOWN";
  var settings = getAllUserSettings_();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainCardForHost_(hostApp, settings)))
    .build();
}


// ?? Main card ?????????????????????????????????

function buildMainCard_(e) {
  var settings = getAllUserSettings_();
  var hostApp  = detectHostApp_(e);
  return buildMainCardForHost_(hostApp, settings);
}

function buildMainCardForHost_(hostApp, settings) {
  if (hostApp === "UNKNOWN") {
    return buildUnsupportedCard_();
  }

  return CardService.newCardBuilder()
    .setHeader(buildKaercherHeader_(hostApp))
    .addSection(buildProfileSection_(settings.profile))
    .addSection(buildLanguageSection_(settings.sourceLang, settings.targetLang))
    .addSection(buildActionSection_(hostApp))
    .addSection(buildHelpFooter_())
    .addSection(buildReportSection_())
    .build();
}


// ?? Action section (per host app) ?????????????

function buildActionSection_(hostApp) {
  var section = CardService.newCardSection()
    .setHeader("IMPORTANT")
    .setCollapsible(false);

  // Profile reminder
  section.addWidget(
    CardService.newTextParagraph().setText(
      "? Make sure to select the correct <b>translation profile</b> before translating and having <b>writing rights</b> for this document or make a local copy of it."
    )
  );
  section.addWidget(CardService.newDivider());

  if (hostApp === "DOCS") {
    section.addWidget(
      CardService.newTextParagraph().setText(
        "? <b>Select text</b> to translate a section, or press <b>Ctrl+A</b> (?+A) to select the entire document."
      )
    );
    section.addWidget(CardService.newDivider());
    section.addWidget(
      CardService.newTextButton()
        .setText("TRANSL. SELECTION")
        .setOnClickAction(CardService.newAction().setFunctionName("handleDocsSelectionTranslate"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Translates only the selected text and replaces it in-place.")
        .setWrapText(true)
    );
    section.addWidget(CardService.newDivider());
    section.addWidget(
      CardService.newTextButton()
        .setText("TRANSL. ENTIRE DOCUMENT")
        .setOnClickAction(CardService.newAction().setFunctionName("handleDocsFullTranslate"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Translates all paragraphs, list items, and table cells. Character formatting (bold, italic, colour) is preserved.")
        .setWrapText(true)
    );

  } else if (hostApp === "SHEETS") {
    section.addWidget(
      CardService.newTextParagraph().setText(
        "? <b>Select cells</b> to translate a range, or press <b>Ctrl+A</b> (?+A) to select the entire sheet."
      )
    );
    section.addWidget(CardService.newDivider());
    section.addWidget(
      CardService.newTextButton()
        .setText("TRANSL. SELECTION")
        .setOnClickAction(CardService.newAction().setFunctionName("handleSheetsSelectionTranslate"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Translates selected cells and replaces their content. Cell formatting is preserved.")
        .setWrapText(true)
    );
    section.addWidget(CardService.newDivider());
    section.addWidget(
      CardService.newTextButton()
        .setText("TRANSL. ENTIRE SPREADSHEET")
        .setOnClickAction(CardService.newAction().setFunctionName("handleSheetsFullTranslate"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Translates all text cells across every sheet (numbers are skipped). Cell formatting is preserved.")
        .setWrapText(true)
    );

  } else if (hostApp === "SLIDES") {
    section.addWidget(
      CardService.newTextParagraph().setText(
        "? <b>Select one or more text boxes</b> by clicking on it, then translate the selection or translate all slides at once below."
      )
    );
    section.addWidget(CardService.newDivider());
    section.addWidget(
      CardService.newTextButton()
        .setText("TRANSL. SELECTED SHAPES")
        .setOnClickAction(CardService.newAction().setFunctionName("handleSlidesSelectionTranslate"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Translates the currently selected text boxes. Font, size, and colour are preserved.")
        .setWrapText(true)
    );
    section.addWidget(CardService.newDivider());
    section.addWidget(
      CardService.newTextButton()
        .setText("TRANSL. ALL SLIDES AND NOTES")
        .setOnClickAction(CardService.newAction().setFunctionName("handleSlidesFullTranslate"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Translates every text box, table cell, and speaker note across all slides. Formatting is preserved.")
        .setWrapText(true)
    );
    section.addWidget(CardService.newDivider());
    section.addWidget(
      CardService.newTextButton()
        .setText("TRANSL. SPEAKER NOTES ONLY")
        .setOnClickAction(CardService.newAction().setFunctionName("handleSlidesNotesOnlyTranslate"))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    );
    section.addWidget(
      CardService.newDecoratedText()
        .setText("Translates only the speaker notes across all slides (shapes and tables on the slides themselves are left untouched).")
        .setWrapText(true)
    );
  }

  return section;
}


// ?? Profile section (dynamic from ScriptProperties) ??

function buildProfileSection_(currentProfile) {
  var profiles = getMtProfiles_();
  var section  = CardService.newCardSection()
    .setHeader("TRANSLATION PROFILE")
    .setCollapsible(false);

  var sel = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.RADIO_BUTTON)
    .setFieldName("profile");

  Object.keys(profiles).forEach(function(key) {
    sel.addItem(profiles[key].label, key, key === currentProfile);
  });
  section.addWidget(sel);
  return section;
}


// ?? Language section (no Auto-Detect) ????????

function buildLanguageSection_(currentSource, currentTarget) {
  var section = CardService.newCardSection()
    .setHeader("LANGUAGES")
    .setCollapsible(false);

  // Source language
  var srcSel = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Source Language")
    .setFieldName("sourceLang");

  Object.keys(CONFIG.LANGUAGES).forEach(function(code) {
    srcSel.addItem(CONFIG.LANGUAGES[code], code, code === currentSource);
  });
  section.addWidget(srcSel);

  // Target language
  var tgtSel = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Target Language")
    .setFieldName("targetLang");
  Object.keys(CONFIG.LANGUAGES).forEach(function(code) {
    tgtSel.addItem(CONFIG.LANGUAGES[code], code, code === currentTarget);
  });
  section.addWidget(tgtSel);

  return section;
}


// ?? Footer sections ???????????????????????????

function buildHelpFooter_() {
  return CardService.newCardSection()
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextButton()
        .setText("? HELP")
        .setOnClickAction(CardService.newAction().setFunctionName("onHelp"))
    );
}

function buildReportSection_() {
  return CardService.newCardSection()
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextButton()
        .setText("REPORT BUG")
        .setOpenLink(CardService.newOpenLink().setUrl(CONFIG.REPORT_ISSUE_URL))
    )
    .addWidget(
      CardService.newTextButton()
        .setText("REPORT TRANSLATION ISSUE")
        .setOpenLink(CardService.newOpenLink().setUrl(CONFIG.REPORT_TRANSISSUE_URL))
    );
}


// ?? Special cards ?????????????????????????????

function buildSettingsCard_() {
  var profiles = getMtProfiles_();
  var card     = CardService.newCardBuilder()
    .setHeader(buildKaercherHeader_("UNKNOWN"));

  // API status
  var statusSection = CardService.newCardSection().setHeader("API STATUS");
  var tokenStatus;
  try {
    getToken_();
    tokenStatus = "API  status ?";
  } catch (_) {
    tokenStatus = "API  status ?";
  }
  statusSection.addWidget(CardService.newTextParagraph().setText(tokenStatus));
  card.addSection(statusSection);

  // Profile overview (from ScriptProperties)
  var profileSection = CardService.newCardSection().setHeader("CONFIGURED PROFILES");
  Object.keys(profiles).forEach(function(key) {
    var p = profiles[key];
    profileSection.addWidget(
      CardService.newDecoratedText()
        .setTopLabel(p.label + "  ?")
        .setText("Profile UID: " + p.uid.substring(0, 18) + "?")
        .setWrapText(true)
    );
  });
  card.addSection(profileSection);

  card.addSection(
    CardService.newCardSection()
      .addWidget(
        CardService.newTextButton()
          .setText("Open Phrase TMS")
          .setOpenLink(CardService.newOpenLink().setUrl("https://cloud.memsource.com"))
      )
  );

  card.addSection(buildHelpFooter_());
  card.addSection(buildReportSection_());
  return card.build();
}

function buildSetupCard_() {
  return CardService.newCardBuilder()
    .setHeader(buildKaercherHeader_("UNKNOWN"))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newDecoratedText()
            .setTopLabel("API TOKEN MISSING")
            .setText("No Phrase API token has been configured.")
            .setBottomLabel("Please run ADMIN_setApiToken() in the Apps Script editor.")
            .setWrapText(true)
        )
        .addWidget(
          CardService.newTextButton()
            .setText("Open Phrase API Documentation")
            .setOpenLink(CardService.newOpenLink().setUrl("https://support.phrase.com/hc/en-us/articles/5709716552604"))
        )
    )
    .addSection(buildHelpFooter_())
    .addSection(buildReportSection_())
    .build();
}

function buildUnsupportedCard_() {
  return CardService.newCardBuilder()
    .setHeader(buildKaercherHeader_("UNKNOWN"))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph().setText(
            "Open this add-on inside <b>Google Docs</b>, <b>Sheets</b>, or <b>Slides</b> to translate content in-place."
          )
        )
    )
    .addSection(buildHelpFooter_())
    .addSection(buildReportSection_())
    .build();
}

function createErrorCard_(msg) {
  return CardService.newCardBuilder()
    .setHeader(buildKaercherHeader_("UNKNOWN"))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("?  " + msg))
        .addWidget(
          CardService.newTextButton()
            .setText("? BACK")
            .setOnClickAction(CardService.newAction().setFunctionName("onHomepage"))
        )
    )
    .addSection(buildHelpFooter_())
    .addSection(buildReportSection_())
    .build();
}


// ?? Header & host-app detection ???????????????

function buildKaercherHeader_(hostApp) {
  var subtitles = {
    "DOCS":    "Google Docs  ?  Translate in-place",
    "SHEETS":  "Google Sheets  ?  Translate in-place",
    "SLIDES":  "Google Slides  ?  Translate in-place",
    "UNKNOWN": "Powered by Phrase Machine Translation"
  };
  return CardService.newCardHeader()
    .setTitle("K?RCHER TRANSLATION")
    .setSubtitle(subtitles[hostApp] || subtitles["UNKNOWN"])
    .setImageUrl("https://i.imgur.com/ZcTRAu7.png")
    .setImageStyle(CardService.ImageStyle.SQUARE);
}

function detectHostApp_(e) {
  if (e.docs)   return "DOCS";
  if (e.sheets) return "SHEETS";
  if (e.slides) return "SLIDES";
  return "UNKNOWN";
}