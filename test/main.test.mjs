// Runs the whole mod setup against the shipped plan, a fake game whose Bank
// follows v1.3.1, a fake mod context, and a small DOM (linkedom) for the
// status line. Each boot() is one game load of the same character; a
// character's mod storage is part of its save. localStorage is the device,
// shared by every character on it.
/* global game */

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { setup } from "../src/main.mjs";
import { FakeBank, fakeGame } from "./fakes.mjs";
import { pack, unpack } from "../src/codec.mjs";

const PLAN = JSON.parse(readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"));
const INDEX = JSON.parse(readFileSync(new URL("../data/item-index.json", import.meta.url), "utf8"));
const IDS = Object.keys(PLAN.items);
const planned = (id) => PLAN.items[id];
// A few items from every planned tab, all starting in tab 0.
const SAMPLE = PLAN.tabs.flatMap((_, x) => IDS.filter((id) => planned(id) === x).slice(0, 4));

const GLOBALS = ["game", "document", "assets", "imageNotify", "SwalLocale", "Bank", "bankTabMenu", "localStorage", "downloadTextFile"];
const saved = {};
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
const originalAddTabs = FakeBank.prototype.addTabs;

let toasts;
let answers;
let validation;
let downloads;
const device = new Map();

before(() => {
  for (const k of GLOBALS) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  set("document", parseHTML("<html><body></body></html>").document);
  set("assets", { getURI: (p) => `https://cdn/${p}` });
  set("imageNotify", (media, message, theme) => toasts.push([theme, message]));
  set("SwalLocale", {
    fire: (opts) => Promise.resolve(answers.shift()?.(opts) ?? { isDismissed: true }),
    showValidationMessage: (html) => validation.push(html)
  });
  set("localStorage", {
    getItem: (k) => (device.has(k) ? device.get(k) : null),
    setItem: (k, v) => device.set(k, String(v)),
    removeItem: (k) => device.delete(k)
  });
  set("downloadTextFile", (name, text, type) => downloads.push({ name, text, type }));
  set("Bank", FakeBank);
  set("bankTabMenu", { moveIconsToNewTab() {} });
});

after(() => {
  for (const k of GLOBALS) {
    if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
    else delete globalThis[k];
  }
});

afterEach(() => {
  FakeBank.prototype.addTabs = originalAddTabs;
  device.clear();
});

// One character: its game state, mod storage and settings outlive a reload.
function character({ tabCount = 12, ids = SAMPLE } = {}) {
  set("game", fakeGame(IDS, tabCount));
  for (const id of ids) game.bank.addItemByID(id);
  return { game, storage: new Map(), settings: new Map() };
}

function fakeCtx(ch) {
  const hooks = {};
  const sections = new Map();
  const ctx = {
    hooks,
    sections,
    loadData: async (path) => {
      if (path === "data/plan.json") return structuredClone(PLAN);
      if (path === "data/item-index.json") return { ids: INDEX.ids.slice() };
      throw new Error(`no such file ${path}`);
    },
    characterStorage: {
      getItem: (k) => (ch.storage.has(k) ? JSON.parse(ch.storage.get(k)) : undefined),
      setItem: (k, v) => ch.storage.set(k, JSON.stringify(v)),
      removeItem: (k) => ch.storage.delete(k)
    },
    settings: {
      section(name) {
        if (!sections.has(name)) {
          const items = [];
          sections.set(name, {
            items,
            add: (x) => items.push(...[].concat(x)),
            get: (n) => ch.settings.get(n),
            set: (n, v) => {
              ch.settings.set(n, v);
              items.find((s) => s.name === n).onChange?.(v);
            }
          });
        }
        return sections.get(name);
      }
    },
    // Wraps the method like the game's patch API does.
    patch(C, method) {
      return {
        after(fn) {
          const orig = C.prototype[method];
          C.prototype[method] = function (...args) {
            const ret = orig.apply(this, args);
            const r = fn.call(this, ret, ...args);
            return r === undefined ? ret : r;
          };
        }
      };
    },
    api: (endpoints) => (ctx.endpoints = endpoints),
    onCharacterLoaded: (fn) => (hooks.characterLoaded = fn),
    onInterfaceReady: (fn) => (hooks.interfaceReady = fn)
  };
  return ctx;
}

const tick = () => new Promise((r) => setImmediate(r));

// Loads the game: setup, character loaded, interface ready.
async function boot(ch, { answer } = {}) {
  FakeBank.prototype.addTabs = originalAddTabs; // the previous load's patch
  set("game", ch.game);
  toasts = [];
  answers = [].concat(answer ?? []);
  validation = [];
  downloads = [];
  const ctx = fakeCtx(ch);
  await setup(ctx);
  ctx.status = ctx.sections.get("Bank Layout").items.find((s) => s.name === "status");
  ctx.statusEl = ctx.status.render("bankLayout:status");
  ctx.hooks.characterLoaded();
  ctx.hooks.interfaceReady();
  await tick();
  return ctx;
}

const apply = () => ({ isConfirmed: true, value: true });
const notNow = () => ({ isDismissed: true });
const never = () => ({ isDenied: true });

const tabOf = (id) => game.bank.items.get(game.items.getObjectByID(id))?.tab;
const allInPlace = (n) => SAMPLE.every((id) => tabOf(id) === planned(id) % n);

test("settings: one section with the switches, Apply now and a status line", async () => {
  const ctx = await boot(character(), { answer: notNow });
  assert.deepEqual(
    ctx.sections.get("Bank Layout").items.map((s) => [s.name, s.type, s.default]),
    [
      ["enabled", "switch", true],
      ["autoReapply", "switch", true],
      ["sortAfterApply", "switch", true],
      ["applyNow", "button", undefined],
      ["status", "custom", undefined]
    ]
  );
  assert.deepEqual(
    ctx.sections.get("Your own plan").items.map((s) => [s.name, s.type]),
    [
      ["help", "custom"],
      ["captureBank", "button"],
      ["exportPlan", "button"],
      ["importPlan", "button"],
      ["removePlan", "button"]
    ]
  );
  assert.match(ctx.sections.get("Your own plan").items[0].render().querySelector("a").href, /docs\/custom-plans\.md$/);
  assert.equal(ctx.statusEl.textContent, "Built-in plan (06797e5ac77c): 3,710 items in 27 tabs. You own 12 tabs. Not applied to this character yet.");
});

test("first run asks first; Apply moves every item to X mod N and sets every default tab", async () => {
  const ch = character();
  let prompt;
  await boot(ch, {
    answer: (opts) => {
      prompt = opts;
      return apply();
    }
  });
  const expectedMoves = SAMPLE.filter((id) => planned(id) % 12 !== 0).length;
  assert.equal(prompt.text, `Bank Layout will move ${expectedMoves} items into the planned tabs and set default tabs for 3,710 items. Continue?`);
  assert.ok(allInPlace(12));
  assert.equal(game.bank.defaultItemTabs.size, 3710);
  assert.equal(game.bank.sorted, 1);
  assert.equal(game.bank.itemSelectionMode, 0);
  game.bank.check();
  assert.deepEqual(toasts, [["success", `Bank Layout: moved ${expectedMoves} items (12 tabs).`]]);
  const applied = JSON.parse(ch.storage.get("applied"));
  assert.equal(applied.planVersion, PLAN.planVersion);
  assert.equal(applied.tabCount, 12);
});

test("a never-seen item lands in its wrapped tab with no code running", async () => {
  const ch = character({ ids: [] });
  await boot(ch, { answer: apply });
  const id = "melvorD:Rune_Platebody";
  game.bank.addItemByID(id);
  assert.equal(tabOf(id), planned(id) % 12);
});

test("Not now changes nothing and asks again next load", async () => {
  const ch = character();
  await boot(ch, { answer: notNow });
  assert.equal(game.bank.defaultItemTabs.size, 0);
  assert.ok(SAMPLE.every((id) => tabOf(id) === 0));
  assert.equal(ch.storage.has("applied"), false);
  let asked = false;
  await boot(ch, {
    answer: () => {
      asked = true;
      return notNow();
    }
  });
  assert.ok(asked);
});

test("Don't ask again stops the prompt; Apply now still works", async () => {
  const ch = character();
  await boot(ch, { answer: never });
  let asked = false;
  const ctx = await boot(ch, {
    answer: () => {
      asked = true;
      return apply();
    }
  });
  assert.equal(asked, false);
  ctx.sections
    .get("Bank Layout")
    .items.find((s) => s.name === "applyNow")
    .onClick();
  assert.ok(allInPlace(12));
});

test("buying a tab re-applies: the group for the new tab leaves tab 0", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: apply });
  const fishing = SAMPLE.find((id) => planned(id) === 12);
  assert.equal(tabOf(fishing), 0);
  game.bank.addTabs(1);
  assert.equal(tabOf(fishing), 12);
  assert.ok(allInPlace(13));
  assert.equal(JSON.parse(ch.storage.get("applied")).tabCount, 13);
  assert.match(ctx.statusEl.textContent, /You own 13 tabs\. Last applied .* with 13 tabs\.$/);
  game.bank.check();
});

