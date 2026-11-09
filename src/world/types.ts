/**
 * Shared contracts between all modules. FROZEN during the parallel build:
 * agents implement against these; only the orchestrator edits this file.
 * Coordinates: see core/Math2.ts (metres, +x east, +z south, heading 0 = north, clockwise).
 */
import type * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';

// ---------------------------------------------------------------- world data (bedstuy.json)

export type Side = 'N' | 'S' | 'E' | 'W';
export type StreetClass = 'avenue' | 'street';

export interface StreetDef {
  /** stable id, e.g. "throop", "kosciuszko" */
  id: string;
  /** official name for data/minimap, e.g. "Kosciuszko St" */
  name: string;
  /** what the in-game street sign shows (may differ, e.g. "Kosciusko St") */
  signName: string;
  /** 'ns' streets run north-south at x = offset; 'ew' streets run east-west at z = offset */
  axis: 'ns' | 'ew';
  offset: number;
  class: StreetClass;
  /** curb-to-curb roadway width in metres */
  roadWidth: number;
  /** sidewalk width each side in metres */
  sidewalkWidth: number;
  /** 0 = two-way; +1 = one-way in +axis direction (east for ew, south for ns); -1 = the opposite */
  oneWay: 0 | 1 | -1;
}

export type Archetype =
  | 'bodega' | 'laundromat' | 'barbershop' | 'braiding' | 'caribbean' | 'chinese' | 'pizza'
  | 'church' | 'liquor' | 'dollar' | 'pharmacy' | 'daycare' | 'funeral' | 'autorepair' | 'condo';

export interface PoiDef {
  id: string;
  /** block id "r{row}c{col}", rows 0..4 north->south, cols 0..1 west->east */
  block: string;
  face: Side;
  /** 0..1 position along the face, measured left->right when standing on the street facing the block */
  t: number;
  archetype: Archetype;
  /** awning / sign copy, parody only */
  sign: string;
  /** CSS colour for the awning */
  awningColor: string;
}

export interface BedstuyData {
  name: string;
  seed: number;
  streets: StreetDef[];
  pois: PoiDef[];
}

// ---------------------------------------------------------------- grid model (output of Grid.ts)

export interface Intersection {
  id: string;                 // `${nsStreetId}|${ewStreetId}`
  center: Vec2;
  nsStreetId: string;
  ewStreetId: string;
  /** half extents of the paved intersection box: halfX = nsStreet.roadWidth/2, halfZ = ewStreet.roadWidth/2 */
  halfX: number;
  halfZ: number;
}

export interface RoadSegment {
  id: string;
  streetId: string;
  fromIntersection: string;
  toIntersection: string;
  /** centreline endpoints, trimmed to the edges of the intersections */
  a: Vec2;
  b: Vec2;
  width: number;
}

export interface Crosswalk {
  intersectionId: string;
  /** which approach of the intersection, by side */
  side: Side;
  a: Vec2;
  b: Vec2;
  width: number;
}

export interface BlockFace {
  blockId: string;
  side: Side;
  streetId: string;
  /** building line (back of sidewalk), left->right when standing on the street facing the block */
  a: Vec2;
  b: Vec2;
  /** curb line, same ordering */
  curbA: Vec2;
  curbB: Vec2;
  /** unit normal pointing from the block out toward the street */
  outward: Vec2;
}

export interface Block {
  id: string;                 // "r{row}c{col}"
  row: number;
  col: number;
  /** curb polygon, 4 points, clockwise viewed from above (NW, NE, SE, SW) */
  curb: Vec2[];
  /** building-line polygon (curb inset by sidewalk width), same ordering */
  buildingLine: Vec2[];
  faces: BlockFace[];
}

export interface GraphNode { id: string; pos: Vec2; }
export interface GraphEdge { from: string; to: string; length: number; streetId?: string; }
/** Directed graph. `adjacency[nodeId]` lists outgoing edge indices into `edges`. */
export interface Graph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  adjacency: Record<string, number[]>;
}

export interface LaneNode extends GraphNode {
  streetId: string;
  /** heading of travel at this node */
  heading: number;
  /** true if this node is where a lane enters an intersection (vehicles yield here) */
  stopLine: boolean;
  intersectionId?: string;
}
export interface LaneGraph extends Graph { nodes: Record<string, LaneNode>; }

export interface GridBounds { minX: number; maxX: number; minZ: number; maxZ: number; }

