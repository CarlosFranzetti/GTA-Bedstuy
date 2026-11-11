import { hyp } from '@/core/Math2';
import * as THREE from 'three';
import type { EventBus } from '@/core/Events';
import { angleDiff, type Vec2 } from '@/core/Math2';
import type { TrafficLights } from '@/game/TrafficLights';
import { Rng } from '@/core/Rng';
import { animateWalk, type HumanModel } from '@/entities/models/humanModel';
import { buildPerson as buildPedModel, loadPeople } from '@/entities/models/pedMesh';
import type { BarkKind } from '@/game/pedBarks';
import { PED_SPECS } from '@/textures/painters/ped';
import type { CharacterRig, CharacterSource } from '@/world/types';

// start decoding the MakeHuman body shapes at once (browser only); until they are ready people use PEDHI's procedural bodies
if (typeof window !== 'undefined') void loadPeople();
import type { Body2D, Contact, Entity, Graph, GraphNode, IMaterialLibrary, IVehicle, IWorld2D } from '@/world/types';

export type PedState = 'walking' | 'waiting' | 'down' | 'fleeing' | 'sitting' | 'meeting' | 'chatting';
/** What the body language should look like (hook for animation / debugging). */
export type PedPose = 'walk' | 'stand' | 'phone' | 'sit' | 'down' | 'talk';
/** A short body-language beat on top of the current pose (PedSocial and the ped itself start them). */
export type PedReaction = 'glance' | 'wave' | 'nod' | 'startle' | 'laugh' | 'shout' | 'point';
export const REACTION_TIME: Record<PedReaction, number> = { glance: 1.4, wave: 1.6, nod: 0.9, startle: 1.2, laugh: 1.8, shout: 1.3, point: 1.4 };

/** A crosswalk edge of the sidewalk graph: which intersection it belongs to and which roadway it crosses. */
export interface PedCrossing { intersectionId: string; crossedStreetId: string; }
/** A place to sit: on the stoop of a brownstone, just in front of the building line. */
export interface StoopSpot {
  pos: Vec2; outward: Vec2;
  /** 'door' = a shop door to loiter beside (stand or phone, no sitting); default is a stoop to sit on */
  kind?: 'stoop' | 'door';
}
/** Extra world knowledge handed over after construction (TrafficSystem wires it; legacy callers can skip it). */
export interface PedEnvironment {
  lights?: TrafficLights;
  /** key `${fromNodeId}>${toNodeId}` for both directions of every crosswalk edge */
  crossings?: ReadonlyMap<string, PedCrossing>;
  stoops?: ReadonlyArray<StoopSpot>;
  /** shop doors to loiter beside (idle behaviour 2) */
  doors?: ReadonlyArray<StoopSpot>;
  /** multiplier on the stoop-sitting and door-loitering chances (the hour of day sets it; 1 = the base rate) */
  idleBoost?: number;
}

const WALK_SPEED = 1.2;
const FLEE_SPEED = 4;
const DOWN_TIME = 6;
const HIT_SPEED = 2;
const CROSSWALK_SCAN_RADIUS = 12;
const WAIT_RECHECK = 0.3;
const MAX_WAIT = 8;
const ARRIVE = 0.4;
const FALLBACK_CROSSWALK = /cross|cw/i;
/** longest a pedestrian waits for WALK before stepping off anyway */
const MAX_SIGNAL_WAIT = 150;
const PHONE_CHANCE = 0.35;
const NODE_IDLE_CHANCE = 0.03;
const STOOP_CHANCE = 0.05;
/** chance, at a node, to stop for a while beside a shop door (before the hour boost) */
const DOOR_CHANCE = 0.04;
const IDLE_ROLL_MIN = 5;
const IDLE_ROLL_MAX = 11;
/** per roll, before the hour boost */
const IDLE_STOOP = 0.02;
const IDLE_DOOR = 0.03;
const DOOR_MIN = 14;
const DOOR_MAX = 45;
const SIT_MIN = 10;
const SIT_MAX = 30;
const STOOP_LATERAL = 1.6;
const THREAT_PERIOD = 0.25;
const THREAT_RADIUS = 10;
const THREAT_MIN_SPEED = 4;
const FOLLOW_DETACH = 9;
/** walking around a stopped car: scan period, radius, speed under which a car counts as stopped, look-ahead and margin (m) */
/** head-on pedestrian jam: nearly still, another pedestrian within this radius dead ahead -> step right */
const PED_JAM_SPEED = 0.5;
const PED_JAM_RADIUS = 1.1;
const BLOCK_SCAN_PERIOD = 0.1;
const BLOCK_RADIUS = 4;
const BLOCK_MAX_SPEED = 1.5;
const BLOCK_LOOKAHEAD = 0.9;
const BLOCK_MARGIN = 0.5;
/** a meeting that has not become a conversation in this long is dropped (nobody is left walking to a ped that went elsewhere) */
export const MEET_TIMEOUT = 7;
/** a conversation never lasts longer than this */
export const CHAT_MAX = 22;
/** how close two people stand to talk (m) */
export const CHAT_DISTANCE = 1.15;

export class Pedestrian implements Entity {
  readonly object3D: THREE.Group;
  readonly body: Body2D;
  state: PedState = 'walking';

