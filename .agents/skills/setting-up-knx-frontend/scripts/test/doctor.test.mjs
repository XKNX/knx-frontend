import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanup, git, makeFixture, makeHealthy, run, runIn } from "./helpers.mjs";

const withFixture = (options, fn) => async () => {
  const fixture = makeFixture(options);
  try {
    await fn(fixture);
  } finally {
    cleanup(fixture);
  }
};

test("outside a git repository the doctor exits 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-empty-"));
  try {
    const result = runIn(dir);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /not inside a git repository/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "a repository that is not knx-frontend exits 2",
  withFixture({ name: "something-else" }, (fixture) => {
    const result = run(fixture);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /not a knx-frontend checkout/);
  }),
);

test(
  "unknown options and a non-numeric port exit 2",
  withFixture({}, (fixture) => {
    assert.equal(run(fixture, ["--bogus"]).code, 2);
    assert.equal(run(fixture, ["--port", "x"]).code, 2);
    assert.equal(run(fixture, ["--port"]).code, 2);
  }),
);

test(
  "the checkout and an upstream remote over ssh are ok",
  withFixture(
    {
      remotes: {
        upstream: "git@github.com:XKNX/knx-frontend.git",
        origin: "https://github.com/someone/knx-frontend.git",
      },
    },
    (fixture) => {
      const result = run(fixture, ["--json"]);
      assert.equal(result.check("repo").status, "ok");
      assert.equal(result.check("upstream").status, "ok");
      assert.match(result.check("upstream").message, /"upstream"/);
      assert.equal(result.check("fork").status, "ok");
      assert.match(result.check("fork").message, /"origin"/);
    },
  ),
);

test(
  "only a fork remote fails upstream and names the command",
  withFixture({ remotes: { origin: "https://github.com/someone/knx-frontend.git" } }, (fixture) => {
    const result = run(fixture, ["--json"]);
    assert.equal(result.check("upstream").status, "fail");
    assert.match(
      result.check("upstream").fix,
      /git remote add upstream https:\/\/github.com\/XKNX\/knx-frontend.git/,
    );
    assert.equal(result.code, 1);
  }),
);

test(
  "no fork remote is a warning with a fork command that asks first",
  withFixture({}, (fixture) => {
    const fork = run(fixture, ["--json"]).check("fork");
    assert.equal(fork.status, "warn");
    assert.match(fork.fix, /gh repo fork XKNX\/knx-frontend --remote=false/);
    assert.match(fork.fix, /ask the user first/);
  }),
);

test(
  "text output lists the fix under the check and ends with a summary",
  withFixture({ remotes: {} }, (fixture) => {
    const result = run(fixture);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /^FAIL +upstream +no remote points at XKNX\/knx-frontend/m);
    assert.match(result.stdout, /^ {24}fix: git remote add upstream/m);
    assert.match(result.stdout, /\d+ ok, \d+ info, \d+ warn, \d+ fail/);
  }),
);

const RELEASES = [
  "20260930.0 true",
  "20260826.7 false",
  "20260826.4 false",
  "20260801.0 true",
].join("\n");
const pins = (tag) => `{"requirements": ["home-assistant-frontend==${tag}"]}`;

test(
  "an uninitialized submodule fails and blocks yarn and the release check",
  withFixture({ initSubmodule: false }, (fixture) => {
    const result = run(fixture, ["--json"]);
    assert.equal(result.check("submodule").status, "fail");
    assert.match(
      result.check("submodule").fix,
      /git submodule update --init homeassistant-frontend/,
    );
    assert.doesNotMatch(result.check("submodule").fix, /--recursive/);
    assert.equal(result.check("submodule-release").status, "fail");
    assert.match(result.check("submodule-release").message, /not initialized/);
  }),
);

test(
  "a submodule at another commit than the pointer fails",
  withFixture({}, (fixture) => {
    git(join(fixture.repo, "homeassistant-frontend"), "checkout", "-q", "20260826.7");
    const submodule = run(fixture, ["--json"]).check("submodule");
    assert.equal(submodule.status, "fail");
    assert.match(submodule.message, /different commit than the pointer/);
  }),
);