test("buying a tab does nothing if the layout was never accepted, or auto re-apply is off", async () => {
  const ch = character();
  await boot(ch, { answer: notNow });
  game.bank.addTabs(1);
  assert.ok(SAMPLE.every((id) => tabOf(id) === 0));

  const ch2 = character();
  ch2.settings.set("autoReapply", false);
  await boot(ch2, { answer: apply });
  game.bank.addTabs(1);
  const fishing = SAMPLE.find((id) => planned(id) === 12);
  assert.equal(tabOf(fishing), 0);
});

test("a manual move survives a reload; a plan change re-applies", async () => {
  const ch = character();
  await boot(ch, { answer: apply });
  const id = SAMPLE.find((x) => planned(x) === 5);
  const b = game.bank.items.get(game.items.getObjectByID(id));
  game.bank.setItemSelectionMode(1);
  game.bank.selectedItems.add(b);
  game.bank.moveSelectedItemsToTab(9);

  await boot(ch);
  assert.equal(tabOf(id), 9);
  assert.deepEqual(toasts, []);

  const old = JSON.parse(ch.storage.get("applied"));
  ch.storage.set("applied", JSON.stringify({ ...old, planVersion: "older" }));
  await boot(ch);
  assert.equal(tabOf(id), 5);
  assert.equal(JSON.parse(ch.storage.get("applied")).planVersion, PLAN.planVersion);
});

