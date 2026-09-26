import assert from "node:assert/strict";
import test from "node:test";
import { codeFindings } from "../lib/code.mjs";
import { parseDiff } from "../lib/diff.mjs";

const added = (path, lines) =>
  parseDiff(
    `diff --git a/${path} b/${path}\n@@ -1,0 +1,${lines.length} @@\n` +
      lines.map((line) => `+${line}`).join("\n") +
      "\n",
  );
const rules = (files) => codeFindings(files).map((item) => [item.rule, item.line]);

test("console in source is flagged, in tests it is not", () => {
  assert.deepEqual(rules(added("src/views/a.ts", ["const a = 1;", 'console.log("x");'])), [
    ["CODE-console", 2],
  ]);
  assert.deepEqual(rules(added("src/views/a.test.ts", ['console.log("x");'])), []);
});

test("direct mwc and material web imports are flagged", () => {
  assert.deepEqual(
    rules(
      added("src/components/a.ts", [
        'import "@material/mwc-list/mwc-list-item";',
        'import { MdButton } from "@material/web/button/filled-button.js";',
        'import "@ha/components/ha-list-item";',
      ]),
    ),
    [
      ["CODE-mwc", 1],
      ["CODE-mwc", 2],
    ],
  );
});

test("relative imports into the submodule are flagged", () => {
  assert.deepEqual(
    rules(
      added("src/views/a.ts", ['import { x } from "../../homeassistant-frontend/src/common/x";']),
    ),
    [["CODE-ha-path", 1]],
  );
});

test("custom elements need the knx- prefix", () => {
  assert.deepEqual(
    rules(
      added("src/components/a.ts", [
        '@customElement("flex-content-expansion-panel")',
        '@customElement("knx-telegram-table")',
      ]),
    ),
    [["CODE-prefix", 1]],
  );
});

test("hard-coded back paths are flagged", () => {
  assert.deepEqual(
    rules(
      added("src/views/a.ts", [
        '<hass-subpage .backPath=${"/knx/entities"}>',
        '<hass-subpage back-path="/knx">',
        'const route = { backPath: "/knx/info" };',
        "<hass-subpage .backPath=${this._backPath}>",
      ]),
    ),
    [
      ["CODE-backpath", 1],
      ["CODE-backpath", 2],
      ["CODE-backpath", 3],
    ],
  );
});

test("deleted files and files outside src are ignored", () => {
  assert.deepEqual(rules(added("build-scripts/a.cjs", ['console.log("x");'])), []);
});
