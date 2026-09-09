// Refresh the generated data files and the per-state doc pages from the
// livetrafficcam.com public API. No dependencies; run with `node scripts/refresh.mjs`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordSnapshot, snapshotDate } from "./history.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://livetrafficcam.com";
const UA = "traffic-camera-sources-refresh (+https://github.com/bzsasson/traffic-camera-sources)";

// The API returns at most this many cameras per query. cameras.geojson is
// therefore a sample for large states; full counts live in uptime-summary.json.
const API_ROW_CAP = 200;

const STATES = {
  AK: "alaska", AZ: "arizona", CA: "california", GA: "georgia", HI: "hawaii",
  IA: "iowa", NV: "nevada", UT: "utah", WA: "washington", WI: "wisconsin",
};

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Uptime summary: verbatim copy of the live report JSON.
const uptime = await getJson(`${SITE}/reports/camera-uptime.json`);
writeFileSync(
  join(ROOT, "data", "uptime-summary.json"),
  JSON.stringify(uptime, null, 2) + "\n",
);
console.log(`uptime-summary.json: ${uptime.states.length} states`);

// 1b. Uptime history: keep this week's report as a dated snapshot and add
// one row per state to the CSV time series (data/uptime/).
console.log(`uptime history: ${recordSnapshot(ROOT, uptime)} rows for ${snapshotDate(uptime)}`);

// 2. Camera locations as GeoJSON, one query per covered state.
const features = [];
const perState = {};
for (const [code] of Object.entries(STATES)) {
  const { cams } = await getJson(`${SITE}/api/cams.json?state=${code}`);
  perState[code] = cams.length;
  for (const cam of cams) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cam.lng, cam.lat] },
      properties: {
        id: cam.id,
        name: cam.name,
        slug: cam.slug,
        route: cam.route,
        state: cam.state,
        live_status: cam.live_status,
        last_live_at: cam.last_live_at,
        official_url: cam.official_url,
        attribution: cam.attribution,
        state_page: `${SITE}/traffic-cameras/${STATES[cam.state] ?? ""}/`,
      },
    });
  }
  await sleep(1000);
}
const geojson = {
  type: "FeatureCollection",
  note:
    `Sample of up to ${API_ROW_CAP} cameras per state (the source API caps ` +
    `each query at ${API_ROW_CAP} rows). Full per-state fleet counts are in ` +
    `uptime-summary.json. Camera records carry the attribution of the ` +
    `operating agency.`,
  generated_at: new Date().toISOString(),
  source: `${SITE}/api/cams.json`,
  features,
};
writeFileSync(
  join(ROOT, "data", "cameras.geojson"),
  JSON.stringify(geojson, null, 2) + "\n",
);
console.log(`cameras.geojson: ${features.length} features`);

// 3. Per-state doc pages with current counts.
const rows = new Map(uptime.states.map((s) => [s.state, s]));
mkdirSync(join(ROOT, "docs", "states"), { recursive: true });
const template = readFileSync(join(ROOT, "docs", "state-template.html"), "utf8");
const dateStamp = new Date().toISOString().slice(0, 10);
for (const [code, slug] of Object.entries(STATES)) {
  const row = rows.get(code);
  const name = slug
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  // Coerce remote values to finite numbers before they touch HTML, so a
  // compromised or malformed API response cannot inject markup into the
  // generated (and auto-committed) pages.
  const num = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`non-numeric uptime value: ${JSON.stringify(v)}`);
    return n;
  };
  const uptimeLine = row
    ? `${num(row.cams).toLocaleString("en-US")} cameras tracked; ` +
      `${num(row.live_now).toLocaleString("en-US")} verified live right now ` +
      `(${num(row.liveNowPct)}%), ${num(row.checkLivePct)}% of checks live over 14 days.`
    : `Camera liveness for ${name} is not yet measured in the uptime report.`;
  const html = template
    .replaceAll("{{NAME}}", name)
    .replaceAll("{{CODE}}", code)
    .replaceAll("{{SLUG}}", slug)
    .replaceAll("{{UPTIME_LINE}}", uptimeLine)
    .replaceAll("{{SAMPLE_COUNT}}", String(Number(perState[code]) || 0))
    .replaceAll("{{DATE}}", dateStamp);
  writeFileSync(join(ROOT, "docs", "states", `${slug}.html`), html);
}
console.log(`state pages: ${Object.keys(STATES).length}`);
