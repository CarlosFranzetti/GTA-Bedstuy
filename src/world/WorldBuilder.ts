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
import { createSkyline } from '@/world/Skyline';
import { chunkLayout, splitMeshesIntoCells, type ChunkLayout, type SplitStats } from '@/render/Culling';

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
  /**
   * Per-chunk building and furniture meshes (2 x 2 blocks each, `userData.cell` = chunk key): hide them as a unit beyond
   * `chunkRangeFor(tier)` (a second DistanceCuller; see Culling.ts). Props stay in `propCells`.
   */
  chunkMeshes: THREE.Mesh[];
  chunks: ChunkLayout;
  stats: { meshes: number; lots: number; colliders: number; cells: SplitStats };
}

/** Meshes below this many triangles are not split per cell: one city-wide draw is cheaper than one per visible cell. */
export const MIN_SPLIT_TRIANGLES = 12_000;

/** Sidewalk slabs are 0.15 m tall; buildings and furniture sit on top of them. */
export const SIDEWALK_HEIGHT = 0.15;

/**
 * Chunk size for splitting merged static meshes: 2 x 2 blocks (500 x 200 m on this grid), anchored at the north-west street
 * corner so every chunk edge is a street centreline (see `chunkLayout`). Earlier measurements on the ten-block layout
 * (4 camera spots, 60 deg / 1200 m frustum): unsplit = 29 draws / 581k tris in view; 250 x 200 = 77 draws / 352k;
 * 125 x 100 = 187 draws / 259k. Bigger cells mean fewer draws; the per-tier chunk range (Culling.ts) bounds the vertices.
 */
export function cullCellSize(grid: GridModel): { x: number; z: number } {
  const l = chunkLayout(grid.streets);
  return { x: l.cellX, z: l.cellZ };
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
  const chunks = chunkLayout(grid.streets);
  const cells: SplitStats = { meshesBefore: 0, meshesAfter: 0, trianglesAfter: 0 };
  const split = (g: THREE.Object3D): THREE.Mesh[] => splitMeshesIntoCells(g, chunks.cellX, chunks.cellZ, cells, MIN_SPLIT_TRIANGLES, chunks.originX, chunks.originZ);
  const chunkMeshes = [...split(buildings.group), ...split(furniture.group)]; // instanced kinds are skipped
  const propCells = split(props.group);

  // the far skyline ring: forked last so the streams of everything above are unchanged
  const skyline = createSkyline(grid.bounds, materials, rng.fork('skyline'));
  if (skyline) group.add(skyline);

  let meshes = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  return { grid, lots, group, colliders, furnitureGroup: furniture.group, signalsGroup: signals, lamps: furniture.lamps, propCells, chunkMeshes, chunks, stats: { meshes, lots: lots.length, colliders: colliders.length, cells } };
}