export interface GridModel {
  seed: number;
  bounds: GridBounds;
  streets: StreetDef[];
  intersections: Intersection[];
  segments: RoadSegment[];
  crosswalks: Crosswalk[];
  blocks: Block[];
  /** vehicle lanes: one node chain per direction per segment, connected through intersections */
  lanes: LaneGraph;
  /** pedestrian graph: block corners + crosswalk endpoints + mid-face points, walking on sidewalks */
  sidewalks: Graph;
  streetById(id: string): StreetDef;
  blockById(id: string): Block;
  /** nearest lane node to a point */
  nearestLaneNode(p: Vec2): LaneNode;
  nearestSidewalkNode(p: Vec2): GraphNode;
  /** nearest street (for the HUD location label) */
  nearestStreet(p: Vec2): StreetDef;
  /** true if p is on a roadway (not sidewalk/block) */
  isOnRoad(p: Vec2): boolean;
}

// ---------------------------------------------------------------- lots & buildings

export type LotType = 'brownstone' | 'rowhouse' | 'mixeduse' | 'church' | 'apartment' | 'vacant' | 'scaffold';

export interface Lot {
  id: string;
  blockId: string;
  side: Side;
  /** front edge on the building line, left->right facing the block from the street */
  frontA: Vec2;
  frontB: Vec2;
  width: number;
  depth: number;
  /** unit normal from the lot toward the street */
  outward: Vec2;
  type: LotType;
  corner: boolean;
  poi?: PoiDef;
}

// ---------------------------------------------------------------- materials / textures

export type MaterialKey =
  | 'asphalt' | 'asphaltWorn' | 'concrete' | 'curb' | 'laneLine' | 'crosswalk' | 'bluestone' | 'granite' | 'manhole' | 'grate'
  | 'brownstone' | 'brickRed' | 'brickPainted' | 'limestone' | 'cornice' | 'stoop'
  | 'window' | 'storefrontGlass' | 'rollGate' | 'roof' | 'waterTank'
  | 'treeTrunk' | 'treeLeaves' | 'metalDark' | 'metalGreen' | 'hydrant' | 'trash' | 'scaffold' | 'chainlink'
  | 'carGlass' | 'tire' | 'copLivery' | 'taxiLivery' | 'skin' | 'cloth'
  | 'tireSidewall' | 'plate' | 'clothHoodie' | 'clothDenim' | 'clothVarsity' | 'clothSneaker'
  | 'corrugatedSteel' | 'chainlinkFence' | 'chainlinkRail' | 'graniteCurb' | 'castIronFence' | 'tarRoof' | 'graffiti';

export interface IMaterialLibrary {
  /** Shared material for a key. `variant` selects a deterministic colour/texture variant (0..n). Cached. */
  get(key: MaterialKey, variant?: number): THREE.Material;
  /** Awning material: coloured vinyl with the sign text printed along the front valance (cached by colour+text). */
  awning(color: string, text: string): THREE.Material;
  /** Sign board with text (cached). */
  sign(text: string, bg?: string, fg?: string): THREE.Material;
  /** Painted car body material for a CSS colour (cached). */
  carPaint(color: string): THREE.Material;
  /** Toggle night state: windows glow, storefronts light up. */
  setNight(night: boolean): void;
  /** Optional: environment map (PMREM) for reflections on glass, car paint, wet asphalt. */
  setEnvironment?(env: THREE.Texture | null): void;
  /** Optional: build and apply flake/dirt/scratch detail maps to every car paint material. */
  carPaintDetail?(): void;
}

// ---------------------------------------------------------------- physics (2D on the ground plane)

export interface Circle { kind: 'circle'; r: number; }
/** halfW across the heading, halfL along the heading */
export interface OBB { kind: 'obb'; halfW: number; halfL: number; }
/** static only, convex, clockwise */
export interface Polygon { kind: 'polygon'; points: Vec2[]; }
/** static only (curbs, fences) */
export interface Segment { kind: 'segment'; a: Vec2; b: Vec2; }
export type Shape2D = Circle | OBB | Polygon | Segment;

export type BodyKind = 'player' | 'vehicle' | 'ped' | 'cop' | 'static';

/** A static obstacle produced by world generation (building footprint, tree, pole, curb). */
export interface StaticCollider { shape: Polygon | Segment | Circle; pos: Vec2; id?: string; }

export interface Body2D {
  id: string;
  kind: BodyKind;
  shape: Shape2D;
  pos: Vec2;
  vel: Vec2;
  heading: number;
  /** kg; Infinity for static */
  mass: number;
  /** optional back-reference to the owning entity */
  userData?: unknown;
}

