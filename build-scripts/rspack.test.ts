// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rspack, type Configuration, type Stats } from "@rspack/core";
import { expect, it } from "vitest";
import { createRspackConfig } from "./rspack.cjs";

it("resolves a dependency from its importing package in an isolated node_modules layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "knx-nested-dependency-"));
  const consumer = join(root, "node_modules/knx-test-consumer");
  const provider = join(consumer, "node_modules/knx-test-provider");
  await mkdir(provider, { recursive: true });
  await writeFile(join(provider, "package.json"), JSON.stringify({ main: "index.js" }));
  await writeFile(
    join(provider, "index.js"),
    'export const value = "KNX_NESTED_RESOLUTION_SENTINEL";',
  );
  await writeFile(join(consumer, "index.js"), 'export { value } from "knx-test-provider";');
  const entry = join(root, "entry.js");
  await writeFile(
    entry,
    'import { value } from "knx-test-consumer"; globalThis.knxTestValue = value;',
  );
  const output = join(root, "output");
  const config: Configuration = createRspackConfig({
    entry: { test: entry },
    outputPath: output,
    publicPath: "/",
    isProdBuild: true,
    latestBuild: true,
    isStatsBuild: false,
  });
  config.optimization = { ...config.optimization, minimize: false };
  const compiler = rspack(config);
  try {
    const stats = await new Promise<Stats>((accept, reject) => {
      compiler.run((error, result) => {
        if (error || !result) reject(error ?? new Error("Missing build result"));
        else accept(result);
      });
    });
    expect(stats.toString({ all: false, errors: true })).toBe("");
    const assets = stats.toJson({ all: false, assets: true }).assets!;
    const scripts = await Promise.all(
      assets
        .filter(({ name }) => name.endsWith(".js"))
        .map(({ name }) => readFile(join(output, name), "utf8")),
    );
    expect(scripts.join("\n")).toContain("KNX_NESTED_RESOLUTION_SENTINEL");
  } finally {
    await new Promise<void>((accept, reject) => {
      compiler.close((error) => (error ? reject(error) : accept()));
    });
    await rm(root, { recursive: true, force: true });
  }
});
