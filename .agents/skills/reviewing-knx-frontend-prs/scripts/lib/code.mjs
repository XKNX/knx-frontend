// Code patterns maintainers have repeatedly asked to change in src/.

import { finding } from "./findings.mjs";

const RULES = [
  {
    rule: "CODE-console",
    test: (text, file) => !file.path.endsWith(".test.ts") && /\bconsole\.[a-z]+\s*\(/.test(text),
    message: "Use KNXLogger (src/tools/knx-logger) instead of console.",
    evidence: ["#41", "#457"],
  },
  {
    rule: "CODE-mwc",
    test: (text) => /(?:\bfrom|\bimport)\s*\(?\s*["']@material\/(?:mwc-|web(?:\/|["']))/.test(text),
    message:
      "Do not import @material/mwc-* or @material/web directly; the host HA registers them already. Use the ha-* wrapper.",
    evidence: ["#233", "#242"],
  },
  {
    rule: "CODE-ha-path",
    test: (text) =>
      /(?:\bfrom|\bimport)\s*\(?\s*["'][^"']*homeassistant-frontend\/src\//.test(text),
    message: "Import Home Assistant frontend code through the @ha/* alias.",
    evidence: [],
  },
  {
    rule: "CODE-prefix",
    test: (text) => {
      const name = text.match(/@customElement\(\s*["']([^"']+)["']/)?.[1];
      return name !== undefined && !name.startsWith("knx-");
    },
    message: "Custom elements in this panel start with knx-.",
    evidence: [],
  },
  {
    rule: "CODE-backpath",
    test: (text) => /\.backPath=\$\{\s*["'`]|\bback-path=["']|\bbackPath:\s*["'`]/.test(text),
    message:
      "Hard-coded back paths grow the history; use navigateInFlow/exitFlow (src/utils/navigation).",
    evidence: ["#299", "#312"],
  },
];

const isSource = (file) => file.status !== "deleted" && /^src\/.+\.(ts|js)$/.test(file.path);

export function codeFindings(files) {
  const results = [];
  for (const file of files.filter(isSource)) {
    for (const { line, text } of file.added) {
      for (const { rule, test, message, evidence } of RULES) {
        if (test(text, file)) {
          results.push(
            finding({ rule, severity: "should-fix", file: file.path, line, message, evidence }),
          );
        }
      }
    }
  }
  return results;
}
