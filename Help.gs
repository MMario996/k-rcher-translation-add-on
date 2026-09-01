/**
 * ????????????????????????????????????????????????????????????
 *  Help.gs ? User manual / help card
 * ????????????????????????????????????????????????????????????
 */

function buildManualCard_() {
  var card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle("K?RCHER TRANSLATION ? HELP")
        .setSubtitle("User Manual")
        .setImageUrl("https://i.imgur.com/ZcTRAu7.png")
        .setImageStyle(CardService.ImageStyle.SQUARE)
    );

  // ?? OVERVIEW ??????????????????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("? OVERVIEW")
      .setCollapsible(false)
      .addWidget(
        CardService.newTextParagraph().setText(
          "The K?rcher Translation Add-on lets you translate content directly inside " +
          "<b>Google Docs, Sheets, and Slides</b> powered by <b>Phrase Machine Translation</b> " +
          "with K?rcher-specific terminology profiles.\n\n" +
          "All translations run through your selected <b>Translation Profile</b>, which includes " +
          "the correct MT engine and any configured glossaries for that content type.\n\n" +
          "<b>Text formatting is preserved</b> wherever technically possible bold, italic, " +
          "underline, font family/size, and colour are maintained after translation."
        )
      )
  );

  // ?? TRANSLATION PROFILES ??????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("?? TRANSLATION PROFILES")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText(
          "Choose the profile that matches your content type before translating:"
        )
      )
      .addWidget(
        CardService.newDecoratedText()
          .setTopLabel("MARKETING")
          .setText("")
          .setBottomLabel("Use for marketing documents.")
          .setWrapText(true)
      )
      .addWidget(
        CardService.newDecoratedText()
          .setTopLabel("TECHNICAL")
          .setText("")
          .setBottomLabel("Use for technical documents.")
          .setWrapText(true)
      )
      .addWidget(
        CardService.newDecoratedText()
          .setTopLabel("GENERAL")
          .setText("")
          .setBottomLabel("Use for general content.")
          .setWrapText(true)
      )
      .addWidget(
        CardService.newTextParagraph().setText(
          "? <i>Each profile uses K?rcher's approved terminology. Glossaries are applied automatically. No extra steps needed.</i>"
        )
      )
  );

  // ?? LANGUAGES ?????????????????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("? LANGUAGES")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText(
          "<b>Source Language:</b> The language your document is written in. " +
          "<b>Target Language:</b> The language you want to translate into.\n\n" +
          "Your language settings are saved automatically and will be remembered the next time you open the add-on."
        )
      )
  );

  // ?? GOOGLE DOCS ???????????????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("1?? GOOGLE DOCS")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText(
          "<b>Translate Selection</b>\n" +
          "1. Select the text you want to translate, or press Ctrl+A to select the entire document.\n" +
          "2. Click ? TRANSLATE SELECTION.\n" +
          "3. The selected text is replaced in place with the translation.\n\n" +
          "<b>Translate Entire Document</b>\n" +
          "1. Click ?? TRANSLATE ENTIRE DOCUMENT.\n" +
          "2. All paragraphs, list items, and table cells are translated.\n" +
          "3. Empty paragraphs are automatically skipped.\n\n" +
          "<b>Formatting:</b> Character formatting (bold, italic, underline, font family/size, colour) " +
          "is preserved after translation.\n\n" +
          "?? <i>For large documents, make a copy before translating. Very long documents may need to be translated section by section.</i>"
        )
      )
  );

  // ?? GOOGLE SHEETS ?????????????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("2?? GOOGLE SHEETS")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText(
          "<b>Translate Selection</b>\n" +
          "1. Select the cells you want to translate.\n" +
          "2. Click ? TRANSLATE SELECTION.\n" +
          "3. Cell contents are replaced with translations.\n\n" +
          "<b>Translate Entire Spreadsheet</b>\n" +
          "1. Click ?? TRANSLATE ENTIRE SPREADSHEET.\n" +
          "2. All text cells across every sheet are translated.\n" +
          "3. Numbers and empty cells are automatically skipped.\n\n" +
          "<b>Formatting:</b> Cell formatting (background colour, font, borders, number format) " +
          "is fully preserved, only cell values are changed.\n\n" +
          "?? <i>All sheets in the spreadsheet are affected. Make a copy before translating large files.</i>"
        )
      )
  );

  // ?? GOOGLE SLIDES ?????????????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("3?? GOOGLE SLIDES")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText(
          "<b>Translate Selected Shapes</b>\n" +
          "1. Click on a text box or shape on the current slide.\n" +
          "2. Click ? TRANSLATE SELECTED SHAPES.\n" +
          "3. Only the selected text boxes are translated.\n\n" +
          "<b>Translate All Slides + Notes</b>\n" +
          "1. Click ?? TRANSLATE ALL SLIDES + NOTES ? no selection needed.\n" +
          "2. Every text box and table cell across all slides is translated.\n" +
          "3. <b>Speaker notes</b> on every slide are also translated automatically.\n\n" +
          "<b>Translate Speaker Notes Only</b>\n" +
          "1. Click ? TRANSL. SPEAKER NOTES ONLY ? no selection needed.\n" +
          "2. Only the speaker notes on every slide are translated.\n" +
          "3. Text boxes and tables on the slides themselves are left untouched.\n\n" +
          "<b>Grouped objects:</b> Text boxes that are grouped with each other, or grouped together " +
          "with images/graphics, are detected and translated automatically. You do <b>not</b> need to " +
          "ungroup them first.\n\n" +
          "<b>Formatting:</b> Paragraph alignment, line spacing, and run-level formatting " +
          "(bold, italic, underline, font family/size, colour) are preserved after translation.\n\n" +
          "?? <i>Complex nested text runs may be simplified. Always review critical slides after translation.</i>"
        )
      )
  );

  // ?? TIPS & BEST PRACTICES ?????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("? TIPS & BEST PRACTICES")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(1)
      .addWidget(
        CardService.newTextParagraph().setText(
          "? <b>Make a copy before full-document translation</b> in-place translation cannot be undone beyond Ctrl+Z.\n\n" +
          "? <b>Numbers are never translated</b> purely numeric cells in Sheets are automatically skipped.\n\n" +
          "? <b>Glossaries apply automatically</b> no setup needed. The selected profile handles terminology consistency.\n\n" +
          "? <b>Speaker notes can be translated on their own</b> use TRANSL. SPEAKER NOTES ONLY in Slides if you only need the notes updated, without touching the slide content.\n\n" +
          "? <b>Grouped shapes are supported</b> in Slides, translation now reaches into grouped text boxes (including groups mixed with images) without needing to ungroup first.\n\n" +
          "? <b>Multilingual Content</b> text which is already in the target language won't be translated again."
        )
      )
  );

  // ?? SUPPORT ???????????????????????????????????
  card.addSection(
    CardService.newCardSection()
      .setHeader("? SUPPORT")
      .setCollapsible(false)
      .addWidget(
        CardService.newTextParagraph().setText(
          "If something doesn't work as expected, please create a ticket here."
        )
      )
      .addWidget(
        CardService.newTextButton()
          .setText("REPORT TRANSLATION ISSUE")
          .setOpenLink(CardService.newOpenLink().setUrl(CONFIG.REPORT_TRANSISSUE_URL))
      )
      .addWidget(
        CardService.newTextButton()
          .setText("REPORT BUG")
          .setOpenLink(CardService.newOpenLink().setUrl(CONFIG.REPORT_ISSUE_URL))
      )
      .addWidget(
        CardService.newTextButton()
          .setText("? BACK")
          .setOnClickAction(CardService.newAction().setFunctionName("onHomepage"))
      )
  );

  return card.build();
}