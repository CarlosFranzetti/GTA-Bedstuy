/** Orchestrates static world generation: grid → roads, lots, buildings, furniture + static colliders. */
import * as THREE from 'three';
import type { Rng } from '@/core/Rng';
import type { BedstuyData, GridModel, IMaterialLibrary, Lot, StaticCollider } from '@/world/types';
import { buildGrid } from '@/world/Grid';
import { buildRoads } from '@/world/RoadBuilder';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildBuildings } from '@/world/BuildingGen';
import { buildFurniture, type LampSpot } from '@/world/FurnitureGen';
import { buildProps } from '@/world/PropsGen';

export interface BuiltWorld {
  grid: GridModel;
  lots: Lot[];
  group: THREE.Group;
  colliders: StaticCollider[];
  furnitureGroup: THREE.Group;
  lamps: LampSpot[];
  stats: { meshes: number; lots: number; colliders: number };
}

/** Sidewalk slabs are 0.15 m tall; buildings and furniture sit on top of them. */
export const SIDEWALK_HEIGHT = 0.15;

export function buildWorld(data: BedstuyData, materials: IMaterialLibrary, rng: Rng): BuiltWorld {
  const grid = buildGrid(data);
  const group = new THREE.Group();
  group.name = 'world';
  const colliders: StaticCollider[] = [];

  const roads = buildRoads(grid, materials);
  group.add(roads.group);
  colliders.push(...roads.colliders);

  const lots = subdivideLots(grid, data.pois, rng.fork('lots'));
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

  let meshes = 0;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  return { grid, lots, group, colliders, furnitureGroup: furniture.group, lamps: furniture.lamps, stats: { meshes, lots: lots.length, colliders: colliders.length } };
}
