/* Modules the KNX panel replaces with a stub at build time.
 *
 * The panel is built from the full homeassistant-frontend source tree, so it inherits every
 * dependency HA has — camera players, map renderers, chart engines — whether or not the KNX
 * panel can reach them. Unreachable code still ships: rspack emits it as lazy chunks that no
 * KNX user ever downloads, but `knx_frontend/` is zipped into the wheel as-is, so every Home
 * Assistant install pays for it on disk. Replacing the module that pulls a library in drops
 * the whole subtree behind it.
 *
 * ── If something in the panel is missing or dead, look here first ──────────────────────────
 *
 * Every stub says so on the console the moment it is reached:
 *
 *     [KNX] "leaflet maps" is stubbed out in this build ...
 *
 * The quoted name is the `name` of an entry below. To get the real module back, delete that
 * entry and rebuild — nothing else references it.
 *
 * ── Adding an entry ───────────────────────────────────────────────────────────────────────
 *
 * `test` is matched against the *resolved absolute path*, so use the helpers below rather
 * than hand-writing a regex. The replacement must be a real module, not an empty file:
 *
 *   - Every value export its consumers use must exist, or the build fails with
 *     "export 'X' was not found". Type-only imports are erased and need nothing.
 *   - Prefer a shape that makes the consumer degrade on its own (`isSupported: () => false`)
 *     over one that throws somewhere deep inside it.
 *   - Warn from the point that means "actually used": module scope for something behind a
 *     dynamic import, `connectedCallback` for a custom element (its module is often
 *     evaluated eagerly by a static import that never renders anything).
 *   - Check what rspack really resolves: a package's `main` is often the CommonJS build while
 *     the bundle gets `browser` or `module`, and a stub aimed at the wrong file matches
 *     nothing at all — silently.
 *
 * Verify with `yarn build && yarn build:size`, and confirm the library is gone rather than
 * merely moved: `grep -rl <marker> knx_frontend/frontend_latest` should come back empty.
 */

const path = require("path");
const paths = require("./paths.cjs");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches exactly these absolute paths, and nothing else. */
const exactly = (...absolutePaths) =>
  new RegExp(`^(?:${absolutePaths.map(escapeRegExp).join("|")})$`);

/** An npm package entry, resolved the way the bundler resolves it. */
const npm = (request) => require.resolve(request);

/** Modules inside the homeassistant-frontend submodule, relative to its `src/`. */
const ha = (...relativePaths) =>
  relativePaths.map((relative) =>
    path.resolve(paths.root_dir, "homeassistant-frontend/src", relative),
  );

/** Our replacement, in `src/stubs/`. */
const stub = (file) => path.resolve(paths.root_dir, "src/stubs", file);

/**
 * @type {{ name: string, why: string, test: RegExp, replacement: string }[]}
 */
const stubs = [
  {
    name: "hls.js",
    why: "HTTP Live Streaming player, dynamically imported by ha-hls-player for camera streams. The KNX panel renders no cameras; this alone was 1.3 MB of the wheel.",
    // Resolve the exact entry ha-hls-player imports, not the bare package.
    test: exactly(npm("hls.js/dist/hls.light.mjs")),
    replacement: stub("hls.ts"),
  },
  {
    name: "qr-scanner",
    why: "Camera-based QR code scanner, dynamically imported by ha-qr-scanner. Nothing in the KNX panel scans QR codes.",
    // The "module" entry is the one in the bundle; require.resolve() would give the
    // CommonJS "main" (qr-scanner.umd.min.js), which never appears in it.
    test: exactly(npm("qr-scanner/qr-scanner.min.js")),
    replacement: stub("qr-scanner.ts"),
  },
];

module.exports.stubs = stubs;

/** `[{ test, replacement }]` for rspack's NormalModuleReplacementPlugin. */
module.exports.moduleReplacements = () =>
  stubs.map(({ test, replacement }) => ({ test, replacement }));
