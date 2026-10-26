// Packs a plan small enough to keep in a character's save (mod storage is
// capped at 8kb a character), and unpacks it. Pure, so it is tested without
// the game.
//
// Item IDs are most of a plan's size, so they aren't stored. The mod ships an
// ordered list of item IDs, data/item-index.json, and a packed plan is one
// byte per item in that order (its tab, or NOT_PLANNED), deflated and base64
// encoded. The list only ever grows at the end, so a plan packed with an
// older, shorter list still unpacks with a newer one. Items not in the list
// (other mods' items, say) are stored with their IDs.

import { deflateSync, inflateSync } from "fflate";

const FORMAT = 1;
const NOT_PLANNED = 255;

// FNV-1a, 32-bit: a short, stable fingerprint of some text.
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

export const prefixFingerprint = (ids, count) => fingerprint(ids.slice(0, count).join("\n"));

// Problems with data/item-index.json; empty means usable. Every released
// prefix of the list must be unchanged, or plans saved with it would unpack
// wrongly.
export function checkIndex(index) {
  const problems = [];
  if (!index || !Array.isArray(index.ids) || !Array.isArray(index.releases)) return ['needs "ids" and "releases" lists'];
  const seen = new Set();
  for (const id of index.ids) {
    if (seen.has(id)) problems.push(`${id} is listed twice`);
    seen.add(id);
  }
  for (const r of index.releases) {
    if (r.count > index.ids.length) problems.push(`release of ${r.count} items is longer than the list`);
    else if (prefixFingerprint(index.ids, r.count) !== r.fingerprint)
      problems.push(`the first ${r.count} IDs changed since they were released; only add IDs at the end`);
  }
  return problems;
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000));
  return btoa(s);
}

function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// The packed form: a small JSON-able object.
export function pack(plan, ids) {
  const position = new Map(ids.map((id, i) => [id, i]));
  const bytes = new Uint8Array(ids.length).fill(NOT_PLANNED);
  const extra = {};
  for (const [id, x] of Object.entries(plan.items)) {
    const i = position.get(id);
    if (i === undefined) extra[id] = x;
    else bytes[i] = x;
  }
  const packed = { f: FORMAT, n: ids.length, t: toBase64(deflateSync(bytes, { level: 9 })), tabs: plan.tabs, name: plan.name };
  if (Object.keys(extra).length) packed.x = extra;
  if (plan.extends) packed.e = plan.extends;
  return packed;
}

// Throws with a player-readable reason if the plan can't be read.
export function unpack(packed, ids) {
  if (!packed || packed.f !== FORMAT) throw new Error("it was saved in a format this version of Bank Layout doesn't know");
  if (packed.n > ids.length) throw new Error("it was saved by a newer version of Bank Layout");
  const bytes = inflateSync(fromBase64(packed.t));
  if (bytes.length !== packed.n) throw new Error("it is damaged");
  const items = {};
  for (let i = 0; i < bytes.length; i++) if (bytes[i] !== NOT_PLANNED) items[ids[i]] = bytes[i];
  Object.assign(items, packed.x ?? {});
  return { source: "custom", name: packed.name, extends: packed.e ?? null, tabs: packed.tabs, items };
}

// Bytes the packed plan takes in mod storage (key plus JSON, as the game counts).
export const storedSize = (key, packed) => key.length + JSON.stringify(packed).length;
