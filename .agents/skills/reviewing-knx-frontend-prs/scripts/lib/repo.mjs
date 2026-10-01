// Rules about which files a change touches: generated and release-owned paths, the production
// source-map setting, tests for utils, and which local gates the change calls for.

import { finding } from "./findings.mjs";

const SUBMODULE = "homeassistant-frontend";
const TOOLCHAIN = new Set([".yarnrc.yml", ".nvmrc", ".browserslistrc"]);
const RELEASE = new Set(["VERSION", "src/version.ts"]);

export function pathFindings(files) {
  const bump = files.some((file) => file.path === SUBMODULE && file.gitlink);
  const findings = [];
  for (const { path } of files) {
    let message = null;
    if (path.startsWith("knx_frontend/")) {
      message =
        "knx_frontend/ is build output; it is produced by yarn build and must not be committed.";
    } else if (RELEASE.has(path)) {
      message = `${path} must stay "dev"; the release workflow writes the version.`;
    } else if (TOOLCHAIN.has(path) && !bump) {
      message = `${path} is copied from the submodule by script/upgrade-frontend; change it only in a submodule upgrade.`;
    }
    if (message) {
      findings.push(
        finding({
          rule: "PATH-protected",
          severity: "blocker",
          file: path,
          line: null,
          message,
          evidence: ["#24"],
        }),
      );
    }
  }
  return { findings, handover: bump ? "upgrading-knx-frontend-submodule" : null };
}

const RSPACK = "build-scripts/rspack.cjs";

export function devtoolFindings(files, readHead) {
  if (!files.some((file) => file.path === RSPACK && file.status !== "deleted")) return [];
  const text = readHead(RSPACK) ?? "";
  const lines = text.split("\n");
  const index = lines.findIndex((line) => /\bdevtool:/.test(line));
  const value = text.match(/\bdevtool:\s*isProdBuild\s*\?\s*"([^"]+)"/)?.[1];
  if (value === "nosources-source-map") return [];
  return [
    finding({
      rule: "BUILD-devtool",
      severity: "blocker",
      file: RSPACK,
      line: index < 0 ? null : index + 1,
      message: value
        ? `The production devtool is "${value}"; it must stay "nosources-source-map", or the wheel ships the source code.`
        : 'Cannot find the production devtool (devtool: isProdBuild ? "…"); it must stay "nosources-source-map".',
      evidence: ["#441"],
    }),
  ];
}

const isUtil = (file) =>
  file.status !== "deleted" &&
  /^src\/utils\/.+\.ts$/.test(file.path) &&
  !file.path.endsWith(".test.ts");

export function testFindings(files) {
  if (files.some((file) => file.status !== "deleted" && file.path.endsWith(".test.ts"))) return [];
  return files.filter(isUtil).map((file) =>
    finding({
      rule: "TEST-utils",
      severity: "nit",
      file: file.path,
      line: null,
      message: "A util changed without any test change; consider a Vitest test next to it.",
      evidence: ["#466"],
    }),
  );
}

const BUILD_INPUT =
  /^(package\.json|yarn\.lock|rspack\.config\.cjs|build-scripts\/.*|src\/stubs\/.*)$/;

export function gates(files) {
  const paths = files.map((file) => file.path);
  const result = [];
  if (paths.some((path) => BUILD_INPUT.test(path))) result.push("build");
  if (paths.some((path) => path === "package.json" || path === "yarn.lock")) result.push("dedupe");
  if (paths.some((path) => path.endsWith(".ts"))) result.push("types");
  if (paths.some((path) => /^src\/.+\.ts$/.test(path) && !path.endsWith(".test.ts"))) {
    result.push("lint-lit");
  }
  return result;
}
