// The panel talks to the KNX integration in HA Core through `knx/*` WebSocket commands. A command
// the frontend sends must exist in Core's homeassistant/components/knx/websocket.py.

import { matchAdded } from "./diff.mjs";
import { finding } from "./findings.mjs";

const TYPE = /\btype:\s*["'](knx\/[a-z0-9_/]+)["']/g;
const isSource = (file) =>
  file.status !== "deleted" && /^src\/.+\.ts$/.test(file.path) && !file.path.endsWith(".test.ts");

export function addedCommands(files) {
  return files
    .filter(isSource)
    .flatMap((file) =>
      matchAdded(file, TYPE).map(({ match, line }) => ({
        file: file.path,
        line,
        command: match[1],
      })),
    );
}

export function wsFindings(files, coreText) {
  const commands = addedCommands(files);
  if (commands.length === 0) return { findings: [], notRun: [] };
  if (coreText === null) {
    return {
      findings: [],
      notRun: [
        "WS-contract: Core's homeassistant/components/knx/websocket.py could not be read (pass --core or log in to gh)",
      ],
    };
  }
  const findings = commands
    .filter(({ command }) => !coreText.includes(`"${command}"`))
    .map(({ file, line, command }) =>
      finding({
        rule: "WS-contract",
        severity: "blocker",
        file,
        line,
        message: `"${command}" is not a command in Core's homeassistant/components/knx/websocket.py; link the Core PR that adds it (then this is a question) or drop it.`,
        evidence: ["#233", "#410"],
      }),
    );
  return { findings, notRun: [] };
}
