# Bank Layout mod: design

**Status:** ready to build, 2026-10-26.
**Target:** Melvor Idle v1.3.1, all platforms that support mods.
**Inputs in this project:**

- `data/plan.json`: the per-item tab plan.
- `bank-tab-sorting-approach.md`: research notes on how the game places items (not in this repo).

## 1. Goal

Apply a fixed per-item bank tab layout automatically:

- Every item lives in its planned tab.
- New items, including ones never seen before, arrive in the right tab.
- The layout keeps working while you own fewer than the 27 tabs the plan needs.

The mod makes **no gameplay changes**. It only rearranges the bank and sets the game's own "default tab" for each item.

## 2. How the game already works

The mod relies on these points, verified in `assets/js/built/bank2.js` for v1.3.1.

| Mechanism                                         | Detail                                                                                                                                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game.bank.defaultItemTabs: Map<AnyItem, number>` | Saved with the character. Holds each item's home tab.                                                                                                                                                                                         |
| `Bank.getItemDefaultTab(item)`                    | Returns `defaultItemTabs.get(item) ?? 0`.                                                                                                                                                                                                     |
| `Bank.addItem(...)`                               | When an item isn't already in the bank, it's created in `getItemDefaultTab(item)`. This covers brand-new items too.                                                                                                                           |
| `Bank.moveItemToNewTab(old, new, pos)`            | Moves the data only, with no UI update. It's used after a drag-and-drop, where the drag library has already moved the item on screen. It also sets `defaultItemTabs`.                                                                         |
| `Bank.moveSelectedItemsToTab(tabID)`              | The game's own "Move items to new tab" path. It moves the data, then calls `bankTabMenu.moveIconsToNewTab(...)` to update the UI and sets `defaultItemTabs`. It requires `itemSelectionMode === 1` (MoveItems) and uses `bank.selectedItems`. |
| `Bank.addTabs(qty)`                               | Called when you buy a tab. Pushes empty tabs and calls `bankTabMenu.updateTabCount`.                                                                                                                                                          |
| `Bank.sortButtonOnClick()`                        | Sorts **each tab separately** by the sort setting. On `Default` (0) it uses the game's built-in item order. On `Custom` (5) it uses `customSortOrder`, which the game rebuilds from the current layout after every move.                      |
| `Bank.tabCount`                                   | The number of tabs you own. Starts at 12, up to 22 with GP purchases and 27 with Into the Abyss purchases.                                                                                                                                    |

**Consequence:** once `defaultItemTabs` is filled in, new items land correctly with no code running. The mod's main job is to fill it in, fix the current layout, and redo both when the tab count changes.

## 3. Plan data (`bank-tab-plan.json`)

```json
{
  "planVersion": "06797e5ac77c",
  "gameVersion": "v1.3.1",
  "tabs": ["Weapons: Melee", "Armour: Melee", "...", "Events & Novelties"],
  "items": { "melvorD:Bronze_Dagger": 0, "melvorF:Boots_Of_Stealth": 10, "...": 0 }
}
```

- `tabs` has 27 names. Its index is the planned tab **X**, counting from 0.
- `items` maps every bankable item ID (3,710 of them) to X.
  - The 38 Golbin Raid–exclusive items are left out. They can never enter the bank.
- `planVersion` is a hash of the content. Changing the plan changes it, which triggers a re-apply (§5.3).
- Ship the file inside the mod as `data/plan.json` and load it with `ctx.loadData('data/plan.json')`.

## 4. Wrapping rule

For an item with planned tab X, the actual tab is **`X mod N`**, where N is `game.bank.tabCount`.

- With N ≥ 27, this is the plan unchanged.
- With fewer tabs, the planned tabs past the end wrap back onto the first ones. With N = 12:
  - Fishing (12) goes to Weapons: Melee (0).
  - Cooking (13) goes to Armour: Melee (1).
  - …
  - Chests (23) goes to Woodcutting & Firemaking (11).
  - Parts (24) goes to tab 0, Curios (25) to tab 1, Events (26) to tab 2.
- Items **not in the plan**, such as content from a later game version or other mods: **leave them alone**. Don't set `defaultItemTabs` for them. The game puts new ones in tab 0, its normal behaviour, and the player can move them by hand.

## 5. Behaviour

### 5.1 Lifecycle

- `setup(ctx)`:
  1. Load the plan.
  2. Register settings (§6).
  3. Patch `Bank.addTabs` (§5.3).
- `ctx.onCharacterLoaded(...)`: decide whether to apply (§5.3). The bank is loaded at this point, but its UI isn't shown yet.
- `ctx.onInterfaceReady(...)`: if an apply is pending, run it here, so the UI-updating calls (`bankTabMenu`) work.

### 5.2 `applyLayout({ sort })` algorithm

```
N = bank.tabCount
target(item) = plan.items[item.id] % N            // only for items in the plan

