# k-rcher-translation-add-on

Google Workspace add-on (Docs / Sheets / Slides) that translates content via
Phrase, with a Gemini fallback when Phrase MT is unavailable.

## Gemini Post-Editing (PE)

After a translation is produced, an optional second Gemini pass reviews it
against a profile-specific instruction set — the same Post-Editing prompts
used in the [autofix-hub](../autofix-hub) project — and swaps in an improved
version where warranted. The prompt used depends on the active translation
profile (`Technical` / `Marketing` / `General`, see `getPePromptForProfile_`
in `Api.gs`; `General` reuses the `Technical` prompt).

Runs for Docs, Sheets and Slides. To stay clear of the add-on's ~30 s
execution limit:

- it is skipped automatically once a run has already used 12 s
  (`GEMINI_PE_TIME_BUDGET_MS_` in `Api.gs`) — the Phrase translation is kept;
- segments go out in small batches of 10, all in parallel;
- Gemini's "thinking" is switched off (`thinkingConfig.thinkingLevel =
  "minimal"`). If the gateway rejects that field, it is dropped
  automatically. `ADMIN_testGeminiPostEditSpeed()` measures the difference.

This step is enabled by default whenever `GEMINI_API_KEY` is configured, and
is designed to never slow a translation down by more than one extra network
round-trip: segments are batched and sent in parallel via
`UrlFetchApp.fetchAll()`, and any failure (disabled, no key, network error,
bad response) makes it fail open — the original translation is returned
unchanged, never blocked or delayed further.

Toggle it via the Apps Script editor:

```js
ADMIN_disableGeminiPostEdit()   // turn it off (e.g. if latency becomes an issue)
ADMIN_enableGeminiPostEdit()    // turn it back on
ADMIN_isGeminiPostEditEnabled() // check current state
```
## Usage log: errors

The admin usage log (see `ADMIN_createUsageLogSheet()` in `Admin.gs`) has two
extra columns, `Status` (`OK` / `ERROR`) and `Error` (the error message),
plus `Duration (s)` for the whole run. Existing log sheets get the missing
headers added automatically on the next run.
Hard platform kills ("Exceeded maximum execution time") can't be caught by
the script and therefore don't show up in the log.
