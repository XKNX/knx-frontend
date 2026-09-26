// Maps the triage features of one Dependabot PR to the next action. The first matching rule wins,
// so the order below is the policy: closing needs no green CI, repairs come before judging CI,
// and nothing merges unless the CI result is understood.

export function decide(f) {
  if (!f.fromDependabot) return { action: "skip", reason: "not opened by app/dependabot" };
  if (f.ecosystem === "other") {
    return { action: "stop", reason: `unexpected files: ${f.files.join(", ")}` };
  }
  if (f.state === "superseded") {
    return {
      action: "close-superseded",
      reason: `main already resolves ${f.package} to ${f.supersededBy}`,
    };
  }
  if (f.ecosystem === "npm" && f.kind === "direct") {
    const overrides = f.overrides.length > 0 ? `; overrides: ${f.overrides.join(", ")}` : "";
    return { action: "close-direct", reason: `direct dependency, owned by the submodule${overrides}` };
  }
  if (f.state === "conflict" || f.state === "behind") {
    const why = f.state === "conflict" ? "conflicts with main" : `${f.behindBy} commits behind main`;
    return f.foreignCommits.length > 0
      ? {
          action: "recreate",
          reason: `${why}; branch has non-Dependabot commits ${f.foreignCommits.join(", ")}`,
        }
      : { action: "rebase", reason: why };
  }
  if (f.state === "unknown") {
    return { action: "wait", reason: "GitHub has not computed mergeability yet" };
  }
  if (f.ci === "pending") return { action: "wait", reason: "checks pending" };
  if (f.ci === "dedupe") return { action: "dedupe-fix", reason: "only `yarn dedupe --check` fails" };
  if (f.ci === "red") return { action: "stop", reason: `failing: ${f.ciDetail}` };

  const types = f.ci === "types-baseline" ? " (Types: known main errors only)" : "";
  if (f.ecosystem === "actions") {
    const kind = f.major ? "major bump: read release notes first" : "workflow bump";
    return { action: "merge", reason: `${kind}${types}` };
  }
  if (f.reach === "dev") {
    return { action: "merge", reason: `tooling only via ${f.devRoots.join(", ")}${types}` };
  }
  if (f.reach === "runtime") {
    return { action: "local-gates", reason: `ships via ${f.runtimeRoots.join(", ")}${types}` };
  }
  return { action: "local-gates", reason: `reach unknown${types}` };
}
