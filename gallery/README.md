# KNX Frontend Gallery

Optional offline previews of the actual product components, dialogs and views.
Local fixtures need no Home Assistant login or KNX connection; unknown backend
calls fail visibly. Product code and builds must never import Gallery tooling.
Brand images load online from Home Assistant's Brands CDN with its missing-image
placeholder; automated tests substitute these requests locally.

## Run and build

Run commands from the repository root, using Node from `.nvmrc` and the existing
`script/bootstrap` setup. Install Chromium with `pnpm exec playwright install chromium`
(add `--with-deps` on Linux hosts). Gallery CI uses the official version-matched
Playwright container for the build and browser shards, with Node from `.nvmrc`
and dependency caches isolated from host installations.

```sh
pnpm gallery                 # http://127.0.0.1:8091; accepts --port
pnpm gallery:build           # optimized build/gallery/ plus light/dark thumbnails
pnpm gallery:thumbnails      # refresh thumbnails from the existing build
```

Build once before local development to populate overview images; detail previews
update live, while thumbnails show the last build. The catalog opens scenarios;
Compare shares accepted component and fixture state across devices and color modes.

## Author examples

Create an example for each new production custom element and maintain affected
examples whenever public interfaces, supported states or interactions change.
Read product sources and callers; demonstrate a realistic KNX task.

- Export one `entry = defineExample(...)` using [helpers](src/examples/helpers.ts)
  and [GalleryDefinition](src/types.ts); register it in [catalog.ts](src/catalog.ts).
  Each production custom element has exactly one coverage owner. Preserve existing
  IDs, scenario URLs, relationships and slot examples.
- Use [DPT option selector](src/examples/knx-dpt-option-selector.ts) for controlled
  inputs/events, [DPT select dialog](src/examples/knx-dpt-select-dialog.ts) for
  callbacks/dialog hosting, and [project view](src/examples/knx-project-view.ts)
  for explicit missing, empty and failed backend scenarios.
- Put copy in [en.json](src/localize/en.json). Declare real inputs as `properties`,
  host inputs as `suppliedProperties`, and local switches as `exampleOptions`.
  Document actual events/callbacks/methods/slots; validate structured JSON inputs.
  `backend-en.json` is a Core snapshot; remove the payload-label supplement in
  `backendFixtures` when Core supplies it.
- Import components and runtime fixtures inside `load()`, create fresh fixtures,
  cancel asynchronous work with `env.signal`, and reuse [dialog](src/examples/dialog.ts),
  [view](src/examples/view.ts) and [view fixtures](src/fixtures/views.ts) hosts.
- Reuse `observe`, `valueChanged` and callback adapters. [composeBindings](src/sync-bindings.ts)
  infers editable properties; declare additional supported state/dialog openers in
  `interaction`, and keep real local inputs in `localProperties`. Options, callbacks,
  services, viewport state, native files and application continuations stay local.
- Derive example-owned DOM from accepted state, including peer updates. Prepare initial
  outcomes once with `env.fixtures.prepare(change)` and commit successful mutations
  with `env.fixtures.commit(change)`; reuse [environment](src/environment.ts) and view
  handlers. [FixtureOutcomes](src/fixtures/outcomes.ts) owns the plain model;
  `fixtureState.capture/apply` transports complete validated snapshots without
  replaying APIs, subscriptions or callbacks, including before a late pane renders.
- Background producers check `env.canProduce()` and `env.signal`; automatic traffic
  uses `env.produceTelegram(data)`. Delayed explicit sends after writer handoff transfer
  validated raw history through existing `fixture-telegrams` guards; peers receive it
  idempotently without subscriber replay or old UI state. Paused rows stay paused.
  Known entity/expose navigation predecessors resolve inside the originating iframe.

## Checks

