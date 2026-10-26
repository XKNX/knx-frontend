# KNX Frontend Gallery

Optional offline previews of the actual product components, dialogs and views.
Local fixtures need no Home Assistant login or KNX connection; unknown backend
calls fail visibly. Product code and builds must never import Gallery tooling.
Brand images load online from Home Assistant's Brands CDN with its missing-image
placeholder; automated tests substitute these requests locally.

## Run and build

Run commands from the repository root, using Node from `.nvmrc` and the existing
`script/bootstrap` setup. Install Chromium with `pnpm exec playwright install chromium`
(add `--with-deps` on Linux hosts).

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
pnpm test
pnpm lint
pnpm gallery:unit
pnpm gallery:types
pnpm gallery:integration
pnpm gallery:build
```

The integration build prepares generated inputs and validates the standalone
bundle independently from unit tests. Inspect rendering, controls, events,
reset/errors and Compare while authoring examples.

## Backend translations

Backend translation fixtures are generated with `pnpm gallery:translations` from
the public Core revision pinned in `gallery/script/gallery_translations.py`,
including all KNX config-panel keys and resolved references. Use
`pnpm gallery:translations:check` to verify the committed copy; fetching is an
explicit maintenance step, never part of preview runtime or normal unit tests.

The extra `raw_payload_base_label` fixture is a temporary compatibility value for
a missing Core key, tracked by the separate Core payload-label correction. It must
be removed when that correction is available in the pinned public Core snapshot.
