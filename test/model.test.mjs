import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as model from "../src/model.mjs";

const PLAN = JSON.parse(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));

// ------------------------------------------------- the shipped plan

test("the shipped plan is valid: 27 tabs, 3,710 items", () => {
  assert.deepEqual(model.validatePlan(PLAN), []);
  assert.equal(PLAN.tabs.length, 27);
  assert.equal(Object.keys(PLAN.items).length, 3710);
});

test("validatePlan reports bad plans", () => {
  assert.deepEqual(model.validatePlan(null), ["not an object"]);
  assert.match(model.validatePlan({ tabs: ["A"], items: {} }).join(), /planVersion/);
  assert.match(model.validatePlan({ planVersion: "x", tabs: [], items: {} }).join(), /tabs/);
  assert.match(model.validatePlan({ planVersion: "x", tabs: ["A"], items: { "a:B": 1 } }).join(), /a:B: tab 1/);
  assert.match(model.validatePlan({ planVersion: "x", tabs: ["A"], items: { "a:B": 0.5 } }).join(), /a:B/);
});

// ------------------------------------------------- wrapping

test("targetTab wraps planned tabs past the last owned tab", () => {
  assert.equal(model.targetTab(5, 27), 5);
  assert.equal(model.targetTab(26, 27), 26);
  assert.equal(model.targetTab(12, 12), 0); // Fishing -> Weapons: Melee
  assert.equal(model.targetTab(13, 12), 1); // Cooking -> Armour: Melee
  assert.equal(model.targetTab(23, 12), 11); // Chests -> Woodcutting & Firemaking
  assert.equal(model.targetTab(26, 12), 2); // Events -> tab 2
  assert.equal(model.targetTab(26, 22), 4);
});

// ------------------------------------------------- computeLayout

const it = (id) => ({ id });
const items = new Map(["a:Sword", "a:Fish", "a:Chest", "a:Herb", "b:Unplanned"].map((id) => [id, it(id)]));
const find = (id) => items.get(id);
const planned = new Map([
  ["a:Sword", 0],
  ["a:Fish", 12],
  ["a:Chest", 23],
  ["a:Herb", 18],
  ["a:Absent", 4]
]);
const bi = (id, tab) => ({ item: items.get(id), tab });

test("computeLayout sets a home tab for every planned item the game knows", () => {
  const { defaults, missing } = model.computeLayout(planned, find, [], 12);
  assert.equal(defaults.size, 4);
  assert.equal(defaults.get(items.get("a:Fish")), 0);
  assert.equal(defaults.get(items.get("a:Chest")), 11);
  assert.equal(defaults.get(items.get("a:Herb")), 6);
  assert.equal(missing, 1);
});

test("computeLayout moves only misplaced planned items, grouped by target tab in order", () => {
  const sword = bi("a:Sword", 0);
  const fish = bi("a:Fish", 3);
  const chest = bi("a:Chest", 0);
  const herb = bi("a:Herb", 18);
  const other = bi("b:Unplanned", 5);
  const { moves, moveCount } = model.computeLayout(planned, find, [sword, fish, chest, herb, other], 27);
  assert.equal(moveCount, 2);
  assert.deepEqual([...moves.keys()], [12, 23]);
  assert.deepEqual(moves.get(12), [fish]);
  assert.deepEqual(moves.get(23), [chest]);
});

test("computeLayout with 12 tabs moves wrapped items onto the first tabs", () => {
  const fish = bi("a:Fish", 12 % 12);
  const herb = bi("a:Herb", 0);
  const { moves, moveCount } = model.computeLayout(planned, find, [fish, herb], 12);
  assert.equal(moveCount, 1);
  assert.deepEqual([...moves.keys()], [6]);
});

// ------------------------------------------------- decide

