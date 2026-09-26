// Interprets the checks of a PR the way this repository needs: `Types` is red on main, so a red
// Types check only counts when it adds errors; `Lint` also runs `yarn dedupe --check`, which
// Dependabot does not satisfy on its own and which can be repaired on the branch.

export const DEDUPE_STEP = "Check for duplicate dependencies";

const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const startOf = (check) => check.startedAt ?? check.createdAt ?? "";
const jobIdFromUrl = (url) => url?.match(/\/job\/(\d+)/)?.[1] ?? null;

export function summarizeChecks(rollup) {
  const latest = new Map();
  for (const check of rollup) {
    const name = check.name ?? check.context;
    const previous = latest.get(name);
    if (!previous || startOf(previous) <= startOf(check)) latest.set(name, check);
  }
  let pending = latest.size === 0;
  const failing = [];
  for (const [name, check] of latest) {
    if (check.__typename === "StatusContext") {
      if (check.state === "PENDING" || check.state === "EXPECTED") pending = true;
      else if (check.state !== "SUCCESS") failing.push({ name, jobId: null });
    } else if (check.status !== "COMPLETED") {
      pending = true;
    } else if (!PASSED.has(check.conclusion)) {
      failing.push({ name, jobId: jobIdFromUrl(check.detailsUrl) });
    }
  }
  return { pending, failing };
}

export function tsErrors(log) {
  const errors = new Set();
  for (const raw of log.split("\n")) {
    const line = raw
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/^\S+Z\s/, "")
      .replace(/^##\[error\]/, "")
      .trim();
    if (/error TS\d+:/.test(line)) errors.add(line);
  }
  return errors;
}

export function ciState({
  pending,
  failing,
  lintFailedSteps = [],
  typesErrors = null,
  baselineErrors = null,
}) {
  if (pending) return { ci: "pending", detail: "" };
  if (failing.length === 0) return { ci: "green", detail: "" };
  const kindOf = ({ name }) => {
    if (name === "Types" && typesErrors && baselineErrors) {
      const known = typesErrors.size > 0 && [...typesErrors].every((e) => baselineErrors.has(e));
      return known ? "types-baseline" : "red";
    }
    if (
      name === "Lint" &&
      lintFailedSteps.length > 0 &&
      lintFailedSteps.every((step) => step === DEDUPE_STEP)
    ) {
      return "dedupe";
    }
    return "red";
  };
  const kinds = failing.map(kindOf);
  const red = failing.filter((_, i) => kinds[i] === "red").map((check) => check.name);
  if (red.length > 0) return { ci: "red", detail: red.join(", ") };
  if (kinds.includes("dedupe")) return { ci: "dedupe", detail: "" };
  return { ci: "types-baseline", detail: "" };
}
