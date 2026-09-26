import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff } from "../lib/diff.mjs";
import { addedCommands, wsFindings } from "../lib/ws.mjs";

const files = parseDiff(
  `diff --git a/src/services/websocket.service.ts b/src/services/websocket.service.ts\n@@ -1,0 +40,3 @@\n+  type: "knx/get_base_data",\n+  type: "knx/brand_new_command",\n+  type: 'knx/subscribe_telegrams',\n` +
    `diff --git a/src/services/websocket.service.test.ts b/src/services/websocket.service.test.ts\n@@ -1,0 +1 @@\n+  type: "knx/only_in_test",\n`,
);
const core = `
@websocket_api.websocket_command({vol.Required("type"): "knx/get_base_data"})
@websocket_api.websocket_command({vol.Required("type"): "knx/subscribe_telegrams"})
`;

test("addedCommands lists knx/ types added outside tests", () => {
  assert.deepEqual(
    addedCommands(files).map(({ line, command }) => [line, command]),
    [
      [40, "knx/get_base_data"],
      [41, "knx/brand_new_command"],
      [42, "knx/subscribe_telegrams"],
    ],
  );
});

test("a command Core does not know is a blocker", () => {
  const { findings, notRun } = wsFindings(files, core);
  assert.deepEqual(notRun, []);
  assert.deepEqual(
    findings.map((item) => [item.rule, item.severity, item.line]),
    [["WS-contract", "blocker", 41]],
  );
  assert.match(findings[0].message, /knx\/brand_new_command/);
});

test("without the Core file the rule is reported as not run", () => {
  const { findings, notRun } = wsFindings(files, null);
  assert.deepEqual(findings, []);
  assert.equal(notRun.length, 1);
  assert.match(notRun[0], /WS-contract/);
});

test("no added commands means nothing to check and nothing not run", () => {
  assert.deepEqual(wsFindings([], null), { findings: [], notRun: [] });
});
