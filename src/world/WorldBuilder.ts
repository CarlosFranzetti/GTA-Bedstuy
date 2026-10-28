/** Orchestrates static world generation: grid → roads, lots, buildings, furniture + static colliders. */
import * as THREE from 'three';
import type { Rng } from '@/core/Rng';
import type { BedstuyData, GridModel, IMaterialLibrary, Lot, StaticCollider } from '@/world/types';
import { buildGrid } from '@/world/Grid';
import { buildRoads } from '@/world/RoadBuilder';
import { subdivideLots } from '@/world/LotSubdivider';
import { getBedstuyFaces } from '@/world/data/faces';
import { buildBuildings } from '@/world/BuildingGen';
import { buildFurniture, type LampSpot } from '@/world/FurnitureGen';
import { buildProps } from '@/world/PropsGen';
import { buildSignals, signalColliders } from '@/world/props/signals';
import { splitMeshesIntoCells, type SplitStats } from '@/render/Culling';

export interface BuiltWorld {
  grid: GridModel;
  lots: Lot[];
  group: THREE.Group;
  colliders: StaticCollider[];
  furnitureGroup: THREE.Group;
  /** Traffic-signal poles/heads; drive with updateSignalMeshes(signalsGroup, traffic.lights) each frame. */
  signalsGroup: THREE.Group;
  lamps: LampSpot[];
  /** Per-cell prop meshes (candidates for distance culling). */
  propCells: THREE.Mesh[];
  stats: { meshes: number; lots: number; colliders: number; cells: SplitStats };
}

/** Meshes below this many triangles are not split per cell: one city-wide draw is cheaper than one per visible cell. */
export const MIN_SPLIT_TRIANGLES = 12_000;

/** Sidewalk slabs are 0.15 m tall; buildings and furniture sit on top of them. */
export const SIDEWALK_HEIGHT = 0.15;

/**
 * Cell size (m) for splitting merged static meshes: one block wide (N-S street pitch) by two blocks deep (2 x E-W street
 * pitch). Measured on the real layout (4 camera spots, 60 deg / 1200 m frustum): unsplit = 29 draws / 581k tris in view;
 * 250 x 200 = 77 draws / 352k; 125 x 100 = 187 draws / 259k. Finer cells trade draw calls (CPU, x3 passes) for
 * vertices; this keeps draw calls low while the shadow pass (160 m box) skips most of the city.
 */
export function cullCellSize(grid: GridModel): { x: number; z: number } {
  const pitch = (axis: 'ns' | 'ew', fallback: number): number => {
    const o = grid.streets.filter((st) => st.axis === axis).map((st) => st.offset).sort((a, b) => a - b);
    let best = Infinity;
    for (let i = 1; i < o.length; i++) best = Math.min(best, o[i] - o[i - 1]);
    return isFinite(best) && best > 20 ? best : fallback;
  };
  return { x: pitch('ns', 250), z: pitch('ew', 100) * 2 };
}

export function buildWorld(data: BedstuyData, materials: IMaterialLibrary, rng: Rng): BuiltWorld {
  const grid = buildGrid(data);
  const group = new THREE.Group();
  group.name = 'world';
  const colliders: StaticCollider[] = [];

  const roads = buildRoads(grid, materials);
  group.add(roads.group);
  colliders.push(...roads.colliders);

  const lots = subdivideLots(grid, data.pois, rng.fork('lots'), getBedstuyFaces());
  const buildings = buildBuildings(lots, materials, rng.fork('buildings'));
  buildings.group.position.y = SIDEWALK_HEIGHT;
  group.add(buildings.group);
  colliders.push(...buildings.colliders);

  const furniture = buildFurniture(grid, lots, materials, rng.fork('furniture'));
  furniture.group.position.y = SIDEWALK_HEIGHT;
  group.add(furniture.group);
  colliders.push(...furniture.colliders);

  const props = buildProps(grid, lots, materials, rng.fork('props'));
  props.group.position.y = SIDEWALK_HEIGHT;
  group.add(props.group);
  colliders.push(...props.colliders);

  const signals = buildSignals(grid, materials);
  signals.position.y = SIDEWALK_HEIGHT;
  group.add(signals);
  colliders.push(...signalColliders(grid));

  // The generators merge one geometry per material city-wide, which frustum culling can never reject. Re-bin the
  // triangles into per-cell meshes (same names/materials, so lamp lookup by name keeps working).
  const cell = cullCellSize(grid);
  const cells: SplitStats = { meshesBefore: 0, meshesAfter: 0, trianglesAfter: 0 };
  splitMeshesIntoCells(buildings.group, cell.x, cell.z, cells, MIN_SPLIT_TRIANGLES);
  splitMeshesIntoCells(furniture.group, cell.x, cell.z, cells, MIN_SPLIT_TRIANGLES); // instanced kinds are skipped
  const propCells = splitMeshesIntoCells(props.group, cell.x, cell.z, cells, MIN_SPLIT_TRIANGLES);

  let meshes = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  return { grid, lots, group, colliders, furnitureGroup: furniture.group, signalsGroup: signals, lamps: furniture.lamps, propCells, stats: { meshes, lots: lots.length, colliders: colliders.length, cells } };
}
