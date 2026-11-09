// "What changed in 3.0": every finding the page names is shown once, with its before and its after (or why it was
// accepted), and every picture it names has its file and size. Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { FINDINGS, GROUPS, SCREENS, imageName, pictures } from "../packages/site/src/whats-new.mjs";
import sizes from "../packages/site/src/whats-new-images.mjs";

const shown = [...SCREENS, ...GROUPS].flatMap((part) => part.findings);

test("every finding is shown once, with its before and its after or why it was accepted", () => {
  assert.deepEqual([...new Set(shown)].sort(), Object.keys(FINDINGS).sort());
  assert.equal(new Set(shown).size, shown.length, "a finding is in two screens or groups");
  for (const [id, entry] of Object.entries(FINDINGS)) {
    assert.ok(entry.was?.length > 10, `${id} has no before`);
    assert.ok(entry.now?.length > 10 || entry.accepted?.length > 10, `${id} has no after and no reason`);
  }
});

test("every picture the page names has its file and size", () => {
  for (const { from } of pictures()) {
    const name = imageName(from);
    assert.ok(sizes[name], `${name} has no size`);
    assert.ok(existsSync(`packages/site/public/whats-new/${name}`), `${name} is missing`);
  }
  for (const screen of SCREENS) {
    assert.ok(screen.afterAlt.length > 20, `${screen.id} has no alt text`);
    if (screen.before) assert.ok(screen.beforeAlt.length > 20, `${screen.id}'s before has no alt text`);
  }
});
