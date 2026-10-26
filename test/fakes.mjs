// A stand-in for the game's Bank, following v1.3.1's bank2.js for the parts
// the mod uses: tabs, default tabs, selection mode, moving and adding items.
// UI calls are recorded on `ui` instead of touching a DOM.

export const item = (id) => ({ id, name: id.split(":")[1] });

export class FakeBank {
  constructor(registry, tabCount = 12) {
    this.registry = registry;
    this.items = new Map();
    this.itemsByTab = Array.from({ length: tabCount }, () => []);
    this.defaultItemTabs = new Map();
    this.itemSelectionMode = 0;
    this.selectedItems = new Set();
    this.selectedBankItem = undefined;
    this.customSortOrder = [];
    this.renderQueue = { tabIcons: new Set(), bankValue: false };
    this.ui = [];
    this.sorted = 0;
  }

  get tabCount() {
    return this.itemsByTab.length;
  }

  getItemDefaultTab(item) {
    return this.defaultItemTabs.get(item) ?? 0;
  }

  addItemByID(id) {
    const item = this.registry.get(id);
    if (this.items.has(item)) return this.items.get(item);
    const tab = this.getItemDefaultTab(item);
    const bankItem = { item, quantity: 1, tab, tabPosition: this.itemsByTab[tab].length };
    this.items.set(item, bankItem);
    this.itemsByTab[tab].push(bankItem);
    return bankItem;
  }

  addTabs(quantity) {
    for (let i = 0; i < quantity; i++) this.itemsByTab.push([]);
    this.ui.push(["updateTabCount", this.tabCount]);
  }

  reassignBankItemPositions(tabID, startingPosition) {
    const tab = this.itemsByTab[tabID];
    for (let p = startingPosition; p < tab.length; p++) tab[p].tabPosition = p;
  }

  setItemSelectionMode(mode) {
    if (mode === this.itemSelectionMode) return;
    if (this.itemSelectionMode !== 0) this.selectedItems.clear();
    this.itemSelectionMode = mode;
    this.ui.push(["selectionMode", mode]);
  }

  moveSelectedItemsToTab(newTabID) {
    if (this.itemSelectionMode !== 1) return;
    const byTab = new Map();
    this.selectedItems.forEach((b) => {
      if (b.tab === newTabID) return;
      if (!byTab.has(b.tab)) byTab.set(b.tab, []);
      byTab.get(b.tab).push(b);
    });
    const dest = this.itemsByTab[newTabID];
    const moved = [];
    byTab.forEach((arr, tabID) => {
      const src = this.itemsByTab[tabID];
      arr.sort((a, b) => a.tabPosition - b.tabPosition);
      const lowest = arr[0].tabPosition;
      let removed = 0;
      arr.forEach((b) => {
        const r = src.splice(b.tabPosition - removed, 1);
        r[0].tab = newTabID;
        r[0].tabPosition = dest.length;
        dest.push(...r);
        moved.push(...r);
        removed++;
      });
      this.reassignBankItemPositions(tabID, lowest);
    });
    this.ui.push(["moveIconsToNewTab", moved.length, newTabID]);
    moved.forEach(({ item }) => this.defaultItemTabs.set(item, newTabID));
    this.storeCustomSortOrder();
    this.setItemSelectionMode(0);
    this.renderQueue.bankValue = true;
  }

  storeCustomSortOrder() {}

  sortButtonOnClick() {
    this.sorted++;
  }

  // Checks the invariants the game relies on: every bank item sits at its
  // recorded tab and position.
  check() {
    this.itemsByTab.forEach((tab, t) =>
      tab.forEach((b, p) => {
        if (b.tab !== t || b.tabPosition !== p) throw new Error(`${b.item.id} says ${b.tab}/${b.tabPosition}, is at ${t}/${p}`);
      })
    );
    let n = 0;
    this.itemsByTab.forEach((tab) => (n += tab.length));
    if (n !== this.items.size) throw new Error(`items map has ${this.items.size}, tabs hold ${n}`);
  }
}

// A fake `game` whose items registry holds the given IDs.
export function fakeGame(ids, tabCount = 12) {
  const registry = new Map(ids.map((id) => [id, item(id)]));
  const bank = new FakeBank(registry, tabCount);
  return {
    items: { getObjectByID: (id) => registry.get(id) },
    bank,
    settings: { bankSortOrder: 0 }
  };
}
