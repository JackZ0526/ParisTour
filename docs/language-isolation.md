# Language isolation

## Boundaries

- UI copy uses the active locale. Missing English keys no longer borrow Chinese copy.
- Feature copy is stored in typed, paired `src/shared/i18n/copy/` dictionaries. Prompt resources live under `src/shared/i18n/prompts/`; fixed-language resources are called only by the corresponding language branch or a deliberately language-independent lookup task.
- UI language names, brands, official venue names, URLs, identifiers, JSON field names, keyboard events and diagnostic logs retain their canonical spelling. Multilingual recognition aliases accept old saved data in either language.
- Original user messages, notes, external reviews and saved model replies remain original content. Changing the UI language does not rewrite them. Known saved UI labels (such as pending times and chat work-step labels) are localized at display time.
- Built-in place, itinerary and flight copy resolves at access time so imports do not freeze the initial language. Dates use locale-aware `Intl` formatting.
- Hotel district labels and facility labels are localized separately from classification identities. Chinese and English inputs remain recognizable after switching language.

## Model instructions

Chat context instructions (dates, season, viewing target, current day, web research and candidate lists), hotel instructions and generation prompts select the intended language. English prompt tests inspect assembled requests, not just individual dictionaries. Raw user content remains factual data inside its data boundary.

Jev is an explicit exception to UI locale selection: its decision input is English in both UI languages. Known preference tags are converted locally. Other CJK strings are translated in one batch, cached in memory for one hour (up to 256 strings), and validated before Jev is called. This works on a copy and preserves identifiers and original trip data. If translation fails, is invalid or exhausts the request deadline, existing routing/ranking fallbacks apply. The server rejects residual CJK, including escaped JSON text, before invoking Jev. Official Latin venue names are preserved; this character validation alone is not a proof of semantic translation quality.

An uncached dynamic translation adds a model request. The earlier speed benchmark predates this normalization and should not be interpreted as a fresh measurement of this path.

## Verification

- `npm run check:i18n`: catches direct hardcoded JSX text and accessible labels, with explicit brand/address-example exemptions. Included in `npm run lint`.
- Dictionary parity and English-copy checks cover feature catalogs. Prompt checks cover English prompt resources and assembled itinerary/chat requests.
- Regression tests cover saved labels, hotel facility grouping, built-in copy after locale switches, Jev translation/cache/invalid-output paths, and the server language boundary.
- Browser verification: Chinese → English → Chinese; profile/preferences, flight labels, date picker, itinerary and saved assistant work-step labels. The original itinerary and selected preferences were preserved.

The static check is a guard against common UI regressions, not a proof that arbitrary future model output or third-party content is in the selected language. New dynamic text requires a deliberate display/translation policy rather than a fallback into the other locale.
