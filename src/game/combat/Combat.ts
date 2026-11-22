/**
 * On-foot combat, GTA III style: ONE action button whose meaning depends on what is in the player's hands.
 *   fists  -> a quick left-right jab, a third press inside a short window is a heavy hit
 *   bat / pipe / fish -> a swing (the bat has a forehand and a backhand, the pipe one heavy overhead blow, the fish a slap)
 *   bottle / brick -> a throw along the camera's yaw (a bottle shatters, a brick can be picked up again)
 *   pistol / revolver / shotgun -> a hitscan shot along the camera's yaw (the shotgun fires a spread of pellets and pumps between shots)
 * COMBAT2 (22 Nov): anyone can be hit, in every state, police officers too; blood and weapons are in (owner's decision), but not
 * gore: nobody is torn apart, people go down hurt or knocked out and get up again. People react by their temperament (crowd.ts),
 * some fight back and can hurt the player (vitals.ts).
 *
 * Wiring (see docs/swarm/tasks/COMBAT2.md): construct once, call `update(dt, ...)` once per fixed step after `player.control`, and read
 * `holdView` for the camera. The class owns the hands, the pickups, the flying items and the effects.
 */
import type * as THREE from 'three';
import { angleDiff, forwardFromHeading, headingFromVec, type Vec2 } from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type { Pedestrian } from '@/entities/Pedestrian';
import type { Officer } from '@/entities/Officer';
import type { ActionPose } from '@/entities/anim/controller';
import type { Force } from '@/entities/pedVitals';
import type { Body2D, IWorld2D } from '@/world/types';
import { GUNS, MELEE, pelletDamage, pelletOffsets, type GunId } from './arsenal';
import type { BloodFx } from './blood';
import { Crowd, FIGHT_FLEE_RADIUS, FIGHT_WATCH_RADIUS, LOOK_BEAT as CROWD_LOOK_BEAT, WITNESS_RADIUS as CROWD_WITNESS, type Person } from './crowd';
import { FIST, FistCombo, fistTip, inFistArc, type FistImpact } from './fists';
import { Hands, PISTOL, actionFor, isGun, isMelee, type HandsHudState } from './items';
import { MeleeCombo } from './melee';
import { PickupSet, type PickupDef } from './pickups';
import { bounce, impactOutcome, launch, stepProjectile, type FlightHit, type Projectile, type ThrowKind } from './projectile';
import type { CombatSounds } from './sfx';
import { assistYaw, resolveShot } from './shot';
import type { PlayerVitals } from './vitals';
import type { CombatFx, V3 } from './view';

/** Anything the player can hit: a pedestrian or a police officer on foot. */
export type Victim = Pedestrian | Officer;

/** The bits of Player the combat system touches. */
export interface CombatPlayer {
  body: { pos: Vec2; vel: Vec2; heading: number };
  inVehicle: boolean;
  isEntering: boolean;
  /** set by Combat each step */
  actionPose: ActionPose | null;
  aimYaw: number | null;
  handAnchor?(): THREE.Object3D | null;
}

/** The bits of Input the combat system reads (consumes the press edges so they never pile up). */
export interface CombatInput {
  actionHeld(): boolean;
  consumeAction(): boolean;
  consumeCycle(): number;
}

export interface CombatDeps {
  events: EventBus;
  world: IWorld2D;
  /** every person who can be hit: the pedestrians and, with them, `police.officers` */
  peds: () => Iterable<Victim>;
  player: CombatPlayer;
  pickups?: readonly PickupDef[];
  sfx?: CombatSounds;
  fx?: CombatFx;
  /** blood (Blood from ./blood, created with the quality tier); absent or switched Off = none */
  blood?: BloodFx & { update?(dt: number): void };
  /** the player's health (people who fight back can hurt him) */
  vitals?: PlayerVitals;
  /** the player was hit first: `police.noteAttacked` (fighting back is self-defence) */
  noteAttacked?: () => void;
  /** the player's health ran out and he has been on the ground a moment: the game takes him to the hospital */
  onKnockedOut?: () => void;
  /** Called when the HUD has something new to show. */
  onHands?: (s: HandsHudState | null) => void;
}

export interface CombatFrame {
  /** camera heading: throws and shots go this way */
  viewYaw: number;
  /** true while a menu, the phone, a room or the title is up: the button does nothing and pickups stay on the ground */
  blocked: boolean;
  input: CombatInput;
}