```sh
pnpm test                    # product + Gallery units; product-only coverage
pnpm lint                    # shared ESLint, formatting, types and Lit checks
pnpm gallery:unit            # shared Vitest config, Gallery scope; file/name filters
pnpm gallery:policy          # standard-library Python publishing/security tests
pnpm gallery:lint            # TS/config/tool formatting, syntax and Lit templates
pnpm gallery:types           # shared compiler options, Gallery/HA roots and imports; separate cache
pnpm gallery:test --project=chromium --workers=2 --grep 'components knx-dpt-option-selector'
pnpm gallery:test --project=mobile-chrome --workers=2
pnpm gallery:test --list
GALLERY_BASE_PATH=/knx-frontend/pr/42/gallery/ pnpm gallery:build
GALLERY_E2E_PRODUCTION=1 GALLERY_BASE_PATH=/knx-frontend/pr/42/gallery/ pnpm gallery:test --workers=2
GALLERY_BASE_PATH=/knx-frontend/pr/42/gallery/ pnpm exec playwright test --config gallery/test/playwright.gallery-pages.config.ts
```

Inspect rendering, usage, events, reset/errors, Compare and late panes; verify action counts.
The browser harness checks console errors and backend traffic. Keep the complete
browser suite before publication, split into two shards with two workers each.
The `chromium` project retains the complete desktop suite at 1600 × 1000; the
`mobile-chrome` project uses Pixel 7 emulation and explicitly selected `@mobile`
compact tests plus `@mobile-touch` inspector, navigation and toolbar regressions.
Desktop mouse/keyboard and large-canvas cases run only in `chromium`. Local runs
have no retries; CI retries once and writes list and blob reports under
`blob-report/gallery/`. Attachments live under `test-results/gallery/`: failure
screenshots, retained failure traces and video on the first retry. Open a trace
with `pnpm exec playwright show-trace <trace.zip>`. These diagnostics are separate
from deterministic Gallery thumbnails. CI uploads shard blobs and attachments even
when tests fail, then merges available blobs into a native HTML report on an
Ubuntu runner with read-only permissions. Download `gallery-test-report-html-<attempt>`
and open `index.html` (or `pnpm exec playwright show-report <report-directory>`).
Raw shard attachments use `gallery-test-results-<attempt>-<shard>`; blob artifacts
use `gallery-test-report-<attempt>-<shard>`. Each run attempt downloads only its own
blobs, and a merged report preserves the failed workflow result. Reports expire
after 14 days; the publishable Gallery artifact remains separate.
Recover failed build, browser or report jobs with **Re-run all jobs**; selective
merge/shard retries cannot regenerate all required current-attempt blobs and the
site artifact.
`pnpm test`, `pnpm lint` and `pnpm lint:types` include Gallery by default. Focused
Gallery aliases reuse the shared configuration; the publication workflow runs them
unconditionally at the exact PR head, including when preview approval is pending.
Browser tests use the shared DOM and Node/Playwright type environment. Optional production
statistics use `KNX_BUILD_STATS=1 pnpm build`; check a real unpacked wheel with
`node gallery/script/check-gallery-exclusion.mjs build/checks/production.json /path/to/unpacked-wheel`.

## GitHub Pages

Choose **GitHub Actions** in Settings → Pages, restrict the `github-pages` deployment
environment to `main`, allow Actions PR comments and writes to the dedicated
`gh-pages` data branch, then set `GALLERY_PAGES_ENABLED=true` as an Actions variable.
An unrelated existing `gh-pages` branch is not adopted. Configure custom domains
before building; the Pages API supplies the URL prefix. Verify permissions and
fork approvals in the first repository before enabling another.

Main publishes below the Pages URL at `/gallery/`; PR previews use
`/pr/<number>/gallery/`. Authors with
write/maintain/admin access get previews automatically. A maintainer's **Re-run all
jobs** in Gallery build approves the exact external PR SHA and run attempt; each
new SHA needs approval. Edit the PR description for a fresh run if reruns expired.
One sticky comment tracks status/links; failures retain the last published preview.
Older previews retain their previous address until an authorized rebuild.
Closing a PR removes its preview on the next successful deployment; **Gallery Pages
→ Run workflow** reconciles closed previews and retries saved authorized candidates.

PR checks use read-only permissions without secrets; publishing executes Main code
and validates artifacts as data. Publication waits for all required checks and official
deployment. Main and previews share an origin; approval reviews the hosted code.
The publisher keeps its serialized queue and append-only state.
