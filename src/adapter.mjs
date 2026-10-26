// The only module that touches Melvor's globals. Checked against v1.3.1's
// bank2.js; game updates that break the mod usually land here.

const MOVE_ITEMS = 1; // BankSelectionMode.MoveItems
const NO_SELECTION = 0; // BankSelectionMode.None

export function createAdapter() {
  const bank = () => game.bank;
  const note = (where, e) => console.error(`[Bank Layout] ${where}`, e);

  function tabCount() {
    return bank().tabCount;
  }

  function findItem(id) {
    return game.items?.getObjectByID?.(id);
  }

  function bankItems() {
    return [...bank().items.values()];
  }

  // The tab an item has been told to go to, or undefined if none.
  function defaultTab(item) {
    return bank().defaultItemTabs.get(item);
  }

  // Where the game puts each item the next time it enters the bank.
  function setDefaultTabs(defaults) {
    const map = bank().defaultItemTabs;
    for (const [item, tab] of defaults) map.set(item, tab);
  }

  // The game's own "Move items to new tab" path: moves the data, updates the
  // bank UI, sets each item's default tab and leaves move mode. Filling the
  // selection must come after entering move mode, which clears it.
  function moveWithGame(list, tab) {
    const b = bank();
    b.setItemSelectionMode(NO_SELECTION);
    b.setItemSelectionMode(MOVE_ITEMS);
    b.selectedItems.clear();
    for (const bankItem of list) b.selectedItems.add(bankItem);
    b.moveSelectedItemsToTab(tab);
  }

  // The same steps as Bank.moveSelectedItemsToTab, without selection mode.
  // Used if the game path fails, for the items it didn't move.
  function moveDirect(list, tab) {
    const b = bank();
    const dest = b.itemsByTab[tab];
    const moved = [];
    const from = new Set();
    for (const bankItem of [...list].sort((x, y) => x.tab - y.tab || x.tabPosition - y.tabPosition)) {
      const src = b.itemsByTab[bankItem.tab];
      const i = src.indexOf(bankItem);
      if (i < 0) continue;
      src.splice(i, 1);
      from.add(bankItem.tab);
      bankItem.tab = tab;
      bankItem.tabPosition = dest.length;
      dest.push(bankItem);
      moved.push(bankItem);
    }
    if (!moved.length) return;
    for (const t of from) {
      b.reassignBankItemPositions(t, 0);
      b.renderQueue.tabIcons.add(t);
    }
    b.renderQueue.tabIcons.add(tab);
    if (typeof bankTabMenu !== "undefined") bankTabMenu.moveIconsToNewTab(moved, tab);
    for (const bankItem of moved) b.defaultItemTabs.set(bankItem.item, tab);
    b.storeCustomSortOrder();
    b.renderQueue.bankValue = true;
  }

  function moveItemsToTab(list, tab) {
    if (tab >= tabCount()) return;
    try {
      moveWithGame(list, tab);
    } catch (e) {
      note(`moving items to tab ${tab}`, e);
      try {
        bank().setItemSelectionMode(NO_SELECTION);
      } catch (e2) {}
    }
    const left = list.filter((bankItem) => bankItem.tab !== tab);
    if (left.length) moveDirect(left, tab);
  }

  function sortOrder() {
    return game.settings?.bankSortOrder;
  }

  // Sorts each tab on its own by the bank sort setting.
  function sortBank() {
    bank().sortButtonOnClick();
  }

  function notify(message, theme = "success") {
    try {
      if (typeof imageNotify === "function") {
        imageNotify(assets.getURI("assets/media/main/bank_header.png"), message, theme);
        return;
      }
    } catch (e) {}
    console.log(`[Bank Layout] ${message}`);
  }

  // The first-run question. With a plan remembered on this device, offers it
  // or the built-in plan; resolves to "custom", "builtin" or "later".
  // Otherwise resolves to "builtin", "later" or "never".
  function firstRun(text, devicePlanName) {
    const swal = typeof SwalLocale !== "undefined" ? SwalLocale : globalThis.Swal;
    if (!swal) return Promise.resolve("later");
    const buttons = devicePlanName
      ? { confirmButtonText: `Use "${devicePlanName}"`, denyButtonText: "Use the built-in plan", cancelButtonText: "Not now" }
      : { confirmButtonText: "Apply", denyButtonText: "Don't ask again", cancelButtonText: "Not now" };
    return swal
      .fire({
        title: "Bank Layout",
        text,
        imageUrl: assets.getURI("assets/media/main/bank_header.png"),
        imageWidth: 64,
        imageHeight: 64,
        showCancelButton: true,
        showDenyButton: true,
        ...buttons
      })
      .then((r) => {
        const yes = r.isConfirmed || r.value === true;
        if (devicePlanName) return yes ? "custom" : r.isDenied ? "builtin" : "later";
        return yes ? "builtin" : r.isDenied ? "never" : "later";
      });
  }

  // ----------------------------------------------- the device's last plan

  // Each character keeps its plan in its own save. This device also
  // remembers the last plan used on it (packed, ~1kb), to offer to
  // characters that don't have one yet.
  const DEVICE_KEY = "bankLayout:lastPlan";

  function loadDevicePlan() {
    try {
      const text = localStorage.getItem(DEVICE_KEY);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      return null;
    }
  }

  function saveDevicePlan(packed) {
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(packed));
    } catch (e) {
      note("remembering the plan on this device", e);
    }
  }

  function forgetDevicePlan() {
    try {
      localStorage.removeItem(DEVICE_KEY);
    } catch (e) {}
  }

  function itemName(id) {
    return findItem(id)?.name ?? "";
  }

  function bankByID() {
    return bankItems().map((b) => ({ id: b.item.id, tab: b.tab }));
  }

  function defaultTabsByID() {
    const out = new Map();
    for (const [item, tab] of bank().defaultItemTabs) if (item?.id) out.set(item.id, tab);
    return out;
  }

  // ----------------------------------------------- dialogs

  const modal = () => (typeof SwalLocale !== "undefined" ? SwalLocale : globalThis.Swal);

  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    Object.assign(e, props);
    for (const c of [].concat(children)) e.append(c);
    return e;
  }

  function messageList(lines, className) {
    return el(
      "ul",
      { className: `text-left font-size-sm ${className}` },
      lines.map((l) => el("li", { textContent: l }))
    );
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  // Asks for a plan, pasted or from a file. `check(text)` returns a list of
  // errors, shown in the dialog so the player can fix them; the dialog closes
  // with the text once there are none. Resolves to the text, or null.
  function importDialog(check) {
    const swal = modal();
    if (!swal) return Promise.resolve(null);
    const text = el("textarea", {
      className: "form-control font-size-sm",
      rows: 8,
      placeholder: "item_id,tab\nmelvorD:Bronze_Dagger,1\n…"
    });
    const file = el("input", { type: "file", accept: ".csv,.json,.txt,text/csv,application/json,text/plain", className: "mt-2" });
    const body = el("div", {}, [
      el("p", { className: "font-size-sm", textContent: "Paste a plan (CSV or JSON), or choose a file. See the mod's documentation for the format." }),
      text,
      file
    ]);
    return swal
      .fire({
        title: "Import a plan",
        html: body,
        showCancelButton: true,
        confirmButtonText: "Check and continue",
        preConfirm: async () => {
          const value = file.files?.[0] ? await readFile(file.files[0]) : text.value;
          const errors = check(value);
          if (errors.length) {
            // Shown as HTML, and the errors quote the player's text.
            const escape = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
            swal.showValidationMessage(errors.map(escape).join("<br>"));
            return false;
          }
          return value;
        }
      })
      .then((r) => (r.isConfirmed && typeof r.value === "string" ? r.value : null));
  }

  // A yes/no question with optional lists of notes. Resolves to true or false.
  function ask({ title, text, notes = [], confirmText = "OK", danger = false }) {
    const swal = modal();
    if (!swal) return Promise.resolve(false);
    const body = el("div", {}, [el("p", { textContent: text })]);
    if (notes.length) body.append(messageList(notes, "text-warning"));
    return swal
      .fire({ title, html: body, showCancelButton: true, confirmButtonText: confirmText, ...(danger ? { confirmButtonColor: "#d33" } : {}) })
      .then((r) => r.isConfirmed === true || r.value === true);
  }

  async function copyText(textarea) {
    try {
      await navigator.clipboard.writeText(textarea.value);
      return true;
    } catch (e) {}
    try {
      textarea.select();
      return document.execCommand("copy");
    } catch (e) {
      return false;
    }
  }

  // Shows the plan as CSV, to download or copy.
  function exportDialog(csv, fileName) {
    const swal = modal();
    if (!swal) return Promise.resolve();
    const text = el("textarea", { className: "form-control font-size-sm", rows: 8, readOnly: true, value: csv });
    const body = el("div", {}, [
      el("p", {
        className: "font-size-sm",
        textContent: "Open it in a spreadsheet, change the tab column, and import it back. Tabs count from 1."
      }),
      text
    ]);
    return swal
      .fire({
        title: "Export the plan",
        html: body,
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: "Download",
        denyButtonText: "Copy",
        cancelButtonText: "Close"
      })
      .then(async (r) => {
        if (r.isConfirmed) {
          if (typeof downloadTextFile === "function") downloadTextFile(fileName, csv, "text/csv");
        } else if (r.isDenied) {
          notify((await copyText(text)) ? "Plan copied to the clipboard." : "Couldn't copy; select the text and copy it instead.", "info");
        }
      });
  }

  return {
    tabCount,
    findItem,
    bankItems,
    defaultTab,
    setDefaultTabs,
    moveItemsToTab,
    moveDirect,
    sortOrder,
    sortBank,
    notify,
    firstRun,
    loadDevicePlan,
    saveDevicePlan,
    forgetDevicePlan,
    itemName,
    bankByID,
    defaultTabsByID,
    importDialog,
    exportDialog,
    ask
  };
}