/** Pedestrians this close to a fight run (m), and the ones this close see it (witnesses). */
export const FLEE_RADIUS = FIGHT_FLEE_RADIUS;
export const SHOUT_RADIUS = FIGHT_WATCH_RADIUS;
export const WITNESS_RADIUS = CROWD_WITNESS;
/** A gunshot carries further than a scuffle: people this close run, the ones this close shout (the pistol's; each gun has its own in arsenal.ts). */
export const GUNSHOT_FLEE_RADIUS = GUNS.pistol.fleeRadius;
export const GUNSHOT_SHOUT_RADIUS = GUNS.pistol.shoutRadius;
/** Bystanders stand and look at what happened for about this long (s, each person 0.6 to 1.4 times it) before they run. */
export const LOOK_BEAT = CROWD_LOOK_BEAT;
/** Seconds the player keeps facing the aim after releasing the button with a gun out. */
const AIM_HOLD = 0.35;
const THROW_WINDUP = 0.22;
const THROW_TIME = 0.5;
const CHEST = 1.3;
/** a thrown bottle and brick: damage */
const THROWN_DAMAGE: Record<ThrowKind, number> = { bottle: 12, brick: 22 };
/** how long the player lies after the hospital knock-out before the game moves him (s) */
const KO_LIE = 1.4;

interface PendingFlee { ped: Victim; from: Vec2; seenDown: boolean; wait: number; out: boolean }

const isPed = (v: Victim): v is Pedestrian => typeof (v as Pedestrian).flee === 'function' && (v as Pedestrian).vitals !== undefined && typeof (v as Pedestrian).cower === 'function';

export class Combat {
  readonly hands = new Hands();
  readonly pickups: PickupSet;
  readonly crowd: Crowd;
  /** True while the camera must not drift back behind the player (aiming a gun). Set `cam.holdView = combat.holdView`. */
  holdView = false;
  private readonly fists = new FistCombo();
  private readonly melee = new MeleeCombo(MELEE.bat);
  private readonly flights: Projectile[] = [];
  private readonly pendingFlee: PendingFlee[] = [];
  private t = 0;
  private fireCool = 0;
  private reloadLeft = 0;
  private aimHold = 0;
  private recoil = 0;
  private pumpLeft = 0;
  private pumpSound = -1;
  private throwT = -1;
  private throwKind: ThrowKind | null = null;
  private throwYaw = 0;
  private dryClicked = false;
  private lastHud = '';
  private shots = 0;
  private koT = 0;
  private koFired = false;
  /** knock-back of the last punch taken (m/s), fading: it moves the player while he is stunned */
  private readonly knock = { x: 0, z: 0 };
  /** last frame: the player may act (on foot, nothing blocking) */
  private live = false;
  private aimHeld = false;

  constructor(private readonly deps: CombatDeps) {
    this.pickups = new PickupSet(deps.pickups ?? []);
    this.hands.onChange = () => this.pushHud();
    this.crowd = new Crowd({
      peds: () => this.persons(),
      player: () => this.deps.player.body as unknown as Body2D,
      onPlayerHit: (dmg, from) => this.playerHit(dmg, from),
    });
  }

  private *persons(): IterableIterator<Person> { for (const v of this.deps.peds()) if (isPed(v)) yield v; }

  /** Step to the next (+1) or previous (-1) item; the HUD widget calls this on a tap. */
  cycle(dir: number): void {
    this.reloadLeft = 0; this.throwT = -1; this.fists.cancel(); this.melee.cancel(); this.pumpLeft = 0;
    this.hands.cycle(dir);
  }

  /** What the HUD shows now: the hands, with the reticle flag on foot; dimmed in a car, where the action button does nothing yet. */
  hudState(): HandsHudState | null {
    const s = this.hands.state();
    if (this.deps.player.inVehicle) return { ...s, dim: true };
    return { ...s, aim: this.live && (actionFor(s.item) === 'shoot' || actionFor(s.item) === 'throw'), shots: this.shots };
  }

  /**
   * 0 or 1: the action button is held with a gun or a throwable in hand, so the camera slides a little further over the shoulder.
   * Wiring: `cam.aimBias = combat.aimBias` next to `cam.holdView = combat.holdView`.
   */
  get aimBias(): number { return this.aimHeld ? 1 : 0; }