  private readonly model: HumanModel | null = null;
  private readonly rig: CharacterRig | null = null;
  /** Optional rigged character source (GLB); when set, peds use it instead of the procedural model. */
  static characterSource: CharacterSource | null = null;
  private amp = 0;
  private targetId: string | null = null;
  private prevId: string | null = null;
  private downTimer = 0;
  private waitTimer = 0;
  private recheck = 0;
  private fleeTimer = 0;
  private readonly fleeFrom: Vec2 = { x: 0, z: 0 };
  private phase = 0;
  private env: PedEnvironment | null = null;
  private waitCrossing: PedCrossing | null = null;
  private phoneIdle = false;
  private sitTimer = 0;
  private idleTimer = 0;
  /** own stream for the idle behaviours, so adding them leaves the walking / routing draws of `rng` untouched */
  private readonly idleRng: Rng;
  private sitOnStoop = false;
  private detour: { stage: 0 | 1 | 3; p0: Vec2; spot: StoopSpot } | null = null;
  private threatTimer = 0;
  private leader: Pedestrian | null = null;
  private slot = 0;
  private followers = 0;
  private movingNow = false;
  private blockTimer = 0;
  private blockKey = '';
  private blockSign: 1 | -1 = 1;
  private readonly blockSlide: Vec2 = { x: 0, z: 0 };
  // ---- social life (PedSocial schedules it; the ped plays it)
  /** called when this person wants to say something; PedSocial checks distance / rate and emits the bark */
  static socialHook: ((p: Pedestrian, kind: BarkKind) => void) | null = null;
  chatPartner: Pedestrian | null = null;
  private chatTimer = 0;
  private chatSpeakIn = 0;
  private chatLead = false;
  private meetGoal: Vec2 = { x: 0, z: 0 };
  private meetTimer = 0;
  /** seconds before this person may be matched for another conversation / greeting */
  socialCooldown = 4;
  barkCooldown = 0;
  private reaction: { kind: PedReaction; t: number; dur: number; delay: number; toward: Vec2 | null } | null = null;
  private gesture = 0;

  constructor(
    readonly id: string,
    start: GraphNode,
    private readonly sidewalks: Graph,
    private readonly world: IWorld2D,
    materials: IMaterialLibrary,
    private readonly events: EventBus,
    private readonly rng: Rng,
    private readonly crosswalkNodes?: ReadonlySet<string>,
    env?: PedEnvironment,
  ) {
    this.idleRng = new Rng(Rng.hash(`${id}:idle`));
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

    let g: THREE.Group;
    if (Pedestrian.characterSource) {
      // one rng draw: model * 8 + cloth tint (a source with several people reports variantCount; others have the 8 tints)
      const n = (Pedestrian.characterSource as { variantCount?: number }).variantCount ?? 8;
      this.rig = Pedestrian.characterSource.instantiate(rng.int(0, n - 1)); g = this.rig.group;
    }
    else { this.model = buildPedModel(materials, rng); g = this.model.group; }
    g.rotation.order = 'YXZ';
    this.object3D = g;

    if (!this.pickNext(start.id)) this.targetId = null;
    if (env) this.setEnvironment(env);
    this.applyPose();
  }

  /** Give the pedestrian its signals, crosswalk table and stoops. Safe to call once after construction. */
  setEnvironment(env: PedEnvironment): void {
    this.env = env;
    if (this.prevId && this.state === 'walking') this.gateAt(this.prevId);
  }

  get pose(): PedPose {
    if (this.state === 'down') return 'down';
    if (this.state === 'chatting') return 'talk';
    if (this.state === 'sitting') return this.sitOnStoop ? 'sit' : this.phoneIdle ? 'phone' : 'stand';
    if (this.state === 'waiting') return this.phoneIdle ? 'phone' : 'stand';
    return this.movingNow ? 'walk' : 'stand';
  }

  /** Walk together with `leader` (a small group). The follower keeps to the leader's side. */
  follow(leader: Pedestrian, slot: number): void {
    this.leader = leader;
    this.slot = slot;
    leader.followers++;
    this.state = 'walking';
    this.waitCrossing = null;
    this.detour = null;
  }

  get groupLeader(): Pedestrian | null { return this.leader; }
  /** Walking alone (no leader, no followers): safe to remove without orphaning a group. */
  get isFree(): boolean { return this.leader === null && this.followers === 0 && this.state !== 'down'; }
  /** True while the pedestrian is waiting at a curb for the WALK signal. */
  get waitingForWalk(): boolean { return this.state === 'waiting' && this.waitCrossing !== null; }

  get targetNodeId(): string | null { return this.targetId; }
  get previousNodeId(): string | null { return this.prevId; }

