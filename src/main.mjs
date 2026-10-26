// Mod entry point: settings, the addTabs hook, the active plan, and applying
// the layout.

import { createAdapter } from "./adapter.mjs";
import * as codec from "./codec.mjs";
import * as model from "./model.mjs";
import * as plans from "./plans.mjs";

const DOCS_URL = "https://github.com/CardSwim8/melvor-item-sorting/blob/main/docs/custom-plans.md";

// Mod storage holds 8kb a character; leave room for the other records.
const PLAN_BUDGET = 7600;

export async function setup(ctx) {
  const A = createAdapter();
  const note = (where, e) => console.error(`[Bank Layout] ${where}`, e);

  const builtin = await ctx.loadData("data/plan.json");
  const problems = model.validatePlan(builtin);
  if (problems.length) {
    note("data/plan.json is not a valid plan; the mod is off.", problems);
    return;
  }
  // The item order plans are packed against (see codec.mjs).
  const { ids } = await ctx.loadData("data/item-index.json");

  // The plan in use: this character's own plan, kept in its save, or the
  // built-in one.
  let custom = null;
  let active = plans.resolvePlan(null, builtin);
  let planned = model.planMap(active);

  // Reads this character's plan from its save. A plan that can't be read
  // leaves `custom` empty; decide() then refuses to overwrite its layout.
  function loadActive() {
    custom = null;
    const packed = ctx.characterStorage.getItem("plan");
    if (packed) {
      try {
        const plan = codec.unpack(packed, ids);
        const bad = model.validatePlan(plans.resolvePlan(plan, builtin));
        if (bad.length) throw new Error(`it is damaged (${bad[0]})`);
        custom = plan;
      } catch (e) {
        note(`this character's plan can't be read: ${e.message}`, e);
      }
    }
    active = plans.resolvePlan(custom, builtin);
    planned = model.planMap(active);
  }

  // The plan this device last used, to offer to characters without one.
  function devicePlan() {
    const packed = A.loadDevicePlan();
    if (!packed) return null;
    try {
      const plan = codec.unpack(packed, ids);
      return model.validatePlan(plans.resolvePlan(plan, builtin)).length ? null : plan;
    } catch (e) {
      return null;
    }
  }

  const prefs = { enabled: true, autoReapply: true, sortAfterApply: true };
  let pending = null;
  let ready = false;
  let statusEl = null;

  // ----------------------------------------------- per-character records

  // { planVersion, source, tabCount, appliedAt } from the last apply.
  const getApplied = () => ctx.characterStorage.getItem("applied");
  // Set by "Don't ask again" on the first-run prompt.
  const getDeclined = () => ctx.characterStorage.getItem("declined") === true;

  function refreshStatus() {
    if (!statusEl || !ready) return;
    try {
      statusEl.textContent = model.statusText(getApplied(), active, A.tabCount());
    } catch (e) {
      note("status", e);
    }
  }

  // ----------------------------------------------- applying

  function layout(map = planned) {
    return model.computeLayout(map, A.findItem, A.bankItems(), A.tabCount());
  }

  function applyLayout({ sort }) {
    const tabCount = A.tabCount();
    const { defaults, moves, moveCount } = layout();
    A.setDefaultTabs(defaults);
    for (const [tab, list] of moves) A.moveItemsToTab(list, tab);
    const s = model.sortPlan(sort, A.sortOrder());
    if (s.sort) A.sortBank();
    ctx.characterStorage.setItem("applied", { planVersion: active.planVersion, source: active.source, tabCount, appliedAt: Date.now() });
    A.notify(model.appliedMessage(moveCount, tabCount));
    if (s.note) A.notify(s.note, "info");
    refreshStatus();
    return { moved: moveCount, tabCount, defaults: defaults.size };
  }

  function tryApply(sort = prefs.sortAfterApply) {
    try {
      return applyLayout({ sort });
    } catch (e) {
      note("applying the layout", e);
      A.notify("Bank Layout could not apply the layout. See the console for details.", "danger");
    }
  }

  async function askFirstRun() {
    const offer = custom ? null : devicePlan();
    if (offer) {
      const mine = layout(model.planMap(plans.resolvePlan(offer, builtin))).moveCount;
      const theirs = layout().moveCount;
      const answer = await A.firstRun(model.offerMessage(offer.name, mine, theirs), offer.name);
      if (answer === "custom") useCustomPlan(offer);
      else if (answer === "builtin") tryApply();
      return;
    }
    const { defaults, moveCount } = layout();
    const answer = await A.firstRun(model.confirmMessage(moveCount, defaults.size, active.source === "custom" ? `your plan "${active.name}"` : null));
    if (answer === "builtin") tryApply();
    else if (answer === "never") ctx.characterStorage.setItem("declined", true);
  }

  // ----------------------------------------------- custom plans

  const isKnownItem = (id) => !!A.findItem(id);

  // Keeps a plan in this character's save (or removes it, for null), makes it
  // the active plan and applies it. Returns false if it couldn't be kept.
  function useCustomPlan(plan, sort) {
    try {
      if (plan) {
        const packed = codec.pack(plan, ids);
        const size = codec.storedSize("plan", packed);
        if (size > PLAN_BUDGET) {
          A.notify(model.tooBigMessage(size, PLAN_BUDGET), "danger");
          return false;
        }
        ctx.characterStorage.setItem("plan", packed);
        A.saveDevicePlan(packed);
      } else {
        const packed = ctx.characterStorage.getItem("plan");
        ctx.characterStorage.removeItem("plan");
        // Stop offering it to new characters, if it is the one remembered.
        if (packed && JSON.stringify(packed) === JSON.stringify(A.loadDevicePlan())) A.forgetDevicePlan();
      }
    } catch (e) {
      note("saving the plan", e);
      A.notify("Bank Layout couldn't keep the plan in this character's save. See the console for details.", "danger");
      return false;
    }
    loadActive();
    if (ready) tryApply(sort);
    return true;
  }

  async function importPlan() {
    const text = await A.importDialog((t) => plans.parsePlan(t, { isKnownItem }).errors ?? []);
    if (text === null) return;
    const { plan, warnings } = plans.parsePlan(text, { isKnownItem });
    const resolved = plans.resolvePlan(plan, builtin);
    const base = plan.extends === "builtin" ? `, on top of the built-in plan (${Object.keys(resolved.items).length.toLocaleString("en-US")} items in all)` : "";
    const ok = await A.ask({
      title: "Use this plan?",
      text: `"${plan.name}": ${Object.keys(plan.items).length.toLocaleString("en-US")} items in ${plan.tabs.length} tabs${base}. It becomes this character's plan, kept in its save, and is applied now. New characters on this device are offered it too.`,
      notes: warnings,
      confirmText: "Use and apply"
    });
    if (ok) useCustomPlan(plan);
  }

  function exportCSV() {
    return plans.toCSV({ ...active, extends: null }, A.itemName);
  }

  async function captureBank() {
    const ok = await A.ask({
      title: "Use your bank as the plan?",
      text: "Every item keeps the tab it is in now, and items you don't have keep their default tab. This becomes this character's plan, kept in its save; items you get later land in these tabs.",
      notes: custom ? [`It replaces this character's plan "${custom.name}". Export that first if you want to keep it.`] : [],
      confirmText: "Use my bank"
    });
    if (!ok) return;
    const plan = plans.captureBank(active, A.bankByID(), A.defaultTabsByID(), A.tabCount());
    // Keep the order the player arranged inside each tab.
    useCustomPlan(plan, false);
  }

  async function removePlan() {
    if (!custom) {
      A.notify("This character has no plan of its own; the built-in plan is in use.", "info");
      return;
    }
    const ok = await A.ask({
      title: "Remove this character's plan?",
      text: `"${custom.name}" is removed from this character, and the built-in plan is applied now.`,
      notes: ["Export it first if you might want it back."],
      confirmText: "Remove and apply",
      danger: true
    });
    if (ok) useCustomPlan(null);
  }

  const run = (where, fn) => () => {
    if (!ready) return;
    Promise.resolve()
      .then(fn)
      .catch((e) => note(where, e));
  };

  // ----------------------------------------------- settings

  const section = ctx.settings.section("Bank Layout");
  section.add([
    {
      type: "switch",
      name: "enabled",
      label: "Keep the bank in the planned layout",
      hint: "Off: nothing happens when the game loads or when you buy a tab. Apply now still works.",
      default: true,
      onChange: (value) => {
        prefs.enabled = value;
      }
    },
    {
      type: "switch",
      name: "autoReapply",
      label: "Re-apply when you buy a tab or the plan changes",
      hint: "Otherwise items you move by hand are never moved back.",
      default: true,
      onChange: (value) => {
        prefs.autoReapply = value;
      }
    },
    {
      type: "switch",
      name: "sortAfterApply",
      label: "Sort each tab after applying",
      hint: "Only with the bank's Default sort order.",
      default: true,
      onChange: (value) => {
        prefs.sortAfterApply = value;
      }
    },
    {
      type: "button",
      name: "applyNow",
      display: "Apply now",
      label: "Move every item to its planned tab",
      onClick: () => {
        if (ready) tryApply();
      }
    },
    {
      type: "custom",
      name: "status",
      render: (name) => {
        statusEl = document.createElement("div");
        statusEl.id = name;
        statusEl.className = "font-size-sm text-muted ml-2";
        refreshStatus();
        return statusEl;
      },
      get: () => null,
      set: () => {}
    }
  ]);

  const mine = ctx.settings.section("Your own plan");
  mine.add([
    {
      type: "custom",
      name: "help",
      render: () => {
        const p = document.createElement("div");
        p.className = "font-size-sm ml-2 mb-2";
        p.append("Use your own tabs instead of the built-in plan. Each character keeps its plan in its save, so it goes wherever the save goes. ");
        const a = document.createElement("a");
        a.href = DOCS_URL;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "How to make a plan";
        p.append(a);
        return p;
      },
      get: () => null,
      set: () => {}
    },
    {
      type: "button",
      name: "captureBank",
      display: "Use my bank as the plan",
      label: "Arrange your bank by hand, then save it as your plan",
      onClick: run("saving the bank as the plan", captureBank)
    },
    {
      type: "button",
      name: "exportPlan",
      display: "Export plan",
      label: "The plan in use as a spreadsheet (CSV) to edit",
      onClick: run("exporting the plan", () => A.exportDialog(exportCSV(), "bank-layout-plan.csv"))
    },
    {
      type: "button",
      name: "importPlan",
      display: "Import plan",
      label: "Use a plan from a CSV or JSON file",
      onClick: run("importing a plan", importPlan)
    },
    {
      type: "button",
      name: "removePlan",
      display: "Remove my plan",
      color: "danger",
      label: "Go back to the built-in plan",
      onClick: run("removing the custom plan", removePlan)
    }
  ]);

  // ----------------------------------------------- game hooks

  // Buying a tab changes where wrapped items belong.
  try {
    if (typeof Bank !== "undefined" && typeof Bank.prototype.addTabs === "function") {
      ctx.patch(Bank, "addTabs").after(() => {
        if (!ready) return;
        try {
          const action = model.decide({
            ...prefs,
            declined: true, // never prompt mid-game; only re-apply an accepted layout
            applied: getApplied(),
            active,
            tabCount: A.tabCount()
          });
          if (action === "apply") tryApply();
          else refreshStatus();
        } catch (e) {
          note("after buying a tab", e);
        }
      });
    } else {
      note("addTabs", "Bank.addTabs not found; buying a tab won't re-apply the layout.");
    }
  } catch (e) {
    note("addTabs", e);
  }

  // Whether the bank matches the layout: every planned item in the bank sits
  // in its target tab, and every planned item has its default tab set.
  function verify() {
    const { defaults, moves, moveCount } = layout();
    let wrongDefaults = 0;
    for (const [item, tab] of defaults) if (A.defaultTab(item) !== tab) wrongDefaults++;
    const misplaced = [];
    for (const [tab, list] of moves) for (const b of list) misplaced.push(`${b.item.id}: in tab ${b.tab}, belongs in ${tab}`);
    return { ok: moveCount === 0 && wrongDefaults === 0, tabCount: A.tabCount(), planned: defaults.size, misplaced, wrongDefaults };
  }

  // For the console: mod.api.bankLayout.verify(), .preview(), .apply(), ...
  ctx.api({
    apply: (opts = {}) => applyLayout({ sort: opts.sort ?? prefs.sortAfterApply }),
    preview: () => {
      const { defaults, moves, moveCount, missing } = layout();
      return { tabCount: A.tabCount(), defaults: defaults.size, moveCount, missing, moves };
    },
    verify,
    plan: () => active,
    exportPlan: exportCSV,
    // Imports without dialogs. Throws with the problems if the plan is invalid;
    // returns the warnings otherwise.
    importPlan: (text) => {
      const { plan, warnings, errors } = plans.parsePlan(text, { isKnownItem });
      if (errors) throw new Error(errors.join("\n"));
      if (!useCustomPlan(plan)) throw new Error("Couldn't keep the plan in this character's save.");
      return warnings;
    },
    removeCustomPlan: () => useCustomPlan(null)
  });

  // ----------------------------------------------- lifecycle

  ctx.onCharacterLoaded(() => {
    try {
      loadActive();
      for (const k of Object.keys(prefs)) {
        const saved = section.get(k);
        if (typeof saved === "boolean") prefs[k] = saved;
      }
      pending = model.decide({
        ...prefs,
        declined: getDeclined(),
        applied: getApplied(),
        active,
        tabCount: A.tabCount()
      });
    } catch (e) {
      note("checking the layout on load", e);
    }
  });

  // The bank UI exists from here, which the game's move path needs.
  ctx.onInterfaceReady(() => {
    ready = true;
    refreshStatus();
    const action = pending;
    pending = null;
    if (action === "apply") tryApply();
    else if (action === "confirm") askFirstRun().catch((e) => note("first-run prompt", e));
    else if (action === "custom-missing") A.notify(model.CUSTOM_MISSING, "info");
  });
}
