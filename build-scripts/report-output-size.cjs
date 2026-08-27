/* global require, process, __dirname */
// Report the size of the built panel, broken down by file type.
//
// The shipped wheel is just `knx_frontend/` zipped up, so this is the number every Home
// Assistant install pays for. It is easy to inflate by accident — a `devtool` setting that
// embedded `sourcesContent` once made source maps 48% of the wheel and 67% of the installed
// size, and went unnoticed for three years — so measure it on every build and surface it on
// the PR rather than burying it in a log.
//
// Two numbers are reported per bucket:
//   installed - bytes on disk, what the wheel expands to
//   download  - the same bytes deflated, which is what the wheel itself weighs
//
// Usage:
//   node build-scripts/report-output-size.cjs [--markdown <path>]
//
// When GITHUB_OUTPUT is set, a one-line `summary=` is written for use as a commit status
// description, so the size shows up in the PR check list.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
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
    if (entry.name === "__pycache__") {
      continue;
    }
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
};

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

const root = paths.knx_output_root;
if (!fs.existsSync(root)) {
  console.error(`No build output at ${root}. Run \`yarn build\` first.`);
  process.exit(1);
}

// Measure. `download` deflates each file the way the wheel does; already-compressed .gz/.br
// files come back roughly unchanged, which is exactly how they land in the wheel too.
const buckets = {};
let files = 0;
let installed = 0;
let download = 0;
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  const build = rel.includes(path.sep) ? rel.split(path.sep)[0] : "(root)";
  const key = `${build} ${categorize(file)}`;
  const data = fs.readFileSync(file);
  const compressed = zlib.deflateSync(data, { level: 6 }).length;
  buckets[key] ??= { files: 0, installed: 0, download: 0 };
  buckets[key].files += 1;
  buckets[key].installed += data.length;
  buckets[key].download += compressed;
  files += 1;
  installed += data.length;
  download += compressed;
}

const rows = Object.entries(buckets)
  .map(([key, v]) => ({ ...v, key }))
  .filter((r) => r.installed >= 1024)
  .sort((a, b) => b.download - a.download);

console.log(`\nBuild output: ${mb(installed)} installed, ${mb(download)} download (${files} files)\n`);
console.log(`${"bucket".padEnd(28)}${"files".padStart(7)}${"installed".padStart(12)}${"download".padStart(12)}`);
for (const r of rows) {
  console.log(
    `${r.key.padEnd(28)}${String(r.files).padStart(7)}${mb(r.installed).padStart(12)}${mb(r.download).padStart(12)}`,
  );
}
console.log(`${"TOTAL".padEnd(28)}${String(files).padStart(7)}${mb(installed).padStart(12)}${mb(download).padStart(12)}`);
console.log();

// One-line summary for a commit status description (max 140 chars)
const summary = `${mb(download)} download, ${mb(installed)} installed`;
console.log(summary);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
}

// Breakdown for the CI job summary page
const markdownPath = arg("markdown");
if (markdownPath) {
  const lines = [
    "### Build size",
    "",
    "| bucket | files | installed | download |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map((r) => `| \`${r.key}\` | ${r.files} | ${mb(r.installed)} | ${mb(r.download)} |`),
    `| **total** | **${files}** | **${mb(installed)}** | **${mb(download)}** |`,
    "",
    "`installed` is what the wheel expands to on disk; `download` is the wheel itself.",
  ];
  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`);
}
