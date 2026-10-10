// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import type { Configuration, Stats } from "@rspack/core";
import { rspack } from "@rspack/core";
import { expect, it } from "vitest";
import { createGalleryConfig, normalizeGalleryBasePath } from "../script/gallery.mjs";

it("normalizes a Pages prefix and rejects ambiguous or external paths", () => {
  expect(normalizeGalleryBasePath("/owner.github.io/pr/42")).toBe("/owner.github.io/pr/42/");
  expect(normalizeGalleryBasePath("/demo/pr/42")).toBe("/demo/pr/42/");
  expect(createGalleryConfig({ basePath: "/demo/pr/42/" }).output.publicPath).toBe("/demo/pr/42/");
  for (const path of ["https://example.com/", "//host/", "/a/../", "/a%2fb/", "/a?b", "/a\\b"]) {
    expect(() => normalizeGalleryBasePath(path)).toThrow();
  }
});

it("emits isolated gallery and preview entries outside the Python package", async () => {
  const config: Configuration = createGalleryConfig();
  expect(config.output?.path).toBe(resolve("build/gallery"));
  expect(config.devtool).toBe("cheap-module-source-map");
  const output = await mkdtemp(join(tmpdir(), "knx-gallery-"));
  config.output = { ...config.output, path: output };
  const compiler = rspack(config);
  try {
    const stats = await new Promise<Stats>((accept, reject) => {
      compiler.run((error, result) => {
        if (error || !result || result.hasErrors()) {
          reject(error ?? new Error(result?.toString({ all: false, errors: true })));
        } else {
          accept(result);
        }
      });
    });
    expect(
      JSON.parse(
        await readFile(join(output, "static/locale-data/intl-displaynames/en.json"), "utf8"),
      ),
    ).toHaveProperty("locale");
    expect(
      (await readFile(join(output, "static/fonts/roboto/Roboto-Regular.woff2"))).byteLength,
    ).toBeGreaterThan(0);
    expect(await readdir(join(output, "static"))).not.toContain("brands");
    const index = await readFile(join(output, "index.html"), "utf8");
    const preview = await readFile(join(output, "preview.html"), "utf8");
    expect(index).toContain('src="/gallery.dev.js"');
    expect(index).not.toContain('src="/preview.dev.js"');
    expect(preview).toContain('src="/preview.dev.js"');
    expect(preview).not.toContain('src="/gallery.dev.js"');
    expect((await readdir(output)).filter((file) => file.endsWith(".html")).sort()).toEqual([
      "index.html",
      "preview.html",
    ]);
    expect(
      stats
        .toJson({ all: false, assets: true })
        .assets?.every(
          (asset) => !asset.name.includes("knx_frontend") && !asset.name.startsWith("../"),
        ),
    ).toBe(true);
  } finally {
    await new Promise<void>((accept, reject) => {
      compiler.close((error) => (error ? reject(error) : accept()));
    });
    await rm(output, { recursive: true, force: true });
  }
  // A full rspack build takes about 40 s on CI runners and longer with coverage enabled.
}, 180_000);

it("uses production optimization for the standalone gallery build", () => {
  const config: Configuration = createGalleryConfig({ production: true });
  expect(config.mode).toBe("production");
  expect(config.devtool).toBe("nosources-source-map");
  expect(config.output?.path).toBe(resolve("build/gallery"));
});
