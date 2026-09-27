import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanup, makeFixture, run, runIn } from "./helpers.mjs";

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
