// Uptime history: turn one live uptime report into a dated snapshot file
// and one CSV row per state, so the per-state reliability numbers become a
// time series instead of being overwritten every week.
//
// Used by refresh.mjs (weekly) and backfill-history.mjs (one-off, from git).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const HISTORY_COLUMNS = [
  "date",
  "state",
  "cams",
  "live_now",
  "stale_now",
  "dead_now",
  "live_now_pct",
  "checks_14d",
  "live_checks_14d",
  "stale_checks_14d",
  "dead_checks_14d",
  "error_checks_14d",
  "check_live_pct",
];

const num = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`non-numeric uptime value: ${JSON.stringify(v)}`);
  return n;
};

// The report's generation date (UTC), which names the snapshot and keys
// the CSV rows.
export function snapshotDate(uptime) {
  const d = new Date(uptime.generated_at);
  if (Number.isNaN(d.getTime())) throw new Error(`bad generated_at: ${uptime.generated_at}`);
  return d.toISOString().slice(0, 10);
}

function rowsFor(uptime) {
  const date = snapshotDate(uptime);
  return uptime.states.map((s) => ({
    date,
    state: String(s.state).replace(/[^A-Z]/g, "").slice(0, 2),
    cams: num(s.cams),
    live_now: num(s.live_now),
    stale_now: num(s.stale_now),
    dead_now: num(s.dead_now),
    live_now_pct: num(s.liveNowPct),
    checks_14d: num(s.checks),
    live_checks_14d: num(s.live_checks),
    stale_checks_14d: num(s.stale_checks),
    dead_checks_14d: num(s.dead_checks),
    error_checks_14d: num(s.error_checks),
    check_live_pct: num(s.checkLivePct),
  }));
}

function readCsv(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const header = lines.shift().split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

// Writes data/uptime/snapshots/<date>.json and merges the report's rows
// into data/uptime/history.csv. Re-running for the same date replaces that
// date's rows, so a re-run never duplicates. Returns the number of rows
// written for this date.
export function recordSnapshot(root, uptime) {
  const dir = join(root, "data", "uptime");
  mkdirSync(join(dir, "snapshots"), { recursive: true });
  const date = snapshotDate(uptime);
  writeFileSync(join(dir, "snapshots", `${date}.json`), JSON.stringify(uptime, null, 2) + "\n");

  const csvPath = join(dir, "history.csv");
  const kept = readCsv(csvPath).filter((r) => r.date !== date);
  const rows = [...kept, ...rowsFor(uptime)].sort((a, b) =>
    a.date === b.date ? (a.state < b.state ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
  const out = [HISTORY_COLUMNS.join(",")];
  for (const r of rows) out.push(HISTORY_COLUMNS.map((c) => r[c]).join(","));
  writeFileSync(csvPath, out.join("\n") + "\n");
  return uptime.states.length;
}
