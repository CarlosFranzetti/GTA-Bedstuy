/**
 * Entry bundled by bake-pack.mjs: the full list of clips the voice pack should hold, built from the same source files
 * the game uses (cast, shows, DJ copy, story cast, ped bark tables), so the keys match the runtime exactly.
 *
 * The dial (station names and spoken frequencies for the DJ idents) comes from src/audio/radio.ts. That table is being
 * reworked by RADIO15, so it is imported lazily: if it does not load, the last good snapshot
 * (scripts/voice/stations.snapshot.json, rewritten on every successful load) is used instead.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planPack, planStats, type PlanClip, type StationFill } from '../../src/audio/voice/packPlan';
import { planBarks } from '../../src/audio/voice/peds/lines';
import { planStory, type StoryLine } from '../../src/audio/voice/StoryVoices';

/** Mission and story dialogue: every `{ who: '...', text: '...' }` literal under src/game/missions/content (no world needed). */
export function extractStoryLines(dir: string): StoryLine[] {
  const out: StoryLine[] = [];
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
  walk(dir);
  const re = /who:\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*text:\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/gs;
  const un = (t: string) => t.replace(/\\(['"`\\])/g, '$1');
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(re)) out.push({ who: un(m[2]), text: un(m[4]) });
  return out;
}

export async function buildPlan(root: string, snapshotPath: string): Promise<PlanClip[]> {
  const snap = snapshotPath;
  let stations: StationFill[];
  try {
    const { SC_STATIONS } = await import('../../src/audio/radio');
    stations = SC_STATIONS.map((s) => ({ id: s.id, name: s.name, freq: s.freq }));
    try { writeFileSync(snap, JSON.stringify(stations, null, 1) + '\n'); } catch { /* read-only checkout */ }
  } catch (e) {
    console.warn(`[plan] src/audio/radio.ts did not load (${(e as Error).message}); using ${snap}`);
    stations = JSON.parse(readFileSync(snap, 'utf8')) as StationFill[];
  }
  const dir = join(root, 'src/game/missions/content');
  let story: StoryLine[] = [];
  try { story = extractStoryLines(dir); } catch (e) { console.warn(`[plan] story lines unavailable: ${(e as Error).message}`); }
  return planPack({ stations, extra: [...planStory(story), ...planBarks()] });
}
export { planStats };