test("a save with a different tab count re-applies on load", async () => {
  const ch = character();
  await boot(ch, { answer: apply });
  ch.game.bank.itemsByTab.push([], [], []); // e.g. the save was edited
  await boot(ch);
  assert.ok(allInPlace(15));
});

test("with 27 tabs the plan is used unchanged", async () => {
  await boot(character({ tabCount: 27 }), { answer: apply });
  assert.ok(SAMPLE.every((id) => tabOf(id) === planned(id)));
});

test("Custom sort: items move, sorting is skipped, the player is told", async () => {
  const ch = character();
  ch.game.settings.bankSortOrder = 5;
  await boot(ch, { answer: apply });
  assert.ok(allInPlace(12));
  assert.equal(game.bank.sorted, 0);
  assert.equal(toasts.length, 2);
  assert.match(toasts[1][1], /Custom sort/);
});

test("Sort after applying off: no sort, no note", async () => {
  const ch = character();
  ch.settings.set("sortAfterApply", false);
  await boot(ch, { answer: apply });
  assert.equal(game.bank.sorted, 0);
  assert.equal(toasts.length, 1);
});

test("disabled: no prompt on load", async () => {
  const ch = character();
  ch.settings.set("enabled", false);
  let asked = false;
  await boot(ch, {
    answer: () => {
      asked = true;
      return apply();
    }
  });
  assert.equal(asked, false);
  assert.equal(game.bank.defaultItemTabs.size, 0);
});

test("items not in the plan are left alone, and unknown plan IDs are skipped", async () => {
  const ch = character({ ids: SAMPLE.filter((id) => !id.startsWith("melvorItA:")) });
  // An item from another mod, in tab 3, with its own default tab.
  const other = { id: "otherMod:Thing" };
  const b = { item: other, quantity: 1, tab: 3, tabPosition: 0 };
  ch.game.bank.items.set(other, b);
  ch.game.bank.itemsByTab[3].push(b);
  ch.game.bank.defaultItemTabs.set(other, 3);
  // An expansion whose items the game doesn't have.
  const known = new Set(IDS.filter((id) => !id.startsWith("melvorItA:")));
  const get = ch.game.items.getObjectByID;
  ch.game.items.getObjectByID = (id) => (known.has(id) ? get(id) : undefined);
  const ctx = await boot(ch, { answer: apply });
  assert.equal(b.tab, 3);
  assert.equal(game.bank.defaultItemTabs.get(other), 3);
  assert.equal(game.bank.defaultItemTabs.size, known.size + 1);
  assert.equal(ctx.endpoints.preview().missing, IDS.length - known.size);
});