  /** The player is staggering or on the ground after a punch: main.ts cuts his movement while this is true. */
  get stunned(): boolean { return !!this.deps.vitals && this.deps.vitals.stunned; }

  /** The hands, for the saved game (see ui/GameSave). */
  serialize(): unknown { return this.hands.serialize(); }
  /** Put the hands back from a save; anything in progress stops. */
  restore(d: unknown): void { this.stopAll(); this.recoil = 0; this.hands.restore(d); }
  /** A new game, a bust, a hospital: empty hands. */
  reset(): void { this.restore(null); }

  private pushHud(): void {
    const s = this.hudState();
    const key = s ? `${s.item}|${s.count}|${s.reserve}|${s.reloading}|${s.aim ? 1 : 0}|${s.shots ?? 0}|${s.dim ? 1 : 0}` : '';
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.deps.onHands?.(s);
  }

  // ------------------------------------------------------------------------------------------------ the frame

  update(dt: number, frame: CombatFrame): void {
    const p = this.deps.player;
    this.t += dt;
    // always take the edges, so a press during a menu is not remembered
    const pressed = frame.input.consumeAction();
    const held = frame.input.actionHeld();
    const cyc = frame.input.consumeCycle();
    const vit = this.deps.vitals;
    vit?.update(dt);
    const hurtNow = !!vit && vit.stunned;
    const live = !frame.blocked && !p.inVehicle && !p.isEntering && !hurtNow;
    this.live = live;
    this.aimHeld = false;

    // pickups: walking over them while on foot; the glow and bob are drawn either way
    const got = this.pickups.update(dt, p.body.pos, live, (k) => this.hands.canTake(k));
    for (const g of got) { this.hands.add(g.kind); this.deps.sfx?.pickup(); }
    this.deps.fx?.pickups(this.pickups.active(), p.body.pos.x, p.body.pos.z, this.t);

    if (hurtNow && !frame.blocked && !p.inVehicle) {
      // staggering or lying: nothing in the hands works; the body shows it
      this.stopAll();
      const k = Math.exp(-6 * dt);
      this.knock.x *= k; this.knock.z *= k;
      p.body.vel.x = this.knock.x; p.body.vel.z = this.knock.z; // runs after player.control: his own input does nothing while he reels
      p.actionPose = { kind: 'hurt', k: vit!.down ? Math.min(1, 0.25 + (1 - vit!.downT / 1.7) * 0.75) : Math.min(1, 0.5 + (0.35 - vit!.stun)) };
    } else if (!live) {
      this.stopAll();
    } else {
      if (cyc) this.cycle(cyc);
      this.fireCool = Math.max(0, this.fireCool - dt);
      const action = actionFor(this.hands.current);
      if (action !== 'throw') this.throwT = -1;
      if (action !== 'punch') this.fists.cancel();
      if (action !== 'swing') this.melee.cancel();
      if (action !== 'shoot') { this.reloadLeft = 0; this.aimHold = 0; this.hands.reloading = false; this.pumpLeft = 0; this.pumpSound = -1; }
      if (action === 'punch') this.updateFists(dt, pressed);
      else if (action === 'swing') this.updateMelee(dt, pressed);
      else if (action === 'throw') this.updateThrow(dt, pressed, frame);
      else this.updateGun(dt, pressed, held, frame);
      this.aimHeld = held && action !== 'punch' && action !== 'swing' && (action === 'shoot' || (this.hands.current === 'bottle' ? this.hands.bottles : this.hands.bricks) > 0 || this.throwT >= 0);
    }
    // knocked out: after a moment on the ground the game takes him to the hospital
    if (vit?.out) {
      this.koT += dt;
      if (!this.koFired && this.koT >= KO_LIE) { this.koFired = true; this.deps.onKnockedOut?.(); }
    } else { this.koT = 0; this.koFired = false; }

    this.updateFlights(dt);
    this.updateFlees(dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.deps.blood?.update?.(dt);
    this.deps.fx?.setHeld(live ? this.hands.current : 'fists', p.handAnchor?.() ?? null);
    this.deps.fx?.update(dt);
    this.pushHud();
  }

  private stopAll(): void {
    const p = this.deps.player;
    this.fists.cancel(); this.melee.cancel(); this.throwT = -1; this.reloadLeft = 0; this.aimHold = 0; this.hands.reloading = false; this.pumpLeft = 0; this.pumpSound = -1;
    this.holdView = false; p.aimYaw = null; p.actionPose = null;
  }

  // ------------------------------------------------------------------------------------------------ fists

  private updateFists(dt: number, pressed: boolean): void {
    const p = this.deps.player;
    this.holdView = false; p.aimYaw = null;
    if (pressed) {
      const was = this.fists.busy;
      if (!was) this.faceNearPed();
      this.fists.press();
      if (!was && this.fists.busy) this.deps.sfx?.whoosh();
    }
    const impact = this.fists.update(dt);
    if (impact) this.punchLands(impact);
    const sw = this.fists.swing;
    p.actionPose = sw ? { kind: sw === 'H' ? 'heavy' : sw === 'R' ? 'punchR' : 'punchL', k: this.fists.progress } : null;
  }

  /** A light lock-on: a person within 1.7 m and 75 degrees of where the player is facing pulls the body round to them as a swing starts. */
  private faceNearPed(reach = 1.7): void {
    const b = this.deps.player.body;
    let best: Victim | null = null, bestD = reach;
    for (const ped of this.deps.peds()) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.body.pos.x - b.pos.x, ped.body.pos.z - b.pos.z);
      if (d >= bestD) continue;
      const to = headingFromVec({ x: ped.body.pos.x - b.pos.x, z: ped.body.pos.z - b.pos.z });
      if (Math.abs(angleDiff(b.heading, to)) > (75 * Math.PI) / 180) continue;
      best = ped; bestD = d;
    }
    if (best) b.heading = headingFromVec({ x: best.body.pos.x - b.pos.x, z: best.body.pos.z - b.pos.z });
  }

  /**
   * The people a swing reaches: inside `range` and the arc, nearest first (a person standing counts as nearer than one on the ground,
   * who can still be hit when nobody is up). Judged where they are now or were when the swing began.
   */
  private reachable(range: number, arcDeg: number, lag: number, max = 1): Victim[] {
    const p = this.deps.player;
    const origin = p.body.pos;
    const found: Array<{ v: Victim; d: number }> = [];
    for (const ped of this.deps.peds()) {
      const was = { x: ped.body.pos.x - ped.body.vel.x * lag, z: ped.body.pos.z - ped.body.vel.z * lag };
      if (!inFistArc(origin, p.body.heading, ped.body.pos, range, arcDeg) && !inFistArc(origin, p.body.heading, was, range, arcDeg)) continue;
      const d = Math.hypot(ped.body.pos.x - origin.x, ped.body.pos.z - origin.z) + (ped.state === 'down' ? 0.6 : 0);
      found.push({ v: ped, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, max).map((f) => f.v);
  }

  private punchLands(imp: FistImpact): void {
    const p = this.deps.player;
    const origin = p.body.pos;
    const [best] = this.reachable(FIST.range, FIST.arcDeg, FIST.swing * FIST.impactAt);
    if (best) {
      this.hurt(best, imp.heavy ? 'heavy' : 'light', 'fist', { x: origin.x, z: origin.z });
      this.deps.sfx?.punch(imp.heavy);
      this.deps.fx?.burst('puff', { x: best.body.pos.x, y: CHEST, z: best.body.pos.z }, 3);
      return;
    }
    this.noTarget(FIST.range);
  }

  /** a car (or a wall) in reach: a thud and nothing else */
  private noTarget(range: number): void {
    const p = this.deps.player;
    const origin = p.body.pos;
    const tip = fistTip(origin, p.body.heading, range);
    const dir = forwardFromHeading(p.body.heading);
    const hit = this.deps.world.raycast(origin, dir, Math.hypot(tip.x - origin.x, tip.z - origin.z), 'player');
    if (hit && hit.body.kind !== 'ped') { if (hit.body.kind === 'vehicle' || hit.body.kind === 'cop') this.deps.sfx?.carThud(); else this.deps.sfx?.thud(); }
  }

  // ------------------------------------------------------------------------------------------------ melee weapons

  private updateMelee(dt: number, pressed: boolean): void {
    const p = this.deps.player, id = this.hands.current;
    if (!isMelee(id)) return;
    const def = MELEE[id];
    this.holdView = false; p.aimYaw = null;
    if (this.melee.def !== def) { this.melee.def = def; this.melee.cancel(); }
    if (pressed) {
      const was = this.melee.busy;
      if (!was) this.faceNearPed(def.reach + 0.5);
      this.melee.press();
      if (!was && this.melee.busy) this.deps.sfx?.swing?.(id === 'pipe');
    }
    const impact = this.melee.update(dt);
    if (impact) this.meleeLands(def, impact);
    if (this.melee.busy && this.melee.t === 0) this.deps.sfx?.swing?.(id === 'pipe'); // a queued second swing began as the first ended
    p.actionPose = this.melee.busy ? { kind: this.melee.pose, k: this.melee.progress } : null;
  }

  private meleeLands(def: (typeof MELEE)[keyof typeof MELEE], imp: { damage: number; force: Force }): void {
    const p = this.deps.player;
    const origin = p.body.pos;
    const victims = this.reachable(def.reach, def.arcDeg, def.swing * def.impactAt, def.id === 'fish' ? 1 : 2);
    if (victims.length === 0) { this.noTarget(def.reach); return; }
    for (const v of victims) {
      this.hurt(v, imp.force, 'fist', { x: origin.x, z: origin.z }, true, imp.damage);
      this.deps.fx?.burst('puff', { x: v.body.pos.x, y: CHEST, z: v.body.pos.z }, 3);
    }
    const sfx = this.deps.sfx;
    if (def.id === 'fish') sfx?.slap?.(); else sfx?.club?.(def.id);
    if (this.hands.useMelee()) this.deps.sfx?.glass(); // the fish is done for
  }

  // ------------------------------------------------------------------------------------------------ throwing

  private updateThrow(dt: number, pressed: boolean, frame: CombatFrame): void {
    const p = this.deps.player;
    this.holdView = false;
    if (this.throwT < 0 && pressed && this.hands.current !== 'fists') {
      const kind = this.hands.current === 'bottle' ? 'bottle' : 'brick';
      if ((kind === 'bottle' ? this.hands.bottles : this.hands.bricks) > 0) { this.throwT = 0; this.throwKind = kind; this.throwYaw = frame.viewYaw; this.deps.sfx?.throwAway(); }
    }
    if (this.throwT >= 0) {
      const before = this.throwT;
      this.throwT += dt;
      p.aimYaw = this.throwYaw;
      if (before < THROW_WINDUP && this.throwT >= THROW_WINDUP) this.releaseThrow();
      if (this.throwT >= THROW_TIME) this.throwT = -1;
      p.actionPose = this.throwT >= 0 ? { kind: 'throw', k: this.throwT / THROW_TIME } : null;
      if (this.throwT < 0) p.aimYaw = null;
    } else { p.aimYaw = null; p.actionPose = null; }
  }

  private releaseThrow(): void {
    const kind = this.throwKind;
    if (!kind) return;
    // the item is spent at the moment it leaves the hand (the current item may have been used up: Hands falls back to fists then)
    const prev = this.hands.current;
    this.hands.current = kind;
    const taken = this.hands.takeThrowable();
    if (!taken) { this.hands.current = prev; return; }
    const pr = launch(taken, this.deps.player.body.pos, this.throwYaw);
    this.flights.push(pr);
  }

  private updateFlights(dt: number): void {
    const fx = this.deps.fx;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const pr = this.flights[i];
      const hit = stepProjectile(pr, dt, this.deps.world, 'player');
      if (hit) this.thrownHits(pr, hit);
      if (!pr.alive) this.flights.splice(i, 1);
    }
    for (let s = 0; s < 4; s++) {
      const pr = this.flights[s];
      if (pr && pr.alive) fx?.flying(s, pr.kind, pr, pr.spin); else fx?.flying(s, null);
    }
  }

  private thrownHits(pr: Projectile, hit: FlightHit): void {
    const out = impactOutcome(pr.kind, hit.target);
    const pos: V3 = { x: hit.x, y: hit.y, z: hit.z };
    const sfx = this.deps.sfx, fx = this.deps.fx;
    if (hit.target === 'ped' && hit.body && out.knockdown) {
      const ped = hit.body.userData as Victim | undefined;
      if (ped && typeof ped.hitBy === 'function') this.hurt(ped, 'thrown', 'thrown', { x: pr.x - pr.vx * 0.05, z: pr.z - pr.vz * 0.05 }, true, THROWN_DAMAGE[pr.kind]);
    }
    if (out.carThud) sfx?.carThud();
    if (out.sound === 'glass') sfx?.glass(); else if (!out.carThud) sfx?.thud();
    if (out.particles === 'glass') fx?.burst('glass', pos, 10);
    else if (out.particles === 'dust') fx?.burst('dust', pos, 4);
    if (out.shatters) { pr.alive = false; return; }
    if (hit.target === 'ped') { pr.alive = false; this.pickups.drop('brick', pr.x, pr.z); return; } // it drops at the person's feet (and cannot hit them twice)
    if (!bounce(pr, hit.target)) {
      pr.alive = false;
      this.pickups.drop('brick', pr.x, pr.z);
    }
  }

  // ------------------------------------------------------------------------------------------------ guns

  private gunInHand(): GunId { const c = this.hands.current; return isGun(c) ? c : 'pistol'; }

  private updateGun(dt: number, pressed: boolean, held: boolean, frame: CombatFrame): void {
    const p = this.deps.player;
    const h = this.hands;
    const id = this.gunInHand(), def = GUNS[id];
    if (this.pumpLeft > 0) {
      const before = this.pumpLeft;
      this.pumpLeft -= dt;
      if (this.pumpSound > 0 && before > this.pumpSound && this.pumpLeft <= this.pumpSound) { this.pumpSound = -1; this.deps.sfx?.pump?.(); }
      if (this.pumpLeft < 0) this.pumpLeft = 0;
    }
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) { this.reloadLeft = 0; h.reloading = false; h.reload(id); }
    }
    if (pressed) this.dryClicked = false;
    const aiming = held || this.aimHold > 0;
    if (held) this.aimHold = AIM_HOLD; else this.aimHold = Math.max(0, this.aimHold - dt);
    this.holdView = held;
    if (aiming) p.aimYaw = frame.viewYaw; else p.aimYaw = null;
    // auto reload when the gun runs dry and the button is pressed again; or a spare magazine and an empty gun
    if (held && h.guns[id].mag <= 0 && this.reloadLeft <= 0 && h.guns[id].reserve > 0) this.startReload(id);
    if (held && this.reloadLeft <= 0 && this.fireCool <= 0) {
      const facing = Math.abs(angleDiff(p.body.heading, frame.viewYaw)) < 0.3;
      if (h.guns[id].mag > 0 && facing) this.fire(frame.viewYaw, id);
      else if (h.guns[id].mag <= 0 && h.guns[id].reserve <= 0 && !this.dryClicked) { this.dryClicked = true; this.deps.sfx?.click(); this.fireCool = 0.25; }
    }
    if (!aiming) p.actionPose = null;
    else if (id === 'shotgun') p.actionPose = { kind: 'longgun', k: this.pumpLeft > 0 && def.pump > 0 ? 1 - this.pumpLeft / def.pump : 1, recoil: this.recoil };
    else p.actionPose = { kind: 'aim', k: 1, recoil: this.recoil };
  }

  private startReload(id: GunId = this.gunInHand()): void {
    this.reloadLeft = GUNS[id].reload; this.hands.reloading = true;
    this.deps.sfx?.reload();
    this.pushHud();
  }

  /** Fire one round (or one shotgun load) along `yaw` (camera heading). Public for scripted review. */
  fire(yaw: number, id: GunId = this.gunInHand()): ReturnType<typeof resolveShot> | null {
    const p = this.deps.player, h = this.hands, world = this.deps.world;
    const def = GUNS[id];
    if (!h.fireRound(id)) return null;
    this.fireCool = def.fireInterval + def.pump;
    if (def.pump > 0) { this.pumpLeft = def.pump; this.pumpSound = def.pump * 0.55; }
    this.recoil = id === 'shotgun' ? 1.4 : id === 'revolver' ? 1.2 : 1;
    this.shots++;
    const origin = { x: p.body.pos.x, z: p.body.pos.z };
    const peds = this.nearbyPedBodies(origin, def.range);
    const aim = def.pellets > 1 ? yaw : assistYaw(world, origin, yaw, peds, def.range);
    const shot = resolveShot(world, origin, aim, def.range);
    const from: V3 = this.deps.fx?.muzzlePoint?.() ?? { x: origin.x + shot.dir.x * 0.5, y: CHEST, z: origin.z + shot.dir.z * 0.5 };
    const fx = this.deps.fx, sfx = this.deps.sfx;
    fx?.flash(from);
    if (id === 'pistol') sfx?.crack(); else if (sfx?.bang) sfx.bang(id); else sfx?.crack();
    // anyone could hear it: the police system hears it as a crime, and people near run or cower
    this.deps.events.emit('gunshot', { pos: origin });
    this.deps.events.emit('crime', { type: 'gunshot', pos: origin });
    this.crowd.gunshot(origin, def.fleeRadius, def.shoutRadius);
    if (def.pellets > 1) { this.firePellets(def, origin, aim, from); return shot; }
    const to: V3 = { x: shot.point.x, y: CHEST, z: shot.point.z };
    fx?.tracer(from, to);
    switch (shot.target) {
      case 'ped': {
        const ped = shot.body?.userData as Victim | undefined;
        if (ped && typeof ped.hitBy === 'function') this.hurt(ped, def.force, 'shot', origin, false, def.damage);
        fx?.burst('puff', { x: shot.point.x, y: CHEST, z: shot.point.z }, 3);
        break;
      }
      case 'vehicle': sfx?.tick(); fx?.burst('spark', { x: shot.point.x, y: CHEST, z: shot.point.z }, 5); break;
      case 'wall': fx?.burst('puff', { x: shot.point.x - shot.dir.x * 0.05, y: CHEST, z: shot.point.z - shot.dir.z * 0.05 }, 4); break;
      default: break;
    }
    if (h.guns[id].mag <= 0 && h.guns[id].reserve > 0) this.startReload(id);
    return shot;
  }

  /** A shotgun load: a fan of pellets, each its own ray; a person hit by several takes their sum, in one blow. */
  private firePellets(def: (typeof GUNS)[GunId], origin: Vec2, aim: number, from: V3): void {
    const world = this.deps.world, fx = this.deps.fx, sfx = this.deps.sfx;
    const offs = pelletOffsets(def, this.shots);
    const takers = new Map<Victim, { dmg: number; n: number; px: number; pz: number }>();
    let drawn = 0;
    for (const off of offs) {
      const s = resolveShot(world, origin, aim + off, def.range);
      if (drawn < 3 && fx) { fx.tracer(from, { x: s.point.x, y: CHEST, z: s.point.z }); drawn++; }
      if (s.target === 'ped') {
        const ped = s.body?.userData as Victim | undefined;
        if (ped && typeof ped.hitBy === 'function') {
          const e = takers.get(ped) ?? { dmg: 0, n: 0, px: s.point.x, pz: s.point.z };
          e.dmg += pelletDamage(def, s.dist); e.n++; takers.set(ped, e);
        }
      } else if (s.target === 'wall') fx?.burst('puff', { x: s.point.x - s.dir.x * 0.05, y: CHEST, z: s.point.z - s.dir.z * 0.05 }, 1);
      else if (s.target === 'vehicle') { fx?.burst('spark', { x: s.point.x, y: CHEST, z: s.point.z }, 1); }
    }
    for (const [ped, e] of takers) {
      this.hurt(ped, e.n >= 3 ? 'blast' : 'shot', 'shot', origin, false, Math.round(e.dmg));
      fx?.burst('puff', { x: e.px, y: CHEST, z: e.pz }, 3);
    }
    if (takers.size === 0) sfx?.tick?.();
    if (this.hands.guns.shotgun.mag <= 0 && this.hands.guns.shotgun.reserve > 0) this.startReload('shotgun');
  }

  private nearbyPedBodies(origin: Vec2, range: number): Body2D[] {
    const out: Body2D[] = [];
    for (const ped of this.deps.peds()) {
      if (ped.state === 'down') continue;
      const dx = ped.body.pos.x - origin.x, dz = ped.body.pos.z - origin.z;
      if (dx * dx + dz * dz < range * range) out.push(ped.body);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ consequences

  /**
   * A blow landed on `ped` (anyone, in any state): the person's health decides stagger, knock down or knock out; blood shows a hard hit;
   * the system is told; the street reacts by temperament; and the wanted level rises through the crime events. `damage` overrides the
   * default of the kind of blow (weapons give their own).
   */
  hurt(ped: Victim, force: Force, by: 'fist' | 'thrown' | 'shot', from: Vec2, crime = true, damage?: number): void {
    const res = ped.hitBy(from, force, damage);
    if (res === 'ignored') return;
    const pos = { x: ped.body.pos.x, z: ped.body.pos.z };
    const down = res === 'knockedDown' || res === 'knockedOut';
    this.bleed(ped, res, force, from);
    this.deps.events.emit('pedHit', { id: ped.id, pos, by, down });
    if (down) this.deps.sfx?.body?.();
    const person = isPed(ped) ? ped : null;
    if (down && person) this.pendingFlee.push({ ped, from: { x: from.x, z: from.z }, seenDown: false, wait: 10 + (res === 'knockedOut' ? 40 : 0), out: res === 'knockedOut' });
    // a gun has already scattered the street (`fire`); a fight is what a blow starts
    const witnesses = force === 'shot' || force === 'blast' ? 0 : this.crowd.fight(pos, person);
    if (person && res === 'staggered') this.crowd.victimReacts(person);
    if (!crime) return;
    if (by === 'thrown') this.deps.events.emit('crime', { type: 'thrownHit', pos });
    else if (by === 'fist' && (down || res === 'struckDown') && witnesses > 0) this.deps.events.emit('crime', { type: 'assault', pos });
  }

  /** Blood for a blow: nothing on a light jab until the person is worn down, a burst on a hard hit, a spray on a shot, a pool when out. */
  private bleed(ped: Victim, res: string, force: Force, from: Vec2): void {
    const b = this.deps.blood;
    if (!b) return;
    const x = ped.body.pos.x, z = ped.body.pos.z, dx = x - from.x, dz = z - from.z;
    const worn = ped.vitals.hurt;
    if (force === 'shot' || force === 'blast') b.spray(x, CHEST, z, dx, dz);
    else if (force === 'light') { if (worn) b.burst(x, 1.5, z, dx, dz, 0.5); }
    else b.burst(x, 1.4, z, dx, dz, force === 'club' || force === 'heavy' ? 1 : 0.8);
    if (res === 'knockedOut') b.pool(x + dx * 0.1, z + dz * 0.1);
  }

  /** A person's punch landed on the player. */
  private playerHit(damage: number, from: Vec2): void {
    const v = this.deps.vitals;
    if (!v) return;
    this.deps.noteAttacked?.();
    const p = this.deps.player.body;
    const r = v.hurt(damage);
    if (r === 'ignored') return;
    const dx = p.pos.x - from.x, dz = p.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    const push = r === 'stagger' ? 2.0 : 4.2;
    this.knock.x = (dx / d) * push; this.knock.z = (dz / d) * push;
    this.deps.sfx?.punch(r !== 'stagger');
    this.deps.sfx?.grunt?.();
    if (r !== 'stagger') this.deps.blood?.burst(p.pos.x, 1.45, p.pos.z, dx, dz, 0.5);
    this.stopAll();
  }

  /** People who were put on the ground run (or, if that is who they are, fight) when they get up. */
  private updateFlees(dt: number): void {
    for (let i = this.pendingFlee.length - 1; i >= 0; i--) {
      const f = this.pendingFlee[i];
      f.wait -= dt;
      if (f.ped.state === 'down') f.seenDown = true;
      else if (f.seenDown || f.wait <= 0) {
        const ped = f.ped as Pedestrian;
        if (!f.out && ped.vitals.temper === 'fight') this.crowd.victimReacts(ped);
        if (ped.special === null || ped.special.mode !== 'fight') ped.flee(f.from, f.out ? 9 : 7);
        this.pendingFlee.splice(i, 1);
        continue;
      }
      if (f.wait < -5) this.pendingFlee.splice(i, 1);
    }
  }

  /** For tests and review scripts. */
  get flying(): readonly Projectile[] { return this.flights; }
  get reloading(): boolean { return this.reloadLeft > 0; }
  get ready(): boolean { return this.fireCool <= 0; }
  get pumping(): boolean { return this.pumpLeft > 0; }
  /** the pistol's numbers, for old callers */
  static readonly PISTOL = PISTOL;
}
