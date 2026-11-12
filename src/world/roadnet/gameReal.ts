/**
 * REALGAME: everything the game itself (missions, notices, pointer, minimaps, saves) needs from the real map, in one place.
 * Real path only: main.ts reaches it through `await import('@/world/roadnet/gameReal')` behind `?map=real`.
 *
 *   const rg = buildRealGame(realWorld)   // also switches the mission places to the real lots (`useRealPlaces`)
 *   rg.features      el stations for buildMissions(...)           rg.frontage     for new AmbientNotices(grid, ...)
 *   rg.router        pointer + map route line                      rg.minimapRoads for new Minimap(root, grid, ...)
 *   rg.streetSource  for new MapScreen(.., { streets })            rg.mapPlaces    the map's blips (home, deli, shops, el stops)
 *   rg.home          where a new player or a save from the other map appears    rg.bounds   where a saved pose is clamped
 *   rg.streetName(p) the HUD and the save-slot label
 */
import type { Vec2 } from '@/core/Math2';
import type { Side } from '@/world/types';
import { useRealPlaces } from '@/game/missions/content/places';
import { detectStoryFeatures, type StoryFeatures } from '@/game/missions/content/story/north';
import type { PointerRouter } from '@/game/missions/PointerRoute';
import type { RealFrontage } from '@/game/story/AmbientNotices';
import { navPlaces, placesFromLots, type MapPlace } from '@/ui/MapScreen';
import type { MinimapRoads } from '@/ui/Minimap';
import { roadNetStreetSource, type MapStreetSource } from '@/ui/map/streetSource';
import type { BedstuyData, GridModel } from '@/world/types';
import { pointOnPath, type ElPath, type ElStationReal } from './elReal';
import { realMinimapRoads } from './minimapReal';
import { createRealPointerRouter } from './pointerReal';
import { createWalker } from './walkReal';
import type { RealPlaces } from './placesReal';
import type { RealWorld } from './realWorld';

export interface RealGame {
  places: RealPlaces;
  router: PointerRouter;
  streetSource: MapStreetSource;
  minimapRoads: MinimapRoads;
  /** the el stops in grid metres, once each (a stop shared by two lines is listed once) */
  stations: Array<{ id: string; name: string; x: number; z: number }>;
  features: StoryFeatures;
  frontage: RealFrontage;
  mapPlaces: MapPlace[];
  home: { x: number; z: number; heading: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  streetName(p: Vec2): string;
  /** back to the grid's places, and on again (tests) */
  release(): void;
  reapply(): void;
}

type Needs = Pick<RealWorld, 'net' | 'derived' | 'sidewalks' | 'places' | 'el' | 'lots' | 'homeSpawn'>;

export function elStations(el: { paths: readonly ElPath[]; stations: readonly ElStationReal[] }): RealGame['stations'] {
  const out: RealGame['stations'] = [];
  for (const st of el.stations) {
    if (out.some((o) => o.id === st.id)) continue;
    const path = el.paths.find((p) => p.id === st.path);
    if (!path) continue;
    const p = pointOnPath(path, st.s).p;
    out.push({ id: st.id, name: st.name, x: p.x, z: p.z });
  }
  return out;
}

export function buildRealGame(rw: Needs): RealGame {
  if (!rw.places) throw new Error('the real map has no places table (it fell back); missions cannot be placed');
  const places = rw.places;
  const walker = createWalker(rw.derived.buildingRings, rw.sidewalks.graph);
  useRealPlaces(places, walker);
  const streetSource = roadNetStreetSource(rw.net);
  const stations = elStations(rw.el);
  // north.ts looks for `data.transit.stations`; hand it the real ones
  const features = detectStoryFeatures(null as unknown as GridModel, { transit: { operator: '', line: '', stations } } as unknown as BedstuyData);
  const b = rw.net.bounds;
  return {
    places,
    router: createRealPointerRouter(rw.derived.buildingRings, rw.sidewalks.graph),
    streetSource,
    minimapRoads: realMinimapRoads(streetSource),
    stations,
    features,
    frontage: (blockId: string, side: Side, t: number) => places.frontage(blockId, side, t),
    mapPlaces: [
      ...navPlaces(),
      ...placesFromLots(rw.lots),
      ...stations.map((s) => ({ id: `station:${s.id}`, kind: 'station' as const, label: s.name, x: s.x, z: s.z })),
    ],
    home: { x: rw.homeSpawn.x, z: rw.homeSpawn.z, heading: rw.homeSpawn.heading },
    bounds: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ },
    streetName: (p) => rw.net.streetNameAt(p),
    release: () => useRealPlaces(null),
    reapply: () => useRealPlaces(places, walker),
  };
}