test(
  "the submodule at its pointer is ok",
  withFixture({}, (fixture) => {
    assert.equal(run(fixture, ["--json"]).check("submodule").status, "ok");
  }),
);

test(
  "release: newer stable and beta with compare links, warn when HA Core pins newer",
  withFixture({}, (fixture) => {
    const release = run(fixture, ["--json"], {
      STUB_GH_RELEASES: RELEASES,
      STUB_GH_MANIFEST: pins("20260826.7"),
    }).check("submodule-release");
    assert.equal(release.status, "warn");
    assert.match(release.message, /^checked out 20260826\.4 \(stable\)/);
    assert.match(
      release.message,
      /newer stable: 20260826\.7 {2}https:\/\/github\.com\/home-assistant\/frontend\/compare\/20260826\.4\.\.\.20260826\.7/,
    );
    assert.match(
      release.message,
      /newer beta: {3}20260930\.0 {2}https:\/\/github\.com\/home-assistant\/frontend\/compare\/20260826\.4\.\.\.20260930\.0/,
    );
    assert.match(release.message, /HA Core dev pins: 20260826\.7/);
    assert.match(release.fix, /upgrading-knx-frontend-submodule/);
  }),
);

test(
  "release: a beta older than the newest stable is not shown, an equal pin is info",
  withFixture({}, (fixture) => {
    const release = run(fixture, ["--json"], {
      STUB_GH_RELEASES: ["20260826.7 false", "20260826.5 true", "20260826.4 false"].join("\n"),
      STUB_GH_MANIFEST: pins("20260826.4"),
    }).check("submodule-release");
    assert.equal(release.status, "info");
    assert.match(release.message, /newer stable: 20260826\.7/);
    assert.doesNotMatch(release.message, /newer beta/);
  }),
);

test(
  "release: a pointer between tags is not a release tag",
  withFixture({ afterLastTag: true }, (fixture) => {
    const release = run(fixture, ["--json"], { STUB_GH_RELEASES: RELEASES }).check(
      "submodule-release",
    );
    assert.match(release.message, /not a release tag; nearest tag 20260826\.7/);
  }),
);

test(
  "release: gh failing is reported as not checked, not as a failure",
  withFixture({}, (fixture) => {
    const release = run(fixture, ["--json"], { STUB_GH_FAIL: "1" }).check("submodule-release");
    assert.equal(release.status, "info");
    assert.match(release.message, /checked out 20260826\.4/);
    assert.match(release.message, /not checked \(gh unavailable or offline\)/);
  }),
);

test(
  "node 26 in this shell fails with nvm use as the fix",
  withFixture({}, (fixture) => {
    const node = run(fixture, ["--json"], { STUB_NODE: "26.1.0" }).check("node");
    assert.equal(node.status, "fail");
    assert.match(node.message, /node 26\.1\.0 is active, \.nvmrc wants 24\.19\.0/);
    assert.match(node.fix, /nvm use/);
  }),
);

test(
  "the .nvmrc version missing in nvm warns with nvm install, asking first",
  withFixture({}, (fixture) => {
    rmSync(join(fixture.nvm, "versions"), { recursive: true, force: true });
    const nvm = run(fixture, ["--json"]).check("nvm");
    assert.equal(nvm.status, "warn");
    assert.match(nvm.fix, /nvm install/);
    assert.match(nvm.fix, /ask the user first/);
  }),
);

