const path = require("path");
const env = require("./env.cjs");
const paths = require("./paths.cjs");
const { dependencies } = require("../package.json");

// Files from NPM Packages that should not be imported
module.exports.ignorePackages = () => [];

// Files from NPM packages that we should replace with empty file
module.exports.emptyPackages = ({ isHassioBuild }) =>
  [
    // Icons in supervisor conflict with icons in HA so we don't load.
    // ... for KNX we seem to need it - probably due to iframe.
    // isHassioBuild &&
    //   require.resolve(
    //     path.resolve(paths.root_dir, "homeassistant-frontend/src/components/ha-icon.ts"),
    //   ),
    // isHassioBuild &&
    //   require.resolve(
    //     path.resolve(paths.root_dir, "homeassistant-frontend/src/components/ha-icon-picker.ts"),
    //   ),
  ].filter(Boolean);

module.exports.definedVars = ({ isProdBuild, latestBuild, defineOverlay }) => ({
  __DEV__: !isProdBuild,
  __BUILD__: JSON.stringify(latestBuild ? "latest" : "es5"),
  __VERSION__: JSON.stringify(env.version()),
  __DEMO__: false,
  __SUPERVISOR__: false,
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

module.exports.terserOptions = ({ latestBuild, isTestBuild }) => ({
  safari10: !latestBuild,
  ecma: latestBuild ? 2015 : 5,
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
        useBuiltIns: latestBuild ? false : "usage",
        corejs: latestBuild ? false : dependencies["core-js"],
        bugfixes: true,
        shippedProposals: true,
      },
    ],
  ],
  plugins: [
    [
      path.resolve(
        paths.root_dir,
        "homeassistant-frontend/build-scripts/babel-plugins/inline-constants-plugin.cjs",
      ),
      {
        modules: ["@mdi/js"],
        ignoreModuleNotFound: true,
      },
    ],
    [
      path.resolve(
        paths.root_dir,
        "homeassistant-frontend/build-scripts/babel-plugins/custom-polyfill-plugin.js",
      ),
      { method: "usage-global" },
    ],
    // Import helpers and regenerator from runtime package
    ["@babel/plugin-transform-runtime", { version: dependencies["@babel/runtime"] }],
    "@babel/plugin-transform-class-properties",
    "@babel/plugin-transform-private-methods",
  ].filter(Boolean),
  exclude: [
    // \\ for Windows, / for Mac OS and Linux
    /node_modules[\\/]core-js/,
    /node_modules[\\/]webpack[\\/]buildin/,
  ],
  overrides: [
    {
      // Use unambiguous for dependencies so that require() is correctly injected into CommonJS files
      // Exclusions are needed in some cases where ES modules have no static imports or exports, such as polyfills
      sourceType: "unambiguous",
      include: /\/node_modules\//,
      exclude: [
        "element-internals-polyfill",
        "@shoelace-style",
        "@?lit(?:-labs|-element|-html)?",
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
      isHassioBuild: true,
    };
  },
};
