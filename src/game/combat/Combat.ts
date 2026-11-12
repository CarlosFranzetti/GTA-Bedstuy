/**
 * On-foot combat, GTA III style: ONE action button whose meaning depends on what is in the player's hands.
 *   fists  -> a quick left-right jab, a third press inside a short window is a heavy hit
 *   bottle / brick -> a throw along the camera's yaw (a bottle shatters, a brick can be picked up again)
 *   pistol -> a hitscan shot along the camera's yaw, 3 a second, 12 to a magazine, a short reload
 * Nobody dies and there is no blood: people stagger, go down, get up and run.
 *
 * Wiring (see the report in docs): construct once, call `update(dt, ...)` once per fixed step after `player.control`, and read
 * `holdView` for the camera. The class owns the hands, the pickups, the flying items and the effects.
 */
import type * as THREE from 'three';
import { angleDiff, forwardFromHeading, headingFromVec, type Vec2 } from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type { Pedestrian } from '@/entities/Pedestrian';
import type { ActionPose } from '@/entities/anim/controller';
import type { Body2D, IWorld2D } from '@/world/types';
import { FistCombo, fistTip, inFistArc, type FistImpact } from './fists';
import { Hands, PISTOL, actionFor, type HandsHudState } from './items';
import { PickupSet, type PickupDef } from './pickups';
import { bounce, impactOutcome, launch, stepProjectile, type FlightHit, type Projectile, type ThrowKind } from './projectile';
import type { CombatSounds } from './sfx';
import { assistYaw, resolveShot } from './shot';
import type { CombatFx, V3 } from './view';

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
  /** every pedestrian in the world */
  peds: () => Iterable<Pedestrian>;
  player: CombatPlayer;
  pickups?: readonly PickupDef[];
  sfx?: CombatSounds;
  fx?: CombatFx;
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
export const FLEE_RADIUS = 9;
export const SHOUT_RADIUS = 18;
export const WITNESS_RADIUS = 25;
/** Seconds the player keeps facing the aim after releasing the button with the pistol out. */
const AIM_HOLD = 0.35;
const THROW_WINDUP = 0.22;
const THROW_TIME = 0.5;
const CHEST = 1.3;

interface PendingFlee { ped: Pedestrian; from: Vec2; seenDown: boolean; wait: number }

export class Combat {
  readonly hands = new Hands();
  readonly pickups: PickupSet;
  /** True while the camera must not drift back behind the player (aiming the pistol). Set `cam.holdView = combat.holdView`. */
  holdView = false;
  private readonly fists = new FistCombo();
  private readonly flights: Projectile[] = [];
  private readonly pendingFlee: PendingFlee[] = [];
  private t = 0;
  private fireCool = 0;
  private reloadLeft = 0;
  private aimHold = 0;
  private recoil = 0;
  private throwT = -1;
  private throwKind: ThrowKind | null = null;
  private throwYaw = 0;
  private dryClicked = false;
  private lastHud = '';

  constructor(private readonly deps: CombatDeps) {
    this.pickups = new PickupSet(deps.pickups ?? []);
    this.hands.onChange = () => this.pushHud();
  }

  /** Step to the next (+1) or previous (-1) item; the HUD widget calls this on a tap. */
  cycle(dir: number): void {
    this.reloadLeft = 0; this.throwT = -1; this.fists.cancel();
    this.hands.cycle(dir);
  }

  /** What the HUD shows now (null while in a car). */
  hudState(): HandsHudState | null { return this.deps.player.inVehicle ? null : this.hands.state(); }

