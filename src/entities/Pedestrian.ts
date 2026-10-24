import * as THREE from 'three';
import type { EventBus } from '@/core/Events';
import { angleDiff, type Vec2 } from '@/core/Math2';
import type { Rng } from '@/core/Rng';
import type { Body2D, Contact, Entity, Graph, GraphNode, IMaterialLibrary, IVehicle, IWorld2D } from '@/world/types';

export type PedState = 'walking' | 'waiting' | 'down' | 'fleeing';

const WALK_SPEED = 1.2;
const FLEE_SPEED = 4;
const DOWN_TIME = 6;
const HIT_SPEED = 2;
const CROSSWALK_SCAN_RADIUS = 12;
const WAIT_RECHECK = 0.3;
const MAX_WAIT = 8;
const ARRIVE = 0.4;
const FALLBACK_CROSSWALK = /cross|cw/i;

// geometries are shared between all pedestrians
let bodyGeo: THREE.BufferGeometry | null = null;
let headGeo: THREE.BufferGeometry | null = null;
let legGeo: THREE.BufferGeometry | null = null;
function sharedGeometry(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry; leg: THREE.BufferGeometry } {
  bodyGeo ??= new THREE.CapsuleGeometry(0.2, 0.55, 4, 8);
  headGeo ??= new THREE.SphereGeometry(0.15, 10, 8);
  if (!legGeo) {
    legGeo = new THREE.BoxGeometry(0.12, 0.7, 0.14);
    legGeo.translate(0, -0.35, 0); // pivot at the hip
  }
  return { body: bodyGeo, head: headGeo, leg: legGeo };
}

export class Pedestrian implements Entity {
  readonly object3D: THREE.Group;
  readonly body: Body2D;
  state: PedState = 'walking';

  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private targetId: string | null = null;
  private prevId: string | null = null;
  private downTimer = 0;
  private waitTimer = 0;
  private recheck = 0;
  private fleeTimer = 0;
  private readonly fleeFrom: Vec2 = { x: 0, z: 0 };
  private phase = 0;

  constructor(
    readonly id: string,
    start: GraphNode,
    private readonly sidewalks: Graph,
    private readonly world: IWorld2D,
    materials: IMaterialLibrary,
    private readonly events: EventBus,
    private readonly rng: Rng,
    private readonly crosswalkNodes?: ReadonlySet<string>,
  ) {
    this.body = {
      id,
      kind: 'ped',
      shape: { kind: 'circle', r: 0.3 },
      pos: { x: start.pos.x, z: start.pos.z },
      vel: { x: 0, z: 0 },
      heading: rng.range(-Math.PI, Math.PI),
      mass: 70,
      userData: this,
    };

    const geo = sharedGeometry();
    const cloth = materials.get('cloth', rng.int(0, 7));
    const skin = materials.get('skin', rng.int(0, 5));
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const torso = new THREE.Mesh(geo.body, cloth);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(geo.head, skin);
    head.position.y = 1.68;
    this.legL = new THREE.Mesh(geo.leg, cloth);
    this.legL.position.set(-0.09, 0.78, 0);
    this.legR = new THREE.Mesh(geo.leg, cloth);
    this.legR.position.set(0.09, 0.78, 0);
    g.add(torso, head, this.legL, this.legR);
    this.object3D = g;

    if (!this.pickNext(start.id)) this.targetId = null;
    this.applyPose();
  }

  get targetNodeId(): string | null { return this.targetId; }
  get previousNodeId(): string | null { return this.prevId; }

  /** Run away from a point for `seconds` (ignored while knocked down). */
  flee(from: Vec2, seconds = 5): void {
    if (this.state === 'down') return;
    this.fleeFrom.x = from.x;
    this.fleeFrom.z = from.z;
    this.fleeTimer = seconds;
    this.state = 'fleeing';
    this.waitTimer = 0;
    // heading toward the threat: turn back along the edge we were on
    const t = this.targetId ? this.sidewalks.nodes[this.targetId] : undefined;
    if (t && this.prevId && this.sidewalks.nodes[this.prevId]) {
      const dNow = Math.hypot(this.body.pos.x - from.x, this.body.pos.z - from.z);
      const dTarget = Math.hypot(t.pos.x - from.x, t.pos.z - from.z);
      if (dTarget < dNow) {
        const back = this.prevId;
        this.prevId = this.targetId;
        this.targetId = back;
      }
    }
  }

  onContact(_contact: Contact, other: Body2D): void {
    if (this.state === 'down') return;
    if (other.kind !== 'vehicle' && other.kind !== 'cop') return;
    const sp = Math.hypot(other.vel.x, other.vel.z);
    if (sp <= HIT_SPEED) return;
    this.state = 'down';
    this.downTimer = DOWN_TIME;
    this.body.vel.x = other.vel.x * 0.5;
    this.body.vel.z = other.vel.z * 0.5;
    const pos = { x: this.body.pos.x, z: this.body.pos.z };
    this.events.emit('pedKnockedDown', { id: this.id, pos });
    if ((other.userData as IVehicle | undefined)?.driver === 'player') {
      this.events.emit('crime', { type: 'hitPed', pos });
    }
  }

