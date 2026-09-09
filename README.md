# traffic-camera-sources

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22223825.svg)](https://doi.org/10.5281/zenodo.22223825)

Open data on public US traffic and road-condition cameras: which
official feeds exist, where the cameras are, and how reliably each
state's fleet actually serves a live image.

The data is aggregated by [LiveTrafficCam](https://livetrafficcam.com/),
a directory of official state DOT and 511 camera feeds that checks every
camera on a rolling schedule with real HTTP requests. "Live" in this
data means a verified current image, not a listing.

## Files

- `data/sources.json` — registry of the official feed sources (state DOT
  APIs, 511 platforms, FAA WeatherCams): name, kind, state, official
  site, terms URL where published, and the attribution line each
  camera carries. Maintained by hand.
- `data/cameras.geojson` — camera locations as GeoJSON points: id, name,
  route, state, live status, official source URL, attribution. A sample
  of up to 200 cameras per state, because the source API caps each
  query at 200 rows; use the uptime summary for full fleet counts.
- `data/uptime-summary.json` — full measured per-state counts: cameras
  tracked, live/stale/dead right now, and the 14-day check success
  rate. A copy of the live report JSON with its `source` field kept.
- `data/uptime/history.csv` — the same per-state numbers as a weekly
  time series, one row per state per refresh, from 2026-08-31 onward:
  cameras tracked, live/stale/dead at refresh time, and the 14-day check
  counts and live rate. This is the file to use for "how reliable is
  each state's fleet over time". `data/uptime/snapshots/` keeps each
  week's raw report.

A weekly GitHub Action re-pulls the generated files and commits only
when something changed. No images or image URLs are included.

## How liveness is measured

Every camera is probed around the clock on a rotating schedule. Each
check reads the image's last-updated time; a camera counts as live only
when its image is genuinely current, stale when the feed answers with an
old frame, dead when it stops answering. Details:
[how liveness is measured](https://bzsasson.github.io/traffic-camera-sources/methodology.html)
and the live
[camera uptime report](https://livetrafficcam.com/reports/camera-uptime/).

## Querying instead of downloading

[livetrafficcam-mcp](https://github.com/bzsasson/livetrafficcam-mcp) is
an MCP server over the same API: cameras by state or route, mountain
pass cameras, single-camera status, and per-state uptime, for AI
assistants that speak the Model Context Protocol.

## Citing

Cite uptime numbers with a link to the
[camera uptime report](https://livetrafficcam.com/reports/camera-uptime/),
which is where they are generated and kept current. The repo carries a
`CITATION.cff` (GitHub's "Cite this repository" button gives BibTeX and
APA); formats and rules:
[how to cite](https://bzsasson.github.io/traffic-camera-sources/cite.html).

## License

Files authored in this repo (`sources.json`, docs) are
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Camera
records carry the attribution of their operating agency (for example
"Camera: Caltrans"); keep it when reusing the data.
