/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");
const env = require("./env.cjs");
const paths = require("./paths.cjs");
const { dependencies } = require("../package.json");

// Files from NPM Packages that should not be imported
module.exports.ignorePackages = () => [];

// Files from NPM packages that we should replace with empty file
module.exports.emptyPackages = ({ latestBuild, isHassioBuild }) =>
  [
    // Contains all color definitions for all material color sets.
    // We don't use it
    require.resolve("@polymer/paper-styles/color.js"),
    require.resolve("@polymer/paper-styles/default-theme.js"),
    // Loads stuff from a CDN
    require.resolve("@polymer/font-roboto/roboto.js"),
    require.resolve("@vaadin/vaadin-material-styles/typography.js"),
    require.resolve("@vaadin/vaadin-material-styles/font-icons.js"),
    // Compatibility not needed for latest builds
    latestBuild &&
      // wrapped in require.resolve so it blows up if file no longer exists
      require.resolve(
        path.resolve(paths.polymer_dir, "homeassistant-frontend/src/resources/compatibility.ts"),
      ),
    // Icons in supervisor conflict with icons in HA so we don't load.
    isHassioBuild &&
      require.resolve(
        path.resolve(paths.polymer_dir, "homeassistant-frontend/src/components/ha-icon.ts"),
      ),
    isHassioBuild &&
      require.resolve(
        path.resolve(paths.polymer_dir, "homeassistant-frontend/src/components/ha-icon-picker.ts"),
      ),
  ].filter(Boolean);

module.exports.definedVars = ({ isProdBuild, latestBuild, defineOverlay }) => ({
  __DEV__: !isProdBuild,
  __BUILD__: JSON.stringify(latestBuild ? "latest" : "es5"),
  __VERSION__: JSON.stringify(env.version()),
  __DEMO__: false,
  __SUPERVISOR__: false,
  __BACKWARDS_COMPAT__: false,
  __STATIC_PATH__: "/static/",
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
    "@babel/preset-typescript",
  ],
  plugins: [
    [
      path.resolve(
        paths.polymer_dir,
        "homeassistant-frontend/build-scripts/babel-plugins/inline-constants-plugin.cjs",
      ),
      {
        modules: ["@mdi/js"],
        ignoreModuleNotFound: true,
      },
    ],
    [
      path.resolve(
        paths.polymer_dir,
        "homeassistant-frontend/build-scripts/babel-plugins/custom-polyfill-plugin.js",
      ),
      { method: "usage-global" },
    ],
    // Import helpers and regenerator from runtime package
    ["@babel/plugin-transform-runtime", { version: dependencies["@babel/runtime"] }],
    // Transpile decorators (still in TC39 process)
    // Modern browsers support class fields and private methods, but transform is required with the older decorator version dictated by Lit
    ["@babel/plugin-proposal-decorators", { version: "2018-09", decoratorsBeforeExport: true }],
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
      exclude: ["element-internals-polyfill", "@?lit(?:-labs|-element|-html)?"].map(
        (p) => new RegExp(`/node_modules/${p}/`),
      ),
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
