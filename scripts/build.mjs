// Builds the mod into dist/ and packages it as the zip mod.io serves.
//
//   node scripts/build.mjs            bundle + zip
//   node scripts/build.mjs --watch    rebuild dist/mod on change (no zip)

import { build, context } from "esbuild";
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlan } from "../src/model.mjs";
import { checkIndex } from "../src/codec.mjs";
import { missingFromIndex } from "./item-index.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");
const dist = join(root, "dist");
const out = join(dist, "mod");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));

// Where the plan and the item list sit in the mod; main.mjs loads them with
// ctx.loadData.
const PLAN = "data/plan.json";
const INDEX = "data/item-index.json";

// Files copied as-is next to the bundle. Every file the manifest names must
// end up in the zip, which validateManifest checks.
const STATIC = ["manifest.json", "icon.png"];

const options = {
  entryPoints: [join(src, "main.mjs")],
  outfile: join(out, manifest.setup),
  bundle: true,
  format: "esm",
  // Melvor runs in Steam's Electron, browsers, and mobile webviews. Same
  // target as Task Keeper; raise it deliberately, not by accident.
  target: "chrome58",
  charset: "ascii",
  logLevel: "info"
};

// The plan and item list are checked, then written without whitespace. The
// mod only needs the list's IDs.
function copyPlan() {
  const plan = JSON.parse(readFileSync(join(root, PLAN), "utf8"));
  const problems = validatePlan(plan);
  if (problems.length) throw new Error(`${PLAN} is not a valid plan:\n  ${problems.join("\n  ")}`);
  const index = JSON.parse(readFileSync(join(root, INDEX), "utf8"));
  const broken = checkIndex(index);
  if (broken.length) throw new Error(`${INDEX} is broken:\n  ${broken.join("\n  ")}`);
  const missing = missingFromIndex(index, plan);
  if (missing.length) throw new Error(`${INDEX} lacks ${missing.length} plan items. Run: node scripts/item-index.mjs`);
  mkdirSync(dirname(join(out, PLAN)), { recursive: true });
  writeFileSync(join(out, PLAN), JSON.stringify(plan));
  writeFileSync(join(out, INDEX), JSON.stringify({ ids: index.ids }));
}

function copyStatic() {
  for (const f of STATIC) cpSync(join(src, f), join(out, f));
  copyPlan();
}

function validateManifest() {
  const required = [manifest.setup, ...(manifest.load ?? []), manifest.icon].filter(Boolean);
  const missing = required.filter((f) => !existsSync(join(out, f)));
  if (missing.length) throw new Error(`manifest.json names files missing from the build: ${missing.join(", ")}`);
  if (!manifest.namespace) throw new Error("manifest.json has no namespace");
}

// Fixed timestamps so the same source always produces the same zip bytes.
// Zip stores local time, so the date is built in local time too; a UTC date
// would give different bytes in different timezones.
function makeZip() {
  const files = {};
  for (const f of [manifest.setup, ...STATIC, PLAN, INDEX]) {
    files[f] = [readFileSync(join(out, f)), { mtime: new Date(2000, 0, 1) }];
  }
  const zip = zipSync(files, { level: 9 });
  const name = `bank-layout-v${pkg.version}.zip`;
  writeFileSync(join(dist, name), zip);
  const md5 = createHash("md5").update(zip).digest("hex");
  console.log(`\n  dist/${name}  ${(zip.length / 1024).toFixed(1)}kb  md5 ${md5}`);
}

if (process.argv.includes("--watch")) {
  mkdirSync(out, { recursive: true });
  copyStatic();
  const ctx = await context({
    ...options,
    plugins: [{ name: "static", setup: (b) => b.onEnd(copyStatic) }]
  });
  await ctx.watch();
} else {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await build(options);
  copyStatic();
  validateManifest();
  makeZip();
}
