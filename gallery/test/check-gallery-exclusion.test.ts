// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rspack, type Stats } from "@rspack/core";
import { afterEach, expect, it } from "vitest";
import { productionStatsOptions } from "../../build-scripts/rspack.cjs";
import { findGalleryModules } from "../script/check-gallery-exclusion.mjs";

const gallery = "./gallery/src/preview.ts";
const clean = { modules: [{ identifier: "./src/main.ts" }] };
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true })));

it("finds direct, dynamic, concatenated and child compilation gallery modules", () => {
  expect(findGalleryModules(clean)).toEqual([]);
  for (const stats of [
    { modules: [{ identifier: gallery }] },
    { chunks: [{ initial: false, modules: [{ name: gallery }] }] },
    { modules: [{ name: "./src/main.ts + 2 modules", modules: [{ nameForCondition: gallery }] }] },
    { children: [clean, { children: [{ modules: [{ id: gallery }] }] }] },
  ]) {
    expect(findGalleryModules(stats)).toEqual([gallery]);
  }
  expect(
    findGalleryModules({ modules: [{ identifier: "loader!C:\\repo\\gallery\\src\\index.ts" }] }),
  ).toHaveLength(1);
});

it("requires valid build evidence and rejects named or renamed wheel contamination", () => {
  const root = mkdtempSync(join(tmpdir(), "knx-exclusion-"));
  directories.push(root);
  const wheel = join(root, "wheel");
  const output = join(wheel, "knx_frontend/frontend_latest");
  mkdirSync(output, { recursive: true });
  const legacy = join(wheel, "knx_frontend/frontend_es5");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "entrypoint.123.js"), "export{};");
  writeFileSync(join(wheel, "knx_frontend/entrypoint.123.js"), "export{};");
  const statsPath = join(root, "stats.json");
  const stats = {
    children: ["frontend_latest", "frontend_es5"].map((target) => ({
      ...clean,
      outputPath: `/build/knx_frontend/${target}`,
      errorsCount: 0,
      assets: [{ name: "entrypoint.123.js" }],
    })),
  };
  writeFileSync(statsPath, JSON.stringify(stats));
  writeFileSync(join(output, "entrypoint.123.js"), "export{};");
  const run = () =>
    spawnSync(
      process.execPath,
      [resolve("gallery/script/check-gallery-exclusion.mjs"), statsPath, wheel],
      { encoding: "utf8" },
    );
  expect(run().status).toBe(0);
  for (const modules of [
    [{ name: "orphan modules", filteredChildren: 2 }],
    [{ identifier: "./src/entry.js", filteredModules: 1 }],
    [{ identifier: "./src/entry.js", modules: [{ name: "hidden", filteredChildren: 1 }] }],
  ]) {
    writeFileSync(
      statsPath,
      JSON.stringify({ children: stats.children.map((child) => ({ ...child, modules })) }),
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Incomplete module evidence");
  }
  writeFileSync(
    statsPath,
    JSON.stringify({ children: stats.children.map((child) => ({ ...child, filteredModules: 1 })) }),
  );
  expect(run().status).toBe(1);
  writeFileSync(statsPath, JSON.stringify(stats));
  rmSync(join(legacy, "entrypoint.123.js"));
  expect(run().status).toBe(1);
  writeFileSync(join(legacy, "entrypoint.123.js"), "export{};");
  const contamination = join(output, "gallery.js");
  writeFileSync(contamination, "export{};");
  expect(run().status).toBe(1);
  rmSync(contamination);
  const renamed = join(output, "984.abcdef.js");
  writeFileSync(renamed, "(()=>{let n=1;return n})()");
  expect(run().status).toBe(1);
  rmSync(renamed);
  writeFileSync(
    join(output, "entrypoint.123.js"),
    'customElements.define("knx-gallery-preview",class extends HTMLElement{});',
  );
  expect(run().status).toBe(1);
  writeFileSync(join(output, "entrypoint.123.js"), "export{};");
  writeFileSync(statsPath, "{}");
  expect(run().status).toBe(1);
  writeFileSync(statsPath, JSON.stringify({ ...stats, children: stats.children.slice(0, 1) }));
  expect(run().status).toBe(1);
  writeFileSync(
    statsPath,
    JSON.stringify({ children: stats.children.map((child) => ({ ...child, errorsCount: 1 })) }),
  );
  expect(run().status).toBe(1);
});

it("includes gallery identities from a real production concatenated module", async () => {
  const root = mkdtempSync(join(tmpdir(), "knx-concatenation-"));
  directories.push(root);
  mkdirSync(join(root, "gallery"));
  writeFileSync(
    join(root, "entry.js"),
    'import { value } from "./gallery/value.js"; globalThis.result = value;',
  );
  writeFileSync(join(root, "gallery/value.js"), "export const value = Math.random();");
  const compiler = rspack({
    mode: "production",
    context: root,
    entry: "./entry.js",
    output: { path: join(root, "output"), filename: "entrypoint.[contenthash].js" },
    optimization: { concatenateModules: true },
  });
  try {
    const stats = await new Promise<Stats>((accept, reject) => {
      compiler.run((error, result) => {
        if (error || !result || result.hasErrors()) reject(error ?? new Error(result?.toString()));
        else accept(result);
      });
    });
    const json = stats.toJson(productionStatsOptions);
    const concatenated = json.modules?.find((module) => module.name?.includes("+ 1 modules"));
    expect(concatenated).toBeDefined();
    expect(
      findGalleryModules(concatenated).some((name) => name.endsWith("/gallery/value.js")),
    ).toBe(true);
  } finally {
    await new Promise<void>((accept, reject) => {
      compiler.close((error) => {
        if (error) reject(error);
        else accept();
      });
    });
  }
});