test(
  "nvm missing warns",
  withFixture({}, (fixture) => {
    const empty = mkdtempSync(join(tmpdir(), "doctor-nvm-"));
    try {
      const nvm = run(fixture, ["--json"], { NVM_DIR: empty }).check("nvm");
      assert.equal(nvm.status, "warn");
      assert.match(nvm.message, /nvm not found/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  }),
);

test(
  "a yarn version other than packageManager fails",
  withFixture({}, (fixture) => {
    const yarn = run(fixture, ["--json"], { STUB_YARN: "1.22.22" }).check("yarn");
    assert.equal(yarn.status, "fail");
    assert.match(yarn.message, /yarn 1\.22\.22, package\.json wants 4\.18\.0/);
  }),
);

test(
  "yarn is not checked without the submodule",
  withFixture({ initSubmodule: false }, (fixture) => {
    const yarn = run(fixture, ["--json"]).check("yarn");
    assert.equal(yarn.status, "fail");
    assert.match(yarn.message, /submodule/);
  }),
);

test(
  "node_modules older than yarn.lock fails",
  withFixture({}, (fixture) => {
    makeHealthy(fixture);
    const later = new Date(Date.now() + 120_000);
    utimesSync(join(fixture.repo, "yarn.lock"), later, later);
    const deps = run(fixture, ["--json"]).check("deps");
    assert.equal(deps.status, "fail");
    assert.match(deps.message, /older than yarn\.lock/);
    assert.equal(deps.fix, "yarn install");
  }),
);

test(
  "a bare checkout: deps fail; hooks, agents, build and types-inputs warn",
  withFixture({}, (fixture) => {
    const result = run(fixture, ["--json"]);
    assert.equal(result.check("deps").status, "fail");
    for (const id of ["hooks", "agents", "build", "types-inputs"]) {
      assert.equal(result.check(id).status, "warn", id);
    }
    assert.match(result.check("agents").fix, /yarn agent:claude/);
    assert.match(result.check("build").fix, /script\/build/);
    assert.match(result.check("types-inputs").fix, /yarn gulp gen-icons-json build-translations/);
  }),
);

test(
  "local setup in place: toolchain checks are ok",
  withFixture({}, (fixture) => {
    makeHealthy(fixture);
    const result = run(fixture, ["--json"]);
    for (const id of ["nvm", "node", "yarn", "deps", "hooks", "agents", "build", "types-inputs"]) {
      assert.equal(result.check(id).status, "ok", id);
    }
  }),
);

const hasLsof = spawnSync("sh", ["-c", "command -v lsof"]).status === 0;

const listen = () =>
  new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => resolvePort(server));
  });

test(
  "ha: the Python loading this checkout is ok and the start command is printed",
  withFixture({}, (fixture) => {
    makeHealthy(fixture);
    const result = run(fixture, ["--ha-python", fixture.python, "--json"], { STUB_PY: "checkout" });
    assert.equal(result.check("ha").status, "ok");
    assert.match(result.json.start, /^PYTHONPATH=\S+ AIOHTTP_NOSENDFILE=1 \S+\/hass/);
    assert.match(result.json.start, /\/knx$/m);
    assert.notEqual(result.code, 2);
  }),
);

test(
  "ha: the Python loading site-packages fails",
  withFixture({}, (fixture) => {
    makeHealthy(fixture);
    const result = run(fixture, ["--ha-python", fixture.python, "--json"]);
    assert.equal(result.check("ha").status, "fail");
    assert.match(result.check("ha").message, /site-packages/);
    assert.equal(result.code, 1);
  }),
);

test(
  "ha: a path that is not executable fails",
  withFixture({}, (fixture) => {
    const ha = run(fixture, ["--ha-python", "/nonexistent/python", "--json"]).check("ha");
    assert.equal(ha.status, "fail");
    assert.match(ha.message, /not an executable/);
  }),
);

test(
  "port: a busy port warns with the holder and a free port",
  withFixture({}, async (fixture) => {
    const server = await listen();
    try {
      const { port } = server.address();
      const check = run(fixture, ["--port", String(port), "--json"]).check("port");
      assert.equal(check.status, "warn");
      assert.match(check.message, new RegExp(`port ${port} is in use`));
      assert.match(check.message, /free port: \d+/);
      if (hasLsof) assert.match(check.message, new RegExp(`PID ${process.pid}`));
      assert.match(check.fix, /never stop the process/);
    } finally {
      server.close();
    }
  }),
);

