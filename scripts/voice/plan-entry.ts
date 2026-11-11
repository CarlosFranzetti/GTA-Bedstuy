/**
 * Entry bundled by bake-pack.mjs: the full list of clips the voice pack should hold, built from the same source files
 * the game uses (cast, shows, DJ copy, story cast, ped bark tables), so the keys match the runtime exactly.
 *
 * The dial (station names and spoken frequencies for the DJ idents) comes from src/audio/radio.ts. That table is being
 * reworked by RADIO15, so it is imported lazily: if it does not load, the last good snapshot
 * (scripts/voice/stations.snapshot.json, rewritten on every successful load) is used instead.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { planPack, planStats, type PlanClip, type StationFill } from '../../src/audio/voice/packPlan';

const SNAPSHOT = new URL('./stations.snapshot.json', import.meta.url);

export async function buildPlan(snapshotPath?: string): Promise<PlanClip[]> {
  const snap = snapshotPath ?? new URL('../../scripts/voice/stations.snapshot.json', import.meta.url).pathname;
  let stations: StationFill[];
  try {
    const { SC_STATIONS } = await import('../../src/audio/radio');
    stations = SC_STATIONS.map((s) => ({ id: s.id, name: s.name, freq: s.freq }));
    try { writeFileSync(snap, JSON.stringify(stations, null, 1) + '\n'); } catch { /* read-only checkout */ }
  } catch (e) {
    console.warn(`[plan] src/audio/radio.ts did not load (${(e as Error).message}); using ${snap}`);
    stations = JSON.parse(readFileSync(snap, 'utf8')) as StationFill[];
  }
  return planPack({ stations, extra: [] });
}
export { planStats, SNAPSHOT };
