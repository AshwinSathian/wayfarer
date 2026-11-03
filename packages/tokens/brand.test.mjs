// The brand files (D2.4): the maskable icon keeps its glyph in the safe zone, and the favicon's ICO is
// what browsers read. That the SVGs are the tokens' colours is `npm run check:tokens`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { brandSvgs, markColours } from "./brand.mjs";
import { ico } from "./brand-png.mjs";
import { hexColours } from "./tokens.mjs";

test("the maskable icon's glyph is inside the safe zone, a circle of 40% of the size about the centre", () => {
  const svg = brandSvgs()["maskable.svg"];
  assert.match(svg, /viewBox="0 0 26 26"><rect width="26" height="26" fill="#[0-9A-F]{6}"\/>/, "the tile fills it");
  const path = /<path d="([^"]+)"[^>]*stroke-width="([\d.]+)"/.exec(svg);
  // Every point and control point of the path (a curve stays inside its control points), plus half the stroke.
  const points = [];
  for (let i = 0, x = 0, y = 0, commands = path[1].match(/[A-Z][^A-Z]*/g); i < commands.length; i++) {
    const [command, ...args] = [commands[i][0], ...(commands[i].slice(1).match(/-?[\d.]+/g) ?? []).map(Number)];
    if (command === "H") [x] = args;
    else if (command === "V") [y] = args;
    else for (let j = 0; j < args.length; j += 2) [x, y] = [args[j], args[j + 1]];
    if (command === "C") for (let j = 0; j < 4; j += 2) points.push([args[j], args[j + 1], Number(path[2]) / 2]);
    points.push([x, y, Number(path[2]) / 2]);
  }
  const dot = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(svg).slice(1).map(Number);
  points.push(dot);
  const reach = Math.max(...points.map(([x, y, r]) => Math.hypot(x - 13, y - 13) + r));
  assert.ok(reach <= 26 * 0.4, `the glyph reaches ${reach.toFixed(2)} of the 10.4 units the zone allows`);
});

test("the mark is Send's colours: the ink, and the colour on it, in each theme", () => {
  for (const name of ["light", "dark"]) {
    const colours = hexColours(name);
    assert.deepEqual(markColours(name), { tile: colours.ink, glyph: colours["on-ink"] });
  }
});

test("an ICO names each PNG's size and where it starts", () => {
  const pngs = [16, 32, 48].map((size) => ({ size, data: Buffer.alloc(size, size) }));
  const file = ico(pngs);
  assert.equal(file.readUInt16LE(2), 1, "an icon");
  assert.equal(file.readUInt16LE(4), 3);
  let offset = 6 + 16 * 3;
  for (const [i, { size, data }] of pngs.entries()) {
    const entry = 6 + 16 * i;
    assert.equal(file.readUInt8(entry), size);
    assert.equal(file.readUInt32LE(entry + 8), data.length);
    assert.equal(file.readUInt32LE(entry + 12), offset);
    assert.deepEqual(file.subarray(offset, offset + data.length), data);
    offset += data.length;
  }
});

test("the committed favicon.ico holds the mark at 16, 32 and 48 px", () => {
  const file = readFileSync(new URL("brand/app/favicon.ico", import.meta.url));
  assert.deepEqual(
    [0, 1, 2].map((i) => file.readUInt8(6 + 16 * i)),
    [16, 32, 48],
  );
});
