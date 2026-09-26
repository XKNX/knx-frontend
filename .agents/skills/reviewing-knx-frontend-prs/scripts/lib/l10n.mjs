// Localization rules. Panel strings live as flat keys in src/localize/languages/<lang>.json;
// knx.localize falls back to en and then to hass.localize, so dotted keys (ui.*, component.knx.*)
// are Home Assistant keys and a missing flat key renders as the raw key.

import { matchAdded } from "./diff.mjs";
import { finding } from "./findings.mjs";

export const LANG_DIR = "src/localize/languages/";

export function addedKeys(file) {
  const keys = [];
  for (const { line, text } of file.added) {
    const match = text.match(/^\s*"([^"]+)":\s*"(.*)",?\s*$/);
    if (match) keys.push({ key: match[1], value: match[2], line });
  }
  return keys;
}

const isLanguageFile = (file) =>
  file.status !== "deleted" && file.path.startsWith(LANG_DIR) && file.path.endsWith(".json");
const isSource = (file) =>
  file.status !== "deleted" && /^src\/.+\.ts$/.test(file.path) && !file.path.endsWith(".test.ts");

const CALL = /knx\.localize\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`|([^\s)"'`]))/g;

export function l10nFindings(files, languages) {
  const results = [];
  for (const file of files.filter(isLanguageFile)) {
    const lang = file.path.slice(LANG_DIR.length, -".json".length);
    for (const { key, value, line } of addedKeys(file)) {
      const missing = Object.keys(languages).filter(
        (code) => code !== lang && !languages[code].has(key),
      );
      if (missing.length > 0) {
        results.push(
          finding({
            rule: "L10N-parity",
            severity: "should-fix",
            file: file.path,
            line,
            message: `"${key}" is missing in ${missing.map((code) => `${code}.json`).join(", ")}.`,
            evidence: ["#244", "#465"],
          }),
        );
      }
      if (lang === "en") {
        results.push(
          finding({
            rule: "L10N-new-key",
            severity: "question",
            file: file.path,
            line,
            message: `New frontend key "${key}": check first for an existing Home Assistant key (ui.*, state.*) or a backend string (component.knx.*); frontend keys are the last resort.`,
            evidence: ["#307", "#457"],
          }),
        );
      }
      if (/\bGA\b/.test(value)) {
        results.push(
          finding({
            rule: "L10N-jargon",
            severity: "nit",
            file: file.path,
            line,
            message: 'Write "group address" instead of "GA".',
          }),
        );
      }
    }
  }

  const en = languages.en ?? new Set();
  for (const file of files.filter(isSource)) {
    for (const { match, line } of matchAdded(file, CALL)) {
      const template = match[3];
      const literal =
        match[1] ??
        match[2] ??
        (template !== undefined && !template.includes("${") ? template : undefined);
      if (literal === undefined) {
        results.push(
          finding({
            rule: "L10N-dynamic",
            severity: "question",
            file: file.path,
            line,
            message:
              "Key built at runtime: make sure every key it can produce exists in all language files.",
            evidence: ["#244"],
          }),
        );
      } else if (!literal.includes(".") && !en.has(literal)) {
        results.push(
          finding({
            rule: "L10N-missing",
            severity: "blocker",
            file: file.path,
            line,
            message: `"${literal}" is not in ${LANG_DIR}en.json; knx.localize would show the raw key.`,
            evidence: ["#244", "#465"],
          }),
        );
      }
    }
  }
  return results;
}
