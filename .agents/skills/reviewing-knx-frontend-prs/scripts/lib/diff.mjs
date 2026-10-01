// Parses `git diff -U0 --no-renames` output into the changed files with their added lines and the
// line numbers those lines have in the new version. Rules only look at added lines, so a finding
// always points at a line the change introduced.

export function parseDiff(text) {
  const files = [];
  let file = null;
  let inHunk = false;
  let line = 0;
  for (const raw of text.split("\n")) {
    const header = raw.match(/^diff --git a\/.+ b\/(.+)$/);
    if (header) {
      file = { path: header[1], status: "modified", gitlink: false, added: [] };
      files.push(file);
      inHunk = false;
      continue;
    }
    if (!file) continue;
    if (raw.startsWith("@@")) {
      const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      line = hunk ? Number(hunk[1]) : 0;
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (raw.startsWith("new file mode")) file.status = "added";
      if (raw.startsWith("deleted file mode")) file.status = "deleted";
      continue;
    }
    if (/^[-+]Subproject commit [0-9a-f]+/.test(raw)) {
      file.gitlink = true;
      continue;
    }
    if (raw.startsWith("+")) {
      file.added.push({ line, text: raw.slice(1) });
      line += 1;
    }
  }
  return files;
}

export function addedBlocks(file) {
  const blocks = [];
  for (const { line, text } of file.added) {
    const last = blocks.at(-1);
    if (last && last.start + last.lines.length === line) last.lines.push(text);
    else blocks.push({ start: line, lines: [text] });
  }
  return blocks;
}

// Runs a global regex over each block of consecutive added lines, so calls and imports that span
// several lines are found, and reports the line on which each match starts.
export function matchAdded(file, regex) {
  const results = [];
  for (const block of addedBlocks(file)) {
    const text = block.lines.join("\n");
    for (const match of text.matchAll(regex)) {
      const line = block.start + text.slice(0, match.index).split("\n").length - 1;
      results.push({ match, line });
    }
  }
  return results;
}
