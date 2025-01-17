/* eslint-disable @typescript-eslint/no-var-requires */
const { existsSync } = require("fs");
const path = require("path");
const rspack = require("@rspack/core");
const { RsdoctorRspackPlugin } = require("@rsdoctor/rspack-plugin");
const { StatsWriterPlugin } = require("webpack-stats-plugin");
const filterStats = require("@bundle-stats/plugin-webpack-filter").default;
const TerserPlugin = require("terser-webpack-plugin");
const { WebpackManifestPlugin } = require("rspack-manifest-plugin");
const log = require("fancy-log");
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
          use: {
            loader: "babel-loader",
            options: {
              ...bundle.babelOptions({ latestBuild }),
              cacheDirectory: !isProdBuild,
              cacheCompression: false,
            },
          },
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
            resource === "webpack/hot"
          ) {
            return false;
          }
          let fullPath;
          try {
            fullPath = resource.startsWith(".")
              ? path.resolve(context, resource)
              : require.resolve(resource);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("Error in Home Assistant ignore plugin", resource, context);
            throw err;
          }

          return ignorePackages.some((toIgnorePath) => fullPath.startsWith(toIgnorePath));
        },
      }),
      new rspack.NormalModuleReplacementPlugin(
        new RegExp(bundle.emptyPackages({ latestBuild, isHassioBuild }).join("|")),
        path.resolve(paths.polymer_dir, "homeassistant-frontend/src/util/empty.js"),
      ),
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
        "lit/directives/repeat$": "lit/directives/repeat.js",
        "lit/directives/live$": "lit/directives/live.js",
        "lit/directives/keyed$": "lit/directives/keyed.js",
        "lit/polyfill-support$": "lit/polyfill-support.js",
        "@lit-labs/virtualizer/layouts/grid": "@lit-labs/virtualizer/layouts/grid.js",
        "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver":
          "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver.js",
        "@lit-labs/observers/resize-controller": "@lit-labs/observers/resize-controller.js",
      },
      tsConfig: path.resolve(paths.polymer_dir, "tsconfig.json"),
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
