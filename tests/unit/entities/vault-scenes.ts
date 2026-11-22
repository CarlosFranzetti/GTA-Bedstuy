/** MOVE2: the pinned scenes of the owner's complaint, as data for vault-harness.ts. Cars face +x (heading pi / 2) unless noted. */
import { HALF_PI, VaultScene, type CarDef, type Wall } from './vault-harness';

export interface SceneDef { name: string; walls: Wall[]; cars: CarDef[]; start: { x: number; z: number }; heading: number; escapeKeys: Record<string, number>; expect: 'vault' | 'squeeze' }

const wide = (z0: number, z1: number, x0 = -9, x1 = 9): Wall => ({ x0, z0, x1, z1 });

/** Gap between two parked cars, nose to tail, 1.12 m: 0.32 m to spare beside a 0.8 m body. A wall on the kerb side and a car double-parked 0.25 m off the flanks on the road side. */
export const NOSE_TO_TAIL: SceneDef = {
  name: 'between two parked cars, nose to tail, 0.3 m to spare (kerb wall, a double-parked car beside)',
  walls: [wide(-3, -0.97)],
  cars: [{ x: -3, z: 0, heading: HALF_PI }, { x: 3, z: 0, heading: HALF_PI }, { x: -1.4, z: 2.09, heading: HALF_PI }],
  start: { x: 0, z: 0 }, heading: Math.PI, escapeKeys: { KeyS: 1 }, expect: 'vault',
};

/** In the strip between a building wall and a car's flank, closed off at both ends. The way out is over the hood. */
export const CAR_AND_WALL: SceneDef = {
  name: 'between a car and a wall (a closed strip beside the hood)',
  walls: [wide(-3, -1.97), { x0: 0.4, z0: -1.97, x1: 1.0, z1: -0.9 }, { x0: 2.2, z0: -1.97, x1: 2.8, z1: -0.9 }],
  cars: [{ x: 0, z: 0, heading: HALF_PI }],
  start: { x: 1.6, z: -1.45 }, heading: Math.PI, escapeKeys: { KeyS: 1 }, expect: 'vault',
};

/** A traffic jam: bumper to bumper in the lane (1.12 m between), a car in each neighbouring lane 0.25 m off the flanks. */
export const JAM: SceneDef = {
  name: 'in a traffic jam, between bumpers (cars in front, behind and both sides)',
  walls: [],
  cars: [{ x: -3, z: 0, heading: HALF_PI }, { x: 3, z: 0, heading: HALF_PI }, { x: -1.4, z: 2.09, heading: HALF_PI }, { x: 2.0, z: -2.09, heading: HALF_PI }],
  start: { x: 0, z: 0 }, heading: Math.PI, escapeKeys: { KeyS: 1 }, expect: 'vault',
};

/** Pinned against a dead-end wall by a car that has stopped against them, a narrow lane (3.3 m) so there is no slipping past. The car is driven in by the test. */
export const STOPPED_AGAINST: SceneDef = {
  name: 'pinned by a car that has stopped against them (dead-end lane, 3.3 m wide)',
  walls: [wide(-3, -1.65, -4, 8), wide(1.65, 3, -4, 8), { x0: -4, z0: -3, x1: -0.45, z1: 3 }],
  cars: [{ x: 4.2, z: 0, heading: -HALF_PI }],
  start: { x: 0, z: 0 }, heading: HALF_PI, escapeKeys: { KeyD: 1 }, expect: 'vault',
};

/** A sealed alley: the cars hug the walls, there is no landing spot beside either: a pinned player climbs right over the car (roof and all). */
export const SEALED: SceneDef = {
  name: 'sealed alley (walls hug the cars: no landing spot beside them, climb over the whole car)',
  walls: [wide(-3, -0.95), wide(0.95, 3)],
  cars: [{ x: -3, z: 0, heading: HALF_PI }, { x: 3, z: 0, heading: HALF_PI }],
  start: { x: 0, z: 0 }, heading: Math.PI, escapeKeys: { KeyS: 1 }, expect: 'vault',
};

/** The same alley with vans: too tall to climb, so the last resort is to squeeze out sideways. */
export const SEALED_VANS: SceneDef = {
  name: 'sealed alley of vans (too tall to climb: squeeze out)',
  walls: [wide(-3, -1.1), wide(1.1, 3)],
  cars: [{ type: 'cargovan', x: -3.5, z: 0, heading: HALF_PI }, { type: 'cargovan', x: 3.5, z: 0, heading: HALF_PI }],
  start: { x: 0, z: 0 }, heading: Math.PI, escapeKeys: { KeyS: 1 }, expect: 'squeeze',
};

export const ALL_SCENES: SceneDef[] = [NOSE_TO_TAIL, CAR_AND_WALL, JAM, STOPPED_AGAINST, SEALED, SEALED_VANS];

export function build(def: SceneDef, dt = 1 / 60): VaultScene {
  const s = new VaultScene(def.walls, def.cars, def.start, dt, def.heading);
  return s;
}
