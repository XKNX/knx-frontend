// Splits a unified diff as printed by `gh pr diff` into what the triage needs: the files a PR
// touches, the yarn.lock resolutions it replaces and adds, and the package.json keys it changes.
// A resolution that is removed and added again only moved and counts as neither.

export function parseDiff(text) {
  const files = [];
  const removed = [];
  const added = [];
  const packageKeys = new Set();
  let file = null;
  for (const line of text.split("\n")) {
    const header = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (header) {
      file = header[1];
      files.push(file);
      continue;
    }
    if (file === "yarn.lock") {
      const match = line.match(/^([-+]) {2}resolution: "(.+)"$/);
      if (match) (match[1] === "-" ? removed : added).push(match[2]);
    }
    if (file === "package.json") {
      const match = line.match(/^[-+]\s+"([^"]+)":\s*"/);
      if (match) packageKeys.add(match[1]);
    }
  }
  const both = new Set(removed.filter((resolution) => added.includes(resolution)));
  return {
    files,
    removed: removed.filter((resolution) => !both.has(resolution)),
    added: added.filter((resolution) => !both.has(resolution)),
    packageKeys: [...packageKeys],
  };
}
