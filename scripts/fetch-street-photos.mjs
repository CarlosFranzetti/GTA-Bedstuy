#!/usr/bin/env node
/**
 * Fetch openly licensed street-level photos near the game's lots into a git-ignored cache, with a manifest.
 *
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/fetch-street-photos.mjs [options]
 *     --points lat,lon;lat,lon   query points (default: a 250 m grid over the PLUTO lots in src/world/data/raw/pluto-bedstuy.json)
 *     --radius 400               search radius in metres per point (Commons caps at 10000)
 *     --width 1280               thumbnail width to download
 *     --out cache/street-photos  cache folder (git-ignored)
 *     --max 80                   most photos to download per run
 *     --no-download              manifest only
 *     --only commons|kartaview|mapillary   run one source (the manifest is merged, so runs add to each other)
 *
 * Sources, in order:
 *   1. Wikimedia Commons (geosearch, no key). Only files whose licence is CC0 / public domain / CC BY / CC BY-SA are kept;
 *      the licence, author and file page come from the MediaWiki API (extmetadata), never guessed.
 *   2. KartaView (no key; CC BY-SA 4.0). Photo metadata is open; the 2018/19 image blobs are archived (HTTP 409) so only
 *      photos whose file still downloads are kept. Recent ones are wrapped 360 frames: stored but flagged `pano`.
 *   3. Mapillary (CC BY-SA 4.0) needs a free client token: set MAPILLARY_TOKEN (https://www.mapillary.com/dashboard/developers).
 *      Without it this step is skipped and the manifest says so.
 * Nothing from Google Maps / Street View is read. The manifest (manifest.json) lists, per file: source, id, author, licence,
 * licence url, page url, file url, lat, lon, heading (when the source knows it), taken date, width, height.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'GTA-Bedstuy-fan-tribute/1.0 (non-commercial open-source fan game; street photo reference)';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const OUT = path.resolve(ROOT, opt('out', 'cache/street-photos'));
const RADIUS = Number(opt('radius', 400));
const ONLY = opt('only', ''); // commons | kartaview | mapillary
const WIDTH = Number(opt('width', 1280));
const MAX = Number(opt('max', 80));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** the licences we accept, as normalised short names; value says whether share-alike applies */
const LICENCES = [
  [/^cc0|public domain|^pd\b|^pdm/i, { id: 'CC0', sa: false }],
  [/^cc[- ]by[- ]sa/i, { id: 'CC-BY-SA', sa: true }],
  [/^cc[- ]by\b/i, { id: 'CC-BY', sa: false }],
];
const normLicence = (s) => { for (const [re, v] of LICENCES) if (re.test((s ?? '').trim())) return { ...v, text: s.trim() }; return null; };
const stripHtml = (s) => (s ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function getJson(url, headers = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    if (res.status === 429 || res.status >= 500) { await sleep(6000 * (attempt + 1)); continue; }
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error(`non-JSON from ${url.slice(0, 90)}: ${text.slice(0, 80)}`); }
  }
  throw new Error(`gave up on ${url.slice(0, 90)}`);
}
async function getBuf(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

function queryPoints() {
  const given = opt('points', '');
  if (given) return given.split(';').map((p) => p.split(',').map(Number));
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/world/data/raw/pluto-bedstuy.json'), 'utf8'));
  const cells = new Map();
  for (const r of rows) { const la = Number(r.latitude), lo = Number(r.longitude); if (la && lo) cells.set(`${Math.round(la / 0.0025)}:${Math.round(lo / 0.003)}`, [Math.round(la / 0.0025) * 0.0025, Math.round(lo / 0.003) * 0.003]); }
  return [...cells.values()];
}

async function fromCommons(points, manifest) {
  const seen = new Set(manifest.map((m) => `commons:${m.id}`));
  const found = [];
  for (const [lat, lon] of points) {
    const q = new URLSearchParams({
      action: 'query', format: 'json', generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: String(Math.min(RADIUS, 10000)), ggsnamespace: '6', ggslimit: '50',
      prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata|size|mime', iiurlwidth: String(WIDTH), iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|DateTimeOriginal|ImageDescription', colimit: '50',
    });
    let j;
    try { j = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`); } catch (e) { console.log(`commons point ${lat},${lon}: ${e.message.slice(0, 60)}`); continue; }
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png)/.test(ii.mime ?? '')) continue;
      const lic = normLicence(ii.extmetadata?.LicenseShortName?.value);
      if (!lic) continue;
      const id = String(p.pageid);
      if (seen.has(`commons:${id}`)) continue;
      seen.add(`commons:${id}`);
      const c = p.coordinates?.[0];
      found.push({
        source: 'commons', id, title: p.title, author: stripHtml(ii.extmetadata?.Artist?.value) || 'unknown', licence: lic.id, licenceText: lic.text, shareAlike: lic.sa,
        licenceUrl: ii.extmetadata?.LicenseUrl?.value ?? null, page: ii.descriptionurl, fileUrl: ii.thumburl ?? ii.url, lat: c?.lat ?? null, lon: c?.lon ?? null, heading: null,
        taken: ii.extmetadata?.DateTimeOriginal?.value ? stripHtml(ii.extmetadata.DateTimeOriginal.value) : null, description: stripHtml(ii.extmetadata?.ImageDescription?.value).slice(0, 200), width: ii.thumbwidth ?? ii.width, height: ii.thumbheight ?? ii.height,
      });
    }
    await sleep(2500);
  }
  return found;
}

async function fromKartaView(points, manifest) {
  const seen = new Set(manifest.map((m) => `kartaview:${m.id}`));
  const found = [];
  for (const [lat, lon] of points) {
    const j = await getJson(`https://api.kartaview.org/2.0/photo/?lat=${lat}&lng=${lon}&radius=${Math.min(RADIUS, 400)}&join=sequence`);
    for (const p of j.result?.data ?? []) {
      if (seen.has(`kartaview:${p.id}`)) continue;
      seen.add(`kartaview:${p.id}`);
      found.push({
        source: 'kartaview', id: String(p.id), title: `KartaView photo ${p.id}`, author: `KartaView contributor (sequence ${p.sequenceId ?? '?'})`, licence: 'CC-BY-SA', licenceText: 'CC BY-SA 4.0', shareAlike: true,
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', page: `https://kartaview.org/details/${p.sequenceId ?? ''}/${p.sequenceIndex ?? ''}/track-info`, fileUrl: p.fileurlProc ?? p.fileurlLTh,
        lat: Number(p.lat), lon: Number(p.lng), heading: p.heading ? Number(p.heading) : null, taken: p.shotDate, pano: /wrapped|pano/.test(p.fileurlProc ?? '') || p.projection === 'SPHERE', width: null, height: null,
      });
    }
    await sleep(400);
  }
  return found;
}

async function fromMapillary(points, manifest, notes) {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) { notes.push('mapillary: skipped, MAPILLARY_TOKEN not set (free client token from mapillary.com/dashboard/developers; images are CC BY-SA 4.0)'); return []; }
  const seen = new Set(manifest.map((m) => `mapillary:${m.id}`));
  const found = [];
  const d = RADIUS / 111000;
  for (const [lat, lon] of points) {
    const dl = d / Math.cos((lat * Math.PI) / 180);
    const q = new URLSearchParams({ fields: 'id,computed_geometry,compass_angle,captured_at,thumb_1024_url,creator,is_pano', bbox: `${lon - dl},${lat - d},${lon + dl},${lat + d}`, limit: '200' });
    const j = await getJson(`https://graph.mapillary.com/images?${q}`, { Authorization: `OAuth ${token}` });
    if (j.error) { notes.push(`mapillary: ${j.error.message}`); break; }
    for (const p of j.data ?? []) {
      if (seen.has(`mapillary:${p.id}`) || p.is_pano || !p.thumb_1024_url) continue;
      seen.add(`mapillary:${p.id}`);
      const [lo, la] = p.computed_geometry?.coordinates ?? [null, null];
      found.push({
        source: 'mapillary', id: String(p.id), title: `Mapillary image ${p.id}`, author: p.creator?.username ?? 'Mapillary contributor', licence: 'CC-BY-SA', licenceText: 'CC BY-SA 4.0', shareAlike: true,
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', page: `https://www.mapillary.com/app/?pKey=${p.id}`, fileUrl: p.thumb_1024_url, lat: la, lon: lo, heading: p.compass_angle ?? null,
        taken: p.captured_at ? new Date(p.captured_at).toISOString().slice(0, 10) : null, width: 1024, height: null,
      });
    }
    await sleep(300);
  }
  return found;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const mfPath = path.join(OUT, 'manifest.json');
  const old = fs.existsSync(mfPath) ? JSON.parse(fs.readFileSync(mfPath, 'utf8')) : { photos: [] };
  const photos = old.photos;
  const notes = [];
  const points = queryPoints();
  console.log(`${points.length} query points, radius ${RADIUS} m`);
  const lists = [];
  for (const [name, fn] of [['commons', fromCommons], ['kartaview', fromKartaView], ['mapillary', (p, m) => fromMapillary(p, m, notes)]]) {
    if (ONLY && ONLY !== name) continue;
    try { const got = await fn(points, photos); console.log(`${name}: ${got.length} new candidates`); lists.push(...got); } catch (e) { notes.push(`${name}: ${e.message}`); console.log(`${name}: failed, ${e.message}`); }
  }
  let downloaded = 0;
  for (const p of lists) {
    if (flag('no-download')) { photos.push(p); continue; }
    if (downloaded >= MAX) break;
    if (!p.fileUrl) continue;
    const buf = await getBuf(p.fileUrl);
    if (!buf || buf.length < 4000 || buf[0] !== 0xff) { notes.push(`${p.source}:${p.id} not downloadable (${buf ? 'not a jpeg' : 'HTTP error'}), dropped`); continue; }
    p.file = `${p.source}-${p.id}.jpg`;
    fs.writeFileSync(path.join(OUT, p.file), buf);
    photos.push(p); downloaded++;
    await sleep(600);
  }
  fs.writeFileSync(mfPath, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), radiusM: RADIUS, notes, photos }, null, 1));
  const by = {};
  for (const p of photos) by[`${p.source} ${p.licence}`] = (by[`${p.source} ${p.licence}`] ?? 0) + 1;
  console.log(`downloaded ${downloaded}; manifest has ${photos.length}:`, by);
  for (const n of notes.slice(0, 12)) console.log(' note:', n);
}
main().catch((e) => { console.error(e); process.exit(1); });