export interface Contact {
  a: Body2D;
  b: Body2D;
  /** unit normal from a toward b */
  normal: Vec2;
  depth: number;
  point: Vec2;
  /** closing speed along the normal at the moment of contact, m/s (>= 0) */
  impulse: number;
}

export interface IWorld2D {
  /** Polygon/Segment points are in world space; `pos` is used for Circle centres (and may be {0,0} for the others). */
  addStatic(shape: Polygon | Segment | Circle, pos?: Vec2, id?: string): Body2D;
  addBody(body: Body2D): void;
  removeBody(id: string): void;
  /** Resolve overlaps for all dynamic bodies (push apart, damp velocity) and return the contacts generated this step. */
  step(dt: number): Contact[];
  /** All dynamic bodies whose shape overlaps the circle. */
  queryCircle(center: Vec2, r: number): Body2D[];
  /** First static or dynamic body hit along a ray, or null. */
  raycast(from: Vec2, dir: Vec2, maxDist: number, ignoreId?: string): { body: Body2D; dist: number; point: Vec2 } | null;
  bodies(): Iterable<Body2D>;
}

// ---------------------------------------------------------------- entities

export interface VehicleInput {
  /** -1 reverse .. 1 full throttle */
  throttle: number;
  /** -1 left .. 1 right */
  steer: number;
  brake: boolean;
  handbrake: boolean;
  horn: boolean;
}

export type VehicleType = 'sedan' | 'suv' | 'boxtruck' | 'cop' | 'cab';

export interface VehicleSpec {
  type: VehicleType;
  length: number;
  width: number;
  height: number;
  maxSpeed: number;    // m/s
  accel: number;       // m/s^2
  brakeDecel: number;  // m/s^2
  maxSteer: number;    // radians at low speed
  color: string;       // CSS colour
  /** Display name for the HUD and tools ("Sedan"); a car's body style can refine it (Coupe, Taxi). */
  name?: string;
}

export interface IVehicle extends Entity {
  readonly spec: VehicleSpec;
  /** forward speed, m/s, negative when reversing */
  readonly speed: number;
  /** 0..1, 1 = wrecked */
  damage: number;
  /** who is driving: 'player' | 'traffic' | 'cop' | null (parked) */
  driver: 'player' | 'traffic' | 'cop' | null;
  /** cop cars only: lightbar flashing + siren audio */
  siren: boolean;
  /** optional: headlights/taillights lit (night) */
  headlights?: boolean;
  setInput(input: VehicleInput): void;
  /** world position of the driver's door, for enter/exit */
  doorPos(): Vec2;
}

export interface Entity {
  readonly id: string;
  readonly object3D: THREE.Object3D;
  readonly body: Body2D;
  update(dt: number): void;
  /** Called by the integrator for every contact involving this entity's body after World2D.step(). */
  onContact?(contact: Contact, other: Body2D): void;
  dispose(): void;
}

// ---------------------------------------------------------------- environment / time

export interface Clock {
  /** hours, 0..24, wraps */
  timeOfDay: number;
  /** derived; true between 19:30 and 06:00 */
  isNight: boolean;
}

// ---------------------------------------------------------------- hud state

export interface HudState {
  stars: number;              // 0..3
  speedKmh: number;
  inVehicle: boolean;
  radioStation: string;
  /** contextual prompt, e.g. "F  Enter car", or '' */
  prompt: string;
  timeOfDay: number;
  streetName: string;         // nearest street for the location label
  fps: number;
}

// ---------------------------------------------------------------- characters (glTF or procedural)

/**
 * One animated person. `group` is the object to add to the scene (origin at the feet, local forward = -z,
 * y up). Drive it with setSpeed (m/s) + update(dt) each frame; the rig crossfades idle / walk / run itself.
 */
export interface CharacterRig {
  group: THREE.Group;
  mixer?: THREE.AnimationMixer;
  clips: Record<'idle' | 'walk' | 'run', THREE.AnimationAction | null>;
  /** current ground speed in m/s (walk > 0.3, run > 4.5) */
  setSpeed(mps: number): void;
  update(dt: number): void;
  /** knocked down: freeze the animation and lay the body flat */
  setDown(down: boolean): void;
  dispose(): void;
  /** nominal standing height in metres */
  height: number;
}

/** Factory for people: a rigged glTF model or the procedural fallback. `variant` picks a cloth colour. */
export interface CharacterSource {
  instantiate(variant: number): CharacterRig;
}