  /** Run away from a point for `seconds` (ignored while knocked down). */
  flee(from: Vec2, seconds = 5): void {
    if (this.state === 'down') return;
    this.dropChat(false);
    this.fleeFrom.x = from.x;
    this.fleeFrom.z = from.z;
    this.fleeTimer = seconds;
    this.state = 'fleeing';
    this.waitTimer = 0;
    this.waitCrossing = null;
    this.detour = null;
    this.detach();
    // heading toward the threat: turn back along the edge we were on
    const t = this.targetId ? this.sidewalks.nodes[this.targetId] : undefined;
    if (t && this.prevId && this.sidewalks.nodes[this.prevId]) {
      const dNow = hyp(this.body.pos.x - from.x, this.body.pos.z - from.z);
      const dTarget = hyp(t.pos.x - from.x, t.pos.z - from.z);
      if (dTarget < dNow) {
        const back = this.prevId;
        this.prevId = this.targetId;
        this.targetId = back;
      }
    }
  }

  onContact(_contact: Contact, other: Body2D): void {
    if (this.state === 'down') return;
    if (other.kind === 'player') { this.bumpedBy(other); return; }
    if (other.kind !== 'vehicle' && other.kind !== 'cop') return;
    const sp = hyp(other.vel.x, other.vel.z);
    if (sp <= HIT_SPEED) return;
    this.dropChat(false);
    this.state = 'down';
    this.waitCrossing = null;
    this.detour = null;
    this.detach();
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
        this.faceTarget(dt);
        if (this.recheck <= 0) {
          this.recheck = WAIT_RECHECK;
          if (this.waitCrossing) {
            const c = this.waitCrossing;
            if (this.waitTimer >= MAX_SIGNAL_WAIT || !this.env?.lights || this.env.lights.walkFor(c.intersectionId, c.crossedStreetId)) {
              this.waitCrossing = null;
              this.state = 'walking';
            }
          } else if (this.waitTimer >= MAX_WAIT || !this.trafficNear(this.pos2())) this.state = 'walking';
        }
        this.scanThreats(dt);
        break;
      }
      case 'meeting': {
        moving = this.meetStep(dt);
        this.scanThreats(dt);
        break;
      }
      case 'chatting': {
        b.vel.x = 0;
        b.vel.z = 0;
        this.chatStep(dt);
        this.scanThreats(dt);
        break;
      }
      case 'sitting': {
        b.vel.x = 0;
        b.vel.z = 0;
        this.sitTimer -= dt;
        if (this.sitTimer <= 0) {
          this.state = 'walking';
          this.sitOnStoop = false;
          this.phoneIdle = false;
          if (this.detour) this.detour.stage = 3;
        }
        this.scanThreats(dt);
        break;
      }
      default: {
        if (this.state === 'fleeing') {
          this.fleeTimer -= dt;
          if (this.fleeTimer <= 0) this.state = 'walking';
        } else this.scanThreats(dt);
        moving = this.leader ? this.followLeader(dt) : this.walk(dt);
      }
    }
    this.movingNow = moving;
    this.socialCooldown -= dt;
    this.barkCooldown -= dt;
    this.gesture += dt;
    if (this.reaction) { if (this.reaction.delay > 0) this.reaction.delay -= dt; else { this.reaction.t += dt; if (this.reaction.t >= this.reaction.dur) this.reaction = null; } }
    if (moving) this.phase += dt * (this.state === 'fleeing' ? 12 : 5);
    this.animate(dt, moving);
    this.applyPose();
  }

  dispose(): void {
    this.detach();
    this.object3D.removeFromParent();
  }

  // ------------------------------------------------------------------ social life

  /** A free pedestrian on an ordinary pavement stretch: not in a group, not crossing or waiting at a curb, not sitting, not rattled. */
  get canSocialize(): boolean {
    if (this.state !== 'walking' || this.leader || this.followers > 0 || this.detour || this.socialCooldown > 0) return false;
    if (this.isCrossingEdge(this.prevId, this.targetId)) return false;
    // never stop on or beside a crosswalk: a pair parked there pinned head-on walkers once
    for (const id of [this.prevId, this.targetId]) {
      const n = id ? this.sidewalks.nodes[id] : undefined;
      if (n && this.isCrosswalk(n.id) && hyp(n.pos.x - this.body.pos.x, n.pos.z - this.body.pos.z) < 6) return false;
    }
    return true;
  }
  get isSeatedOnStoop(): boolean { return this.state === 'sitting' && this.sitOnStoop; }
  get isTalking(): boolean { return this.state === 'chatting' || this.state === 'meeting'; }
  get currentReaction(): PedReaction | null { return this.reaction && this.reaction.delay <= 0 ? this.reaction.kind : null; }
  /** the model's person (null for a rigged GLB character) */
  get person(): { id: string; sex: 'm' | 'f' | 'x'; age: 'kid' | 'teen' | 'adult' | 'old' } | null {
    const id = this.model?.group.userData.pedVariant as string | undefined;
    const sp = id ? PED_SPECS.find((q) => q.id === id) : undefined;
    return sp ? { id: sp.id, sex: sp.sex ?? 'm', age: sp.age ?? 'adult' } : { id: this.id, sex: 'm', age: 'adult' };
  }

  /** Walk over to `partner` (they walk over to us) and talk: meeting first, chatting once they stand face to face. */
  meet(partner: Pedestrian, lead: boolean): void {
    this.state = 'meeting';
    this.chatPartner = partner;
    this.chatLead = lead;
    this.meetTimer = MEET_TIMEOUT;
    this.meetGoal = { x: partner.body.pos.x, z: partner.body.pos.z };
  }

  private meetStep(dt: number): boolean {
    const b = this.body, p = this.chatPartner;
    this.meetTimer -= dt;
    if (!p || p.state === 'down' || p.state === 'fleeing' || p.state === 'sitting' || p.state === 'waiting' || !p.isTalking || this.meetTimer <= 0) { this.dropChat(false, 12); return false; }
    const dx = p.body.pos.x - b.pos.x, dz = p.body.pos.z - b.pos.z, d = hyp(dx, dz);
    if (d <= CHAT_DISTANCE + 0.1) {
      b.vel.x = 0; b.vel.z = 0;
      this.state = 'chatting';
      this.chatTimer = Math.min(CHAT_MAX, this.idleRng.range(8, 18));
      this.chatSpeakIn = this.chatLead ? 0.4 : 2.4;
      return false;
    }
    const sp = Math.min(WALK_SPEED * 0.9, Math.max(0.4, (d - CHAT_DISTANCE) * 2));
    const gx = dx / d, gz = dz / d;
    b.vel.x = gx * sp; b.vel.z = gz * sp;
    b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt;
    b.heading += angleDiff(b.heading, Math.atan2(gx, -gz)) * Math.min(1, dt * 8);
    return true;
  }

  private chatStep(dt: number): void {
    const b = this.body, p = this.chatPartner;
    this.chatTimer -= dt;
    if (!p || p.state === 'down' || p.state === 'fleeing' || !p.isTalking || this.chatTimer <= 0) { const end = !!p && p.isTalking && this.chatTimer <= 0 && this.chatLead; this.dropChat(end, 25); return; }
    const want = Math.atan2(p.body.pos.x - b.pos.x, -(p.body.pos.z - b.pos.z));
    b.heading += angleDiff(b.heading, want) * Math.min(1, dt * 5);
    this.chatSpeakIn -= dt;
    if (this.chatSpeakIn <= 0 && p.state === 'chatting') {
      // take turns: one talks for a few seconds with gestures, the other nods and answers
      this.chatSpeakIn = this.idleRng.range(4.5, 8);
      if (this.idleRng.next() < 0.22) { this.react('laugh'); p.react('laugh', null, 0.2); this.say('laugh'); }
      else { this.say(this.chatLead === (Math.floor(this.chatTimer / 7) % 2 === 0) ? 'chat' : 'chatReply'); p.react('nod', null, 0.8); }
      p.chatSpeakIn = Math.max(p.chatSpeakIn, this.chatSpeakIn * 0.6);
    }
  }

  /** End a conversation (or an approach). The partner ends too; `bye` says goodbye; `cooldown` keeps both from being matched again at once. */
  dropChat(bye: boolean, cooldown = 15): void {
    const p = this.chatPartner;
    if (!this.isTalking && !p) return;
    this.chatPartner = null;
    if (this.state === 'chatting' || this.state === 'meeting') this.state = 'walking';
    this.socialCooldown = cooldown + this.idleRng.range(0, 25);
    if (bye) this.say('bye');
    if (p && p.chatPartner === this) p.dropChat(false, cooldown);
  }

  /** Play a short body-language beat. A glance never replaces a beat that is already playing. */
  react(kind: PedReaction, toward: Vec2 | null = null, delay = 0): void {
    if (this.state === 'down') return;
    if (this.reaction && this.reaction.delay <= 0 && kind === 'glance') return;
    this.reaction = { kind, t: 0, dur: REACTION_TIME[kind], delay, toward: toward ? { x: toward.x, z: toward.z } : null };
  }
  /** Ask to say a line; PedSocial decides whether the player is near enough and the street quiet enough. */
  say(kind: BarkKind): void {
    if (this.barkCooldown > 0 || !Pedestrian.socialHook) return;
    this.barkCooldown = 6;
    Pedestrian.socialHook(this, kind);
  }
  /** The player walked into us: stagger back a step, look, complain. */
  private bumpedBy(other: Body2D): void {
    if (this.state === 'sitting' || this.state === 'waiting') { this.react('glance', other.pos); return; }
    const dx = this.body.pos.x - other.pos.x, dz = this.body.pos.z - other.pos.z, d = hyp(dx, dz) || 1;
    this.body.pos.x += (dx / d) * 0.12; this.body.pos.z += (dz / d) * 0.12;
    this.react('startle', other.pos);
    this.say('bumped');
    if (this.isTalking) this.dropChat(false, 6);
  }

  // ------------------------------------------------------------------ internals

  private pos2(): Vec2 { return this.body.pos; }

  private detach(): void {
    if (this.leader) { this.leader.followers = Math.max(0, this.leader.followers - 1); this.leader = null; }
  }

  private faceTarget(dt: number): void {
    const t = this.targetId ? this.sidewalks.nodes[this.targetId] : undefined;
    if (!t) return;
    const b = this.body;
    const want = Math.atan2(t.pos.x - b.pos.x, -(t.pos.z - b.pos.z));
    b.heading += angleDiff(b.heading, want) * Math.min(1, dt * 6);
  }

  private walk(dt: number): boolean {
    const b = this.body;
    let goal: Vec2 | undefined;
    const det = this.detour;
    if (!det) this.idleRoll(dt);
    if (det) goal = det.stage === 1 ? det.spot.pos : det.p0;
    else goal = (this.targetId ? this.sidewalks.nodes[this.targetId] : undefined)?.pos;
    if (!goal) {
      b.vel.x = 0;
      b.vel.z = 0;
      if (this.prevId) this.pickNext(this.prevId);
      return false;
    }
    const dx = goal.x - b.pos.x;
    const dz = goal.z - b.pos.z;
    const d = hyp(dx, dz);
    const speed = this.state === 'fleeing' ? FLEE_SPEED : WALK_SPEED;
    if (d <= Math.max(det ? 0.15 : ARRIVE, speed * dt)) {
      if (det) this.advanceDetour(det);
      else this.arrive(this.sidewalks.nodes[this.targetId!]);
      b.vel.x = 0;
      b.vel.z = 0;
      return false;
    }
    let gx = dx / d;
    let gz = dz / d;
    // a stopped car across the path: walk around it instead of leaning on it (a pedestrian pinned against a car
    // makes the car hold, and the car's body keeps the pedestrian from getting through)
    this.blockTimer -= dt;
    if (this.blockTimer <= 0) {
      this.blockTimer = BLOCK_SCAN_PERIOD;
      this.blockSlide.x = 0;
      this.blockSlide.z = 0;
      this.findBlocker(gx, gz);
    }
    if (this.blockSlide.x !== 0 || this.blockSlide.z !== 0) { gx = this.blockSlide.x; gz = this.blockSlide.z; }
    const k = speed;
    b.vel.x = gx * k;
    b.vel.z = gz * k;
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    const want = Math.atan2(gx, -gz);
    b.heading += angleDiff(b.heading, want) * Math.min(1, dt * 10);
    return true;
  }

  /** Sets blockSlide to the direction along the nearest side of a stopped car that sits on the path (g = unit direction to goal). */
  private findBlocker(gx: number, gz: number): void {
    const b = this.body;
    const list = this.world.queryCircle(b.pos, BLOCK_RADIUS);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if ((o.kind !== 'vehicle' && o.kind !== 'cop') || o.shape.kind !== 'obb') continue;
      if (hyp(o.vel.x, o.vel.z) > BLOCK_MAX_SPEED) continue;
      const fx = Math.sin(o.heading);
      const fz = -Math.cos(o.heading);
      const rx = -fz;
      const rz = fx;
      // the point 0.9 m down the path, in the car's frame
      const px = b.pos.x + gx * BLOCK_LOOKAHEAD - o.pos.x;
      const pz = b.pos.z + gz * BLOCK_LOOKAHEAD - o.pos.z;
      const hl = o.shape.halfL + BLOCK_MARGIN;
      const hw = o.shape.halfW + BLOCK_MARGIN;
      const u = px * fx + pz * fz;
      const w = px * rx + pz * rz;
      if (Math.abs(u) > hl || Math.abs(w) > hw) continue;
      const qx = b.pos.x - o.pos.x;
      const qz = b.pos.z - o.pos.z;
      const qu = qx * fx + qz * fz;
      const qw = qx * rx + qz * rz;
      let tx: number, tz: number;
      const side = Math.abs(qw) / hw >= Math.abs(qu) / hl;
      // the way round is chosen once per car and kept (the goal can point straight across the car, where the sign flips)
      const key = `${o.id}${side ? 'L' : 'E'}`;
      let s = this.blockKey === key ? this.blockSign : 0;
      if (side) {
        // at a long side: slide toward the end that lies nearer the goal
        if (s === 0) s = gx * fx + gz * fz >= 0 ? 1 : -1;
        tx = fx * s;
        tz = fz * s;
      } else {
        if (s === 0) s = gx * rx + gz * rz >= 0 ? 1 : -1;
        tx = rx * s;
        tz = rz * s;
      }
      this.blockKey = key;
      this.blockSign = s as 1 | -1;
      this.blockSlide.x = tx;
      this.blockSlide.z = tz;
      return;
    }
    this.blockKey = '';
    // two pedestrians head-on in a narrow lane (a crosswalk) press into each other and neither gets through: when blocked by another
    // pedestrian dead ahead and barely moving, both step to their own right (keep-right), which clears them
    if (hyp(b.vel.x, b.vel.z) < PED_JAM_SPEED) {
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o.kind !== 'ped' || o === b) continue;
        const ox = o.pos.x - b.pos.x, oz = o.pos.z - b.pos.z, od = hyp(ox, oz);
        if (od > PED_JAM_RADIUS || od < 1e-4 || (ox * gx + oz * gz) / od < 0.6) continue;
        this.blockSlide.x = gx * 0.35 - gz * 0.94;
        this.blockSlide.z = gz * 0.35 + gx * 0.94;
        return;
      }
    }
  }

  /** Group member: stay at the leader's side, wait when the leader waits. */
  private followLeader(dt: number): boolean {
    const L = this.leader!;
    const b = this.body;
    if (L.state === 'down' || L.state === 'fleeing' || L.leader === this) { this.detach(); this.snapToGraph(); return false; }
    const lb = L.body;
    const dToLeader = hyp(lb.pos.x - b.pos.x, lb.pos.z - b.pos.z);
    if (dToLeader > FOLLOW_DETACH) { this.detach(); this.snapToGraph(); return false; }
    const fx = Math.sin(lb.heading);
    const fz = -Math.cos(lb.heading);
    const side = 0.85 * this.slot;
    const tx = lb.pos.x + (-fz) * side - fx * 0.35;
    const tz = lb.pos.z + fx * side - fz * 0.35;
    const dx = tx - b.pos.x;
    const dz = tz - b.pos.z;
    const d = hyp(dx, dz);
    const leaderMoving = L.movingNow;
    if (d < 0.12 || (!leaderMoving && d < 0.5)) {
      b.vel.x = 0;
      b.vel.z = 0;
      if (!leaderMoving) {
        // idle: face the way the leader faces
        b.heading += angleDiff(b.heading, lb.heading) * Math.min(1, dt * 4);
      }
      return false;
    }
    const sp = Math.min(WALK_SPEED * 1.6, Math.max(0.4, d * 2.5, leaderMoving ? WALK_SPEED * 0.9 : 0));
    const step = Math.min(d, sp * dt);
    b.vel.x = (dx / d) * sp;
    b.vel.z = (dz / d) * sp;
    b.pos.x += (dx / d) * step;
    b.pos.z += (dz / d) * step;
    const want = Math.atan2(dx, -dz);
    b.heading += angleDiff(b.heading, leaderMoving ? lb.heading : want) * Math.min(1, dt * 8);
    return true;
  }

  /** After leaving a group: head for the nearest sidewalk node. */
  private snapToGraph(): void {
    const b = this.body;
    let best: string | null = null;
    let bd = Infinity;
    for (const id in this.sidewalks.nodes) {
      const n = this.sidewalks.nodes[id];
      const d = hyp(n.pos.x - b.pos.x, n.pos.z - b.pos.z);
      if (d < bd) { bd = d; best = id; }
    }
    this.prevId = null;
    this.targetId = best;
  }

  private arrive(node: GraphNode): void {
    this.pickNext(node.id);
    this.gateAt(node.id);
    if (this.state !== 'walking' || !this.env) return;
    // plans only on ordinary edges, never while a group depends on this pedestrian
    if (this.followers > 0 || this.isCrossingEdge(node.id, this.targetId)) return;
    const boost = this.env.idleBoost ?? 1;
    const hasStoops = !!this.env.stoops && this.env.stoops.length > 0, hasDoors = !!this.env.doors && this.env.doors.length > 0;
    if (hasStoops || hasDoors) {
      if (hasStoops && this.rng.chance(Math.min(0.4, STOOP_CHANCE * boost))) this.planStoop(node, this.env.stoops!);
      else if (hasDoors && this.idleRng.chance(Math.min(0.3, DOOR_CHANCE * boost))) this.planStoop(node, this.env.doors!);
    } else if (!this.isCrosswalk(node.id) && this.rng.chance(NODE_IDLE_CHANCE)) {
      this.state = 'sitting';
      this.sitOnStoop = false;
      this.phoneIdle = this.rng.chance(0.5);
      this.sitTimer = this.rng.range(SIT_MIN, SIT_MAX);
    }
  }

  /**
   * Mid-edge idle opportunities (graph nodes are far apart, so node arrivals alone rarely put anyone on a stoop): every few
   * seconds a free walker may head for a stoop or a shop door beside the edge it is on; the hour sets the odds.
   */
  private idleRoll(dt: number): void {
    this.idleTimer -= dt;
    if (this.idleTimer > 0) return;
    this.idleTimer = this.idleRng.range(IDLE_ROLL_MIN, IDLE_ROLL_MAX);
    const env = this.env;
    if (!env || env.idleBoost === undefined || this.state !== 'walking' || this.leader || this.followers > 0 || !this.targetId || !this.prevId) return;
    if (this.isCrossingEdge(this.prevId, this.targetId)) return;
    const boost = env.idleBoost ?? 1;
    const here = { id: '', pos: { x: this.body.pos.x, z: this.body.pos.z } };
    if (env.stoops && env.stoops.length > 0 && this.idleRng.chance(Math.min(0.3, IDLE_STOOP * boost))) this.planStoop(here, env.stoops);
    else if (env.doors && env.doors.length > 0 && this.idleRng.chance(Math.min(0.25, IDLE_DOOR * boost))) this.planStoop(here, env.doors);
  }

  private isCrossingEdge(fromId: string | null, toId: string | null): boolean {
    return !!(fromId && toId && this.env?.crossings?.has(`${fromId}>${toId}`));
  }

  /** At a node, about to take the edge to `targetId`: stop at the curb unless the signal says WALK. */
  private gateAt(nodeId: string): void {
    if (this.state !== 'walking' || !this.targetId) return;
    const info = this.env?.crossings?.get(`${nodeId}>${this.targetId}`);
    if (info) {
      const lights = this.env?.lights;
      if (lights && lights.hasSignal(info.intersectionId)) {
        if (!lights.walkFor(info.intersectionId, info.crossedStreetId)) this.startWaiting(info);
        return;
      }
      if (this.trafficNear(this.sidewalks.nodes[nodeId].pos)) this.startWaiting(null);
      return;
    }
    // legacy behaviour (no crosswalk table): look at the traffic when passing a crosswalk node
    if (!this.env?.crossings && this.isCrosswalk(nodeId) && this.trafficNear(this.sidewalks.nodes[nodeId].pos)) this.startWaiting(null);
  }

  private startWaiting(info: PedCrossing | null): void {
    this.state = 'waiting';
    this.waitCrossing = info;
    this.waitTimer = 0;
    this.recheck = WAIT_RECHECK;
    this.phoneIdle = info !== null && this.rng.chance(PHONE_CHANCE);
  }

  private isCrosswalk(id: string): boolean {
    return this.crosswalkNodes ? this.crosswalkNodes.has(id) : FALLBACK_CROSSWALK.test(id);
  }

  private trafficNear(p: Vec2): boolean {
    const list = this.world.queryCircle(p, CROSSWALK_SCAN_RADIUS);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind !== 'vehicle' && o.kind !== 'cop') continue;
      if (hyp(o.vel.x, o.vel.z) > HIT_SPEED) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ stoops

  /** Maybe sit on a stoop along the edge we are about to walk. */
  private planStoop(from: GraphNode, stoops: ReadonlyArray<StoopSpot>): void {
    const to = this.targetId ? this.sidewalks.nodes[this.targetId] : undefined;
    if (!to) return;
    const ex = to.pos.x - from.pos.x;
    const ez = to.pos.z - from.pos.z;
    const len2 = ex * ex + ez * ez;
    if (len2 < 25) return;
    const cands: Array<{ spot: StoopSpot; p0: Vec2 }> = [];
    for (let i = 0; i < stoops.length; i++) {
      const sp = stoops[i];
      const t = ((sp.pos.x - from.pos.x) * ex + (sp.pos.z - from.pos.z) * ez) / len2;
      if (t < 0.15 || t > 0.85) continue;
      const p0 = { x: from.pos.x + ex * t, z: from.pos.z + ez * t };
      if (hyp(sp.pos.x - p0.x, sp.pos.z - p0.z) > STOOP_LATERAL + 2.5) continue;
      cands.push({ spot: sp, p0 });
    }
    if (cands.length === 0) return;
    const c = cands[Math.floor(this.rng.next() * cands.length) % cands.length];
    this.detour = { stage: 0, p0: c.p0, spot: c.spot };
  }

  private advanceDetour(det: NonNullable<Pedestrian['detour']>): void {
    if (det.stage === 0) { det.stage = 1; return; }
    if (det.stage === 1) {
      this.state = 'sitting';
      const door = det.spot.kind === 'door';
      this.sitOnStoop = !door;
      this.phoneIdle = this.rng.chance(door ? 0.6 : PHONE_CHANCE);
      const boost = Math.max(1, this.env?.idleBoost ?? 1);
      this.sitTimer = door ? this.rng.range(DOOR_MIN, DOOR_MAX) : this.rng.range(SIT_MIN, SIT_MAX) * Math.min(2, boost);
      // stoop sitters face the street; shop loiterers lean on the wall and look along the pavement
      const out = det.spot.outward;
      this.body.heading = door ? Math.atan2(-out.z, -out.x) : Math.atan2(out.x, -out.z);
      return;
    }
    this.detour = null; // back on the walking line
  }

  // ------------------------------------------------------------------ threats

  /** Run from a vehicle that is heading straight at us at speed (a car mounting the sidewalk). */
  private scanThreats(dt: number): void {
    if (!this.env) return;
    this.threatTimer -= dt;
    if (this.threatTimer > 0) return;
    this.threatTimer = THREAT_PERIOD;
    const p = this.body.pos;
    const list = this.world.queryCircle(p, THREAT_RADIUS);
    const crossing = this.isCrossingEdge(this.prevId, this.targetId);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind !== 'vehicle' && o.kind !== 'cop') continue;
      const sp = hyp(o.vel.x, o.vel.z);
      if (sp < THREAT_MIN_SPEED) continue;
      const ux = o.vel.x / sp;
      const uz = o.vel.z / sp;
      const rx = p.x - o.pos.x;
      const rz = p.z - o.pos.z;
      const along = rx * ux + rz * uz;
      if (along < 0.3 || along > 4 + sp * 0.7) continue;
      if (Math.abs(rx * uz - rz * ux) > 1.6) continue;
      // on a crosswalk, ordinary traffic is expected to yield; only the player / runaways scare us there
      const driver = (o.userData as IVehicle | undefined)?.driver;
      if (crossing && this.state !== 'fleeing' && driver !== 'player') continue;
      if (this.state !== 'fleeing') { this.react('shout', o.pos); this.say('nearMiss'); }
      this.flee(o.pos, 3.5);
      return;
    }
  }

  // ------------------------------------------------------------------ graph walking

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
        const d = hyp(n.pos.x - this.fleeFrom.x, n.pos.z - this.fleeFrom.z);
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

  private animate(dt: number, moving: boolean): void {
    const target = !moving ? 0 : this.state === 'fleeing' ? 1.5 : 1;
    this.amp += (target - this.amp) * Math.min(1, dt * 10);
    if (this.amp < 0.01) this.amp = 0;
    if (this.rig) { this.rig.setSpeed(this.amp * (this.state === 'fleeing' ? 4 : 1.2)); this.rig.update(dt); }
    else if (this.model) {
      animateWalk(this.model, this.phase, this.amp);
      this.applyIdlePose(this.model);
    }
  }

  /** Procedural idle poses on top of the walk cycle: looking at a phone, sitting on a step. */
  private applyIdlePose(m: HumanModel): void {
    const pose = this.pose;
    if (pose === 'talk') this.talkPose(m);
    this.reactionPose(m);
    if (pose === 'phone') {
      m.head.rotation.x = -0.45;
      m.arms[1].rotation.x = 1.0;
      m.elbows[1].rotation.x = 1.5;
    } else if (pose === 'sit') {
      m.rig.position.y = -0.42;
      m.legs[0].rotation.x = 1.5;
      m.legs[1].rotation.x = 1.5;
      m.knees[0].rotation.x = -1.5;
      m.knees[1].rotation.x = -1.5;
      if (this.phoneIdle) {
        m.head.rotation.x = -0.45;
        m.arms[1].rotation.x = 1.0;
        m.elbows[1].rotation.x = 1.5;
      }
    }
  }

  /** Gesturing while talking: the speaker's free arm rises and falls, the head nods a little, both turn slightly to each other. */
  private talkPose(m: HumanModel): void {
    const t = this.gesture, speaking = (Math.floor(t / 3.2) + (this.chatLead ? 0 : 1)) % 2 === 0;
    const k = speaking ? 1 : 0.25;
    m.arms[1].rotation.x = 0.55 + k * (0.55 + 0.3 * Math.sin(t * 2.6));
    m.elbows[1].rotation.x = 0.9 + k * (0.5 + 0.4 * Math.sin(t * 2.6 + 1.2));
    m.arms[1].rotation.z = -0.1 * k * Math.sin(t * 1.7);
    m.arms[0].rotation.x = 0.1 + k * 0.25 * Math.max(0, Math.sin(t * 1.9 + 2));
    m.elbows[0].rotation.x = 0.35 + k * 0.5 * Math.max(0, Math.sin(t * 1.9 + 2));
    m.head.rotation.x = 0.04 * Math.sin(t * 3.1) * (speaking ? 1.5 : 0.6);
    m.head.rotation.y = 0.12 * Math.sin(t * 0.8);
    m.torso.rotation.y = 0.06 * Math.sin(t * 0.9);
  }
  private reactionPose(m: HumanModel): void {
    const r = this.reaction;
    if (this.pose !== 'talk') { m.arms[0].rotation.z = 0; m.arms[1].rotation.z = 0; }
    if (!r || r.delay > 0) return;
    const t = this.gesture, k = Math.sin((r.t / r.dur) * Math.PI);   // eases in and out
    switch (r.kind) {
      case 'glance': {
        if (r.toward) { const want = Math.atan2(r.toward.x - this.body.pos.x, -(r.toward.z - this.body.pos.z)); m.head.rotation.y = Math.max(-1.1, Math.min(1.1, -angleDiff(this.body.heading, want))) * k; }
        m.head.rotation.x += 0.05 * k;
        break;
      }
      case 'wave': m.arms[1].rotation.x = 2.3 * k; m.elbows[1].rotation.x = (0.5 + 0.55 * Math.sin(t * 11)) * k; m.head.rotation.x = -0.08 * k; break;
      case 'nod': m.head.rotation.x = 0.22 * k * Math.sin(t * 9); break;
      case 'laugh': m.torso.rotation.x = (-0.14 + 0.06 * Math.sin(t * 15)) * k; m.head.rotation.x = -0.32 * k; m.arms[0].rotation.x = 0.35 * k; m.arms[1].rotation.x = 0.35 * k; m.elbows[0].rotation.x = 0.9 * k; m.elbows[1].rotation.x = 0.9 * k; break;
      case 'startle': m.torso.rotation.x = -0.28 * k; m.head.rotation.x = -0.2 * k; m.arms[0].rotation.x = 1.3 * k; m.arms[1].rotation.x = 1.3 * k; m.elbows[0].rotation.x = 1.1 * k; m.elbows[1].rotation.x = 1.1 * k; m.arms[0].rotation.z = 0.35 * k; m.arms[1].rotation.z = -0.35 * k; break;
      case 'shout': m.arms[1].rotation.x = 2.5 * k; m.elbows[1].rotation.x = 0.7 * k; m.head.rotation.x = -0.22 * k; m.torso.rotation.x = -0.08 * k; break;
      case 'point': m.arms[1].rotation.x = 1.55 * k; m.elbows[1].rotation.x = 0.1 * k; break;
    }
  }

  private applyPose(): void {
    const o = this.object3D;
    const down = this.state === 'down';
    o.position.set(this.body.pos.x, down ? 0.22 : 0, this.body.pos.z);
    o.rotation.y = -this.body.heading;
    if (this.rig) this.rig.setDown(down); else o.rotation.x = down ? Math.PI / 2 : 0;
  }
}
