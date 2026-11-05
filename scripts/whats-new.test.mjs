// W5.5's AC (PLAN-design.md): every finding of severity 1 and 2 of docs/design/audit.md appears on "What changed in
// 3.0" with its before and after, or with the reason it was accepted. The audit decides: each finding's severity, and
// its state from its last status line, dated or not. Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BASELINE, FINDINGS, GROUPS, SCREENS, imageName, pictures } from "../packages/site/src/whats-new.mjs";
import sizes from "../packages/site/src/whats-new-images.mjs";

/**
 * The audit's findings: `**U-NNN. Title.** Severity N.` opens one, and a line that starts `**Status:**` or with a
 * date (bold or not) is a status line. A finding ends at the next one or at a heading.
 */
export function auditFindings(text) {
  const findings = [];
  let current = null;
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    const head = /^\*\*(U-\d{3})\.\s/.exec(line);
    if (head) {
      const severity = /Severity (\d)/.exec(lines.slice(i, i + 4).join(" "))?.[1];
      current = { id: head[1], severity: Number(severity), last: "" };
      findings.push(current);
    } else if (/^#{1,6} /.test(line)) current = null;
    else if (current && /^(\*\*)?(Status:|\d{4}-\d{2}-\d{2})/.test(line)) current.last = line;
  }
  return findings;
}

/**
 * A status line's state: accepted, fixed (a fix, or a report that no longer reproduces) or open. U-132's last line
 * names the PR that finished it without the word (D4.5's "Add {name} to" in #498).
 */
export function stateOf(last) {
  if (/\bAccepted\b/.test(last)) return "accepted";
  if (/\b[Ff]ixed\b|Not reproducible|Run again fixed|"Add \{name\} to"/.test(last)) return "fixed";
  return "open";
}

const audit = auditFindings(readFileSync("docs/design/audit.md", "utf8"));
const shown = [...SCREENS, ...GROUPS].flatMap((part) => part.findings);

test("the parser reads a finding's severity and its last status line, dated or not", () => {
  const sample = [
    "**U-900. A thing.** Severity 2. H1.",
    "Body.",
    "**Status:** Open, D4-f.",
    "2026-10-23 (hig-review): still open.",
    "**2026-11-02:** Fixed in #1.",
    "",
    "### Next",
    "**2026-11-03:** Accepted, but not of U-900.",
    "**U-901. Another\nline.**",
  ].join("\n");
  const [a] = auditFindings(sample);
  assert.equal(a.severity, 2);
  assert.equal(stateOf(a.last), "fixed");
  assert.equal(stateOf("**Status:** Open, D5-c."), "open");
  assert.equal(stateOf("**2026-11-04:** Accepted in D5-c, with U-172: a phone has no flows of its own."), "accepted");
});

test("the audit has findings of severity 1 and 2 to show", () => {
  assert.ok(audit.filter((f) => f.severity <= 2).length > 50);
  assert.deepEqual(
    audit.filter((f) => !f.severity).map((f) => f.id),
    [],
    "a finding whose severity the parser cannot read",
  );
});

for (const finding of audit.filter((f) => f.severity === 1 || f.severity === 2)) {
  test(`${finding.id} (severity ${finding.severity}) is on the page with its before and after, or why it was accepted`, () => {
    const state = stateOf(finding.last);
    assert.notEqual(state, "open", `${finding.id} is open in the audit: "${finding.last}"`);
    const entry = FINDINGS[finding.id];
    assert.ok(entry, `${finding.id} is not in packages/site/src/whats-new.mjs`);
    assert.ok(entry.was?.length > 10, `${finding.id} has no before`);
    if (state === "accepted") assert.ok(entry.accepted?.length > 10, `${finding.id} was accepted: say why`);
    else assert.ok(entry.now?.length > 10, `${finding.id} has no after`);
    assert.equal(shown.filter((id) => id === finding.id).length, 1, `${finding.id} is in no screen or group, or two`);
  });
}

test("every finding the page names is one of the audit's, and is shown once", () => {
  const ids = new Set(audit.map((f) => f.id));
  for (const id of [...Object.keys(FINDINGS), ...shown]) assert.ok(ids.has(id), `${id} is not in the audit`);
  assert.deepEqual([...new Set(shown)].sort(), Object.keys(FINDINGS).sort());
});

test("every picture is made from a capture of the baseline, and has its file and size", () => {
  for (const { from } of pictures()) {
    assert.ok(existsSync(BASELINE + from), `${from} is not in ${BASELINE}`);
    const name = imageName(from);
    assert.ok(sizes[name], `${name} has no size: run node scripts/whats-new-images.mjs`);
    assert.ok(existsSync(`packages/site/public/whats-new/${name}`), `${name} is missing`);
  }
  for (const screen of SCREENS) {
    assert.ok(screen.afterAlt.length > 20, `${screen.id} has no alt text`);
    if (screen.before) assert.ok(screen.beforeAlt.length > 20, `${screen.id}'s before has no alt text`);
  }
});
