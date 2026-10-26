// Players' own plans: reading them from CSV or JSON, exporting the active
// plan as CSV, and combining a partial plan with the built-in one. Pure: no
// game access, so it is tested against plain data.
//
// A parsed custom plan:
//   { source: "custom", name, extends: "builtin" | null, tabs: [names], items: { id: X } }
// X counts from 0 here and in JSON; CSV counts tabs from 1, as players do.

// Default tabs are saved as one byte, and the game allows 255 tabs.
export const MAX_TABS = 255;

const MAX_MESSAGES = 10;

// FNV-1a, 32-bit: a short, stable fingerprint of a plan's content.
function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

// planVersion for a custom plan: changes whenever its content does.
export function customVersion(custom) {
  const entries = Object.entries(custom.items).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return "c-" + fingerprint(JSON.stringify([custom.name ?? "", custom.extends ?? "", custom.tabs, entries]));
}

// The plan the mod applies. A custom plan with `extends: "builtin"` keeps the
// built-in tab for every item it doesn't list, and is re-applied when the
// built-in plan updates.
export function resolvePlan(custom, builtin) {
  if (!custom) return { ...builtin, source: "builtin", name: "Built-in" };
  const own = customVersion(custom);
  if (custom.extends !== "builtin") {
    return { source: "custom", name: custom.name, planVersion: own, tabs: custom.tabs, items: custom.items };
  }
  const tabs = builtin.tabs.slice();
  custom.tabs.forEach((name, i) => {
    if (i >= tabs.length || !/^Tab \d+$/.test(name)) tabs[i] = name;
  });
  return {
    source: "custom",
    name: custom.name,
    planVersion: `${own}+${builtin.planVersion}`,
    tabs,
    items: { ...builtin.items, ...custom.items }
  };
}

// ------------------------------------------------- reading

// Reads a plan in either format. `isKnownItem(id)` says whether the game has
// that item; unknown IDs are kept (they may be from an expansion or mod this
// device lacks) but reported.
// Returns { plan, warnings } or { errors }.
export function parsePlan(text, { isKnownItem = () => true } = {}) {
  const t = String(text ?? "").replace(/^\uFEFF/, "");
  if (!t.trim()) return { errors: ["The plan is empty."] };
  const r = t.trim().startsWith("{") ? readJSON(t) : readCSV(t);
  if (r.errors.length) return { errors: cap(r.errors) };
  const { name, ext, items, names } = r;
  const ids = Object.keys(items);
  if (!ids.length) return { errors: ["The plan lists no items."] };

  const top = Math.max(...Object.values(items));
  const count = Math.max(top + 1, names.length);
  const tabs = Array.from({ length: count }, (_, i) => names[i] || `Tab ${i + 1}`);

  const warnings = [...r.warnings];
  const unknown = ids.filter((id) => !isKnownItem(id));
  if (unknown.length) {
    warnings.push(
      `${unknown.length} item ID${unknown.length === 1 ? " isn't an item" : "s aren't items"} in this game, so ${unknown.length === 1 ? "it is" : "they are"} skipped here: ${unknown
        .slice(0, 5)
        .join(", ")}${unknown.length > 5 ? ", …" : ""}. Check the spelling, or ignore this if they come from an expansion or mod you don't have.`
    );
  }
  return { plan: { source: "custom", name: name || "Custom plan", extends: ext, tabs, items }, warnings: cap(warnings) };
}

function cap(list) {
  return list.length > MAX_MESSAGES ? [...list.slice(0, MAX_MESSAGES), `…and ${list.length - MAX_MESSAGES} more.`] : list;
}

function readExtends(value, errors, where) {
  if (value === undefined || value === null || value === "" || value === "none") return null;
  if (String(value).trim().toLowerCase() === "builtin") return "builtin";
  errors.push(`${where}: "extends" must be "builtin" or left out.`);
  return null;
}

function readJSON(text) {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { errors: [`Not valid JSON: ${e.message}`] };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { errors: ['The JSON must be an object with an "items" object.'] };
  if (!data.items || typeof data.items !== "object" || Array.isArray(data.items))
    return { errors: ['The JSON needs an "items" object: { "melvorD:Bronze_Dagger": 0, ... }.'] };

  let names = [];
  if (data.tabs !== undefined) {
    if (!Array.isArray(data.tabs) || data.tabs.some((n) => typeof n !== "string")) errors.push('"tabs" must be a list of tab names.');
    else if (data.tabs.length > MAX_TABS) errors.push(`"tabs" has ${data.tabs.length} names; the bank allows at most ${MAX_TABS} tabs.`);
    else names = data.tabs;
  }
  const items = {};
  for (const [id, x] of Object.entries(data.items)) {
    if (!/^[^:\s]+:[^:\s]+$/.test(id)) errors.push(`"${id}" isn't an item ID like melvorD:Bronze_Dagger.`);
    else if (!Number.isInteger(x) || x < 0 || x >= MAX_TABS)
      errors.push(`${id}: tab ${JSON.stringify(x)} must be a whole number from 0 to ${MAX_TABS - 1} (JSON counts tabs from 0).`);
    else if (names.length && x >= names.length) errors.push(`${id}: tab ${x} is past the ${names.length} names in "tabs" (JSON counts tabs from 0).`);
    else items[id] = x;
  }
  const ext = readExtends(data.extends, errors, "JSON");
  if (data.name !== undefined && typeof data.name !== "string") errors.push('"name" must be text.');
  return { errors, warnings, name: typeof data.name === "string" ? data.name.trim() : "", ext, items, names };
}

