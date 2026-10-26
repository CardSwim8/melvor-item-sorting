// Maintains data/item-index.json, the ordered item list that saved plans are
// packed against (see src/codec.mjs). IDs are only ever added at the end.
//
//   node scripts/item-index.mjs           add data/plan.json's new item IDs at the end
//   node scripts/item-index.mjs --check   fail if the list is broken or misses plan items
//   node scripts/item-index.mjs --release record the current length as released
//
// Run --release when publishing a version whose list grew, so later edits
// that would break plans saved with it are caught.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkIndex, prefixFingerprint } from "../src/codec.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const INDEX = `${root}data/item-index.json`;
const PLAN = `${root}data/plan.json`;

export function missingFromIndex(index, plan) {
  const have = new Set(index.ids);
  return Object.keys(plan.items).filter((id) => !have.has(id));
}

// One ID per line keeps diffs readable.
function write(index) {
  const lines = index.ids.map((id) => `    ${JSON.stringify(id)}`).join(",\n");
  const releases = index.releases.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
  writeFileSync(INDEX, `{\n  "note": ${JSON.stringify(index.note)},\n  "releases": [\n${releases}\n  ],\n  "ids": [\n${lines}\n  ]\n}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = JSON.parse(readFileSync(INDEX, "utf8"));
  const plan = JSON.parse(readFileSync(PLAN, "utf8"));
  const problems = checkIndex(index);
  if (problems.length) {
    console.error(`data/item-index.json is broken:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  const missing = missingFromIndex(index, plan);

  if (process.argv.includes("--check")) {
    if (missing.length) {
      console.error(`data/item-index.json lacks ${missing.length} plan items (${missing.slice(0, 3).join(", ")}...). Run: node scripts/item-index.mjs`);
      process.exit(1);
    }
    console.log(`data/item-index.json: ${index.ids.length} items, OK.`);
  } else if (process.argv.includes("--release")) {
    const last = index.releases.at(-1);
    if (last?.count === index.ids.length) console.log(`Already released at ${index.ids.length} items.`);
    else {
      index.releases.push({ count: index.ids.length, fingerprint: prefixFingerprint(index.ids, index.ids.length) });
      write(index);
      console.log(`Recorded a release of ${index.ids.length} items.`);
    }
  } else {
    index.ids.push(...missing);
    write(index);
    console.log(`Added ${missing.length} item IDs; the list now has ${index.ids.length}.`);
  }
}
