import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const galleryPath = /(?:^|[! /\\])gallery[\\/]/;
const galleryCode = /knx-gallery(?:-[a-z]+)?|gallery[\\/]src[\\/]/;

/** @param {unknown} stats @returns {string[]} */
export function findGalleryModules(stats) {
  const found = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        ["filteredChildren", "filteredModules"].includes(key) &&
        typeof child === "number" &&
        child > 0
      ) {
        throw new Error(`Incomplete module evidence: ${key} hides ${child} records`);
      }
      if (
        ["identifier", "name", "nameForCondition", "id"].includes(key) &&
        typeof child === "string" &&
        galleryPath.test(child)
      ) {
        found.add(child);
      } else if (typeof child === "object") visit(child);
    }
  };
  visit(stats);
  return [...found].sort();
}

function check(statsFile, wheelDir) {
  const stats = JSON.parse(readFileSync(statsFile, "utf8"));
  const children = stats.children;
  const targets = ["frontend_latest", "frontend_es5"];
  if (
    !Array.isArray(children) ||
    children.length !== 2 ||
    targets.some((target) => !children.some((child) => basename(child.outputPath ?? "") === target))
  ) {
    throw new Error("Stats must contain both regular frontend_latest and frontend_es5 builds");
  }
  const allowedJS = new Set();
  for (const child of children) {
    if (child.errorsCount !== 0 || !child.modules?.length || !child.assets?.length) {
      throw new Error("Missing module/asset evidence or compilation errors");
    }
    const target = basename(child.outputPath);
    for (const asset of child.assets) {
      if (asset.name?.endsWith(".js")) allowedJS.add(`knx_frontend/${target}/${asset.name}`);
    }
    const entry = child.assets.find((asset) => /^entrypoint\.[a-f0-9]+\.js$/.test(asset.name));
    if (!entry) throw new Error(`Missing production entrypoint for ${target}`);
    // gulp's entry-html task generates this loader from the modern entrypoint hash.
    if (target === "frontend_latest") allowedJS.add(`knx_frontend/${entry.name}`);
  }
  const failures = findGalleryModules(stats).map((name) => `Gallery module: ${name}`);
  for (const asset of allowedJS) {
    if (!existsSync(join(wheelDir, asset))) failures.push(`Missing production asset: ${asset}`);
  }
  let files = 0;
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = relative(wheelDir, path).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      files++;
      const uncompressed = name.replace(/\.(?:gz|br)$/, "");
      if (galleryPath.test(name) || /(?:^|\/)gallery(?:[.-]|$)/.test(name)) {
        failures.push(`Gallery file: ${name}`);
      }
      if (/\.[cm]?js$/.test(uncompressed) && !allowedJS.has(uncompressed)) {
        failures.push(`JavaScript absent from production stats: ${name}`);
      }
      if (!/\.(?:[cm]?js|html|css|json|map)$/.test(uncompressed)) continue;
      let content = readFileSync(path);
      if (name.endsWith(".gz")) content = gunzipSync(content);
      if (name.endsWith(".br")) content = brotliDecompressSync(content);
      if (galleryCode.test(content.toString("utf8"))) failures.push(`Gallery code: ${name}`);
    }
  };
  visit(wheelDir);
  if (!files) throw new Error("Unpacked wheel is empty");
  if (failures.length) throw new Error(failures.join("\n"));
  console.info(`Gallery excluded: 2 production module graphs and ${files} wheel files checked`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) {
      throw new Error(
        "Usage: node gallery/script/check-gallery-exclusion.mjs <stats-file> <unpacked-wheel-dir>",
      );
    }
    check(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
