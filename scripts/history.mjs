// Uptime history: turn one live uptime report into a dated snapshot file
// and one CSV row per state, so the per-state reliability numbers become a
// time series instead of being overwritten every week.
//
// Each row also carries a quality flag derived from data/uptime/exclusions.json
// (added 2026-10-22, after the first nine weeks turned out to mix our own
// checker incidents and definition changes with agency reliability):
//   clean    the row's 14-day window touches no known window
//   affected our checker was the problem for part of the window (kind "ours")
//   method   the definition of live or of the fleet changed inside the window;
//            rows on either side are not comparable
//   agency   a known agency-side outage inside the window; the number is real
//            but not typical
//   partial  the window holds too few checks per camera to be a full fortnight
//            (a state's first weeks after wiring)
//   manual   a snapshot taken off the weekly schedule (not a Monday)
// Priority when several apply: affected > method > partial > manual > agency
// > clean. The note column names the reasons. Both columns are additive.
//
// Used by refresh.mjs (weekly) and backfill-history.mjs (rebuild from the
// snapshot files).
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
  "quality",
  "note",
];

// A full fortnight at the checker's cadence is well over this many checks
// per camera; a state in its first days after wiring sits far below it.
export const PARTIAL_CHECKS_PER_CAM = 20;
const WINDOW_DAYS = 14;

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

export function loadExclusions(root) {
  const path = join(root, "data", "uptime", "exclusions.json");
  if (!existsSync(path)) return { windows: [], caveats: [] };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return { windows: parsed.windows ?? [], caveats: parsed.caveats ?? [] };
}

const inScope = (scope, state) => scope === "all" || (Array.isArray(scope) && scope.includes(state));

// Quality flag and note for one state's row. `generatedAt` is the report's
// generation time; the window it summarizes is the 14 days before it.
export function qualityFor({ generatedAt, state, cams, checks }, exclusions) {
  const end = new Date(generatedAt);
  const start = new Date(end.getTime() - WINDOW_DAYS * 86400000);
  const reasons = [];
  const kinds = new Set();
  for (const w of exclusions.windows) {
    if (!inScope(w.scope, state)) continue;
    const from = new Date(w.from);
    const to = new Date(w.to);
    if (from <= end && to >= start) {
      kinds.add(w.kind);
      reasons.push(`${w.kind}: ${w.from.slice(0, 10)}..${w.to.slice(0, 10)}`);
    }
  }
  const isPartial = cams > 0 && checks / cams < PARTIAL_CHECKS_PER_CAM;
  if (isPartial) reasons.push("partial: fewer than 20 checks per camera in the window");
  const isManual = end.getUTCDay() !== 1; // the refresh runs on Mondays
  if (isManual) reasons.push("manual: snapshot taken off the weekly schedule");
  for (const c of exclusions.caveats) {
    if (inScope(c.scope, state)) reasons.push("caveat: see exclusions.json");
  }
  let quality = "clean";
  if (kinds.has("ours")) quality = "affected";
  else if (kinds.has("method")) quality = "method";
  else if (isPartial) quality = "partial";
  else if (isManual) quality = "manual";
  else if (kinds.has("agency")) quality = "agency";
  return { quality, note: reasons.join("; ") };
}

function rowsFor(uptime, exclusions) {
  const date = snapshotDate(uptime);
  return uptime.states.map((s) => {
    const state = String(s.state).replace(/[^A-Z]/g, "").slice(0, 2);
    const cams = num(s.cams);
    const checks = num(s.checks);
    const q = qualityFor({ generatedAt: uptime.generated_at, state, cams, checks }, exclusions);
    return {
      date,
      state,
      cams,
      live_now: num(s.live_now),
      stale_now: num(s.stale_now),
      dead_now: num(s.dead_now),
      live_now_pct: num(s.liveNowPct),
      checks_14d: checks,
      live_checks_14d: num(s.live_checks),
      stale_checks_14d: num(s.stale_checks),
      dead_checks_14d: num(s.dead_checks),
      error_checks_14d: num(s.error_checks),
      check_live_pct: num(s.checkLivePct),
      quality: q.quality,
      note: q.note,
    };
  });
}

// Minimal CSV: the note column is the only free text and never holds a
// comma or a quote (reasons are built from fixed phrases and dates).
function readCsv(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const header = lines.shift().split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function writeRows(csvPath, rows) {
  rows.sort((a, b) =>
    a.date === b.date ? (a.state < b.state ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
  const out = [HISTORY_COLUMNS.join(",")];
  for (const r of rows) out.push(HISTORY_COLUMNS.map((c) => r[c] ?? "").join(","));
  writeFileSync(csvPath, out.join("\n") + "\n");
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
  writeRows(csvPath, [...kept, ...rowsFor(uptime, loadExclusions(root))]);
  return uptime.states.length;
}

// Rebuilds history.csv from every snapshot file, recomputing the quality
// flags. Run after editing exclusions.json.
export function rebuildHistory(root, snapshots) {
  const exclusions = loadExclusions(root);
  const rows = snapshots.flatMap((u) => rowsFor(u, exclusions));
  writeRows(join(root, "data", "uptime", "history.csv"), rows);
  return rows.length;
}