test("verify reports a correct layout as ok, and names what's out of place", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: notNow });
  const before = ctx.endpoints.verify();
  assert.equal(before.ok, false);
  assert.equal(before.wrongDefaults, 3710);
  assert.ok(before.misplaced.length > 0);

  ctx.endpoints.apply();
  assert.deepEqual(ctx.endpoints.verify(), { ok: true, tabCount: 12, planned: 3710, misplaced: [], wrongDefaults: 0 });

  const id = SAMPLE.find((x) => planned(x) === 5);
  const b = game.bank.items.get(game.items.getObjectByID(id));
  game.bank.setItemSelectionMode(1);
  game.bank.selectedItems.add(b);
  game.bank.moveSelectedItemsToTab(9);
  const after = ctx.endpoints.verify();
  assert.equal(after.ok, false);
  assert.deepEqual(after.misplaced, [`${id}: in tab 9, belongs in 5`]);
  assert.equal(after.wrongDefaults, 1);
});

test("the console API previews and applies", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: notNow });
  const p = ctx.endpoints.preview();
  assert.equal(p.tabCount, 12);
  assert.ok(p.moveCount > 0);
  const r = ctx.endpoints.apply({ sort: false });
  assert.equal(r.moved, p.moveCount);
  assert.equal(ctx.endpoints.preview().moveCount, 0);
  assert.equal(game.bank.sorted, 0);
});

test("an invalid plan turns the mod off without throwing", async () => {
  const ctx = fakeCtx(character());
  ctx.loadData = async () => ({ planVersion: "x", tabs: ["A"], items: { "a:B": 4 } });
  const orig = console.error;
  const errors = [];
  console.error = (...a) => errors.push(a);
  try {
    await setup(ctx);
  } finally {
    console.error = orig;
  }
  assert.equal(ctx.sections.size, 0);
  assert.equal(ctx.hooks.characterLoaded, undefined);
  assert.equal(errors.length, 1);
});

// ------------------------------------------------- your own plan

const settle = async () => {
  for (let i = 0; i < 10; i++) await tick();
};
const press = async (ctx, name) => {
  ctx.sections
    .get("Your own plan")
    .items.find((s) => s.name === name)
    .onClick();
  await settle();
};
// Fills the import dialog's text box and presses its button.
const paste = (text) => async (opts) => {
  opts.html.querySelector("textarea").value = text;
  const value = await opts.preConfirm();
  return value === false ? { isDismissed: true } : { isConfirmed: true, value };
};
const capture = (into) => (opts) => {
  into.push(opts);
  return apply();
};
const quiet = async (fn) => {
  const orig = console.error;
  const errors = [];
  console.error = (...a) => errors.push(a);
  try {
    await fn();
  } finally {
    console.error = orig;
  }
  return errors;
};

// Every sampled item in tab (built-in tab mod 5), counted from 1 in the CSV.
const FIVE = "# name: Five\nitem_id,tab\n" + SAMPLE.map((id) => `${id},${(planned(id) % 5) + 1}`).join("\n");
const inFive = () => SAMPLE.every((id) => tabOf(id) === planned(id) % 5);
const DEVICE_KEY = "bankLayout:lastPlan";
const savedPlan = (ch) => (ch.storage.has("plan") ? unpack(JSON.parse(ch.storage.get("plan")), INDEX.ids) : null);

// A character with the FIVE plan imported and applied.
async function withFive() {
  const ch = character();
  const ctx = await boot(ch, { answer: apply });
  answers.push(paste(FIVE), apply);
  await press(ctx, "importPlan");
  return { ch, ctx };
}

test("import: a pasted CSV becomes this character's plan, kept in its save, and is applied", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: apply });
  const prompts = [];
  answers.push(paste(FIVE), capture(prompts));
  await press(ctx, "importPlan");
  assert.match(prompts[0].html.textContent, new RegExp(`"Five": ${SAMPLE.length} items in 5 tabs\\. It becomes this character's plan, kept in its save`));
  assert.ok(inFive());
  assert.equal(savedPlan(ch).name, "Five");
  assert.equal(Object.keys(savedPlan(ch).items).length, SAMPLE.length);
  assert.ok(ch.storage.get("plan").length < 1000, `stored ${ch.storage.get("plan").length} bytes`);
  assert.ok(device.has(DEVICE_KEY));
  const applied = JSON.parse(ch.storage.get("applied"));
  assert.equal(applied.source, "custom");
  assert.match(applied.planVersion, /^c-/);
  assert.match(ctx.statusEl.textContent, new RegExp(`^This character's plan "Five" \\(c-[0-9a-f]{8}\\): ${SAMPLE.length} items in 5 tabs`));
  assert.equal(ctx.endpoints.verify().ok, true);
  game.bank.check();
});

