const { execFileSync } = require("child_process");
const path = require("path");
const env = require("./env.cjs");
const paths = require("./paths.cjs");
const { dependencies } = require("../package.json");

const BABEL_PLUGINS = path.join(
  paths.root_dir,
  "homeassistant-frontend/build-scripts/babel-plugins",
);

// GitHub base URL for production source maps of this repo's own `src/`.
// Release builds write the tag into VERSION (see .github/workflows/ReleaseActions.yml),
// so the ref resolves to a real tag; dev builds fall back to the commit SHA.
module.exports.sourceMapURL = () => {
  const ref = env.version().endsWith("dev") ? process.env.GITHUB_SHA || "dev" : env.version();
  return `https://raw.githubusercontent.com/XKNX/knx-frontend/${ref}/`;
};

// GitHub base URL for production source maps of the homeassistant-frontend submodule.
// Its sources are NOT reachable under this repo on raw.githubusercontent.com — GitHub raw
// does not serve submodule contents — so they must point at the upstream repo at the pinned
// commit. The pin is read from the superproject tree rather than the submodule itself: CI
// checks out with `submodules: recursive` and no fetch-depth, so the submodule is shallow and
// its tags are absent (`git describe` would fail there). raw serves a SHA just as well as a tag.
// Returns undefined if the pin can't be read, in which case callers fall back to /unknown/.
let haRef;
module.exports.haSourceMapURL = () => {
  if (haRef === undefined) {
    try {
      const line = execFileSync("git", ["ls-tree", "HEAD", "homeassistant-frontend"], {
        cwd: paths.root_dir,
        encoding: "utf-8",
      });
      haRef = /^\d+ commit ([0-9a-f]{40})\s/.exec(line)?.[1] ?? null;
    } catch {
      haRef = null;
    }
  }
  return haRef ? `https://raw.githubusercontent.com/home-assistant/frontend/${haRef}/` : undefined;
};

// Files from NPM Packages that should not be imported
module.exports.ignorePackages = () => [];

// Files from NPM packages that we should replace with empty file.
//
// The KNX panel renders no cameras, no media browser and no image uploads, so the
// camera/video/image-processing dependencies HA pulls in are dead weight here — hls.js alone
// was 1.3 MB of the published wheel.
//
// Only packages reached through a *dynamic* import can be stubbed: a static `import X from`
// fails the build outright with "export 'default' was not found" against the empty module.
// That rules out "cropperjs" (image-cropper-dialog imports it statically, and it is only
// ~160 KB). Also excluded: "barcode-detector", which calls prepareZXingModule() at the top
// level of ha-qr-scanner.ts, so an empty module would throw when that module is evaluated
// rather than when it is used; and "node-vibrant", at only ~30 KB.
//
// See the camera stubs note in build-scripts/README.md before adding to this list.
module.exports.emptyPackages = () =>
  [
    // HTTP Live Streaming player, dynamically imported by ha-hls-player for camera streams.
    require.resolve("hls.js/dist/hls.light.mjs"),
    // Camera-based QR code scanner, dynamically imported by ha-qr-scanner. Resolve the exact
    // entry rspack picks (the "module" field), not the bare package — require.resolve() would
    // give the CommonJS "main" (qr-scanner.umd.min.js), which is never the file in the bundle.
    require.resolve("qr-scanner/qr-scanner.min.js"),

    // Icons in landingpage conflict with icons in HA so we don't load.
    // ... for KNX we seem to need it - probably due to iframe.
    //
    //   require.resolve(
    //     path.resolve(paths.root_dir, "homeassistant-frontend/src/components/ha-icon.ts"),
    //   ),
    //
    //   require.resolve(
    //     path.resolve(paths.root_dir, "homeassistant-frontend/src/components/ha-icon-picker.ts"),
    //   ),
  ].filter(Boolean);

module.exports.definedVars = ({ isProdBuild, latestBuild, defineOverlay }) => ({
  __DEV__: !isProdBuild,
  __BUILD__: JSON.stringify(latestBuild ? "latest" : "es5"),
  __VERSION__: JSON.stringify(env.version()),
  __DEMO__: false,
  __BACKWARDS_COMPAT__: false,
  __STATIC_PATH__: "/static/",
  __HASS_URL__: `\`${
    "HASS_URL" in process.env
      ? process.env.HASS_URL
      : // eslint-disable-next-line no-template-curly-in-string
        "${location.protocol}//${location.host}"
  }\``,
  "process.env.NODE_ENV": JSON.stringify(isProdBuild ? "production" : "development"),
  ...defineOverlay,
});

module.exports.htmlMinifierOptions = {
  caseSensitive: true,
  collapseWhitespace: true,
  conservativeCollapse: true,
  decodeEntities: true,
  removeComments: true,
  removeRedundantAttributes: true,
  minifyCSS: {
    compatibility: "*,-properties.zeroUnits",
  },
};

