import { execFile, spawn } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { rspack, HtmlRspackPlugin, CopyRspackPlugin } from "@rspack/core";
import { RspackDevServer } from "@rspack/dev-server";
import { createRspackConfig } from "../../build-scripts/rspack.cjs";

export function normalizeGalleryBasePath(value) {
  if (
    !/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]*\/?$/.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("Gallery base path must contain only URL path segments");
  }
  return value.endsWith("/") ? value : `${value}/`;
}

/** @param {{ production?: boolean, basePath?: string }} options
 * @returns {import("@rspack/core").Configuration} */
export function createGalleryConfig({
  production = false,
  basePath = process.env.GALLERY_BASE_PATH ?? "/",
} = {}) {
  basePath = normalizeGalleryBasePath(basePath);
  const config = createRspackConfig({
    entry: {
      gallery: resolve("gallery/src/index.ts"),
      preview: resolve("gallery/src/preview-entry.ts"),
    },
    outputPath: resolve("build/gallery"),
    publicPath: basePath,
    defineOverlay: { __DEMO__: true, __STATIC_PATH__: JSON.stringify(`${basePath}static/`) },
    isProdBuild: production,
    latestBuild: true,
    isStatsBuild: false,
  });
  // Keep source maps available without embedding them in every iframe's JavaScript.
  if (!production) config.devtool = "cheap-module-source-map";
  config.output.clean = true;
  config.module.rules.push({
    include: resolve("homeassistant-frontend/src/util/brands-url.ts"),
    enforce: "pre",
    use: resolve("gallery/script/gallery-brands-url-loader.cjs"),
  });
  config.plugins.push(
    ...["index", "preview"].map(
      (page) =>
        new HtmlRspackPlugin({
          template: resolve(`gallery/${page}.html`),
          filename: `${page}.html`,
          chunks: [page === "index" ? "gallery" : "preview"],
          scriptLoading: "module",
        }),
    ),
    new CopyRspackPlugin({
      patterns: [
        { from: "gallery/serve.json", to: "serve.json" },
        { from: "homeassistant-frontend/build/mdi", to: "static/mdi" },
        {
          from: "*/en.json",
          context: "homeassistant-frontend/build/locale-data",
          to: "static/locale-data/[path][name][ext]",
        },
        {
          from: "node_modules/roboto-fontface/fonts/roboto/*.woff2",
          to: "static/fonts/roboto/[name][ext]",
        },
        { from: "homeassistant-frontend/build/translations/output", to: "static/translations" },
      ],
    }),
  );
  return config;
}

async function prepareGallery() {
  await promisify(execFile)(
    process.execPath,
    ["node_modules/gulp/bin/gulp.js", "gen-icons-json", "build-translations", "build-locale-data"],
    {
      env: { ...process.env, NODE_ENV: "development", SKIP_FETCH_NIGHTLY_TRANSLATIONS: "1" },
    },
  );
}

const closeCompiler = (compiler) =>
  new Promise((accept, reject) => {
    compiler.close((error) => (error ? reject(error) : accept()));
  });

/** @param {{ port: number }} options
 * @returns {Promise<{ origin: string; stop(): Promise<void> }>} */
export async function startGallery({ port }) {
  await prepareGallery();
  const compiler = rspack(createGalleryConfig());
  const server = new RspackDevServer(
    {
      host: "127.0.0.1",
      port,
      hot: false,
      liveReload: true,
      client: {
        overlay: {
          // Deferred resize delivery is a browser diagnostic, not a widget crash.
          runtimeErrors: (error) =>
            error.message !== "ResizeObserver loop completed with undelivered notifications.",
        },
      },
      static: { directory: resolve("build/gallery/thumbnails"), publicPath: "/thumbnails" },
      historyApiFallback: false,
    },
    compiler,
  );
  const stop = async () => {
    try {
      await server.stop();
    } finally {
      await closeCompiler(compiler);
    }
  };
  try {
    await server.start();
    await new Promise((accept, reject) => {
      server.middleware.waitUntilValid((stats) =>
        stats.hasErrors()
          ? reject(new Error(stats.toString({ all: false, errors: true })))
          : accept(),
      );
    });
    return { origin: `http://127.0.0.1:${server.server.address().port}`, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { port: { type: "string", default: "8091" } },
  });
  const [mode] = positionals;
  if (positionals.length !== 1 || !["develop", "build", "serve"].includes(mode)) {
    throw new Error("Usage: node gallery/script/gallery.mjs <develop|build|serve> [--port 8091]");
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535");
  }
  if (mode === "serve") {
    const basePath = normalizeGalleryBasePath(process.env.GALLERY_BASE_PATH ?? "/");
    const root = await mkdtemp(resolve(tmpdir(), "knx-gallery-pages-"));
    try {
      await cp(resolve("build/gallery"), resolve(root, `.${basePath}`), { recursive: true });
      await writeFile(
        resolve(root, "serve.json"),
        JSON.stringify({
          cleanUrls: false,
          rewrites: [
            {
              source: basePath === "/" ? "/" : basePath.slice(0, -1),
              destination: `${basePath}index.html`,
            },
          ],
        }),
      );
      const child = spawn(
        process.execPath,
        [
          resolve("node_modules/serve/build/main.js"),
          root,
          "-l",
          `tcp://127.0.0.1:${port}`,
          "--no-clipboard",
        ],
        {
          stdio: "inherit",
          env: { ...process.env, NO_UPDATE_CHECK: "1" },
        },
      );
      const stop = () => child.kill("SIGTERM");
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      await new Promise((accept, reject) => {
        child.once("error", reject);
        child.once("exit", (code) =>
          code && code !== 143 ? reject(new Error(`serve exited ${code}`)) : accept(),
        );
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    return;
  }
  if (mode === "develop") {
    const server = await startGallery({ port });
    console.info(`Gallery: ${server.origin}`);
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await server.stop();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }
  await prepareGallery();
  const compiler = rspack(createGalleryConfig({ production: true }));
  try {
    await new Promise((accept, reject) => {
      compiler.run((error, stats) => {
        if (error || stats?.hasErrors()) {
          reject(error ?? new Error(stats.toString({ all: false, errors: true })));
        } else {
          accept();
        }
      });
    });
  } finally {
    await closeCompiler(compiler);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
