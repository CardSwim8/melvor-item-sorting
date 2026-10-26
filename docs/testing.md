# In-game checks

Run these before a release. The automated tests use a stand-in for the game's
bank; these confirm the real one behaves the same.

Use a throwaway character, or **export your save first** (Settings →
Import/Export → Export). Open the browser console with F12 (Steam: F12 or
Ctrl/Cmd+Shift+I). Every check ends with:

```js
mod.api.bankLayout.verify();
```

which should print `ok: true`, an empty `misplaced` list and `wrongDefaults: 0`.

| #   | Do                                                                                                 | Expect                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Load the character with the mod on.                                                                | A "Bank Layout will move N items…" prompt. Click **Apply**. A toast says how many moved; `verify()` is ok.     |
| 2   | `game.bank.addItemByID('melvorD:Rune_Platebody', 1, false, true)` (sell it first if you have one). | It lands in tab `1 % tabs` (tab 1, Armour: Melee). `verify()` is ok.                                           |
| 3   | `game.bank.addTabs(1)` (a free tab: throwaway saves only), or buy a tab in the shop.               | A toast; items planned for the new tab move into it. `verify()` is ok; `game.bank.tabCount` is one higher.     |
| 4   | Drag one item to another tab, then reload.                                                         | No prompt, no toast; the item stays where you put it. `verify()` names it in `misplaced`.                      |
| 5   | Settings → Bank Layout → **Apply now**.                                                            | The item from step 4 moves back; `verify()` is ok.                                                             |
| 6   | Bank settings: sort order **Custom**. Apply now.                                                   | Two toasts: the move count, then "Custom sort is on…". Set the sort order back.                                |
| 7   | With AutoSort (or another bank mod) also on: reload, kill a few monsters, open a chest.            | No console errors; new drops land in their planned tabs.                                                       |
| 8   | A character without every expansion, if you have one.                                              | No errors on Apply; `mod.api.bankLayout.preview().missing` is the number of plan items that game doesn't have. |
| 9   | Mobile or a narrow window: open the bank, select an item, then Apply now.                          | The item is deselected and the move-items bar doesn't stay open.                                               |

Your own plan (Mod Settings → Bank Layout → Your own plan):

| #   | Do                                                                                                         | Expect                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 10  | Drag a few items to other tabs. **Use my bank as the plan**. Reload.                                       | No prompt or moves on reload; the status line says `Custom plan "My bank layout"`; `verify()` is ok.           |
| 11  | **Export plan** → Download. Then Export plan → Copy, and paste into a spreadsheet.                         | The download saves `bank-layout-plan.csv` (on Steam, check that a file appears); the paste fills four columns. |
| 12  | In the sheet, change a few `tab` numbers, save as CSV, **Import plan** with the file.                      | A summary, then the items move. `verify()` is ok.                                                              |
| 13  | Import `docs/examples/gems-and-bones.csv` with 12 tabs.                                                    | Gems go to tab 28 → tab 4 (28 wraps: 27 % 12 = 3, the 4th tab); everything else follows the built-in plan.     |
| 14  | Import text with a mistake (`melvorD:Bronze_Dagger,0`).                                                    | The dialog stays open and names line 1.                                                                        |
| 15  | **Remove my plan**.                                                                                        | Back to the built-in layout; `verify()` is ok.                                                                 |
| 16  | Import a plan, then load the same save on another device or browser (cloud save, or Export → Import save). | No prompt or moves; the status line names the plan. Buying a tab there re-applies with it.                     |
| 17  | Start a new character on the device from step 12.                                                          | First-run offers `Use "<your plan>"` or the built-in plan. Either way `verify()` is ok afterwards.             |
| 18  | Export plan, then import that same file (a full 3,710-item plan).                                          | No "Nearing total character storage" warning in the console.                                                   |

If something fails, copy the console output (anything starting with
`[Bank Layout]`) and the `verify()` result.
