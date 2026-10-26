# Using your own bank plan

Bank Layout comes with a built-in plan that sorts every item into one of 27
tabs. If you'd rather lay out your bank your own way, you can give the mod
your own plan. The mod then keeps your bank in **your** layout: it moves items
into your tabs, and new items you get land in the right tab automatically.

Everything here is in **Mod Settings → Bank Layout → Your own plan**.

- [What a plan is](#what-a-plan-is)
- [Three ways to make a plan](#three-ways-to-make-a-plan)
  - [1. Use your bank as it is](#1-use-your-bank-as-it-is)
  - [2. Export, edit in a spreadsheet, import](#2-export-edit-in-a-spreadsheet-import)
  - [3. Change only a few items](#3-change-only-a-few-items)
- [Where your plan is kept](#where-your-plan-is-kept)
- [Going back to the built-in plan](#going-back-to-the-built-in-plan)
- [File format reference](#file-format-reference)
- [Finding item IDs](#finding-item-ids)
- [Troubleshooting](#troubleshooting)
- [Console commands](#console-commands)

## What a plan is

A plan is a list that says which bank tab each item belongs in:

| item_id               | tab | tab_name       |
| --------------------- | --- | -------------- |
| melvorD:Bronze_Dagger | 1   | Weapons: Melee |
| melvorD:Raw_Shrimp    | 13  | Fishing        |

- **Tabs count from 1.** Tab 1 is the leftmost tab in your bank.
- **Items not in your plan are left alone.** They stay wherever they are.
- **A plan can have more tabs than you own.** If an item's tab is past your
  last tab, it wraps around to the start. With 12 tabs, tab 13 goes to tab 1,
  tab 14 to tab 2, and so on. When you buy another tab, the mod re-applies and
  those items move into the new tab.
- **Order inside a tab** comes from the game's own sort, not from the plan.
  With your bank's sort order set to Default, the mod sorts each tab after
  applying. Turn this off with "Sort each tab after applying".

## Three ways to make a plan

### 1. Use your bank as it is

The quickest way, and no files are involved.

1. Arrange your bank how you like it, by dragging items between tabs.
2. Go to Mod Settings → Bank Layout → Your own plan.
3. Press **Use my bank as the plan**, then **Use my bank**.

Every item keeps the tab it's in now. Items you don't have yet keep their
default tab: the tab the game would already have put them in. From then on,
new items land in those tabs.

This doesn't re-sort your tabs, so the order you arranged inside each tab
stays as it is.

### 2. Export, edit in a spreadsheet, import

Best for a big reorganisation. You start from the full list of every item, with
names.

1. Press **Export plan**. You get the plan in use as a CSV file, which is a
   spreadsheet file. Press **Download** to save it, or **Copy** to copy it and
   paste it into a spreadsheet.
2. Open it in Excel, Google Sheets, Numbers or LibreOffice. It has four
   columns:
   - `item_id`: which item. **Don't change these.**
   - `tab`: the tab the item goes in, counting from 1. **This is what you edit.**
   - `tab_name`: a name for the tab, for your own reference. The game doesn't
     show it.
   - `item_name`: the item's name, so you can tell what each row is. Ignored on
     import.
3. Change the `tab` numbers. Sorting the sheet by `tab_name` or `item_name`, or
   filtering it, makes this easier. You can delete rows: those items will be
   left alone.
4. Save it as **CSV** (File → Save As / Download → CSV).
5. Press **Import plan**. Paste the file's contents into the box, or choose
   the file, then press **Check and continue**.
6. If anything is wrong, the dialog lists the problems with line numbers. Fix
   them and try again.
7. Otherwise it shows how many items and tabs the plan has, plus any warnings.
   Press **Use and apply**.

> Spreadsheet tip: the first lines of the file start with `#`, such as
> `# name: Built-in`. These name your plan. You can change the name, or delete
> those lines.

### 3. Change only a few items

You can keep the built-in plan and change just some items. Make a CSV with only
those items and add the line `# extends: builtin` at the top. Every item you
don't list keeps its built-in tab.

```csv
# name: Built-in, plus a Gems tab
# extends: builtin
item_id,tab,tab_name
melvorD:Topaz,28,Gems
melvorD:Sapphire,28,Gems
melvorD:Ruby,28,Gems
```

The built-in plan uses tabs 1–27, so this example adds a 28th tab. If you own
fewer tabs, tab 28 wraps around like any other.

Two complete examples:

- [examples/gems-and-bones.csv](examples/gems-and-bones.csv) adds Gems and
  Bones tabs to the built-in plan.
- [examples/small-bank.csv](examples/small-bank.csv) is a small plan from
  scratch.

A plan with `# extends: builtin` also picks up updates to the built-in plan
when the mod updates.

## Where your plan is kept

**Each character keeps its own plan in its save.** The plan goes wherever the
save goes: cloud saves, exported saves, and every device you play on.

- **New characters** are offered the last plan you used on this device the
  first time they load. Choose **Use "your plan"**, **Use the built-in plan**,
  or **Not now**.
  - On another device, a new character is offered the built-in plan. To bring
    your plan there, export it from a character that has it, and import it on
    the new character.
- **Changing a character's plan** (importing, or Use my bank as the plan)
  changes only that character. To give several characters the same plan,
  import the same file on each.
- **Saves are small.** A plan is packed to between about 100 bytes and 4 KB.
  Mods may keep 8 KB per character, so almost any plan fits. If one doesn't,
  the mod tells you its size and nothing changes. That only happens with
  hundreds of items from other mods, which are stored with their full names.
- **Updating the mod** keeps your plan readable. If you load a save in an
  _older_ version of the mod than the one that saved its plan, the mod changes
  nothing until you update, and tells you so.

## Going back to the built-in plan

Press **Remove my plan**. The plan is removed from this character and the
built-in plan is applied straight away. New characters on this device stop
being offered it.

Export your plan first if you might want it back.

## File format reference

The mod reads two formats. It decides which by the first character: `{` means
JSON, anything else means CSV.

### CSV

```csv
# name: My plan
# extends: builtin
item_id,tab,tab_name,item_name
melvorD:Bronze_Dagger,1,Weapons,Bronze Dagger
melvorD:Raw_Shrimp,3,"Fish, raw and cooked",Raw Shrimp
```

| Part                 | Rules                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `# name: …`          | Optional. The plan's name, shown in the settings.                                                                                                |
| `# extends: builtin` | Optional. Items not listed keep their built-in tab.                                                                                              |
| Other `#` lines      | Comments; ignored. Blank lines are ignored too.                                                                                                  |
| Header row           | Optional. If present it must include `item_id` and `tab`; columns can be in any order. Without a header, the columns are `item_id,tab,tab_name`. |
| `item_id`            | Required. The item's full ID: `namespace:Name`, such as `melvorD:Bronze_Dagger`. Capitals matter.                                                |
| `tab`                | Required. A whole number from **1** to 255.                                                                                                      |
| `tab_name`           | Optional. If one tab gets two different names, the first one is used.                                                                            |
| Other columns        | Ignored, `item_name` included.                                                                                                                   |
| Quotes               | A value containing a comma or quote goes in double quotes, with any quote inside doubled: `"Fish, ""fresh"""`. Spreadsheets do this for you.     |
| Repeats              | If an item appears twice, the later line wins, and you get a warning.                                                                            |

### JSON

The same format as the built-in plan file, `data/plan.json`. **Tabs count from
0** here.

```json
{
  "name": "My plan",
  "extends": "builtin",
  "tabs": ["Weapons", "Armour", "Fish"],
  "items": {
    "melvorD:Bronze_Dagger": 0,
    "melvorD:Raw_Shrimp": 2
  }
}
```

| Field     | Rules                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| `items`   | Required. Item ID → tab, counting from 0 (0–254).                                                             |
| `tabs`    | Optional tab names. If given, every tab number in `items` must have a name.                                   |
| `name`    | Optional.                                                                                                     |
| `extends` | Optional. `"builtin"`, or left out.                                                                           |
| Others    | Ignored, such as `planVersion` and `note` in the built-in file. The mod works out a version from the content. |

You can import the built-in `data/plan.json` itself, edited or not.

### What the mod checks

- **Errors stop the import**, and you fix them in the dialog:
  - text that isn't an item ID;
  - a tab number that isn't a whole number in range;
  - JSON that can't be read;
  - a plan with no items.
- **Warnings let you continue.** The main one is an item ID the game doesn't
  have. It's usually a typo, but it might be an item from an expansion or mod
  you don't own. Those lines are kept, in case you use the plan somewhere they
  exist, and skipped here.

## Finding item IDs

- **Export plan** lists every item the built-in plan covers, all 3,710 of
  them, with names. That's the easiest place to look one up.
- In the console (see below), with the item selected in your bank:
  `game.bank.selectedBankItem.item.id`
- Every item: `game.items.allObjects.map((i) => i.id + "  " + i.name).join("\n")`

IDs start with a namespace:

| Namespace    | Content              |
| ------------ | -------------------- |
| `melvorD`    | Base game            |
| `melvorF`    | Base game (full)     |
| `melvorTotH` | Throne of the Herald |
| `melvorAoD`  | Atlas of Discovery   |
| `melvorItA`  | Into the Abyss       |

Other mods use their own namespace.

## Troubleshooting

| Problem                                                     | Why, and what to do                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "isn't an item ID like melvorD:Bronze_Dagger"               | The `item_id` column has a name ("Bronze Dagger") or is missing its namespace. Use the ID from an export.                                          |
| "tab "0" … must be a whole number from 1"                   | CSV tabs count from 1. If you converted from JSON, add 1 to every tab.                                                                             |
| "N item IDs aren't items in this game"                      | Typos, or items from an expansion or mod you don't have. Check the listed IDs; the rest of the plan is fine.                                       |
| An item didn't move                                         | Either it isn't in your plan (check the export), or you moved it by hand after the last apply. Press **Apply now**.                                |
| Items are in the right tabs but in a jumbled order          | Set your bank's sort order to Default and press Apply now, or sort the bank yourself.                                                              |
| "this character's own plan couldn't be read"                | The save's plan was made by a newer version of Bank Layout. Update the mod. Or import the plan again, or press Apply now to use the built-in plan. |
| Download does nothing                                       | Some platforms block downloads. Use **Copy** instead, and paste into a spreadsheet or text file.                                                   |
| "this plan needs …kb, more than … a mod can keep in a save" | The plan lists hundreds of items the mod doesn't know (other mods' items take far more space). Leave some out, or use fewer of them.               |
| Another character doesn't use my plan                       | Plans belong to one character. Import it on that character too (export it from one that has it first).                                             |

## Console commands

Open the console with F12, or Ctrl/Cmd+Shift+I in the Steam app.

```js
mod.api.bankLayout.plan(); // the plan in use
mod.api.bankLayout.exportPlan(); // the plan in use, as CSV text
mod.api.bankLayout.importPlan(text); // use a plan (CSV or JSON text) and apply it; returns warnings, throws on errors
mod.api.bankLayout.removeCustomPlan(); // back to the built-in plan, applied now
mod.api.bankLayout.preview(); // what Apply now would move
mod.api.bankLayout.verify(); // does the bank match the plan?
```

## Changing the built-in plan (mod developers)

The built-in plan is `data/plan.json` in this repository, in the JSON format
above plus a `planVersion`.

To ship a different default:

1. Replace that file.
2. Change its `planVersion`.
3. Build with `npm run build`.

Every character on the built-in plan re-applies on its next load. Characters
with their own plan keep using it; plans that use `# extends: builtin`
re-apply on top of the new built-in plan.

If the new plan has items the old one didn't, run `npm run index` to add them
to `data/item-index.json` (the build fails until you do), and
`npm run index -- --release` when you publish. That list fixes the order saved
plans are packed in, so items are only ever added at its end.