test("import: errors stay in the dialog, escaped, and nothing changes", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: notNow });
  answers.push(paste('melvorD:Bronze_Dagger,0\n<b>"x"</b>,1'));
  await press(ctx, "importPlan");
  assert.equal(validation.length, 1);
  assert.match(validation[0], /^Line 1: tab &#34;0&#34; for melvorD:Bronze_Dagger .*<br>Line 2: &#34;&#60;b&#62;/);
  assert.equal(ch.storage.has("plan"), false);
});

test("import: warnings are shown before use, and Cancel keeps the old plan", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: notNow });
  const prompts = [];
  answers.push(paste("melvorD:Bronze_Dagger,2\nmelvorD:Bronze_Dager,1"), (opts) => {
    prompts.push(opts);
    return notNow();
  });
  await press(ctx, "importPlan");
  assert.match(prompts[0].html.textContent, /1 item ID isn't an item in this game, so it is skipped here: melvorD:Bronze_Dager/);
  assert.equal(ch.storage.has("plan"), false);
});

test("the plan travels with the save: on a device that never saw it, it is still used", async () => {
  const { ch } = await withFive();
  device.clear(); // the same save, on another device
  const ctx = await boot(ch);
  assert.deepEqual(toasts, []);
  assert.ok(inFive());
  assert.match(ctx.statusEl.textContent, /^This character's plan "Five"/);
  // Buying a tab re-applies with it, not the built-in plan.
  game.bank.addTabs(1);
  assert.ok(inFive());
});

test("a new character is offered the plan this device last used", async () => {
  await withFive();
  const prompts = [];
  const ch2 = character();
  await boot(ch2, { answer: capture(prompts) });
  const moves = SAMPLE.filter((id) => planned(id) % 5 !== 0).length;
  const builtinMoves = SAMPLE.filter((id) => planned(id) % 12 !== 0).length;
  assert.equal(
    prompts[0].text,
    `This character doesn't have a bank plan yet. Use your plan "Five", the last one used on this device (moves ${moves} items), or the built-in plan (moves ${builtinMoves} items)? Either way, new items land in their planned tab.`
  );
  assert.equal(prompts[0].confirmButtonText, 'Use "Five"');
  assert.equal(prompts[0].denyButtonText, "Use the built-in plan");
  assert.ok(inFive());
  assert.equal(savedPlan(ch2).name, "Five");
});

test("a new character can pick the built-in plan instead", async () => {
  await withFive();
  const ch2 = character();
  await boot(ch2, { answer: () => ({ isDenied: true }) });
  assert.ok(allInPlace(12));
  assert.equal(ch2.storage.has("plan"), false);
  assert.equal(JSON.parse(ch2.storage.get("applied")).source, "builtin");
});

test("a plan this version can't read is left alone, with a message", async () => {
  const { ch } = await withFive();
  const packed = JSON.parse(ch.storage.get("plan"));
  ch.storage.set("plan", JSON.stringify({ ...packed, n: INDEX.ids.length + 50 })); // saved by a newer mod
  let ctx;
  const errors = await quiet(async () => {
    ctx = await boot(ch);
  });
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /saved by a newer version of Bank Layout/);
  assert.ok(inFive());
  assert.deepEqual(toasts, [
    [
      "info",
      "Bank Layout: this character's own plan couldn't be read (it may have been saved by a newer version of the mod), so nothing was changed. Update the mod, or import the plan again."
    ]
  ]);
  assert.match(ctx.statusEl.textContent, /^Built-in plan/);
});

test("a changed plan in the save re-applies on load", async () => {
  const { ch } = await withFive();
  const plan = savedPlan(ch);
  const id = SAMPLE[0];
  plan.items[id] = (planned(id) + 1) % 5;
  ch.storage.set("plan", JSON.stringify(pack(plan, INDEX.ids)));
  await boot(ch);
  assert.equal(tabOf(id), (planned(id) + 1) % 5);
});

