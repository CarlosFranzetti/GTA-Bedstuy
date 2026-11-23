import { hyp } from '@/core/Math2';
import * as THREE from 'three';
import type { EventBus } from '@/core/Events';
import { angleDiff, clamp, headingFromVec, type Vec2 } from '@/core/Math2';
import type { SignalLights } from '@/game/TrafficLights';
import { Rng } from '@/core/Rng';
import { animateWalk, type HumanModel } from '@/entities/models/humanModel';
import { AnimController, PED_ONESHOTS, type ActionPose } from '@/entities/anim/controller';
import { PedVitals, DAMAGE, type Force, type Temperament } from '@/entities/pedVitals';
import { makeGait, type Gait } from '@/entities/anim/gait';
import { easeGround, groundAt } from '@/world/Ground';
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
  lights?: SignalLights;
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
/** A person who is hit stands and turns to face the attacker for about this long (s) before running. */
export const FACE_BEAT = 0.55;
/** Metres of noise on each runner's choice of which way to go at a junction, so a crowd splits instead of all taking the same street. */
const FLEE_SPREAD = 22;
/** Fleeing people whose way out is within this cosine of side-on to the threat pick a way at random. */
const FLEE_TIE = 0.5;
const DOWN_TIME = 6;
/** COMBAT2: what happened to a person who was hit (see `Pedestrian.hitBy`). 'struckDown' = hit while already on the ground. */
export type HitResult = 'staggered' | 'knockedDown' | 'knockedOut' | 'struckDown' | 'ignored';
/** COMBAT2: what a person is doing instead of their daily walk: cowering, filming it, watching it, or fighting the player. */
export interface PedSpecial {
  mode: 'cower' | 'film' | 'watch' | 'fight';
  /** seconds left */
  t: number;
  /** what they face */
  at: Vec2;
  target?: Body2D;
  /** called when a punch of theirs lands (damage, where the puncher stands) */
  onHit?: (damage: number, from: Vec2) => void;
  phase: 'close' | 'wind' | 'swing' | 'recover';
  pt: number;
  punches: number;
  landed: boolean;
}
export const BRAWL = { speed: 3.4, reach: 1.15, giveUp: 16, wind: 0.45, swing: 0.45, recover: 0.5, punches: 3, damage: [7, 7, 12] as const, fightSeconds: 14 };
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
  /** COMBAT2: health, build and temperament (flee, cower, film, fight back) */
  readonly vitals: PedVitals;
  /** COMBAT2: cowering, filming, watching or fighting: set by Combat's crowd, ended here when the time is up */
  special: PedSpecial | null = null;
  /** the arm pose of a fight (read by the animator) */
  private fightPose: ActionPose | null = null;

  private readonly model: HumanModel | null = null;
  private readonly rig: CharacterRig | null = null;
  /** Optional rigged character source (GLB); when set, peds use it instead of the procedural model. */
  static characterSource: CharacterSource | null = null;
  private amp = 0;
  /** this person's own walk (style, cadence, stride, arm swing, posture) and the clip player that uses it */
  private gait: Gait | null = null;
  /** drawn height of the surface under the feet (NaN until first placed) */
  private groundY = NaN;
  private anim: AnimController | null = null;
  private animHeading = 0;
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
  /** bodies of this leader's followers: the head-on jam rule must not mistake one's own group for a pedestrian in the way */
  private readonly followerBodies = new Set<Body2D>();
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
  /** `gesture` clock at the last hitBy */
  private hitStamp = -1e9;
  private reactionSeen: object | null = null;
  /** seconds left of standing and turning to face `flinchAt` before the run starts (a hit, a gunshot) */
  private flinchT = 0;
  private readonly flinchAt: Vec2 = { x: 0, z: 0 };

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
    this.vitals = new PedVitals(id, this.person?.age ?? 'adult');

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
    leader.followerBodies.add(this.body);
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

  /**
   * Run away from a point for `seconds` (ignored while knocked down). With `pause` > 0 they first stand and turn to look at the point
   * for about that long (each person's own beat: 0.6 to 1.4 times it), then run.
   */
  flee(from: Vec2, seconds = 5, pause = 0): void {
    if (this.state === 'down') return;
    if (this.special && (this.special.mode === 'fight' || this.special.mode === 'cower')) return; // a fighter fights on; a person cowering stays frozen
    if (this.special) this.endSpecial(false);
    this.dropChat(false);
    this.flinchT = pause > 0 ? pause * (0.6 + 0.8 * this.rng.next()) : 0;
    this.flinchAt.x = from.x; this.flinchAt.z = from.z;
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
      // running toward the threat when the way to the next node points at it (not merely when that node is nearer to it): turn round
      const ax = this.body.pos.x - from.x, az = this.body.pos.z - from.z, tx = t.pos.x - this.body.pos.x, tz = t.pos.z - this.body.pos.z;
      const cos = (ax * tx + az * tz) / ((hyp(ax, az) * hyp(tx, tz)) || 1);
      // side-on to the threat: either way is as good, so people split up
      if (cos < (Math.abs(cos) < FLEE_TIE ? (this.rng.next() - 0.5) * FLEE_TIE : 0)) {
        const back = this.prevId;
        this.prevId = this.targetId;
        this.targetId = back;
      }
    }
  }

  /** True for a child or a teenager: combat never hurts them (see hitBy). */
  get isMinor(): boolean { const a = this.person?.age; return a === 'kid' || a === 'teen'; }

  /**
   * Someone hit this person (src/game/combat). COMBAT2: health by age and build, a strike by its kind (`force`, and `damage` when the
   * weapon says so). A jab staggers; a second jab inside six seconds, a heavy, thrown, club or shot blow, or a person already worn down
   * puts them on the ground; running out of health knocks them OUT (down for twenty seconds and more, breathing, then up and away).
   * A person already on the ground can be hit again ('struckDown'; the blow that empties them knocks them out). Nobody dies.
   * Who runs, cowers or fights back after it is decided from the temperament (cower here; fighting back is started by Combat).
   */
  hitBy(from: Vec2, force: Force = 'light', damage?: number): HitResult {
    // Lead's line (22 Nov): children and teenagers are never hurt. A blow aimed at one does not land: they duck away and run.
    // No damage, no blood, no knock-down. Cars and everything else treat them as before.
    if (this.isMinor) { this.dropChat(false); if (this.special) this.endSpecial(false); if (this.state !== 'down') this.flee(from, 6); return 'ignored'; }
    const onGround = this.state === 'down';
    const wasOut = this.vitals.out;
    const out = this.vitals.strike(force, damage ?? DAMAGE[force], onGround);
    const dx = this.body.pos.x - from.x, dz = this.body.pos.z - from.z, d = hyp(dx, dz) || 1;
    this.dropChat(false);
    if (onGround) {
      this.body.vel.x += (dx / d) * 0.8; this.body.vel.z += (dz / d) * 0.8;
      if (out === 'out' && !wasOut) { this.downTimer = this.vitals.downSeconds('out'); return 'knockedOut'; }
      if (this.vitals.out) this.downTimer = Math.max(this.downTimer, 6); // hit again while out: stays out a while longer
      else this.downTimer = Math.max(this.downTimer, 2.5); // hit on the ground: not up for a moment
      return 'struckDown';
    }
    if (this.special) this.endSpecial(false);
    if (out === 'stagger') {
      this.body.pos.x += (dx / d) * 0.25; this.body.pos.z += (dz / d) * 0.25;
      this.react('startle', from);
      this.say('hurt');
      if (this.vitals.temper === 'cower') this.cower(from, 7);
      else this.flee(from, 5, FACE_BEAT); // turns to face whoever did it for a beat, then runs
      return 'staggered';
    }
    this.state = 'down';
    this.flinchT = 0;
    this.waitCrossing = null;
    this.detour = null;
    this.reaction = null;
    this.detach();
    this.downTimer = out === 'out' ? this.vitals.downSeconds('out') : DOWN_TIME;
    const push = force === 'blast' ? 5.2 : force === 'heavy' || force === 'club' ? 3.4 : 2.4;
    this.body.vel.x = (dx / d) * push;
    this.body.vel.z = (dz / d) * push;
    this.events.emit('pedKnockedDown', { id: this.id, pos: { x: this.body.pos.x, z: this.body.pos.z } });
    return out === 'out' ? 'knockedOut' : 'knockedDown';
  }

  /** A mission person who must not stay out (they go down for a few seconds but wake at once). */
  get knockoutImmune(): boolean { return this.vitals.immune; }
  set knockoutImmune(v: boolean) { this.vitals.immune = v; }
  /** Out cold on the ground (knocked out and not yet up). */
  get isKnockedOut(): boolean { return this.state === 'down' && this.vitals.out; }

  // ------------------------------------------------------------------ COMBAT2: what people do in a fight

  /** Freeze and cover up for `seconds`, facing away from the threat. */
  cower(from: Vec2, seconds = 7): void { this.beginSpecial({ mode: 'cower', t: seconds * (0.8 + 0.4 * this.rng.next()), at: { x: from.x, z: from.z } }); this.say('help'); }
  /** Stand, face it and film it on a phone. */
  film(toward: Vec2, seconds = 11): void { this.beginSpecial({ mode: 'film', t: seconds * (0.8 + 0.4 * this.rng.next()), at: { x: toward.x, z: toward.z } }); this.say('filming'); }
  /** Stand and watch (a ring of onlookers). */
  watch(toward: Vec2, seconds = 8): void { this.beginSpecial({ mode: 'watch', t: seconds * (0.7 + 0.6 * this.rng.next()), at: { x: toward.x, z: toward.z } }); }
  /** Go for `target` (the player): close in, wind up where it can be seen, punch two or three times, then leave. */
  fightBack(target: Body2D, onHit: (damage: number, from: Vec2) => void): void {
    if (this.state === 'down') return;
    this.beginSpecial({ mode: 'fight', t: BRAWL.fightSeconds, at: { x: target.pos.x, z: target.pos.z }, target, onHit });
    this.say('fightMe');
  }

  private beginSpecial(o: { mode: PedSpecial['mode']; t: number; at: Vec2; target?: Body2D; onHit?: PedSpecial['onHit'] }): void {
    this.dropChat(false); this.detach();
    this.waitCrossing = null; this.detour = null; this.flinchT = 0; this.fightPose = null;
    this.special = { ...o, phase: 'close', pt: 0, punches: 0, landed: false };
    this.state = 'waiting'; this.waitTimer = 0;
  }

  /** Back to walking (or running off, when `run`). */
  endSpecial(run: boolean): void {
    const sp = this.special;
    if (!sp) return;
    this.special = null; this.fightPose = null;
    if (this.state === 'waiting') this.state = 'walking';
    this.body.vel.x = 0; this.body.vel.z = 0;
    if (sp.mode === 'fight') this.snapToGraph();
    if (run) this.flee(sp.at, 6);
  }

  /** The step of whoever is doing one of the special things; true while moving. */
  private updateSpecial(dt: number, sp: PedSpecial): boolean {
    const b = this.body;
    sp.t -= dt;
    if (sp.mode !== 'fight') {
      b.vel.x = 0; b.vel.z = 0;
      const want = sp.mode === 'cower' ? Math.atan2(-(sp.at.x - b.pos.x), sp.at.z - b.pos.z) : Math.atan2(sp.at.x - b.pos.x, -(sp.at.z - b.pos.z));
      b.heading += angleDiff(b.heading, want) * Math.min(1, dt * 6);
      if (sp.t <= 0) this.endSpecial(false);
      return false;
    }
    const tg = sp.target;
    if (!tg || sp.t <= 0) { this.endSpecial(true); return false; }
    const dx = tg.pos.x - b.pos.x, dz = tg.pos.z - b.pos.z, d = hyp(dx, dz) || 1e-3;
    sp.at.x = tg.pos.x; sp.at.z = tg.pos.z;
    b.heading += angleDiff(b.heading, Math.atan2(dx, -dz)) * Math.min(1, dt * 12);
    sp.pt += dt;
    const hand = sp.punches % 2 === 0 ? 'punchR' : 'punchL';
    const heavy = sp.punches >= BRAWL.punches - 1;
    const kind = heavy ? 'heavy' : hand;
    this.fightPose = null;
    if (sp.phase === 'close') {
      if (d > BRAWL.giveUp) { this.endSpecial(true); return false; }
      if (d > BRAWL.reach) {
        const v = Math.min(BRAWL.speed, (d - BRAWL.reach * 0.9) / Math.max(dt, 1e-3));
        b.vel.x = (dx / d) * v; b.vel.z = (dz / d) * v;
        b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt;
        return true;
      }
      sp.phase = 'wind'; sp.pt = 0; sp.landed = false;
    }
    b.vel.x = 0; b.vel.z = 0;
    if (sp.phase === 'wind') {
      this.fightPose = { kind, k: 0.18 * Math.min(1, sp.pt / BRAWL.wind) };
      if (d > BRAWL.reach + 0.8) { sp.phase = 'close'; sp.pt = 0; return false; }
      if (sp.pt >= BRAWL.wind) { sp.phase = 'swing'; sp.pt = 0; }
      return false;
    }
    if (sp.phase === 'swing') {
      const k = 0.18 + 0.82 * Math.min(1, sp.pt / BRAWL.swing);
      this.fightPose = { kind, k };
      if (!sp.landed && k >= (heavy ? 0.5 : 0.4)) {
        sp.landed = true;
        if (d <= BRAWL.reach + 0.5) sp.onHit?.(BRAWL.damage[Math.min(sp.punches, 2)], { x: b.pos.x, z: b.pos.z });
      }
      if (sp.pt >= BRAWL.swing) { sp.punches++; sp.phase = 'recover'; sp.pt = 0; }
      return false;
    }
    // recover
    if (sp.pt >= BRAWL.recover) {
      if (sp.punches >= BRAWL.punches) { this.endSpecial(true); return false; }
      sp.phase = 'close'; sp.pt = 0;
    }
    return false;
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
    // thrown clear of the bumper: along the car's path with a push away from its centreline; cars pass over the body while it slides
    {
      const cs = hyp(other.vel.x, other.vel.z) || 1;
      let ax = this.body.pos.x - other.pos.x, az = this.body.pos.z - other.pos.z;
      const al = hyp(ax, az) || 1; ax /= al; az /= al;
      let dx = other.vel.x / cs + ax * 0.5, dz = other.vel.z / cs + az * 0.5;
      const dl = hyp(dx, dz) || 1;
      const v = Math.min(11, cs * 0.75) + 1;
      this.body.vel.x = (dx / dl) * v; this.body.vel.z = (dz / dl) * v;
      this.body.vehiclePass = true;
    }
    const pos = { x: this.body.pos.x, z: this.body.pos.z };
    this.events.emit('pedKnockedDown', { id: this.id, pos });
    if ((other.userData as IVehicle | undefined)?.driver === 'player') {
      this.events.emit('crime', { type: 'hitPed', pos });
    }
  }

  update(dt: number): void {
    const b = this.body;
    let moving = false;
    this.vitals.tick(dt);
    if (this.state !== 'down' && this.vitals.health < this.vitals.max) this.vitals.health = Math.min(this.vitals.max, this.vitals.health + 0.35 * dt);
    if (this.special && this.state !== 'down') moving = this.updateSpecial(dt, this.special);
    else switch (this.state) {
      case 'down': {
        this.downTimer -= dt;
        b.pos.x += b.vel.x * dt;
        b.pos.z += b.vel.z * dt;
        const damp = Math.exp(-4 * dt);
        b.vel.x *= damp;
        b.vel.z *= damp;
        if (this.downTimer < DOWN_TIME - 1.2) b.vehiclePass = false; // the slide is over after ~1.2 s: from then on they are an obstacle on the ground again
        if (this.downTimer <= 0) {
          this.state = 'walking';
          if (this.vitals.out) this.vitals.wake();
          b.vehiclePass = false;
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
        if (this.state === 'fleeing' && this.flinchT > 0) {
          // frozen for a beat, turning to look at what happened
          this.flinchT -= dt;
          b.vel.x = 0; b.vel.z = 0;
          b.heading += angleDiff(b.heading, Math.atan2(this.flinchAt.x - b.pos.x, -(this.flinchAt.z - b.pos.z))) * Math.min(1, dt * 14);
          break;
        }
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
    this.dropChat(false, 5);
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
    if (this.leader) {
      this.leader.followers = Math.max(0, this.leader.followers - 1);
      this.leader.followerBodies.delete(this.body);
      this.leader = null;
      this.snapToGraph(); // a follower's own route is where it was dealt out, not where it walks now (it would cross the map in a line)
    }
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
    const speed = this.state === 'fleeing' ? FLEE_SPEED : WALK_SPEED * this.walkGait().speedScale;
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
    // the SIMULATION changes speed at once (seeded traffic sims depend on where a person is at every tick); the soft set-off is
    // drawn by the animation layer only (AnimController eases its own pace, lean and stride)
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
        if (o.kind !== 'ped' || o === b || this.followerBodies.has(o) || (this.leader !== null && (o === this.leader.body || this.leader.followerBodies.has(o)))) continue; // own group is no jam
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
        const d = hyp(n.pos.x - this.fleeFrom.x, n.pos.z - this.fleeFrom.z) + (this.rng.next() - 0.5) * FLEE_SPREAD;
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
      // captured-motion clips, each person with their own gait; the hand-keyed walk is the fallback if no clip pack decoded
      if (!this.anim) {
        this.anim = new AnimController(this.model, this.walkGait());
        // ANIM2: a bag or tote in the hand takes most of the swing out of that arm
        const gear = (this.model as { spec?: { gear?: string } }).spec?.gear;
        if (gear === 'bag' || gear === 'tote') this.anim.setCarry(1, 0.3);
      }
      const b = this.body;
      const yawRate = dt > 0 ? -angleDiff(this.animHeading, b.heading) / dt : 0;
      this.animHeading = b.heading;
      if (this.pose === 'phone') this.anim.setIdle('phone', this.gait!.idleOffset > 2.5);
      else if (this.pose === 'talk' && this.anim.hasClip('talk')) {
        const speaking = (Math.floor(this.gesture / 3.2) + (this.chatLead ? 0 : 1)) % 2 === 0; // the same turn-taking as the procedural talk pose
        this.anim.setIdle(speaking ? (this.chatLead ? 'talk' : 'talk2') : null);
      } else {
        // people standing about each have their own way of doing it: plain, a second captured stance, arms crossed, or leaning (hand-keyed)
        const io = this.gait!.idleOffset;
        this.anim.setIdle(io > 4.3 ? 'crossed' : io > 3.6 ? 'idle2' : io < 0.6 && this.state === 'waiting' ? 'lean' : null, io > 2.5);
      }
      const speed = moving ? Math.hypot(b.vel.x, b.vel.z) : 0;
      // far level of detail (a few hundred triangles, 40 m and more away): no foot lock, breathing or look-at
      const lod = (this.lodObj ??= this.model.group.getObjectByName('pedLod') as THREE.LOD | null ?? null);
      const farLevel = !!lod && lod.levels.length > 1 && lod.levels[lod.levels.length - 1].object.visible;
      if (this.anim.cheap !== farLevel) this.anim.cheap = farLevel;
      this.anim.rampUp = this.state === 'fleeing' ? 9 : 3.4;
      this.animLive = this.anim.update(dt, { speed, yawRate, look: farLevel ? null : this.glance(dt), action: this.fightPose });
      if (!this.animLive) animateWalk(this.model, this.phase, this.amp);
      this.applyIdlePose(this.model);
    }
  }

  /** The person to glance at (the player): the host sets it once, to a live position. Null = nobody. */
  static lookAtPoint: Vec2 | null = null;
  private lodObj: THREE.LOD | null | undefined;
  /** the animation controller posed the body this frame (else the procedural walk did) */
  private animLive = false;
  private glanceW = 0;
  private glanceYaw = 0;
  /**
   * Heads turn to the player when he is close and in front (within 6 m, 110 degrees), in glances: each person looks for a while, looks away,
   * looks again (about half of them are not curious at all). Nobody who is fleeing, down or startled looks. Eased so the head never snaps.
   */
  private glance(dt: number): { yaw: number; pitch: number } | null {
    const t = Pedestrian.lookAtPoint, b = this.body;
    let want = 0, yaw = this.glanceYaw;
    if (t && (this.state === 'walking' || this.state === 'waiting')) {
      const dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d < 6 && d > 0.6) {
        const rel = angleDiff(b.heading, headingFromVec({ x: dx, z: dz }));
        const seed = Rng.hash(`${this.id}:glance`);
        const curious = (seed & 1) === 0;
        this.glanceClock += dt;
        const phase = Math.sin(this.glanceClock * 0.9 + (seed % 628) / 100);
        if (curious && Math.abs(rel) < 1.9 && phase > -0.2) { want = 1; yaw = clamp(rel, -1.0, 1.0); }
      }
    }
    this.glanceW += (want - this.glanceW) * (1 - Math.exp(-4 * dt));
    if (want) this.glanceYaw = yaw;
    if (this.glanceW < 0.01) return null;
    return { yaw: -this.glanceYaw * this.glanceW, pitch: 0 }; // positive = to their left; the heading angle is clockwise
  }
  private glanceClock = 0;

  /** This person's gait, from their id and age (deterministic, no random draws). */
  private walkGait(): Gait { return this.gait ??= makeGait(Rng.hash(`${this.id}:gait`), this.person?.age ?? 'adult'); }

  /** Procedural idle poses on top of the walk cycle: looking at a phone, sitting on a step. */
  private applyIdlePose(m: HumanModel): void {
    const pose = this.pose;
    if (pose === 'talk' && !(this.anim?.idleClipName.startsWith('talk') ?? false)) this.talkPose(m); // the captured conversation gestures replace it when loaded
    this.reactionPose(m);
    if (this.special && this.special.mode !== 'fight') this.specialPose(m, this.special.mode);
    if (pose === 'phone' && this.anim?.idleClipName === 'phone') {
      // the captured phone-to-ear idle is already playing
    } else if (pose === 'phone') {
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

  /** COMBAT2: cowering (bent over, arms over the head, knees bent), filming (a phone held up in front), watching (arms folded). */
  private specialPose(m: HumanModel, mode: 'cower' | 'film' | 'watch'): void {
    const t = this.gesture;
    if (mode === 'cower') {
      m.torso.rotation.x = -0.62; m.head.rotation.x = 0.35;
      m.arms[0].rotation.x = 2.3; m.arms[1].rotation.x = 2.3; m.elbows[0].rotation.x = 2.1; m.elbows[1].rotation.x = 2.1;
      m.arms[0].rotation.z = 0.25; m.arms[1].rotation.z = -0.25;
      m.legs[0].rotation.x = 0.55; m.legs[1].rotation.x = 0.55; m.knees[0].rotation.x = -1.0; m.knees[1].rotation.x = -1.0;
      m.rig.position.y = -0.3 + 0.01 * Math.sin(t * 9);
    } else if (mode === 'film') {
      m.arms[1].rotation.x = 1.5; m.elbows[1].rotation.x = 1.1; m.arms[1].rotation.z = -0.1;
      m.arms[0].rotation.x = 1.25; m.elbows[0].rotation.x = 1.3; m.arms[0].rotation.z = 0.12;
      m.head.rotation.x = 0.06 * Math.sin(t * 1.3); m.torso.rotation.x = 0.04;
    } else {
      m.arms[0].rotation.x = 0.55; m.arms[1].rotation.x = 0.55; m.elbows[0].rotation.x = 1.9; m.elbows[1].rotation.x = 1.9; m.arms[0].rotation.y = -0.9; m.arms[1].rotation.y = 0.9;
      m.head.rotation.x = 0.05 * Math.sin(t * 0.9);
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
    const splay = (m.group.userData.splay as number | undefined) ?? 0;
    if (this.pose !== 'talk' && !this.animLive) { m.arms[0].rotation.z = -splay; m.arms[1].rotation.z = splay; } // the controller's body layers hold the arm clearance now (POSE)
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
      case 'startle': if (this.anim?.hasClip('flinch')) {
        if (this.reactionSeen !== r) { this.reactionSeen = r; this.anim.playOnce('flinch', PED_ONESHOTS.flinch); }
        break;
      }
        m.torso.rotation.x = -0.28 * k; m.head.rotation.x = -0.2 * k; m.arms[0].rotation.x = 1.3 * k; m.arms[1].rotation.x = 1.3 * k; m.elbows[0].rotation.x = 1.1 * k; m.elbows[1].rotation.x = 1.1 * k; m.arms[0].rotation.z = 0.35 * k; m.arms[1].rotation.z = -0.35 * k; break;
      case 'shout': m.arms[1].rotation.x = 2.5 * k; m.elbows[1].rotation.x = 0.7 * k; m.head.rotation.x = -0.22 * k; m.torso.rotation.x = -0.08 * k; break;
      case 'point': m.arms[1].rotation.x = 1.55 * k; m.elbows[1].rotation.x = 0.1 * k; break;
    }
  }

  private applyPose(): void {
    const o = this.object3D;
    const down = this.state === 'down';
    this.groundY = easeGround(this.groundY, groundAt(this.body.pos.x, this.body.pos.z), 1 / 60); // on a sidewalk the slab is 0.15 m up
    // COMBAT2: someone knocked out breathes
    const breath = down && this.vitals.out ? 0.012 * Math.sin(this.gesture * 2.4) : 0;
    o.position.set(this.body.pos.x, (down ? 0.22 : 0) + this.groundY + breath, this.body.pos.z);
    o.rotation.y = -this.body.heading;
    if (this.rig) this.rig.setDown(down); else o.rotation.x = down ? Math.PI / 2 : 0;
  }
}