  private pushHud(): void {
    const s = this.hudState();
    const key = s ? `${s.item}|${s.count}|${s.reserve}|${s.reloading}` : '';
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
    const live = !frame.blocked && !p.inVehicle && !p.isEntering;

    // pickups: walking over them while on foot; the glow and bob are drawn either way
    const got = this.pickups.update(dt, p.body.pos, live);
    for (const g of got) { this.hands.add(g.kind); this.deps.sfx?.pickup(); }
    this.deps.fx?.pickups(this.pickups.active(), p.body.pos.x, p.body.pos.z, this.t);

    if (!live) {
      this.stopAll();
    } else {
      if (cyc) this.cycle(cyc);
      this.fireCool = Math.max(0, this.fireCool - dt);
      const action = actionFor(this.hands.current);
      if (action !== 'throw') this.throwT = -1;
      if (action !== 'punch') this.fists.cancel();
      if (action !== 'shoot') { this.reloadLeft = 0; this.aimHold = 0; this.hands.reloading = false; }
      if (action === 'punch') this.updateFists(dt, pressed, frame);
      else if (action === 'throw') this.updateThrow(dt, pressed, frame);
      else this.updatePistol(dt, pressed, held, frame);
    }

    this.updateFlights(dt);
    this.updateFlees(dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.deps.fx?.setHeld(live ? this.hands.current : 'fists', p.handAnchor?.() ?? null);
    this.deps.fx?.update(dt);
    this.pushHud();
  }

  private stopAll(): void {
    const p = this.deps.player;
    this.fists.cancel(); this.throwT = -1; this.reloadLeft = 0; this.aimHold = 0; this.hands.reloading = false;
    this.holdView = false; p.aimYaw = null; p.actionPose = null;
  }

  // ------------------------------------------------------------------------------------------------ fists

  private updateFists(dt: number, pressed: boolean, frame: CombatFrame): void {
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
    void frame;
  }

  /** A light lock-on: a pedestrian within 1.7 m and 75 degrees of where the player is facing pulls the body round to them as a swing starts. */
  private faceNearPed(): void {
    const b = this.deps.player.body;
    let best: Pedestrian | null = null, bestD = 1.7;
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

  private punchLands(imp: FistImpact): void {
    const p = this.deps.player;
    const origin = p.body.pos;
    // the nearest pedestrian inside the arc
    let best: Pedestrian | null = null, bestD = Infinity;
    for (const ped of this.deps.peds()) {
      if (ped.state === 'down') continue;
      if (!inFistArc(origin, p.body.heading, ped.body.pos)) continue;
      const d = Math.hypot(ped.body.pos.x - origin.x, ped.body.pos.z - origin.z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    if (best) {
      this.hurt(best, imp.heavy ? 'heavy' : 'light', 'fist', { x: origin.x, z: origin.z });
      this.deps.sfx?.punch(imp.heavy);
      this.deps.fx?.burst('puff', { x: best.body.pos.x, y: CHEST, z: best.body.pos.z }, 3);
      return;
    }
    // a car (or a wall) in reach: a thud and nothing else
    const tip = fistTip(origin, p.body.heading);
    const dir = forwardFromHeading(p.body.heading);
    const hit = this.deps.world.raycast(origin, dir, Math.hypot(tip.x - origin.x, tip.z - origin.z), 'player');
    if (hit && hit.body.kind !== 'ped') this.deps.sfx?.thud();
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
      const ped = hit.body.userData as Pedestrian | undefined;
      if (ped && typeof ped.hitBy === 'function') this.hurt(ped, 'thrown', 'thrown', { x: pr.x - pr.vx * 0.05, z: pr.z - pr.vz * 0.05 });
    }
    if (out.carThud) sfx?.thud();
    if (out.sound === 'glass') sfx?.glass(); else if (!out.carThud) sfx?.thud();
    if (out.particles === 'glass') fx?.burst('glass', pos, 10);
    else if (out.particles === 'dust') fx?.burst('dust', pos, 4);
    if (out.shatters) { pr.alive = false; return; }
    if (!bounce(pr, hit.target)) {
      pr.alive = false;
      this.pickups.drop('brick', pr.x, pr.z);
    }
  }

  // ------------------------------------------------------------------------------------------------ pistol

  private updatePistol(dt: number, pressed: boolean, held: boolean, frame: CombatFrame): void {
    const p = this.deps.player;
    const h = this.hands;
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) { this.reloadLeft = 0; h.reloading = false; h.reload(); }
    }
    if (pressed) this.dryClicked = false;
    const aiming = held || this.aimHold > 0;
    if (held) this.aimHold = AIM_HOLD; else this.aimHold = Math.max(0, this.aimHold - dt);
    this.holdView = held;
    if (aiming) p.aimYaw = frame.viewYaw; else p.aimYaw = null;
    // auto reload when the gun runs dry and the button is pressed again; or a spare magazine and an empty gun
    if (held && h.mag <= 0 && this.reloadLeft <= 0 && h.reserve > 0) this.startReload();
    if (held && this.reloadLeft <= 0 && this.fireCool <= 0) {
      const facing = Math.abs(angleDiff(p.body.heading, frame.viewYaw)) < 0.3;
      if (h.mag > 0 && facing) this.fire(frame.viewYaw);
      else if (h.mag <= 0 && h.reserve <= 0 && !this.dryClicked) { this.dryClicked = true; this.deps.sfx?.click(); this.fireCool = 0.25; }
    }
    p.actionPose = aiming ? { kind: 'aim', k: 1, recoil: this.recoil } : null;
  }

  private startReload(): void {
    this.reloadLeft = PISTOL.reloadTime; this.hands.reloading = true;
    this.deps.sfx?.reload();
    this.pushHud();
  }

  /** Fire one round along `yaw` (camera heading). Public for scripted review. */
  fire(yaw: number): ReturnType<typeof resolveShot> | null {
    const p = this.deps.player, h = this.hands, world = this.deps.world;
    if (!h.fireRound()) return null;
    this.fireCool = PISTOL.fireInterval;
    this.recoil = 1;
    const origin = { x: p.body.pos.x, z: p.body.pos.z };
    const peds = this.nearbyPedBodies(origin);
    const aim = assistYaw(world, origin, yaw, peds);
    const shot = resolveShot(world, origin, aim);
    const from: V3 = this.deps.fx?.muzzlePoint?.() ?? { x: origin.x + shot.dir.x * 0.5, y: CHEST, z: origin.z + shot.dir.z * 0.5 };
    const to: V3 = { x: shot.point.x, y: CHEST, z: shot.point.z };
    const fx = this.deps.fx, sfx = this.deps.sfx;
    fx?.tracer(from, to);
    fx?.flash(from);
    sfx?.crack();
    // anyone could hear it: the police system hears it as a crime, and people near run
    this.deps.events.emit('gunshot', { pos: origin });
    this.deps.events.emit('crime', { type: 'gunshot', pos: origin });
    this.scare(origin, null);
    switch (shot.target) {
      case 'ped': {
        const ped = shot.body?.userData as Pedestrian | undefined;
        if (ped && typeof ped.hitBy === 'function') this.hurt(ped, 'shot', 'shot', origin, false);
        fx?.burst('puff', { x: shot.point.x, y: CHEST, z: shot.point.z }, 3);
        break;
      }
      case 'vehicle': sfx?.tick(); fx?.burst('spark', { x: shot.point.x, y: CHEST, z: shot.point.z }, 5); break;
      case 'wall': fx?.burst('puff', { x: shot.point.x - shot.dir.x * 0.05, y: CHEST, z: shot.point.z - shot.dir.z * 0.05 }, 4); break;
      default: break;
    }
    if (h.mag <= 0 && h.reserve > 0) this.startReload();
    return shot;
  }

  private nearbyPedBodies(origin: Vec2): Body2D[] {
    const out: Body2D[] = [];
    for (const ped of this.deps.peds()) {
      if (ped.state === 'down') continue;
      const dx = ped.body.pos.x - origin.x, dz = ped.body.pos.z - origin.z;
      if (dx * dx + dz * dz < PISTOL.range * PISTOL.range) out.push(ped.body);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ consequences

  /** A blow landed on `ped`: stagger or knock down, tell the system, scare the street, and raise the wanted level through the crime events. */
  hurt(ped: Pedestrian, force: 'light' | 'heavy' | 'thrown' | 'shot', by: 'fist' | 'thrown' | 'shot', from: Vec2, crime = true): void {
    const res = ped.hitBy(from, force);
    if (res === 'ignored') return;
    const pos = { x: ped.body.pos.x, z: ped.body.pos.z };
    const down = res === 'knockedDown';
    this.deps.events.emit('pedHit', { id: ped.id, pos, by, down });
    if (down) this.pendingFlee.push({ ped, from: { x: from.x, z: from.z }, seenDown: false, wait: 10 });
    const witnesses = this.scare(pos, ped);
    if (!crime) return;
    if (by === 'thrown') this.deps.events.emit('crime', { type: 'thrownHit', pos });
    else if (by === 'fist' && down && witnesses > 0) this.deps.events.emit('crime', { type: 'assault', pos });
  }

  /** Nearby pedestrians run (close) or shout (further); returns how many other people could see it. */
  private scare(pos: Vec2, victim: Pedestrian | null): number {
    let witnesses = 0;
    for (const o of this.deps.peds()) {
      if (o === victim || o.state === 'down') continue;
      const d = Math.hypot(o.body.pos.x - pos.x, o.body.pos.z - pos.z);
      if (d <= WITNESS_RADIUS) witnesses++;
      if (d <= FLEE_RADIUS) o.flee(pos, 6);
      else if (d <= SHOUT_RADIUS) o.react('shout', pos);
    }
    return witnesses;
  }

  /** People who were put on the ground run when they get up. */
  private updateFlees(dt: number): void {
    for (let i = this.pendingFlee.length - 1; i >= 0; i--) {
      const f = this.pendingFlee[i];
      f.wait -= dt;
      if (f.ped.state === 'down') f.seenDown = true;
      else if (f.seenDown || f.wait <= 0) { f.ped.flee(f.from, 7); this.pendingFlee.splice(i, 1); continue; }
      if (f.wait < -5) this.pendingFlee.splice(i, 1);
    }
  }

  /** For tests and review scripts. */
  get flying(): readonly Projectile[] { return this.flights; }
  get reloading(): boolean { return this.reloadLeft > 0; }
  get ready(): boolean { return this.fireCool <= 0; }
}
