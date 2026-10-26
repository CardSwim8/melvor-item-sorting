// The adapter against a fake game whose Bank follows v1.3.1's bank2.js.
/* global game */

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createAdapter } from "../src/adapter.mjs";
import { fakeGame } from "./fakes.mjs";

const IDS = ["a:One", "a:Two", "a:Three", "a:Four", "a:Five"];
const GLOBALS = ["game", "bankTabMenu"];
const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

let A;
let menu;

beforeEach(() => {
  set("game", fakeGame(IDS));
  menu = [];
  set("bankTabMenu", { moveIconsToNewTab: (moved, tab) => menu.push([moved.length, tab]) });
  for (const id of IDS) game.bank.addItemByID(id);
  A = createAdapter();
});

after(() => {
  for (const k of GLOBALS) {
    if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
    else delete globalThis[k];
  }
});

const bankItem = (id) => game.bank.items.get(game.items.getObjectByID(id));

test("reads tab count, items, and the bank", () => {
  assert.equal(A.tabCount(), 12);
  assert.equal(A.findItem("a:Two").id, "a:Two");
  assert.equal(A.findItem("a:Nope"), undefined);
  assert.equal(A.bankItems().length, 5);
});

test("setDefaultTabs fills defaultItemTabs, so new items land there", () => {
  const six = { id: "a:Six" };
  A.setDefaultTabs(new Map([[six, 7]]));
  assert.equal(game.bank.getItemDefaultTab(six), 7);
});

test("moveItemsToTab uses the game's move path and leaves move mode", () => {
  const list = [bankItem("a:Two"), bankItem("a:Four")];
  A.moveItemsToTab(list, 3);
  assert.deepEqual(
    game.bank.itemsByTab[3].map((b) => b.item.id),
    ["a:Two", "a:Four"]
  );
  assert.deepEqual(
    game.bank.itemsByTab[0].map((b) => b.item.id),
    ["a:One", "a:Three", "a:Five"]
  );
  assert.equal(game.bank.getItemDefaultTab(bankItem("a:Two").item), 3);
  assert.equal(game.bank.itemSelectionMode, 0);
  assert.deepEqual(game.bank.ui.at(-2), ["moveIconsToNewTab", 2, 3]);
  game.bank.check();
});

test("a player's half-made selection is cleared, not moved", () => {
  game.bank.setItemSelectionMode(1);
  game.bank.selectedItems.add(bankItem("a:One"));
  A.moveItemsToTab([bankItem("a:Five")], 2);
  assert.deepEqual(
    game.bank.itemsByTab[2].map((b) => b.item.id),
    ["a:Five"]
  );
  assert.equal(bankItem("a:One").tab, 0);
  game.bank.check();
});

test("if the game path throws, the items are moved directly with a UI update", () => {
  game.bank.moveSelectedItemsToTab = () => {
    throw new Error("no bank UI");
  };
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a);
  try {
    A.moveItemsToTab([bankItem("a:Three"), bankItem("a:One")], 5);
  } finally {
    console.error = orig;
  }
  assert.equal(errors.length, 1);
  assert.deepEqual(
    game.bank.itemsByTab[5].map((b) => b.item.id),
    ["a:One", "a:Three"]
  );
  assert.deepEqual(menu, [[2, 5]]);
  assert.equal(game.bank.getItemDefaultTab(bankItem("a:One").item), 5);
  assert.equal(game.bank.itemSelectionMode, 0);
  assert.equal(game.bank.renderQueue.bankValue, true);
  game.bank.check();
});

test("moving to a tab the player doesn't own does nothing", () => {
  A.moveItemsToTab([bankItem("a:One")], 12);
  assert.equal(bankItem("a:One").tab, 0);
});

test("sortOrder and sortBank use the bank setting and the game's sort", () => {
  game.settings.bankSortOrder = 5;
  assert.equal(A.sortOrder(), 5);
  A.sortBank();
  assert.equal(game.bank.sorted, 1);
});

test("the first-run question resolves to later when no modal library is present", async () => {
  assert.equal(await A.firstRun("?"), "later");
});
