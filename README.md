# Bank Layout

A [Melvor Idle](https://melvoridle.com) mod that puts every item in a planned
bank tab, and makes new items land in the right tab too.

The plan gives each of the game's 3,710 bankable items one of 27 tabs
(Weapons: Melee, Armour: Melee, … Events & Novelties). With fewer than 27 tabs,
planned tabs past your last one wrap back onto the first ones: with 12 tabs,
Fishing (tab 12) shares tab 0 with Weapons: Melee. Buy a tab and the layout
re-applies by itself.

**You can use your own plan instead.** Save your bank as it is now as your
plan in one click, or export the plan to a spreadsheet, change the tabs, and
import it back. You can also change just a few items on top of the built-in
plan. Each character keeps its plan in its save, so it follows the save to
any device. See [Using your own bank plan](docs/custom-plans.md).

The mod makes no gameplay changes. It moves items with the game's own "Move
items to new tab" path and sets the game's own default tab for each item, so
new drops land correctly with no mod code running. Items the plan doesn't
cover, such as other mods' items, are left alone.

The first time a character loads, it asks before moving anything. After that
it only re-applies when you buy a tab or the plan is updated; items you move by
hand stay where you put them.

Settings (Mod Settings → Bank Layout): on/off, re-apply on new tabs and plan
changes, sort each tab after applying (Default sort order only), **Apply now**,
and the current status. Under **Your own plan**: use my bank as the plan,
export, import, and remove.

From the console: `mod.api.bankLayout.verify()` checks the bank matches the
layout; `mod.api.bankLayout.preview()` shows what would move;
`mod.api.bankLayout.apply()` applies. More in
[the custom plan guide](docs/custom-plans.md#console-commands).

Install it from mod.io through the in-game mod manager.

## Development

Requires Node 22 or newer (`.nvmrc` pins the version CI uses).

```sh
npm ci
npm run check    # lint, format check, tests, build: what CI runs
npm run build    # dist/mod/ and dist/bank-layout-v<version>.zip
npm run watch    # rebuild dist/mod/ on change
npm test
npm run format   # apply Prettier
```

The zip in `dist/` is exactly what is uploaded to mod.io: `manifest.json`,
`setup.mjs`, `icon.png` and `data/plan.json`.

Before a release, run the in-game checks in [docs/testing.md](docs/testing.md).

### Layout

| Path                   | What it is                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `src/main.mjs`         | Entry point: settings, the `Bank.addTabs` hook, when to apply, the console API.                    |
| `src/adapter.mjs`      | The only code that reads Melvor's globals. Game updates that break the mod usually land here.      |
| `src/codec.mjs`        | Packs a plan small enough for the character save (deflate against `data/item-index.json`).         |
| `src/plans.mjs`        | Pure logic for players' own plans: CSV/JSON import, CSV export, extending the built-in plan.       |
| `src/model.mjs`        | Pure logic: target tabs, what moves, when to apply, messages. Tested without the game.             |
| `src/manifest.json`    | Melvor mod manifest.                                                                               |
| `src/icon.png`         | The 64×64 icon the mod manager and sidebar show. Drawn from Melvor's own bank and item art.        |
| `assets/`              | The mod.io logo (`logo.png`, 1024×576, drawn from Melvor's own art; not in the zip).               |
| `data/plan.json`       | The plan: item ID → planned tab. Checked and minified into the build.                              |
| `data/item-index.json` | Append-only item order that saved plans are packed against. `npm run index` maintains it.          |
| `docs/design.md`       | The design this was built from.                                                                    |
| `docs/custom-plans.md` | Player guide to using their own plan, with the file formats. Linked from the mod's settings.       |
| `docs/examples/`       | Example plans; a test checks they import cleanly.                                                  |
| `scripts/`             | Build/package, item list upkeep, changelog extraction, mod.io upload.                              |
| `test/`                | `node:test` suites against a fake `Bank` that follows the game's v1.3.1 code, and the whole setup. |

### Updating the plan

Replace `data/plan.json` with a regenerated plan and give it a new
`planVersion`. Every character on the built-in plan re-applies on its next load
(if auto re-apply is on). The build refuses a plan whose tabs don't index into
`tabs`.

If the plan has new item IDs, run `npm run index` to append them to
`data/item-index.json`; the build fails until you do. Never reorder or remove
entries there: players' saved plans are packed against that order.

## Releasing

1. Add the player-facing notes under `## [x.y.z]` in `CHANGELOG.md`, one line per entry.
   If `data/item-index.json` grew, run `npm run index -- --release` and commit it, so later edits that would break plans saved with this version are caught.
2. `npm version x.y.z` bumps `package.json`, commits, and creates tag `vx.y.z`.
3. `git push --follow-tags`.

The **Release** workflow then checks that the tag matches `package.json`, runs
the full check, uploads the zip to mod.io as the current release with the
changelog section as its notes, and creates a GitHub Release with the same zip
and notes.

### mod.io credentials

Uploads use a mod.io OAuth 2 token stored in the repo's `mod.io` GitHub
environment. Create a token with **read + write** scope at
[mod.io/me/access](https://mod.io/me/access), then run `scripts/setup-modio.sh`
logged in to `gh` as the repo owner. Actions → Release → **Run workflow** checks
the credentials without uploading.

### The mod.io page

The page's name, summary, description and homepage link come from `modio/`
(`page.json`, `summary.txt`, `description.html`); the logo is
`assets/logo.png`. To publish changes to them:

1. Edit the files and push.
2. Actions → **Update mod.io page** → Run workflow, with **Dry run** ticked
   (the default). It shows what would change, and lists the tags Melvor Idle
   allows, if mod.io has a tag list for it.
3. Run it again with **Dry run** unticked. Tick **Also upload the logo** to
   replace the logo too.

To manage tags, add `"tags": ["…"]` to `modio/page.json` using names from
the dry run; the page's tags are then set to exactly that list. Without
`tags`, the page's tags are left alone. A test checks the summary fits
mod.io's 250 characters.

## License

[MIT](LICENSE)
