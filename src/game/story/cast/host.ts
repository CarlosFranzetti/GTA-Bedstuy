/**
 * The glue between StoryPeople and the running game. Takes the few things main.ts already has and returns a PlacementHost.
 * Kept free of main.ts so a test or a showcase page can build one too.
 */
import type * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { Pedestrian } from '@/entities/Pedestrian';
import type { Body2D } from '@/world/types';
import type { PlacementHost, Station, StoryPed } from './placement';
import type { CastId, CastMember, CastVenue, StationKind } from './types';

export interface HostDeps {
  scene: { add(o: THREE.Object3D): void; remove(o: THREE.Object3D): void };
  world: { addBody(b: Body2D): void; removeBody(id: string): void };
  /** build a Pedestrian of the registered variant at a point (main: nearest sidewalk node, `new Pedestrian(id, node, ..., variantId)`) */
  makePed(id: string, at: Vec2, variantId: string): Pedestrian;
  /** the VENUES registry's spot for a station; null while a venue has none */
  stationFor?(venue: CastVenue, kind: StationKind, m: CastMember): Station | null;
  /** off the roadway; default: always clear */
  isClear?(at: Vec2, r: number): boolean;
  playerPos(): Vec2;
  activeCast(): CastId;
}

export function makePlacementHost(d: HostDeps): PlacementHost {
  return {
    create(m, variantId, _index, at) {
      const ped = d.makePed(`story-${m.id}`, at, variantId);
      d.scene.add(ped.object3D); d.world.addBody(ped.body);
      return ped as unknown as StoryPed;
    },
    destroy(p) {
      const ped = p as unknown as Pedestrian;
      d.scene.remove(ped.object3D); d.world.removeBody(ped.body.id); ped.dispose();
    },
    stationFor: (v, k, m) => d.stationFor?.(v, k, m) ?? null,
    isClear: (at, r) => d.isClear?.(at, r) ?? true,
    playerPos: d.playerPos,
    activeCast: d.activeCast,
  };
}
