# Bundling Home Assistant Frontend

The Home Assistant build pipeline contains various steps to prepare a build.

- Generating icon files to be included
- Generating translation files to be included
- Converting TypeScript, CSS and JSON files to JavaScript
- Bundling
- Minifying the files
- Generating the HTML entrypoint files
- Generating the service worker
- Compressing the files

## Converting files

Currently in Home Assistant we use a bundler to convert TypeScript, CSS and JSON files to JavaScript files that the browser understands.

We currently rely on Webpack. Both of these programs bundle the converted files in both production and development.

For development, bundling is optional. We just want to get the right files in the browser.

Responsibilities of the converter during development:

- Convert TypeScript to JavaScript
- Convert CSS to JavaScript that sets the content as the default export
- Convert JSON to JavaScript that sets the content as the default export
- Make sure import, dynamic import and web worker references work
  - Add extensions where missing
  - Resolve absolute package imports
- Filter out specific imports/packages
- Replace constants with values

In production, the following responsibilities are added:

- Minify HTML
- Bundle multiple imports so that the browser can fetch less files
- Generate a second version that is ES5 compatible

Configuration for all these steps are specified in [bundle.js](bundle.js).

## Output size

The published wheel is `knx_frontend/` zipped up, so build output size is what every Home
Assistant install pays for. `yarn run build:size` prints a per-build, per-file-type breakdown
(also run in CI after every build). Two settings dominate it:

### Source maps

`devtool` in [rspack.cjs](rspack.cjs) must stay on a `nosources-*` variant for production.
Anything else embeds `sourcesContent` — the complete pre-minification source of every module,
homeassistant-frontend and `node_modules` alike — inside every `.js.map`. That was the case
until 2026-08 and accounted for 48% of the wheel and 67% of the installed size.

Because the maps carry no sources, `output.devtoolModuleFilenameTemplate` rewrites paths to
GitHub instead, across two source roots:

- `src/` → `XKNX/knx-frontend` at the version in `VERSION`
- `homeassistant-frontend/src/` → `home-assistant/frontend` at the **pinned submodule commit**.
  It must point at the upstream repo: raw.githubusercontent.com does not serve submodule
  contents, so `XKNX/knx-frontend/<tag>/homeassistant-frontend/…` would 404 on every HA frame.
- everything else → `/unknown/…`, which dev tools request and cheerfully 404 on.

### Camera stubs

`emptyPackages()` in [bundle.cjs](bundle.cjs) replaces hls.js and qr-scanner with an empty
module. The KNX panel renders no cameras, but it reaches HA components that do, and hls.js alone
was 1.3 MB of the wheel.

Only packages behind a **dynamic** import can be stubbed. A static `import X from "pkg"` fails
the build with `export 'default' was not found`, which is why cropperjs is not on the list — do
not "fix" that by giving [../src/util/empty.js](../src/util/empty.js) a default export, as that
trades a build error for a silent runtime one. Also check the package is not used at module top
level (`barcode-detector` is excluded for that reason: an empty module would throw when
ha-qr-scanner is evaluated rather than when it is used).

Point `require.resolve` at the entry file rspack actually picks: `main` is often the CommonJS
build while the bundle gets `browser` or `module`, and a stub aimed at the wrong file silently
matches nothing.