test("a plan too big for the save is refused with the size", async () => {
  const ctx = await boot(character(), { answer: notNow });
  // Items outside the shipped list are stored with their IDs: 400 of them is too much.
  const csv = Array.from({ length: 400 }, (_, i) => `someOtherMod:A_Long_Item_Name_Number_${i},1`).join("\n");
  assert.throws(() => ctx.endpoints.importPlan(csv), /Couldn't keep the plan/);
  assert.match(toasts.at(-1)[1], /^Bank Layout: this plan needs \d+\.\dkb, more than the 7\.4kb a mod can keep in a save/);
});

test("export: the plan in use as CSV, which Download saves", async () => {
  const ctx = await boot(character(), { answer: apply });
  let shown;
  answers.push((opts) => {
    shown = opts.html.querySelector("textarea").value;
    return { isConfirmed: true };
  });
  await press(ctx, "exportPlan");
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "bank-layout-plan.csv");
  assert.equal(downloads[0].text, shown);
  const lines = shown.split("\n");
  assert.deepEqual(lines.slice(0, 3), ["# name: Built-in", "item_id,tab,tab_name,item_name", "melvorD:Bronze_Dagger,1,Weapons: Melee,Bronze_Dagger"]);
  assert.equal(lines.filter((l) => l && !l.startsWith("#")).length, 3711);
});

test("export then import gives back the same plan", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: apply });
  const csv = ctx.endpoints.exportPlan();
  assert.deepEqual(ctx.endpoints.importPlan(csv), []);
  assert.deepEqual(ctx.endpoints.plan().items, PLAN.items);
  assert.equal(ctx.endpoints.plan().source, "custom");
  assert.deepEqual(savedPlan(ch).items, PLAN.items);
});

test("use my bank as the plan: hand-placed items stay, and that becomes the plan", async () => {
  const ch = character();
  const ctx = await boot(ch, { answer: apply });
  const id = SAMPLE.find((x) => planned(x) === 5);
  const b = game.bank.items.get(game.items.getObjectByID(id));
  game.bank.setItemSelectionMode(1);
  game.bank.selectedItems.add(b);
  game.bank.moveSelectedItemsToTab(9);
  const sortedBefore = game.bank.sorted;
  answers.push(apply);
  await press(ctx, "captureBank");
  assert.equal(tabOf(id), 9);
  assert.equal(game.bank.sorted, sortedBefore);
  assert.equal(ctx.endpoints.plan().items[id], 9);
  assert.equal(ctx.endpoints.plan().tabs.length, 12);
  assert.equal(ctx.endpoints.plan().tabs[0], "Weapons: Melee / Fishing / Parts & Components");
  assert.equal(ctx.endpoints.verify().ok, true);
  assert.equal(savedPlan(ch).items[id], 9);
  // It survives a reload: no re-apply moves it back.
  await boot(ch);
  assert.equal(tabOf(id), 9);
  assert.deepEqual(toasts, []);
});

test("remove my plan: back to the built-in plan, applied now, and no longer offered", async () => {
  const { ch, ctx } = await withFive();
  answers.push(apply);
  await press(ctx, "removePlan");
  assert.equal(ch.storage.has("plan"), false);
  assert.equal(device.has(DEVICE_KEY), false);
  assert.ok(allInPlace(12));
  assert.equal(JSON.parse(ch.storage.get("applied")).source, "builtin");
  toasts.length = 0;
  await press(ctx, "removePlan");
  assert.deepEqual(toasts, [["info", "This character has no plan of its own; the built-in plan is in use."]]);
});

test("a damaged plan remembered on the device is not offered", async () => {
  device.set(DEVICE_KEY, JSON.stringify({ f: 1, n: 3, t: "not base64!" }));
  const prompts = [];
  await boot(character(), { answer: capture(prompts) });
  assert.match(prompts[0].text, /^Bank Layout will move/);
  assert.ok(allInPlace(12));
});

test("console importPlan throws on errors and returns warnings", async () => {
  const ctx = await boot(character(), { answer: notNow });
  assert.throws(() => ctx.endpoints.importPlan("Bronze Dagger,1"), /isn't an item ID/);
  assert.match(ctx.endpoints.importPlan("melvorD:Bronze_Dagger,2\nx:Nope,1")[0], /x:Nope/);
  assert.equal(tabOf("melvorD:Bronze_Dagger"), 1);
});
