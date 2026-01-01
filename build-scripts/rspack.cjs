const { existsSync } = require("fs");
const path = require("path");
const rspack = require("@rspack/core");
// eslint-disable-next-line @typescript-eslint/naming-convention
const { RsdoctorRspackPlugin } = require("@rsdoctor/rspack-plugin");
// eslint-disable-next-line @typescript-eslint/naming-convention
const { StatsWriterPlugin } = require("webpack-stats-plugin");
const filterStats = require("@bundle-stats/plugin-webpack-filter");
// eslint-disable-next-line @typescript-eslint/naming-convention
const TerserPlugin = require("terser-webpack-plugin");
const { WebpackManifestPlugin } = require("rspack-manifest-plugin");
const log = require("fancy-log");
// eslint-disable-next-line @typescript-eslint/naming-convention
const WebpackBar = require("webpackbar/rspack");
const paths = require("./paths.cjs");
const bundle = require("./bundle.cjs");

class LogStartCompilePlugin {
  ignoredFirst = false;

  apply(compiler) {
    compiler.hooks.beforeCompile.tap("LogStartCompilePlugin", () => {
      if (!this.ignoredFirst) {
        this.ignoredFirst = true;
        return;
      }
      log("Changes detected. Starting compilation");
    });
  }
}

const createRspackConfig = ({
  entry,
  outputPath,
  publicPath,
  defineOverlay,
  isProdBuild,
  latestBuild,
  isStatsBuild,
  isHassioBuild,
  dontHash,
}) => {
  if (!dontHash) {
    dontHash = new Set();
  }
  const ignorePackages = bundle.ignorePackages({ latestBuild });
  return {
    mode: isProdBuild ? "production" : "development",
    target: `browserslist:${latestBuild ? "modern" : "legacy"}`,
    devtool: isProdBuild ? "cheap-module-source-map" : "eval-cheap-module-source-map",
    entry,
    node: false,
    module: {
      rules: [
        {
          test: /\.m?js$|\.ts$/,
          exclude: /node_modules[\\/]core-js/,
          use: (info) => [
            {
              loader: "babel-loader",
              options: {
                ...bundle.babelOptions({ latestBuild, sw: info.issuerLayer === "sw" }),
                cacheDirectory: !isProdBuild,
                cacheCompression: false,
              },
            },
            {
              loader: "builtin:swc-loader",
              options: bundle.swcOptions(),
            },
          ],
          resolve: {
            fullySpecified: false,
          },
        },
        {
          test: /\.css$/,
          type: "asset/source",
        },
      ],
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          parallel: true,
          extractComments: true,
          terserOptions: bundle.terserOptions(latestBuild),
        }),
      ],
      moduleIds: isProdBuild && !isStatsBuild ? "deterministic" : "named",
      chunkIds: isProdBuild && !isStatsBuild ? "deterministic" : "named",
      splitChunks: {
        // Disable splitting for web workers with ESM output
        // Imports of external chunks are broken
        chunks: latestBuild
          ? (chunk) => !chunk.canBeInitial() && !/^.+-worker$/.test(chunk.name)
          : undefined,
      },
    },
    plugins: [
      new WebpackBar({ fancy: !isProdBuild }),
      new WebpackManifestPlugin({
        // Only include the JS of entrypoints
        filter: (file) => file.isInitial && !file.name.endsWith(".map"),
      }),
      new rspack.DefinePlugin(bundle.definedVars({ isProdBuild, latestBuild, defineOverlay })),
      new rspack.IgnorePlugin({
        checkResource(resource, context) {
          // Only use ignore to intercept imports that we don't control
          // inside node_module dependencies.
          if (
            !context.includes("/node_modules/") ||
            // calling define.amd will call require("!!webpack amd options")
            resource.startsWith("!!webpack") ||
            // loaded by webpack dev server but doesn't exist.
            resource === "webpack/hot" ||
            resource.startsWith("@swc/helpers")
          ) {
            return false;
          }
          let fullPath;
          try {
            fullPath = resource.startsWith(".")
              ? path.resolve(context, resource)
              : require.resolve(resource);
          } catch (err) {
            console.error("Error in Home Assistant ignore plugin", resource, context);
            throw err;
          }

          return ignorePackages.some((toIgnorePath) => fullPath.startsWith(toIgnorePath));
        },
      }),
      bundle.emptyPackages({ isHassioBuild }).length
        ? new rspack.NormalModuleReplacementPlugin(
            new RegExp(
              bundle
                .emptyPackages({ isHassioBuild })
                .join("|")
            ),
            path.resolve(paths.root_dir, "src/util/empty.js")
          )
        : false,
      !isProdBuild && new LogStartCompilePlugin(),
      isProdBuild &&
        isStatsBuild &&
        new RsdoctorRspackPlugin({
          reportDir: path.join(paths.build_dir, "rsdoctor"),
          features: ["plugins", "bundle"],
          supports: {
            generateTileGraph: true,
          },
        }),
    ].filter(Boolean),
    resolve: {
      extensions: [".ts", ".js", ".json"],
      alias: {
        "lit/static-html$": "lit/static-html.js",
        "lit/decorators$": "lit/decorators.js",
        "lit/directive$": "lit/directive.js",
        "lit/directives/until$": "lit/directives/until.js",
        "lit/directives/class-map$": "lit/directives/class-map.js",
        "lit/directives/style-map$": "lit/directives/style-map.js",
        "lit/directives/if-defined$": "lit/directives/if-defined.js",
        "lit/directives/guard$": "lit/directives/guard.js",
        "lit/directives/cache$": "lit/directives/cache.js",
        "lit/directives/join$": "lit/directives/join.js",
        "lit/directives/repeat$": "lit/directives/repeat.js",
        "lit/directives/live$": "lit/directives/live.js",
        "lit/directives/keyed$": "lit/directives/keyed.js",
        "lit/directives/map$": "lit/directives/map.js",
        "lit/polyfill-support$": "lit/polyfill-support.js",
        "@lit-labs/virtualizer/layouts/grid": "@lit-labs/virtualizer/layouts/grid.js",
        "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver":
          "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver.js",
        "@lit-labs/observers/resize-controller": "@lit-labs/observers/resize-controller.js",        "@formatjs/intl-durationformat/should-polyfill$":
          "@formatjs/intl-durationformat/should-polyfill.js",
        "@formatjs/intl-durationformat/polyfill-force$":
          "@formatjs/intl-durationformat/polyfill-force.js",
        "@formatjs/intl-datetimeformat/should-polyfill":
          "@formatjs/intl-datetimeformat/should-polyfill.js",
        "@formatjs/intl-datetimeformat/polyfill-force":
          "@formatjs/intl-datetimeformat/polyfill-force.js",
        "@formatjs/intl-displaynames/should-polyfill":
          "@formatjs/intl-displaynames/should-polyfill.js",
        "@formatjs/intl-displaynames/polyfill-force":
          "@formatjs/intl-displaynames/polyfill-force.js",
        "@formatjs/intl-getcanonicallocales/should-polyfill":
          "@formatjs/intl-getcanonicallocales/should-polyfill.js",
        "@formatjs/intl-getcanonicallocales/polyfill-force":
          "@formatjs/intl-getcanonicallocales/polyfill-force.js",
        "@formatjs/intl-listformat/should-polyfill":
          "@formatjs/intl-listformat/should-polyfill.js",
        "@formatjs/intl-listformat/polyfill-force":
          "@formatjs/intl-listformat/polyfill-force.js",
        "@formatjs/intl-locale/should-polyfill":
          "@formatjs/intl-locale/should-polyfill.js",
        "@formatjs/intl-locale/polyfill-force":
          "@formatjs/intl-locale/polyfill-force.js",
        "@formatjs/intl-numberformat/should-polyfill":
          "@formatjs/intl-numberformat/should-polyfill.js",
        "@formatjs/intl-numberformat/polyfill-force":
          "@formatjs/intl-numberformat/polyfill-force.js",
        "@formatjs/intl-pluralrules/should-polyfill":
          "@formatjs/intl-pluralrules/should-polyfill.js",
        "@formatjs/intl-pluralrules/polyfill-force":
          "@formatjs/intl-pluralrules/polyfill-force.js",
        "@formatjs/intl-relativetimeformat/should-polyfill":
          "@formatjs/intl-relativetimeformat/should-polyfill.js",
        "@formatjs/intl-relativetimeformat/polyfill-force":
          "@formatjs/intl-relativetimeformat/polyfill-force.js",
      },
      tsConfig: path.resolve(paths.root_dir, "tsconfig.json"),
    },
    output: {
      module: latestBuild,
      filename: ({ chunk }) =>
        !isProdBuild || isStatsBuild || dontHash.has(chunk.name)
          ? "[name].dev.js"
          : "[name].[contenthash].js",
      chunkFilename: isProdBuild && !isStatsBuild ? "[name].[contenthash].js" : "[name].js",
      assetModuleFilename: isProdBuild && !isStatsBuild ? "[id].[contenthash][ext]" : "[id][ext]",
      crossOriginLoading: "use-credentials",
      hashFunction: "xxhash64",
      path: outputPath,
      publicPath,
      // To silence warning in worker plugin
      globalObject: "self",
    },
    experiments: {
      outputModule: true,
      topLevelAwait: true,
    },
  };
};

const createKNXConfig = ({ isProdBuild, latestBuild }) =>
  createRspackConfig(bundle.config.knx({ isProdBuild, latestBuild }));

module.exports = {
  createKNXConfig,
  createRspackConfig,
};
