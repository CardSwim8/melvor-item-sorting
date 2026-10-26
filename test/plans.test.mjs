import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlan, toCSV, resolvePlan, customVersion, captureBank } from "../src/plans.mjs";
import { validatePlan } from "../src/model.mjs";

const BUILTIN = JSON.parse(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));

const ok = (text, opts) => {
  const r = parsePlan(text, opts);
  assert.equal(r.errors, undefined, `unexpected errors: ${r.errors}`);
  return r;
};

// ------------------------------------------------- CSV

test("CSV with a header: tabs count from 1, names and comments are read", () => {
  const { plan, warnings } = ok(`# name: Mine
item_id,tab,tab_name,item_name
melvorD:Bronze_Dagger,1,Melee,Bronze Dagger
melvorD:Raw_Shrimp,3,Fish,"Shrimp, raw"
melvorD:Iron_Dagger,1,Melee,
`);
  assert.deepEqual(warnings, []);
  assert.equal(plan.name, "Mine");
  assert.equal(plan.extends, null);
  assert.deepEqual(plan.items, { "melvorD:Bronze_Dagger": 0, "melvorD:Raw_Shrimp": 2, "melvorD:Iron_Dagger": 0 });
  assert.deepEqual(plan.tabs, ["Melee", "Tab 2", "Fish"]);
});

test("CSV without a header, in any column order with a header, and with Windows line ends and a BOM", () => {
  assert.deepEqual(ok("melvorD:A,2\nmelvorD:B,1").plan.items, { "melvorD:A": 1, "melvorD:B": 0 });
  assert.deepEqual(ok("tab,item_id\n4,melvorD:A").plan.items, { "melvorD:A": 3 });
  assert.deepEqual(ok("﻿item_id,tab\r\nmelvorD:A,2\r\n").plan.items, { "melvorD:A": 1 });
});

