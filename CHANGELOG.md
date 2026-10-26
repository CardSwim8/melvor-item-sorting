# Changelog

All notable changes to Bank Layout. The section for a version becomes its
release notes on GitHub and its changelog on mod.io, so write it for players.
mod.io shows it as plain text: keep each entry on one line.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

- First release: moves every item into its planned bank tab (27 tabs, wrapped onto the tabs you own) and sets each item's default tab so new drops land there too.
- Asks before the first apply on each character; re-applies when you buy a tab or the plan updates.
- Settings: on/off, auto re-apply, sort after applying, Apply now, and a status line.
- Use your own plan: save your current bank as your plan, or export the plan as a spreadsheet (CSV), edit it, and import it back. Plans can also change just a few items on top of the built-in one. Each character's plan is kept in its save, so it follows the save to any device; new characters are offered the last plan you used.
- Console: mod.api.bankLayout.verify() checks the bank matches the layout.
