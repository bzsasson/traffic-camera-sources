// Curated slices: small GeoJSON files for one audience each, built from the
// public API by place (never a whole state or source), capped per slice.
// The rule from the derived-assets workstream (roadcams
// docs/marketing/derived-assets.md): a slice follows places that already
// have pages, stays small, and carries attribution and the page link.
// Run from the repo root: node scripts/slices.mjs   (also run by refresh.mjs)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://livetrafficcam.com";
const UA = "traffic-camera-sources-refresh (+https://github.com/bzsasson/traffic-camera-sources)";

export const SLICES = [
  {
    id: "sierra-chain-control",
    name: "Sierra Nevada chain-control passes",
    audience: "Tahoe-bound drivers: Caltrans chain-control stretches of I-80 over Donner Pass and US-50 over Echo Summit, plus the Nevada approach to Reno.",
    cap: 60,
    sources: [
      { entity: "donner-pass", page: `${SITE}/traffic-cameras/california/donner-pass/` },
      { entity: "echo-summit", page: `${SITE}/traffic-cameras/california/echo-summit/` },
      // Corridors are long; keep the mountain stretch only.
      { entity: "i-80-california", page: `${SITE}/traffic-cameras/california/i-80/`, bbox: [38.9, -121.0, 39.5, -119.9] },
      { entity: "us-50-california", page: `${SITE}/traffic-cameras/california/us-50/`, bbox: [38.6, -121.0, 39.1, -119.9] },
      { entity: "i-80-nevada", page: `${SITE}/traffic-cameras/nevada/i-80/`, bbox: [39.3, -120.1, 39.7, -119.75] },
    ],
  },
];

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inBox = (cam, [minLat, minLng, maxLat, maxLng]) =>
  cam.lat != null && cam.lng != null && cam.lat >= minLat && cam.lat <= maxLat && cam.lng >= minLng && cam.lng <= maxLng;

export async function buildSlice(slice) {
  const seen = new Set();
  const features = [];
  for (const src of slice.sources) {
    let cams = [];
    try {
      ({ cams } = await getJson(`${SITE}/api/cams.json?entity=${src.entity}`));
    } catch (err) {
      console.warn(`slice ${slice.id}: ${src.entity} skipped (${err.message})`);
      continue;
    }
    for (const cam of cams) {
      if (seen.has(cam.id)) continue;
      if (src.bbox && !inBox(cam, src.bbox)) continue;
      if (features.length >= slice.cap) break;
      seen.add(cam.id);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [cam.lng, cam.lat] },
        properties: {
          id: cam.id,
          name: cam.name,
          route: cam.route,
          state: cam.state,
          official_url: cam.official_url,
          attribution: cam.attribution,
          place: src.entity,
          page: src.page,
        },
      });
    }
    await sleep(500);
  }
  return {
    type: "FeatureCollection",
    name: slice.name,
    audience: slice.audience,
    note: `Curated slice of up to ${slice.cap} cameras from the places listed in properties.place; not a full fleet. Each record carries the operating agency's attribution; live status is on the page link.`,
    generated_at: new Date().toISOString(),
    source: `${SITE}/api/cams.json`,
    features,
  };
}

export async function writeSlices() {
  mkdirSync(join(ROOT, "data", "slices"), { recursive: true });
  for (const slice of SLICES) {
    const fc = await buildSlice(slice);
    writeFileSync(join(ROOT, "data", "slices", `${slice.id}.geojson`), JSON.stringify(fc, null, 2) + "\n");
    console.log(`slice ${slice.id}: ${fc.features.length} cameras`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeSlices();
}
