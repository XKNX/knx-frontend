const gulp = require("gulp");
const rollup = require("rollup");
const http = require("http");
const path = require("path");
const fs = require("fs-extra");
const log = require("fancy-log");
const { string } = require("rollup-plugin-string");
const handler = require("serve-handler");
const json = require("@rollup/plugin-json");
const commonjs = require("@rollup/plugin-commonjs");
const babel = require("@rollup/plugin-babel").babel;
const babelTypescript = require("@babel/preset-typescript");
const babelDecorators = require("@babel/plugin-proposal-decorators");
const babelClassProperties = require("@babel/plugin-proposal-class-properties");
const entrypointHashmanifest = require("rollup-plugin-entrypoint-hashmanifest");

const nodeResolve = require("@rollup/plugin-node-resolve");
const gzipPlugin = require("rollup-plugin-gzip");
const { terser } = require("rollup-plugin-terser");

const extensions = [".js", ".ts"];

const main = "./src/main.ts";

const DevelopPlugins = [
  string({
    include: ["node_modules/**/*.css"],
  }),
  commonjs(),
  nodeResolve({
    extensions,
    preferBuiltins: false,
    browser: true,
    rootDir: "./src",
  }),
  json({
    compact: true,
    preferConst: true,
  }),
  babel({
    babelrc: false,
    compact: true,
    presets: [babelTypescript.default],
    babelHelpers: "bundled",
    plugins: [
      "@babel/syntax-dynamic-import",
      "@babel/plugin-proposal-optional-chaining",
      "@babel/plugin-proposal-nullish-coalescing-operator",
      [babelDecorators.default, { decoratorsBeforeExport: true }],
      [babelClassProperties.default, { loose: true }],
    ].filter(Boolean),
    extensions,
    exclude: [require.resolve("@mdi/js/mdi.js")],
  }),
  entrypointHashmanifest({ manifestName: "./knx_frontend/manifest.json" }),
];

const BuildPlugins = DevelopPlugins.concat([
  terser({
    output: { comments: false },
  }),
  gzipPlugin.default(),
]);

const inputconfig = {
  input: main,
  plugins: DevelopPlugins,
  preserveEntrySignatures: false,
};
const outputconfig = (isDev) => {
  return {
    dir: "./knx_frontend/",
    chunkFileNames: !isDev ? "c.[hash].js" : "[name]-dev.js",
    assetFileNames: !isDev ? "a.[hash].js" : "[name]-dev.js",
    entryFileNames: !isDev ? "[name]-[hash].js" : "[name]-dev.js",
    format: "es",
    intro: `const __DEMO__ = false;
    const __SUPERVISOR__ = true`,
  };
};

function createServer() {
  const server = http.createServer((request, response) => {
    return handler(request, response, {
      public: "./knx_frontend/",
    });
  });

  server.listen(5001, true, () => {
    log.info("File will be served to http://127.0.0.1:5001/entrypoint.js");
  });
}

gulp.task("rollup-develop", () => {
  const watcher = rollup.watch({
    input: inputconfig.input,
    plugins: inputconfig.plugins,
    output: outputconfig(true),
    preserveEntrySignatures: false,
    watch: {
      include: ["./src/**"],
      chokidar: {
        usePolling: true,
      },
    },
  });

  let startedHttp = false;
  let first = true;

  watcher.on("event", (event) => {
    if (!startedHttp) {
      startedHttp = true;
      createServer();
    }
    if (event.code === "BUNDLE_START") {
      log(`Build started @ ${new Date().toLocaleTimeString()}`);
    } else if (event.code === "BUNDLE_END") {
      if (first) {
        writeEntrypoint();
        first = false;
      }

      log(`Build done @ ${new Date().toLocaleTimeString()}`);
    } else if (event.code === "ERROR") {
      log.error(event.error);
    }
  });
});

gulp.task("rollup-build", async function (task) {
  inputconfig.plugins = BuildPlugins;
  const bundle = await rollup.rollup(inputconfig);
  await bundle.write(outputconfig(false));
  writeEntrypoint();
  task();
});

function writeEntrypoint() {
  const entrypointManifest = require(path.resolve("./knx_frontend/manifest.json"));
  fs.writeFileSync(
    path.resolve("./knx_frontend/entrypoint.js"),
    `
import './${entrypointManifest[main]}';

const styleEl = document.createElement('style');
styleEl.innerHTML = \`
body {
  font-family: Roboto, sans-serif;
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  font-weight: 400;
  margin: 0;
  padding: 0;
  height: 100vh;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #111111;
    color: #e1e1e1;
  }
}
\`;


document.head.appendChild(styleEl);
  `,
    { encoding: "utf-8" }
  );
}
