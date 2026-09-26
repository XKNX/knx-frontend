// The shape every rule returns. `key` is optional and lets the CLI tell a finding on the head from
// the same finding on the merge-base, so only what the change introduced is reported.

export const SEVERITIES = ["blocker", "should-fix", "question", "nit"];

export const finding = ({ rule, severity, file, line, message, evidence = [], key }) => ({
  rule,
  severity,
  file,
  line,
  message,
  evidence,
  ...(key === undefined ? {} : { key }),
});

export const bySeverity = (a, b) =>
  SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
  (a.file ?? "").localeCompare(b.file ?? "") ||
  (a.line ?? 0) - (b.line ?? 0);