  update(dt: number): void {
    const b = this.body;
    let moving = false;
    switch (this.state) {
      case 'down': {
        this.downTimer -= dt;
        b.pos.x += b.vel.x * dt;
        b.pos.z += b.vel.z * dt;
        const damp = Math.exp(-4 * dt);
        b.vel.x *= damp;
        b.vel.z *= damp;
        if (this.downTimer <= 0) {
          this.state = 'walking';
          b.vel.x = 0;
          b.vel.z = 0;
        }
        break;
      }
      case 'waiting': {
        this.waitTimer += dt;
        this.recheck -= dt;
        b.vel.x = 0;
        b.vel.z = 0;
        if (this.recheck <= 0) {
          this.recheck = WAIT_RECHECK;
          if (this.waitTimer >= MAX_WAIT || !this.trafficNear(this.pos2())) this.state = 'walking';
        }
        break;
      }
      default: {
        if (this.state === 'fleeing') {
          this.fleeTimer -= dt;
          if (this.fleeTimer <= 0) this.state = 'walking';
        }
        moving = this.walk(dt);
      }
    }
    if (moving) this.phase += dt * (this.state === 'fleeing' ? 12 : 5);
    this.animate(moving);
    this.applyPose();
  }

  dispose(): void {
    this.object3D.removeFromParent();
  }

  // ------------------------------------------------------------------ internals

  private pos2(): Vec2 { return this.body.pos; }

  private walk(dt: number): boolean {
    const b = this.body;
    const t = this.targetId ? this.sidewalks.nodes[this.targetId] : undefined;
    if (!t) {
      b.vel.x = 0;
      b.vel.z = 0;
      if (this.prevId) this.pickNext(this.prevId);
      return false;
    }
    const dx = t.pos.x - b.pos.x;
    const dz = t.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    const speed = this.state === 'fleeing' ? FLEE_SPEED : WALK_SPEED;
    if (d <= Math.max(ARRIVE, speed * dt)) {
      this.arrive(t);
      b.vel.x = 0;
      b.vel.z = 0;
      return false;
    }
    const k = speed / d;
    b.vel.x = dx * k;
    b.vel.z = dz * k;
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    const want = Math.atan2(dx, -dz);
    b.heading += angleDiff(b.heading, want) * Math.min(1, dt * 10);
    return true;
  }

  private arrive(node: GraphNode): void {
    this.pickNext(node.id);
    if (this.state === 'walking' && this.isCrosswalk(node.id) && this.trafficNear(node.pos)) {
      this.state = 'waiting';
      this.waitTimer = 0;
      this.recheck = WAIT_RECHECK;
    }
  }

  private isCrosswalk(id: string): boolean {
    return this.crosswalkNodes ? this.crosswalkNodes.has(id) : FALLBACK_CROSSWALK.test(id);
  }

  private trafficNear(p: Vec2): boolean {
    const list = this.world.queryCircle(p, CROSSWALK_SCAN_RADIUS);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind !== 'vehicle' && o.kind !== 'cop') continue;
      if (Math.hypot(o.vel.x, o.vel.z) > HIT_SPEED) return true;
    }
    return false;
  }

  /** Choose the next node from `fromId`, never the node we just came from unless it is the only way. */
  private pickNext(fromId: string): boolean {
    const adj = this.sidewalks.adjacency[fromId];
    if (!adj || adj.length === 0) return false;
    const edges = this.sidewalks.edges;
    const came = this.prevId;
    let count = 0;
    for (let i = 0; i < adj.length; i++) if (edges[adj[i]].to !== came) count++;
    const useAll = count === 0;
    let chosen = -1;
    if (this.state === 'fleeing') {
      let bestD = -Infinity;
      for (let i = 0; i < adj.length; i++) {
        const e = edges[adj[i]];
        if (!useAll && e.to === came) continue;
        const n = this.sidewalks.nodes[e.to];
        const d = Math.hypot(n.pos.x - this.fleeFrom.x, n.pos.z - this.fleeFrom.z);
        if (d > bestD) { bestD = d; chosen = adj[i]; }
      }
    } else {
      let pick = Math.floor(this.rng.next() * (useAll ? adj.length : count)) % (useAll ? adj.length : count);
      for (let i = 0; i < adj.length; i++) {
        if (!useAll && edges[adj[i]].to === came) continue;
        if (pick-- === 0) { chosen = adj[i]; break; }
      }
    }
    if (chosen < 0) return false;
    this.prevId = fromId;
    this.targetId = edges[chosen].to;
    return true;
  }

  private animate(moving: boolean): void {
    const swing = moving ? Math.sin(this.phase) * 0.7 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
  }

  private applyPose(): void {
    const o = this.object3D;
    const down = this.state === 'down';
    o.position.set(this.body.pos.x, down ? 0.22 : 0, this.body.pos.z);
    o.rotation.y = -this.body.heading;
    o.rotation.x = down ? Math.PI / 2 : 0;
  }
}