const builtinV1 = { source: "builtin", name: "Built-in", planVersion: "v1", tabs: ["A", "B"], items: { "a:X": 0 } };
const base = { enabled: true, autoReapply: true, declined: false, active: builtinV1, tabCount: 12 };
const applied = { planVersion: "v1", source: "builtin", tabCount: 12, appliedAt: 0 };

test("decide: first run asks, unless declined", () => {
  assert.equal(model.decide({ ...base, applied: undefined }), "confirm");
  assert.equal(model.decide({ ...base, applied: null, declined: true }), null);
});

test("decide: re-applies when the plan or tab count changed, if auto re-apply is on", () => {
  assert.equal(model.decide({ ...base, applied: { ...applied, planVersion: "v0" } }), "apply");
  assert.equal(model.decide({ ...base, applied: { ...applied, tabCount: 11 } }), "apply");
  assert.equal(model.decide({ ...base, autoReapply: false, applied: { ...applied, tabCount: 11 } }), null);
});

test("decide: a character laid out with its own plan that can't be read now is left alone", () => {
  const fromCustom = { ...applied, planVersion: "c-1234abcd", source: "custom" };
  assert.equal(model.decide({ ...base, applied: fromCustom }), "custom-missing");
  // A changed plan of its own is a plan change.
  const otherCustom = { ...builtinV1, source: "custom", planVersion: "c-99999999" };
  assert.equal(model.decide({ ...base, active: otherCustom, applied: fromCustom }), "apply");
  // Switching from the built-in plan to a custom one is a plan change too.
  assert.equal(model.decide({ ...base, active: otherCustom, applied }), "apply");
});

test("decide: nothing when up to date, or when disabled", () => {
  assert.equal(model.decide({ ...base, applied }), null);
  assert.equal(model.decide({ ...base, enabled: false, applied: undefined }), null);
  assert.equal(model.decide({ ...base, enabled: false, applied: { ...applied, tabCount: 11 } }), null);
});

// ------------------------------------------------- sorting and messages

test("sortPlan sorts only on the Default order, and explains otherwise", () => {
  assert.deepEqual(model.sortPlan(true, model.SORT_DEFAULT), { sort: true, note: null });
  assert.deepEqual(model.sortPlan(false, model.SORT_CUSTOM), { sort: false, note: null });
  assert.equal(model.sortPlan(true, model.SORT_CUSTOM).sort, false);
  assert.match(model.sortPlan(true, model.SORT_CUSTOM).note, /Custom sort/);
  assert.match(model.sortPlan(true, 2).note, /isn't Default/);
});

test("messages", () => {
  assert.equal(model.appliedMessage(412, 27), "Bank Layout: moved 412 items (27 tabs).");
  assert.equal(model.appliedMessage(1, 12), "Bank Layout: moved 1 item (12 tabs).");
  assert.equal(model.confirmMessage(1234, 3710), "Bank Layout will move 1,234 items into the planned tabs and set default tabs for 3,710 items. Continue?");
  assert.match(model.confirmMessage(1, 2, 'your plan "Mine"'), /into the planned tabs \(your plan "Mine"\) and/);
});

test("statusText", () => {
  assert.equal(model.statusText(undefined, builtinV1, 12), "Built-in plan (v1): 1 item in 2 tabs. You own 12 tabs. Not applied to this character yet.");
  const ok = model.statusText(applied, builtinV1, 12);
  assert.match(ok, /Last applied .* with 12 tabs\.$/);
  assert.doesNotMatch(ok, /Out of date/);
  assert.match(model.statusText(applied, { ...builtinV1, planVersion: "v2" }, 12), /from the built-in plan \(v1\) with 12 tabs\. Out of date\.$/);
  assert.match(model.statusText(applied, builtinV1, 13), /Out of date\.$/);
  const custom = { ...builtinV1, source: "custom", name: "Mine", planVersion: "c-1" };
  assert.match(model.statusText(applied, custom, 12), /^This character's plan "Mine" \(c-1\): .* from the built-in plan \(v1\)/);
});