1. Set home tabs. For every item ID in the plan:
     item = game.items.getObjectByID(id); if (!item) continue    // e.g. expansion not owned
     bank.defaultItemTabs.set(item, target(item))

2. Group misplaced items by target tab. For each bankItem in bank.items.values():
     if item in plan and bankItem.tab !== target(item): moves[target].push(bankItem)

3. Move them with the game's own path, one target tab at a time:
     for (const [tab, list] of moves):
        bank.setItemSelectionMode(1)               // MoveItems
        bank.selectedItems.clear(); list.forEach(b => bank.selectedItems.add(b))
        bank.moveSelectedItemsToTab(tab)           // updates data and UI, sets defaultItemTabs, resets mode to 0
   If moveSelectedItemsToTab misbehaves when called from code (check this first; see §8), use this fallback:
     do the splices directly, as moveSelectedItemsToTab does, then call
     bankTabMenu.moveIconsToNewTab(movedItems, tab) and bank.renderQueue.bankValue = true.

4. If sort is on and game.settings.bankSortOrder === 0 (Default): bank.sortButtonOnClick()
   (On Custom sort, skip it and tell the player. A Custom sort ignores the planned order.)

5. Save { planVersion, tabCount: N, appliedAt } to ctx.characterStorage under "applied".
6. Show a toast with the number of items moved and N.
```

Notes:

- **Locked items** move normally. Locking only blocks selling.
- **Order within a tab** comes from the Default sort, which is the order the plan sheet uses.
- Step 1 covers every planned item, including ones not in the bank yet. That's what makes future drops land correctly.
- **Performance:** about 3.7k map writes and at most a few thousand moves. Group the moves by tab (step 3) to keep the number of UI calls to N or fewer.

### 5.3 When to apply automatically

Keep `applied = characterStorage.getItem('applied')`.

| Condition                                                                | Action                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| `applied` is missing (first run on this character)                       | Ask for confirmation in a modal (§7), then apply. |
| `applied.planVersion !== plan.planVersion` (plan updated)                | Apply, if the "Auto re-apply" setting is on.      |
| `applied.tabCount !== bank.tabCount` (bought a tab, or the save changed) | Apply, if the "Auto re-apply" setting is on.      |
| Otherwise                                                                | Do nothing. Manual moves are left alone.          |

`Bank.addTabs` patch: `ctx.patch(Bank, 'addTabs').after(() => { if (autoReapply) applyLayout({ sort: true }) })`. This handles buying a tab during play without a reload.

## 6. Settings (`ctx.settings.section('Bank Layout')`)

| name             | type       | default | purpose                                                                                      |
| ---------------- | ---------- | ------- | -------------------------------------------------------------------------------------------- |
| `enabled`        | switch     | `true`  | Master switch, per character. When off, nothing runs on load or on `addTabs`.                |
| `autoReapply`    | switch     | `true`  | Re-apply when the tab count or plan version changes (§5.3).                                  |
| `sortAfterApply` | switch     | `true`  | Run step 4.                                                                                  |
| `applyNow`       | button     | —       | Runs `applyLayout({ sort: sortAfterApply })` straight away.                                  |
| `status`         | label/hint | —       | Shows the plan version, N, and the time of the last apply. Updating the hint text is enough. |

Storage:

- **`characterStorage`** keeps the `applied` record. The layout is per character.
- **Settings** keep the user preferences. They are saved per character by default.

## 7. Messages to the player

- **First-run modal (SweetAlert, as other mods use):** "Bank Layout will move N items into the planned tabs and set default tabs for 3,710 items. Continue?" with Apply and Not now. "Not now" sets nothing and asks again on the next load. Settings also has a "Don't ask again" option.
- **Toast after an apply:** "Bank Layout: moved 412 items (27 tabs)."
- **Custom sort warning:** if `bankSortOrder === 5`, show a toast explaining that sorting was skipped.

## 8. Risks and checks before shipping

1. **`moveSelectedItemsToTab` called from code.**
   - Check that `setItemSelectionMode(1)` doesn't need the bank page to be open, and that it doesn't clear `selectedItems` after you've filled them. Fill `selectedItems` after setting the mode.
   - If it does need the page, use the direct-splice fallback in §5.2 step 3.
2. **Moving when the target tab doesn't exist.** Impossible by design, since `X mod N` < N. Keep a guard anyway: `if (tab >= bank.tabCount) continue`.
3. **Offline progress on load.** Items added during the offline catch-up land in their correct tab already (step 1 from the previous session) or in tab 0 (first run). The first-run apply fixes them.
4. **Another mod that changes `Bank`** (for example AutoSort). It should still work, since AutoSort only calls `sortButtonOnClick`. Test them together.
5. **Save-file growth.** `defaultItemTabs` grows to about 3.7k entries, roughly 3 bytes each when saved. Negligible.
6. **Uninstalling.** The layout and `defaultItemTabs` stay in the save. That's harmless and is the same state the player would reach by moving items by hand.

## 9. Package layout

```
bank-layout/
  manifest.json        { "namespace": "bankLayout", "setup": "setup.mjs", "icon": "icon.png" }
  setup.mjs            export async function setup(ctx) { ... }
  data/plan.json       the plan (from data/plan.json, minified)
  icon.png             any 64x64 bank-ish icon
