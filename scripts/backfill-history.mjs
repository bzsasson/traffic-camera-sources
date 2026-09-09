// One-off: rebuild data/uptime/history.csv and the dated snapshots from
// every version of data/uptime-summary.json in git history. Safe to re-run;
// recordSnapshot replaces rows per date. Run from the repo root:
//   node scripts/backfill-history.mjs
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordSnapshot, snapshotDate } from "./history.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "data/uptime-summary.json";

const shas = execFileSync("git", ["log", "--format=%H", "--reverse", "--", FILE], { cwd: ROOT })
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);

let written = 0;
for (const sha of shas) {
  const json = execFileSync("git", ["show", `${sha}:${FILE}`], { cwd: ROOT }).toString();
  const uptime = JSON.parse(json);
  const n = recordSnapshot(ROOT, uptime);
  console.log(`${sha.slice(0, 7)} ${snapshotDate(uptime)}: ${n} states`);
  written += n;
}
console.log(`backfilled ${shas.length} snapshots, ${written} rows`);