test(
  "port: a free port is ok, and configuration.yaml sets Home Assistant's port",
  withFixture({}, async (fixture) => {
    const server = await listen();
    const { port } = server.address();
    await new Promise((done) => server.close(done));
    const config = join(fixture.root, "ha-config");
    mkdirSync(config);
    writeFileSync(
      join(config, "configuration.yaml"),
      `default_config:\nhttp:\n  server_port: ${port}\n`,
    );
    const result = run(fixture, ["--ha-config", config, "--json"]);
    assert.equal(result.check("port").status, "ok");
    assert.match(result.check("port").message, new RegExp(`port ${port} is free`));
  }),
);

test(
  "a healthy checkout with a fork exits 0 without warnings or failures",
  withFixture(
    {
      remotes: {
        upstream: "https://github.com/XKNX/knx-frontend.git",
        fork: "https://github.com/someone/knx-frontend.git",
      },
    },
    (fixture) => {
      makeHealthy(fixture);
      const result = run(fixture, ["--json"], {
        STUB_GH_RELEASES: "20260826.4 false",
        STUB_GH_MANIFEST: `{"requirements": ["home-assistant-frontend==20260826.4"]}`,
      });
      assert.equal(result.code, 0);
      for (const item of result.json.checks)
        assert.ok(["ok", "info"].includes(item.status), item.id);
      assert.equal(result.json.start, null);
    },
  ),
);

test(
  "yarn is not judged while node is wrong, so the fix is nvm use and not corepack",
  withFixture({}, (fixture) => {
    const yarn = run(fixture, ["--json"], { STUB_NODE: "26.1.0", STUB_YARN: "" }).check("yarn");
    assert.equal(yarn.status, "fail");
    assert.match(yarn.message, /see node/);
    assert.doesNotMatch(yarn.fix ?? "", /corepack/);
  }),
);

test(
  "without --ha-config the start command asks for an own config directory",
  withFixture({}, (fixture) => {
    makeHealthy(fixture);
    const start = run(fixture, ["--ha-python", fixture.python, "--json"], { STUB_PY: "checkout" })
      .json.start;
    assert.match(start, /\/hass -c <your own config dir>/);
    const config = join(fixture.root, "ha-config");
    mkdirSync(config);
    const withConfig = run(
      fixture,
      ["--ha-python", fixture.python, "--ha-config", config, "--json"],
      {
        STUB_PY: "checkout",
      },
    ).json.start;
    assert.match(withConfig, new RegExp(`/hass -c ${config}`));
  }),
);

test(
  "an installed knx-frontend that does not match Core's pin adds --skip-pip-packages",
  withFixture({}, (fixture) => {
    makeHealthy(fixture);
    const env = {
      STUB_PY: "checkout",
      STUB_PY_INSTALLED: "2026.9.4.1",
      STUB_PY_PIN: "2026.8.28.1",
    };
    const result = run(fixture, ["--ha-python", fixture.python, "--json"], env);
    assert.equal(result.check("ha").status, "ok");
    assert.match(result.check("ha").message, /2026\.9\.4\.1 does not match .*2026\.8\.28\.1/);
    assert.match(result.json.start, /--skip-pip-packages knx-frontend/);
    const same = run(fixture, ["--ha-python", fixture.python, "--json"], { STUB_PY: "checkout" });
    assert.doesNotMatch(same.json.start, /--skip-pip-packages/);
  }),
);

test(
  "without .agents/skills only CLAUDE.md is needed for Claude",
  withFixture({}, (fixture) => {
    makeHealthy(fixture);
    rmSync(join(fixture.repo, ".claude"), { recursive: true, force: true });
    rmSync(join(fixture.repo, ".agents"), { recursive: true, force: true });
    assert.equal(run(fixture, ["--json"]).check("agents").status, "ok");
  }),
);
