# knx-frontend review checklist

Judgement rules that `scripts/check.mjs` cannot decide. Each rule says why it exists, which PRs it
comes from, and how to spot a violation in a diff. Report a violation only where the change
introduces or worsens it.

## Localization

- **Order of sources.** Use an existing Home Assistant key first (`hass.localize("ui.…")`,
  `state.default.*`), then a backend string `component.knx.*` from Core's
  `homeassistant/components/knx/strings.json` (needs a linked Core PR), and only then a new flat
  key in `src/localize/languages/*.json`. Spot: new `this.knx.localize("…")` keys whose English
  text already exists in HA (`grep -r '"<text>"' homeassistant-frontend/src/translations/en.json`).
  From #307, #457.
- **Backend strings need a fallback until Core ships them:**
  `hass.localize("component.knx.…") || this.knx.localize("…")`. A new backend namespace also
  needs a `loadBackendTranslation` call in `src/main.ts`. From #466.
- **Sentences, not fragments.** Placeholders instead of concatenating translated pieces or links;
  word order differs between languages. From #466 (the "via" string).
- **Words users read.** No "upload" where nothing leaves the house, "group address" instead of
  "GA", sentence case, Remove vs Delete as in HA. From #99.

## Home Assistant components and patterns

- Prefer `ha-*` elements and selectors over custom fields: `ha-selector-*` (for numbers,
  `ha-selector-number` in box mode), `ha-button`, `ha-dialog` with `DialogMixin`, `ha-alert`.
  Never `mwc-*` or `md-*` directly. From #373, #247, #242.
- `ha-data-table` action columns: `lastFixed: true` and a `label`, like `ha-script-picker`. Every
  sortable column has a `title` or `fieldName`. From #457, #465.
- Use HA helpers instead of hard-coded URLs: `brandsUrl()` for brand images. From #466.
- Model new views on HA's own integration panels (Matter, ZHA, Bluetooth) under
  `homeassistant-frontend/src/panels/config/integrations/integration-panels/`.

## Backend contract (HA Core KNX, xknx, xknxproject)

- Payloads and types in `src/types/` and `src/services/` must match Core's
  `homeassistant/components/knx/`: `websocket.py`, `storage/entity_store_schema.py`,
  `storage/entity_store_validation.py`, `storage/knx_selector.py`, `dpt.py`, `telegrams.py`,
  `expose_controller.py`, and the xknxproject models. Read the Core side before judging.
  From #410, #457 ("destination should be a list").
- Mapping and conversion belong in Core, where WebSocket tests catch breaking changes. From #99.
- A feature that needs a new or changed WebSocket command waits for the approved Core PR; the PR
  body links it. From #233.
- Data fetched once at panel load (`knx.connectionInfo`, project data) goes stale; subscribe or
  refresh where the UI shows live state. From #466.
- Respect integration options (for example the telegram history size) instead of constants.
  From #235.

## iframe panel

- The panel runs in an iframe inside the host HA (`embed_iframe=True`). Reach the main window only
  through `mainWindow` or `window.parent.customPanel`; a plain same-origin `<a href>` already
  navigates the main window. From #457, #466.
- WebSocket results come from another realm: clone them before `deepEqual` or dirty-state
  baselines. From #427.
- A shared subscription does not necessarily emit on subscribe; do not rely on it for the first
  render. Test leaving the panel and coming back. From #266, #281, #430.

## Navigation and editors

- Steps inside a flow use `navigateInFlow`, leaving it `exitFlow`; one history entry per flow; no
  hard-coded back paths. From #299, #312, #423.
- Editors use `DirtyStateProviderMixin` with `PreventUnsavedMixin`; errors navigate through the
  error-page helper. From #423, #427.

## Scale

- KNX installations have thousands of entities and group addresses and tens of thousands of
  telegrams. No subscription to the whole entity registry where `hass.entities` suffices, no
  per-telegram recomputation of whole lists, memoize derived data. From #466, #374.

## KNX domain

- All three group address formats: 3-level `1/2/3`, 2-level `1/2`, free `12345`.
- DPT main 1, 2 and 3: `payload_length` counts bits, not bytes. From #452.
- `dpt_main` and `sub` may be null; telegrams without DPT still pass filters. From #442.
- No truthiness checks where 0 is a valid value (addresses, payloads, DPT numbers).
- Do not build IDs from ISO timestamp strings; they collide. From #460.
- ETS project files are parsed by the backend (xknxproject), never in the frontend.

## UI

- Narrow and mobile layout: nothing overflows, columns stay readable, popovers stay inside the
  viewport, filters can be cleared, click targets do not move. From #40, #99, #373, #393.
- For UI changes ask the author for screenshots (desktop and narrow); do not claim how it looks
  without having seen it.
- Theme variables and `--ha-space-*`; KNX colours via `--knx-green` and `--knx-blue`.

## Robustness

- Log through `KNXLogger`, never `console`; never fail silently: show `<ha-alert>` or a warning.
  From #41, #457.
- Unsubscribe WebSocket subscriptions and remove listeners in `disconnectedCallback`; free large
  project data on navigation.

## Scope and code quality

- Independent improvements go into follow-up PRs. From #40, #99, #374.
- No empty or unused files, no dead code, consistent import style within a view. From #253, #99.
- Tests are welcome, coverage is not enforced; new logic in `src/utils/` should get a Vitest test
  next to it. From #276, #466.

## PR description

- No template is required. Expect a short summary, links to Core, xknx or xknxproject PRs,
  `fixes #N` for issues, and screenshots for UI changes. PRs are squash-merged; stacked PRs need a
  rebase after their base is merged.
