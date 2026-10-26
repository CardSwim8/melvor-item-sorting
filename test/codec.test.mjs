import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pack, unpack, checkIndex, prefixFingerprint, storedSize } from "../src/codec.mjs";
import { missingFromIndex } from "../scripts/item-index.mjs";

const PLAN = JSON.parse(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));
const INDEX = JSON.parse(readFileSync(new URL("../data/item-index.json", import.meta.url), "utf8"));
const IDS = INDEX.ids;
const custom = (items, extra = {}) => ({ source: "custom", name: "Mine", extends: null, tabs: ["A", "B", "C"], items, ...extra });

test("the shipped item list is intact and covers every built-in plan item", () => {
  assert.deepEqual(checkIndex(INDEX), []);
  assert.deepEqual(missingFromIndex(INDEX, PLAN), []);
  assert.ok(INDEX.releases.length >= 1);
});

test("the built-in plan packs to a few hundred bytes and back exactly", () => {
  const plan = custom(PLAN.items, { tabs: PLAN.tabs });
  const packed = pack(plan, IDS);
  assert.ok(storedSize("plan", packed) < 1000, `packed size ${storedSize("plan", packed)}`);
  assert.deepEqual(unpack(JSON.parse(JSON.stringify(packed)), IDS), plan);
});

test("a worst-case plan (every item a random tab) still fits in 8kb", () => {
  let seed = 7;
  const items = {};
  for (const id of IDS) items[id] = (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) % 60;
  const size = storedSize("plan", pack(custom(items, { tabs: Array.from({ length: 60 }, (_, i) => `Tab ${i + 1}`) }), IDS));
  assert.ok(size < 6000, `packed size ${size}`);
});

test("items not in the list are kept with their IDs; unplanned items stay out; extends survives", () => {
  const plan = custom({ [IDS[0]]: 2, [IDS[5]]: 0, "otherMod:Thing": 1 }, { extends: "builtin" });
  const packed = pack(plan, IDS);
  assert.deepEqual(packed.x, { "otherMod:Thing": 1 });
  assert.equal(packed.e, "builtin");
  assert.deepEqual(unpack(packed, IDS), plan);
});

test("a plan packed with an older, shorter list unpacks with a newer one", () => {
  const older = IDS.slice(0, 100);
  const plan = custom({ [IDS[3]]: 1, [IDS[150]]: 2 });
  const packed = pack(plan, older);
  assert.equal(packed.n, 100);
  assert.deepEqual(packed.x, { [IDS[150]]: 2 });
  assert.deepEqual(unpack(packed, IDS), plan);
});

test("unreadable plans throw a reason a player can act on", () => {
  const packed = pack(custom({ [IDS[0]]: 1 }), IDS);
  assert.throws(() => unpack(packed, IDS.slice(0, 10)), /saved by a newer version of Bank Layout/);
  assert.throws(() => unpack({ ...packed, f: 9 }, IDS), /format this version of Bank Layout doesn't know/);
  assert.throws(() => unpack({ ...packed, n: IDS.length - 1 }, IDS), /damaged/);
  assert.throws(() => unpack(null, IDS), /format/);
});

test("checkIndex catches reordering, removal and duplicates in released IDs", () => {
  const ids = ["a:1", "a:2", "a:3"];
  const index = { ids, releases: [{ count: 3, fingerprint: prefixFingerprint(ids, 3) }] };
  assert.deepEqual(checkIndex(index), []);
  assert.deepEqual(checkIndex({ ...index, ids: [...ids, "a:4"] }), []);
  assert.match(checkIndex({ ...index, ids: ["a:2", "a:1", "a:3"] })[0], /changed since they were released/);
  assert.match(checkIndex({ ...index, ids: ["a:1", "a:3"] })[0], /longer than the list/);
  assert.match(checkIndex({ ...index, ids: [...ids, "a:1"] })[0], /a:1 is listed twice/);
});