```

- The manifest schema comes from the official typedefs (`Modding.ModManifest`). It has the fields `namespace`, `icon`, `setup` and `load`.
- `setup` must be a `.mjs` or `.js` module that exports `setup(ctx)`.
- The display name, version and description are set on mod.io, not in the manifest.

## 10. Test plan

Test on a **throwaway character or a backed-up save**. Export the save first (Settings → Import/Export).

1. **Fresh character, 12 tabs.** Apply.
   - Every planned item in the bank sits in `X mod 12`.
   - `defaultItemTabs.size` is about 3,710 for an account with every expansion.
2. **Never-seen item.** Add one from the console (`game.bank.addItemByID('melvorD:Rune_Platebody', 1, false, true)`). It lands in `1 mod N`.
3. **Buy a tab** (or use the console: `game.bank.addTabs(1)`).
   - It re-applies automatically.
   - The group for tab X = old N leaves tab 0 and moves to the new tab.
4. **Plan version change.** Edit `planVersion` in `data/plan.json`, then reload. It re-applies.
5. **Manual move survives.** Drag an item to another tab and reload. It stays put, because neither N nor the plan changed.
6. **Custom sort setting.** Apply. The move happens, the sort is skipped and a toast is shown.
7. **Expansions not owned.** Items from those IDs are skipped with no errors.
8. **Run alongside AutoSort.** No errors, and the order is still correct after new drops.

## 11. Deploying

- **Private use:**
  - Upload to mod.io as a hidden mod and subscribe from the in-game Mod Manager, or
  - Load it locally with the official Creator Toolkit mod (it supports local mod folders).
  - Check the current Creator Toolkit steps on the Melvor wiki under _Mod Creation_.
- **Public:** add a mod.io description stating that the layout is opinionated and generated from game data, and link the plan sheet.

## 12. Regenerating the plan after a game update

- The plan was generated from the game's data files (`assets/data/melvor*.json`) by property rules: slot, combat style, item type, owning skill, upgrade links, and variant/chain cohesion.
- New game content gets no planned tab until the plan is regenerated. Until then it falls back to tab 0 (§4).
- Regenerating means rerunning that classification and publishing a new `bank-tab-plan.json`. The new `planVersion` makes every character re-apply on the next load.

## 13. Players' own plans (added after 0.1.0's first draft)

- **Ways in:** players can replace or extend the built-in plan in three ways, all under Mod Settings → Your own plan:
  - "Use my bank as the plan" records the bank as it is.
  - Export the plan as CSV (with item names), edit it in a spreadsheet, then import it.
  - Import any CSV or JSON. `extends: builtin` keeps the built-in tab for unlisted items.
- **Storage:** each character keeps its plan in `characterStorage` under `plan`, which the game writes into the character save. Mod storage is capped at 8 KB, so the plan is packed (`src/codec.mjs`):
  - one byte per item, in the order of `data/item-index.json` (the tab, or 255 for "not planned"), deflated and base64-encoded;
  - items not in that list are stored with their IDs; tab names, the plan's name and `extends` are stored as they are.
  - Measured: the built-in plan packs to 104 bytes, 300 changed items to about 830 bytes, and every item in a random tab of 40 to 3.4 KB. Plans over 7.4 KB are refused with their size.
- **Item list:** `data/item-index.json` is append-only. Each packed plan records the list length it used, so an older plan unpacks with a newer list. `releases` records the fingerprint of each published prefix; the build and the tests fail if one changes. Maintained with `npm run index`.
- **Device offer:** `localStorage["bankLayout:lastPlan"]` keeps the last packed plan used on the device. A character without a plan is offered it at first run, as "Use \"X\"", "Use the built-in plan" or "Not now".
- **Versioning:** a custom plan's `planVersion` is a hash of its content, so editing it re-applies like a plan update. An extending plan's version also includes the built-in plan's version.
- **The `applied` record now includes `source`.** If a character was laid out with its own plan and that plan can't be read (for example, it was saved by a newer mod version), the mod does nothing on load and says so, rather than overwriting the layout with the built-in plan.
- **Player docs:** `docs/custom-plans.md`, linked from the settings.
