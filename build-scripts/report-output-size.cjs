/* global require, process, __dirname */
// Report the size of the built panel, broken down by file type.
//
// The shipped wheel is just `knx_frontend/` zipped up, so this is the number users pay for on
// every install. It is easy to inflate by accident — a `devtool` setting that embeds
// `sourcesContent` once made source maps 48% of the wheel and went unnoticed for three years —
// so print the breakdown on every build and let it show up in CI logs and PR diffs.
//
// Usage: node build-scripts/report-output-size.cjs

const fs = require("fs");
const path = require("path");
const paths = require("./paths.cjs");

const CATEGORIES = [
  [".js.map", (f) => f.endsWith(".js.map")],
  [".js.gz", (f) => f.endsWith(".js.gz")],
  [".js.br", (f) => f.endsWith(".js.br")],
  [".js", (f) => f.endsWith(".js")],
  [".LICENSE.txt", (f) => f.endsWith(".LICENSE.txt")],
];

const categorize = (file) => CATEGORIES.find(([, test]) => test(file))?.[0] ?? "other";

const walk = function* (dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
};

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

const root = paths.knx_output_root;
if (!fs.existsSync(root)) {
  console.error(`No build output at ${root}. Run \`yarn build\` first.`);
  process.exit(1);
}

const totals = new Map();
let grandTotal = 0;
let fileCount = 0;
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  const build = rel.includes(path.sep) ? rel.split(path.sep)[0] : "(root)";
  const key = `${build}\t${categorize(file)}`;
  const size = fs.statSync(file).size;
  const entry = totals.get(key) ?? { count: 0, size: 0 };
  entry.count += 1;
  entry.size += size;
  totals.set(key, entry);
  grandTotal += size;
  fileCount += 1;
}

const rows = [...totals.entries()]
  .map(([key, v]) => ({ ...v, build: key.split("\t")[0], ext: key.split("\t")[1] }))
  .sort((a, b) => b.size - a.size);

console.log(`\nBuild output: ${mb(grandTotal)} across ${fileCount} files (${root})\n`);
console.log(`${"build".padEnd(18)}${"type".padEnd(16)}${"files".padStart(7)}${"size".padStart(12)}`);
for (const r of rows) {
  console.log(
    `${r.build.padEnd(18)}${r.ext.padEnd(16)}${String(r.count).padStart(7)}${mb(r.size).padStart(12)}`,
  );
}
console.log(`${"TOTAL".padEnd(34)}${String(fileCount).padStart(7)}${mb(grandTotal).padStart(12)}\n`);
