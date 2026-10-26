// Pure logic: where each item belongs, what has to move, and when to apply.
// Nothing here touches the game, so it is tested against plain objects.

// A planned tab past the last tab the player owns wraps back onto the first
// ones, so the layout still works with fewer tabs than the plan has.
export function targetTab(planned, tabCount) {
  return planned % tabCount;
}

// Returns a list of problems; empty means the plan is usable.
export function validatePlan(plan) {
  const problems = [];
  if (!plan || typeof plan !== "object") return ["not an object"];
  if (typeof plan.planVersion !== "string" || !plan.planVersion) problems.push("planVersion must be a non-empty string");
  if (!Array.isArray(plan.tabs) || !plan.tabs.length) problems.push("tabs must be a non-empty array");
  if (!plan.items || typeof plan.items !== "object") {
    problems.push("items must be an object");
    return problems;
  }
  const tabs = Array.isArray(plan.tabs) ? plan.tabs.length : 0;
  for (const [id, tab] of Object.entries(plan.items)) {
    if (!Number.isInteger(tab) || tab < 0 || tab >= tabs) problems.push(`${id}: tab ${tab} is not an index into tabs`);
    if (problems.length > 20) break;
  }
  return problems;
}

// The plan's items as a Map of item ID -> planned tab.
export function planMap(plan) {
  return new Map(Object.entries(plan.items));
}

// Works out the layout for a bank with `tabCount` tabs.
//   planned    Map of item ID -> planned tab
//   findItem   item ID -> item, or undefined (e.g. an expansion's data is absent)
//   bankItems  what is in the bank: objects with `item` and `tab`
// Returns the home tab for every planned item the game knows (`defaults`),
// and the bank items not in their target tab, grouped by target tab in tab
// order (`moves`). Items not in the plan are left alone.
export function computeLayout(planned, findItem, bankItems, tabCount) {
  const defaults = new Map();
  let missing = 0;
  for (const [id, x] of planned) {
    const item = findItem(id);
    if (item) defaults.set(item, targetTab(x, tabCount));
    else missing++;
  }

  const byTab = new Map();
  let moveCount = 0;
  for (const bankItem of bankItems) {
    const x = planned.get(bankItem.item?.id);
    if (x === undefined) continue;
    const tab = targetTab(x, tabCount);
    if (bankItem.tab === tab) continue;
    if (!byTab.has(tab)) byTab.set(tab, []);
    byTab.get(tab).push(bankItem);
    moveCount++;
  }
  const moves = new Map([...byTab.entries()].sort((a, b) => a[0] - b[0]));
  return { defaults, moves, moveCount, missing };
}

// What to do when a character loads:
//   "confirm"         first run on this character: ask before applying
//   "apply"           the plan or the tab count changed since the last apply
//   "custom-missing"  the character was laid out with its own plan, which
//                     can't be read now; don't undo it with the built-in one
//   null              nothing; manual moves are left alone
// `active` is the plan in use: { planVersion, source: "builtin" | "custom" }.
export function decide({ enabled, autoReapply, declined, applied, active, tabCount }) {
  if (!enabled) return null;
  if (!applied) return declined ? null : "confirm";
  if (applied.source === "custom" && active.source !== "custom") return "custom-missing";
  if (applied.planVersion !== active.planVersion || applied.tabCount !== tabCount) return autoReapply ? "apply" : null;
  return null;
}

// Bank sort orders, as game.settings.bankSortOrder holds them.
export const SORT_DEFAULT = 0;
export const SORT_CUSTOM = 5;

// Whether to sort after applying, and if not, what to tell the player.
export function sortPlan(wanted, sortOrder) {
  if (!wanted) return { sort: false, note: null };
  if (sortOrder === SORT_DEFAULT) return { sort: true, note: null };
  if (sortOrder === SORT_CUSTOM) return { sort: false, note: "Custom sort is on, so items were not re-sorted inside their tabs." };
  return { sort: false, note: "Your bank sort order isn't Default, so items were not re-sorted inside their tabs." };
}

const plural = (n, word) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

export function appliedMessage(moveCount, tabCount) {
  return `Bank Layout: moved ${plural(moveCount, "item")} (${plural(tabCount, "tab")}).`;
}

export function confirmMessage(moveCount, defaultCount, planName) {
  const which = planName ? ` (${planName})` : "";
  return `Bank Layout will move ${plural(moveCount, "item")} into the planned tabs${which} and set default tabs for ${plural(defaultCount, "item")}. Continue?`;
}

export const CUSTOM_MISSING =
  "Bank Layout: this character's own plan couldn't be read (it may have been saved by a newer version of the mod), so nothing was changed. Update the mod, or import the plan again.";

export function offerMessage(planName, mineMoves, builtinMoves) {
  return `This character doesn't have a bank plan yet. Use your plan "${planName}", the last one used on this device (moves ${plural(mineMoves, "item")}), or the built-in plan (moves ${plural(builtinMoves, "item")})? Either way, new items land in their planned tab.`;
}

export function tooBigMessage(size, budget) {
  return `Bank Layout: this plan needs ${(size / 1024).toFixed(1)}kb, more than the ${(budget / 1024).toFixed(1)}kb a mod can keep in a save. Use fewer tabs, or leave out items you don't need placed.`;
}

function describePlan(active) {
  return active.source === "custom" ? `This character's plan "${active.name}" (${active.planVersion})` : `Built-in plan (${active.planVersion})`;
}

export function statusText(applied, active, tabCount) {
  const head = `${describePlan(active)}: ${plural(Object.keys(active.items).length, "item")} in ${plural(active.tabs.length, "tab")}. You own ${plural(tabCount, "tab")}.`;
  if (!applied) return `${head} Not applied to this character yet.`;
  const when = new Date(applied.appliedAt).toLocaleString();
  const samePlan = applied.planVersion === active.planVersion;
  const from = samePlan ? "" : ` from ${applied.source === "custom" ? "its own plan" : "the built-in plan"} (${applied.planVersion})`;
  const stale = !samePlan || applied.tabCount !== tabCount;
  return `${head} Last applied ${when}${from} with ${plural(applied.tabCount, "tab")}.${stale ? " Out of date." : ""}`;
}
