// Rebuild data/uptime/history.csv from the snapshot files, recomputing the
// quality flags from data/uptime/exclusions.json. Safe to re-run; run it
// after editing exclusions.json. From the repo root:
//   node scripts/backfill-history.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildHistory, snapshotDate } from "./history.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "uptime", "snapshots");

const snapshots = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));

for (const u of snapshots) console.log(`${snapshotDate(u)}: ${u.states.length} states`);
console.log(`rebuilt history.csv: ${rebuildHistory(ROOT, snapshots)} rows from ${snapshots.length} snapshots`);