module.exports.terserOptions = ({ latestBuild, isTestBuild }) => ({
  // Highest syntax the minifier may emit; it never downlevels. Every browser
  // in [modern] is well past ES2020 (universal since spring 2020); the
  // [legacy] floors (Chrome 59 / Safari 12) top out at ES2017.
  ecma: latestBuild ? 2020 : 2017,
  module: latestBuild,
  format: { comments: false },
  sourceMap: !isTestBuild,
});

/** @type {import('@rspack/core').SwcLoaderOptions} */
module.exports.swcOptions = () => ({
  jsc: {
    loose: true,
    externalHelpers: true,
    target: "ES2021",
    parser: {
      syntax: "typescript",
      decorators: true,
    },
  },
});

module.exports.babelOptions = ({ latestBuild }) => ({
  babelrc: false,
  compact: false,
  assumptions: {
    privateFieldsAsProperties: true,
    setPublicClassFields: true,
    setSpreadProperties: true,
  },
  browserslistEnv: latestBuild ? "modern" : "legacy",
  presets: [
    [
      "@babel/preset-env",
      {
        shippedProposals: true,
      },
    ],
  ],
  plugins: [
    // Inject Core-JS polyfills on demand. Babel 8 removed preset-env's
    // `useBuiltIns`/`corejs` options, so the equivalent polyfill provider is
    // configured directly here (`usage-global` matches the old `useBuiltIns: "usage"`).
    [
      "babel-plugin-polyfill-corejs3",
      {
        method: "usage-global",
        version: dependencies["core-js"],
        shippedProposals: true,
      },
    ],
    [
      path.join(BABEL_PLUGINS, "inline-constants-plugin.cjs"),
      {
        modules: ["@mdi/js"],
        ignoreModuleNotFound: true,
      },
    ],
    // Import helpers and regenerator from runtime package.
    // `moduleName` is pinned so helpers resolve from `@babel/runtime`: the
    // corejs3 polyfill provider above otherwise redirects them to the
    // (uninstalled) `@babel/runtime-corejs3`, which preset-env used to suppress
    // internally when it owned the polyfill injection via `useBuiltIns`.
    [
      "@babel/plugin-transform-runtime",
      { version: dependencies["@babel/runtime"], moduleName: "@babel/runtime" },
    ],
    "@babel/plugin-transform-class-properties",
    "@babel/plugin-transform-private-methods",
  ].filter(Boolean),
  exclude: [
    // \\ for Windows, / for Mac OS and Linux
    /node_modules[\\/]core-js/,
  ],
  // TODO: KNX: sourceMaps: !isTestBuild,
  overrides: [
    {
      // Add plugin to inject various polyfills, excluding the polyfills
      // themselves to prevent self-injection.
      plugins: [
        [path.join(BABEL_PLUGINS, "custom-polyfill-plugin.js"), { method: "usage-global" }],
      ],
      exclude: [
        path.join(paths.root_dir, "homeassistant-frontend/src/resources/polyfills"),
        ...[
          "@formatjs/(?:ecma402-abstract|intl-\\w+)",
          "@lit-labs/virtualizer/polyfills",
          "@webcomponents/scoped-custom-element-registry",
          "element-internals-polyfill",
          "proxy-polyfill",
          "unfetch",
        ].map((p) => new RegExp(`/node_modules/${p}/`)),
      ],
    },
    {
      // Use unambiguous for dependencies so that require() is correctly injected into CommonJS files
      // Exclusions are needed in some cases where ES modules have no static imports or exports, such as polyfills
      // (otherwise babel-plugin-polyfill-corejs3 injects bare require("core-js/modules/...") calls
      // that rspack does not transform, causing ReferenceError in browsers like Safari 14).
      sourceType: "unambiguous",
      include: /\/node_modules\//,
      exclude: [
        "element-internals-polyfill",
        "@?lit(?:-labs|-element|-html)?",
        "@formatjs/(?:ecma402-abstract|intl-\\w+)",
      ].map((p) => new RegExp(`/node_modules/${p}/`)),
    },
  ],
});

const outputPath = (outputRoot, latestBuild) =>
  path.resolve(outputRoot, latestBuild ? "frontend_latest" : "frontend_es5");

const publicPath = (latestBuild, root = "") =>
  latestBuild ? `${root}/frontend_latest/` : `${root}/frontend_es5/`;

module.exports.config = {
  knx({ isProdBuild, latestBuild }) {
    return {
      entry: {
        entrypoint: path.resolve(paths.knx_dir, "src/entrypoint.ts"),
      },
      outputPath: outputPath(paths.knx_output_root, latestBuild),
      publicPath: publicPath(latestBuild, paths.knx_publicPath),
      isProdBuild,
      latestBuild,
    };
  },
};