test("CSV errors name the line", () => {
  const { errors } = parsePlan("item_id,tab\nmelvorD:A,0\nBronze Dagger,2\nmelvorD:C,two\nmelvorD:D,256");
  assert.equal(errors.length, 4);
  assert.match(errors[0], /^Line 2: tab "0" for melvorD:A must be a whole number from 1 to 255 \(CSV counts tabs from 1\)/);
  assert.match(errors[1], /^Line 3: "Bronze Dagger" isn't an item ID/);
  assert.match(errors[2], /^Line 4: tab "two"/);
  assert.match(errors[3], /^Line 5: tab "256"/);
});

test("CSV warnings: repeated items and clashing tab names", () => {
  const { plan, warnings } = ok("melvorD:A,1,One\nmelvorD:A,2,Two\nmelvorD:B,1,Uno");
  assert.equal(plan.items["melvorD:A"], 1);
  assert.match(warnings[0], /Line 2: melvorD:A is also on line 1; the later line wins/);
  assert.match(warnings[1], /Line 3: tab 1 is called both "One" and "Uno"/);
});

test("extends: builtin is read from a CSV comment or a JSON key", () => {
  assert.equal(ok("# extends: builtin\nmelvorD:A,1").plan.extends, "builtin");
  assert.equal(ok('{"extends":"builtin","items":{"melvorD:A":0}}').plan.extends, "builtin");
  assert.match(parsePlan('{"extends":"other","items":{"melvorD:A":0}}').errors[0], /"extends" must be "builtin"/);
});

test("unknown item IDs are kept but reported", () => {
  const { plan, warnings } = ok("melvorD:A,1\nmelvorD:Typo,1\nmodX:Thing,2", { isKnownItem: (id) => id === "melvorD:A" });
  assert.equal(Object.keys(plan.items).length, 3);
  assert.match(warnings[0], /^2 item IDs aren't items in this game, so they are skipped here: melvorD:Typo, modX:Thing\./);
});

test("empty plans and plans with no items are errors; long lists are capped", () => {
  assert.deepEqual(parsePlan("  ").errors, ["The plan is empty."]);
  assert.deepEqual(parsePlan("# name: x\nitem_id,tab\n").errors, ["The plan lists no items."]);
  const many = Array.from({ length: 15 }, (_, i) => `bad${i},1`).join("\n");
  const { errors } = parsePlan(many);
  assert.equal(errors.length, 11);
  assert.equal(errors[10], "…and 5 more.");
});

// ------------------------------------------------- JSON

test("JSON in the built-in format: tabs count from 0", () => {
  const { plan } = ok('{"name":"J","tabs":["A","B"],"items":{"melvorD:A":1,"melvorD:B":0}}');
  assert.deepEqual(plan, { source: "custom", name: "J", extends: null, tabs: ["A", "B"], items: { "melvorD:A": 1, "melvorD:B": 0 } });
  assert.equal(ok('{"items":{"melvorD:A":4}}').plan.tabs.length, 5);
});

test("JSON errors", () => {
  assert.match(parsePlan("{oops").errors[0], /^Not valid JSON/);
  assert.match(parsePlan('{"tabs":[]}').errors[0], /needs an "items" object/);
  assert.match(parsePlan('{"tabs":["A"],"items":{"melvorD:A":1}}').errors[0], /tab 1 is past the 1 names/);
  assert.match(parsePlan('{"items":{"melvorD:A":-1}}').errors[0], /JSON counts tabs from 0/);
  assert.match(parsePlan('{"items":{"Bronze":0}}').errors[0], /isn't an item ID/);
});

test("the shipped plan file imports as a custom plan unchanged", () => {
  const { plan } = ok(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));
  assert.deepEqual(plan.items, BUILTIN.items);
  assert.deepEqual(plan.tabs, BUILTIN.tabs);
});

// ------------------------------------------------- export round trip

test("the built-in plan exported as CSV imports back the same", () => {
  const names = { "melvorD:Bronze_Dagger": "Bronze Dagger" };
  const csv = toCSV({ ...BUILTIN, name: "Built-in" }, (id) => names[id] ?? "");
  const lines = csv.split("\n");
  assert.equal(lines[0], "# name: Built-in");
  assert.equal(lines[1], "item_id,tab,tab_name,item_name");
  assert.equal(lines[2], "melvorD:Bronze_Dagger,1,Weapons: Melee,Bronze Dagger");
  const { plan } = ok(csv);
  assert.deepEqual(plan.items, BUILTIN.items);
  assert.deepEqual(plan.tabs, BUILTIN.tabs);
  assert.equal(plan.name, "Built-in");
});

test("names with commas and quotes survive the round trip", () => {
  const csv = toCSV({ name: "Q", tabs: ['Odd, "tab"'], items: { "melvorD:A": 0 } }, () => 'Item, "x"');
  assert.match(csv, /melvorD:A,1,"Odd, ""tab""","Item, ""x"""/);
  assert.deepEqual(ok(csv).plan.tabs, ['Odd, "tab"']);
});

// ------------------------------------------------- resolving

test("a custom plan replaces the built-in one; its version tracks its content", () => {
  const { plan } = ok("melvorD:A,2");
  const r = resolvePlan(plan, BUILTIN);
  assert.equal(r.source, "custom");
  assert.deepEqual(r.items, { "melvorD:A": 1 });
  assert.deepEqual(validatePlan(r), []);
  assert.match(r.planVersion, /^c-[0-9a-f]{8}$/);
  assert.equal(customVersion(ok("melvorD:A,2").plan), r.planVersion);
  assert.notEqual(customVersion(ok("melvorD:A,3").plan), r.planVersion);
});

test("extends: builtin overrides some items and keeps the rest", () => {
  const { plan } = ok("# extends: builtin\nitem_id,tab,tab_name\nmelvorD:Bronze_Dagger,28,My extra tab");
  const r = resolvePlan(plan, BUILTIN);
  assert.equal(Object.keys(r.items).length, Object.keys(BUILTIN.items).length);
  assert.equal(r.items["melvorD:Bronze_Dagger"], 27);
  assert.equal(r.items["melvorD:Iron_Dagger"], BUILTIN.items["melvorD:Iron_Dagger"]);
  assert.equal(r.tabs.length, 28);
  assert.equal(r.tabs[0], "Weapons: Melee");
  assert.equal(r.tabs[27], "My extra tab");
  assert.deepEqual(validatePlan(r), []);
  assert.equal(r.planVersion, `${customVersion(plan)}+${BUILTIN.planVersion}`);
});

test("no custom plan: the built-in one", () => {
  const r = resolvePlan(null, BUILTIN);
  assert.equal(r.source, "builtin");
  assert.equal(r.planVersion, BUILTIN.planVersion);
});

// ------------------------------------------------- capturing the bank

test("captureBank: bank tab, then default tab, then the active plan wrapped", () => {
  const active = { tabs: ["A", "B", "C", "D"], items: { "x:InBank": 3, "x:HasDefault": 2, "x:Neither": 3 } };
  const plan = captureBank(
    active,
    [
      { id: "x:InBank", tab: 1 },
      { id: "other:Mod", tab: 2 }
    ],
    new Map([["x:HasDefault", 0]]),
    3
  );
  assert.deepEqual(plan.items, { "x:InBank": 1, "x:HasDefault": 0, "x:Neither": 0, "other:Mod": 2 });
  assert.deepEqual(plan.tabs, ["A / D", "B", "C"]);
  assert.equal(plan.extends, null);
});

test("the example plans in docs/examples import with no errors or warnings", () => {
  const known = (id) => id in BUILTIN.items;
  for (const f of ["gems-and-bones.csv", "small-bank.csv"]) {
    const { warnings } = ok(readFileSync(new URL(`../docs/examples/${f}`, import.meta.url), "utf8"), { isKnownItem: known });
    assert.deepEqual(warnings, [], f);
  }
});