// One CSV line into fields. Handles quoted fields with commas and "" escapes.
function splitCSV(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function readCSV(text) {
  const errors = [];
  const warnings = [];
  const items = {};
  const names = [];
  const seenAt = new Map();
  let name = "";
  let ext = null;
  let cols = { id: 0, tab: 1, tabName: 2 };
  let sawHeader = false;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const at = `Line ${i + 1}`;
    if (!line) return;
    if (line.startsWith("#")) {
      const m = /^#\s*(name|extends)\s*:\s*(.*)$/i.exec(line);
      if (m && m[1].toLowerCase() === "name") name = m[2].trim();
      else if (m) ext = readExtends(m[2], errors, at);
      return;
    }
    const f = splitCSV(line);
    if (!sawHeader && f.some((x) => /^item_?id$/i.test(x))) {
      sawHeader = true;
      const find = (re) => f.findIndex((x) => re.test(x));
      cols = { id: find(/^item_?id$/i), tab: find(/^tab$/i), tabName: find(/^tab_?name$/i) };
      if (cols.tab < 0) errors.push(`${at}: the header needs a "tab" column.`);
      return;
    }
    sawHeader = true;
    const id = f[cols.id] ?? "";
    const tabText = f[cols.tab] ?? "";
    if (!/^[^:\s]+:[^:\s]+$/.test(id)) {
      errors.push(`${at}: "${id}" isn't an item ID like melvorD:Bronze_Dagger.`);
      return;
    }
    const tab = Number(tabText);
    if (!/^\d+$/.test(tabText) || tab < 1 || tab > MAX_TABS) {
      errors.push(`${at}: tab "${tabText}" for ${id} must be a whole number from 1 to ${MAX_TABS} (CSV counts tabs from 1).`);
      return;
    }
    const x = tab - 1;
    if (seenAt.has(id)) warnings.push(`${at}: ${id} is also on line ${seenAt.get(id)}; the later line wins.`);
    seenAt.set(id, i + 1);
    items[id] = x;
    const tabName = cols.tabName >= 0 ? (f[cols.tabName] ?? "") : "";
    if (tabName) {
      if (!names[x]) names[x] = tabName;
      else if (names[x] !== tabName) warnings.push(`${at}: tab ${tab} is called both "${names[x]}" and "${tabName}"; using "${names[x]}".`);
    }
  });
  return { errors, warnings, name, ext, items, names };
}

// ------------------------------------------------- writing

const quote = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// The plan as CSV, one row per item, grouped by tab. `nameOf(id)` gives the
// item's name, to make the sheet readable; it is ignored on import.
export function toCSV(plan, nameOf = () => "") {
  const lines = [`# name: ${plan.name ?? "Custom plan"}`];
  if (plan.extends === "builtin") lines.push("# extends: builtin");
  lines.push("item_id,tab,tab_name,item_name");
  const rows = Object.entries(plan.items).map(([id, x], i) => [id, x, i]);
  rows.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  for (const [id, x] of rows) lines.push([id, String(x + 1), quote(plan.tabs[x] ?? `Tab ${x + 1}`), quote(nameOf(id) ?? "")].join(","));
  return lines.join("\n") + "\n";
}

// A plan of the bank as it is now. Items in the bank keep their tab; items
// not in the bank keep their default tab if they have one, else the tab the
// active plan gives them. Tab names list what the active plan puts there.
//   active    the resolved active plan
//   bank      [{ id, tab }] for every item in the bank
//   defaults  Map of item ID -> default tab, for items that have one
export function captureBank(active, bank, defaults, tabCount, name = "My bank layout") {
  const items = {};
  for (const [id, x] of Object.entries(active.items)) items[id] = defaults.has(id) ? defaults.get(id) : x % tabCount;
  for (const [id, x] of defaults) items[id] = x;
  for (const { id, tab } of bank) items[id] = tab;
  const tabs = Array.from({ length: tabCount }, (_, i) => {
    const parts = active.tabs.filter((_, x) => x % tabCount === i);
    return parts.length ? parts.join(" / ") : `Tab ${i + 1}`;
  });
  for (const id of Object.keys(items)) if (items[id] >= tabCount) delete items[id];
  return { source: "custom", name, extends: null, tabs, items };
}
