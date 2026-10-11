// @vitest-environment node
import { resolve } from "node:path";
import type { Configuration } from "@rspack/core";
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

it("uses production optimization for the standalone gallery build", () => {
  const config: Configuration = createGalleryConfig({ production: true });
  expect(config.mode).toBe("production");
  expect(config.devtool).toBe("nosources-source-map");
  expect(config.output?.path).toBe(resolve("build/gallery"));
});
