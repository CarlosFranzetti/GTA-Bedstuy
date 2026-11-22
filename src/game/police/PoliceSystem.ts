/**
 * POLICE2: the police as a story, not a switch. Heat builds from minor acts that someone SEES; stars come from heat, from a
 * serious crime that was seen, or from ignoring a warning. At a star officers walk up and try to arrest: they grab (a hold of about
 * a second and a half; running or a hit breaks free once per chase and costs a star), and on a completed hold the player is BUSTED
 * (see bust.ts for the consequences). Out of sight the stars cool as before; changing cars out of sight helps.
 *
 * Entry points for other lanes (COMBAT2 and friends):
 *   police.reportCrime(type, pos, seen?)  report any crime; `seen` omitted = decided here from witnesses (line of sight)
 *   police.isBeingArrested()              true while an officer has hold of the player or the bust is playing
 *   police.noteAttacked()                 the player was hit first: fighting back for a few seconds adds heat only
 *   police.setGrace(seconds)              no minor heat for that long (a new game, the tutorial)
 *   police.officers                       foot officers (Officer has `hitBy`, so Combat can hit them: it reports hitCop itself)
 */
import type * as THREE from 'three';
import { dist, hyp, type Vec2 } from '@/core/Math2';
import type { CrimeType, EventBus } from '@/core/Events';
import type { Rng } from '@/core/Rng';
import { Officer, GRAB_REACH } from '@/entities/Officer';
import type { IVehicle, IWorld2D, Body2D } from '@/world/types';
import type { CopSystem } from '@/game/CopSystem';
import type { WantedSystem } from '@/game/WantedSystem';
import { CRIME_LABEL } from '@/game/WantedSystem';
import { HEAT_WARN, HEAT_MAX, HeatModel } from './heat';
import { applyBust, type BustHost, type BustInfo, type BustResult, fineFor } from './bust';
import type { PrecinctSite } from './precincts';

export const ARREST_HOLD = 1.5;
/** An on-foot player slower than this (m/s) can be grabbed; a sprint is about 5.5. */
export const GRAB_MAX_SPEED = 3.2;
/** A stopped car (|speed| under this) for this long can be pulled over at one star and up. */
export const CAR_STOPPED_SPEED = 1.0;
export const CAR_STOPPED_SECONDS = 2.0;
export const SIGHT_DAY = 26;
export const SIGHT_NIGHT = 16;
export const OFFICER_SIGHT_DAY = 55;
export const OFFICER_SIGHT_NIGHT = 32;
export const GUNSHOT_HEARD = 70;
/** Seconds out of every officer's sight before the police are "searching". */
export const LOSE_SECONDS = 5;
const MAX_OFFICERS = [0, 2, 3, 4] as const;
const SIGHT_PERIOD = 0.25;
const SPAWN_PERIOD = 1.0;
const BREAK_FREE_COOLDOWN = 3;
const SELF_DEFENCE_SECONDS = 8;
const WARN_LINES = ['Hey. Knock it off.', 'Easy there. I am watching you.', 'Back it up, now.', 'Last warning. Cool it.', 'Not on my block. Cut it out.'];
const HOLD_LINES = ['Hands where I can see them.', 'Stop right there.', 'You are under arrest.', 'Turn around. Easy.'];

export type PoliceState = 'calm' | 'watching' | 'wanted' | 'searching' | 'arrest' | 'busted';

export interface PolicePlayer {
  readonly body: Body2D;
  readonly vehicle: IVehicle | null;
  readonly inVehicle: boolean;
  readonly isDown: boolean;
  actionPose: { kind: string; k: number; recoil?: number } | null;
}

export interface PoliceDeps {
  events: EventBus;
  world: IWorld2D;
  wanted: WantedSystem;
  cops: CopSystem;
  player: PolicePlayer;
  scene: THREE.Scene;
  rng: Rng;
  /** every pedestrian near enough to matter (traffic.peds) */
  peds: () => Iterable<{ body: Body2D; state: string }>;
  /** build an officer at a position (the host owns materials) */
  makeOfficer: (id: string, pos: Vec2, heading: number) => Officer;
  /** true after dusk and before dawn */
  isNight: () => boolean;
  /** true inside a room, during a mission cut, or while a menu has the game: nothing is arrested then */
  blocked: () => boolean;
  /** true while the player's input is running or driving away (a sprint, throttle): breaks a hold once */
  tryingToFlee: () => boolean;
  /** put the player out of the car (the car stays where it is) */
  ejectPlayer: () => void;
  precinct: () => PrecinctSite;
  /** a short on-screen line ("You were seen", "Resisting arrest") */
  say?: (text: string) => void;
  /** the host shows the BUSTED card and then calls completeBust (see main.ts); called once per arrest */
  onBusted?: (info: BustInfo & { fine: number; precinct: string }) => void;
}

interface Hold { officer: Officer; t: number; fromCar: boolean }

export class PoliceSystem {
  readonly heat = new HeatModel();
  readonly officers: Officer[] = [];
  state: PoliceState = 'calm';
  /** the last place an officer saw the player (the search goes there) */
  lastSeen: Vec2 | null = null;
  /** seconds since any officer last saw the player */
  unseenFor = 0;
  busts = 0;
  /** one break-free per chase; reset when the stars reach zero */
  breakFreeUsed = false;
  /** the player resisted this chase (the fine is higher) */
  resisted = false;
  /** latest short HUD line, cleared by the HUD after it shows */
  line = '';

  private hold: Hold | null = null;
  private busted = false;
  private sightTimer = 0;
  private spawnTimer = 0;
  private selfDefence = 0;
  private seq = 0;
  private stoppedFor = 0;
  private starsLastFrame = 0;
  private seenBy: 'none' | 'officer' = 'none';
  private readonly carSpawnAt = new Map<IVehicle, number>();
  private readonly offs: (() => void)[] = [];
  private clock = 0;

  constructor(private readonly d: PoliceDeps) {
    d.wanted.policeDriven = true;
    d.cops.gentleAtOneStar = true;
    this.offs.push(d.events.on('crime', (c) => this.reportCrime(c.type, c.pos)));
    this.offs.push(d.events.on('pedHit', (e) => { if (e.by === 'fist') this.reportCrime('punch', e.pos); }));
    this.offs.push(d.events.on('impact', (e) => this.onImpact(e)));
    this.offs.push(d.events.on('enterVehicle', () => this.onEnterVehicle()));
  }

  // ------------------------------------------------------------------ entry points

  /** No minor heat for the next `seconds` (the first minutes of a new game; the tutorial). */
  setGrace(seconds: number): void { this.heat.setGrace(seconds); }

  isBeingArrested(): boolean { return this.hold !== null || this.busted; }

  /** The player was hit first: fighting back counts as heat only for a few seconds. */
  noteAttacked(): void { this.selfDefence = SELF_DEFENCE_SECONDS; }

  /** 0..1 for the HUD bar */
  get heatFraction(): number { return Math.min(1, this.heat.heat / HEAT_MAX); }

  /** The HUD line for the state: empty when calm. */
  get stateLine(): string {
    switch (this.state) {
      case 'watching': return 'Police are watching';
      case 'searching': return 'Searching';
      case 'arrest': return 'Resisting arrest is a mistake';
      default: return '';
    }
  }

  /**
   * Report a crime. `seen` omitted: someone must be able to see it (a pedestrian or an officer with a clear line to `pos`; a gunshot is
   * heard far off). An unseen crime adds a little heat only. A seen serious crime is a star at once; minor acts need heat.
   */
  reportCrime(type: CrimeType, pos: Vec2, seen?: boolean): void {
    if (this.busted) return;
    let sawIt = seen ?? this.witnessed(pos, type);
    if (this.selfDefence > 0 && (type === 'punch' || type === 'assault')) sawIt = false; // hit first: heat only
    const before = this.d.wanted.stars;
    const r = this.heat.crime(type, sawIt, before);
    if (sawIt) this.d.wanted.touch(); else if (before > 0) this.d.wanted.touch();
    if (r.stars > before) {
      this.d.wanted.addStars(r.stars - before, r.reason === 'ignored-warning' ? 'You ignored the warning' : CRIME_LABEL[type]);
      if (!this.hasOfficerSight()) this.say('You were seen');
    }
    if (r.warned) this.warn(pos);
  }

  /** The player ran into, or over, an officer on foot (called from `impact`). */
  private onImpact(e: { a: string; b: string; strength: number; pos: Vec2 }): void {
    if (e.strength < 3) return;
    const o = this.officers.find((x) => x.body.id === e.a || x.body.id === e.b);
    if (!o) return;
    const playerId = this.d.player.vehicle?.body.id;
    if (!playerId || (e.a !== playerId && e.b !== playerId)) return;
    o.hitBy(this.d.player.body.pos, 'heavy');
    this.reportCrime('hitCop', e.pos, true);
  }

  private onEnterVehicle(): void {
    // a car swapped out of every officer's sight: the police lose a star (they are looking for the old car)
    if (this.d.wanted.stars > 0 && this.unseenFor >= 2 && !this.hold) { this.d.wanted.addStars(-1, ''); this.say('They lost track of the car'); }
  }

  // ------------------------------------------------------------------ sight

  /** Could a pedestrian or an officer see (or, for a gunshot, hear) something at `pos`? */
  witnessed(pos: Vec2, type?: CrimeType): boolean {
    const night = this.d.isNight();
    const r = night ? SIGHT_NIGHT : SIGHT_DAY;
    const ro = night ? OFFICER_SIGHT_NIGHT : OFFICER_SIGHT_DAY;
    const heard = type === 'gunshot' ? GUNSHOT_HEARD : 0;
    for (const p of this.d.peds()) {
      if (p.state === 'down') continue;
      const dd = dist(p.body.pos, pos);
      if (dd <= heard) return true;
      if (dd <= r && this.clear(p.body.pos, pos)) return true;
    }
    for (const o of this.officers) {
      const dd = dist(o.body.pos, pos);
      if (dd <= heard || (dd <= ro && this.clear(o.body.pos, pos))) return true;
    }
    for (const c of this.d.cops.patrolCars()) {
      const dd = dist(c.vehicle.body.pos, pos);
      if (dd <= heard || (dd <= ro && this.clear(c.vehicle.body.pos, pos))) return true;
    }
    return false;
  }

  /** Static walls between two points? (people and cars do not block a look) */
  private clear(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x, dz = b.z - a.z, L = hyp(dx, dz);
    if (L < 0.5) return true;
    const w = this.d.world as IWorld2D & { raycastStatic?: (f: Vec2, d: Vec2, m: number) => { dist: number } | null };
    const hit = w.raycastStatic ? w.raycastStatic(a, { x: dx / L, z: dz / L }, L) : null;
    return !hit || hit.dist >= L - 0.3;
  }

  private hasOfficerSight(): boolean { return this.seenBy === 'officer'; }

  private officerSees(playerPos: Vec2): Vec2 | null {
    const night = this.d.isNight();
    const ro = night ? OFFICER_SIGHT_NIGHT : OFFICER_SIGHT_DAY;
    for (const o of this.officers) if (o.mode !== 'leave' && dist(o.body.pos, playerPos) <= ro && this.clear(o.body.pos, playerPos)) return o.body.pos;
    for (const c of this.d.cops.patrolCars()) if (dist(c.vehicle.body.pos, playerPos) <= ro && this.clear(c.vehicle.body.pos, playerPos)) return c.vehicle.body.pos;
    return null;
  }

  // ------------------------------------------------------------------ warning

  private nearestOfficerSource(pos: Vec2, within: number): { pos: Vec2; car: IVehicle | null } | null {
    let best: { pos: Vec2; car: IVehicle | null } | null = null;
    let bd = within;
    for (const o of this.officers) { const dd = dist(o.body.pos, pos); if (dd < bd) { bd = dd; best = { pos: o.body.pos, car: null }; } }
    for (const c of this.d.cops.patrolCars()) { const dd = dist(c.vehicle.body.pos, pos); if (dd < bd) { bd = dd; best = { pos: c.vehicle.body.pos, car: c.vehicle }; } }
    return best;
  }

  private warn(at: Vec2): void {
    const pp = this.d.player.body.pos;
    const src = this.nearestOfficerSource(pp, 45);
    if (src) {
      if (src.car) this.d.cops.chirp(src.car);
      this.bark(src.pos, WARN_LINES[Math.floor(this.d.rng.next() * WARN_LINES.length) % WARN_LINES.length], 'warn');
    } else {
      this.say('Someone is watching');
    }
    void at;
  }

  private bark(pos: Vec2, text: string, kind: string): void {
    this.d.events.emit('pedBark', { id: `officer${this.seq++}`, text, kind, pos: { x: pos.x, z: pos.z }, pitch: 0.9, rate: 1, sex: 'm', age: 'adult', loud: 1 });
  }

  private say(text: string): void { this.line = text; this.d.say?.(text); }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    this.clock += dt;
    const d = this.d;
    const pb = d.player.vehicle ? d.player.vehicle.body : d.player.body;
    const pp = pb.pos;
    this.heat.update(dt);
    if (this.selfDefence > 0) this.selfDefence -= dt;
    const stars = d.wanted.stars;
    if (stars === 0 && this.starsLastFrame > 0) { this.breakFreeUsed = false; this.resisted = false; }
    this.starsLastFrame = stars;

    if (this.busted) { this.holdPlayer(); this.tickOfficers(dt, pp); this.state = 'busted'; return; }

    // sight: who can see the player right now
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = SIGHT_PERIOD;
      const seen = this.officerSees(pp);
      this.seenBy = seen ? 'officer' : 'none';
      if (seen) { this.lastSeen = { x: pp.x, z: pp.z }; this.unseenFor = 0; } else this.unseenFor += SIGHT_PERIOD;
    }
    d.wanted.holdDecay = stars > 0 && this.unseenFor < LOSE_SECONDS;

    // the officers
    this.spawnTimer -= dt;
    if (stars > 0 && this.spawnTimer <= 0) { this.spawnTimer = SPAWN_PERIOD; this.maybeSpawn(pp, stars); }
    this.tickOfficers(dt, pp);

    // arrest
    if (stars > 0 && !d.blocked()) this.updateArrest(dt, pb, pp, stars); else if (this.hold) this.cancelHold();
    if (this.hold) this.holdPlayer();

    // the state shown to the player
    if (this.hold) this.state = 'arrest';
    else if (stars > 0) this.state = this.unseenFor >= LOSE_SECONDS ? 'searching' : 'wanted';
    else this.state = this.heat.heat >= HEAT_WARN || this.heat.warning ? 'watching' : 'calm';
  }

  private maybeSpawn(pp: Vec2, stars: number): void {
    const cap = MAX_OFFICERS[Math.min(3, stars)];
    let live = 0;
    for (const o of this.officers) if (o.mode !== 'leave') live++;
    if (live >= cap) return;
    for (const c of this.d.cops.patrolCars()) {
      if (!c.pursuing) continue;
      const v = c.vehicle;
      const dd = dist(v.body.pos, pp);
      const slow = Math.abs(v.speed) < 5;
      if (!(dd <= 12 || (dd <= 22 && slow))) continue;
      if (this.clock - (this.carSpawnAt.get(v) ?? -99) < 8) continue;
      this.carSpawnAt.set(v, this.clock);
      const h = v.body.heading;
      const pos = { x: v.body.pos.x + Math.cos(h) * 2.2, z: v.body.pos.z + Math.sin(h) * 2.2 };
      const toward = Math.atan2(pp.x - pos.x, -(pp.z - pos.z));
      const o = this.d.makeOfficer(`officer-${this.seq++}`, pos, toward);
      o.run = stars >= 2;
      o.onStruck = () => this.onOfficerStruck(o);
      this.d.scene.add(o.object3D);
      this.d.world.addBody(o.body);
      this.officers.push(o);
      this.bark(pos, HOLD_LINES[Math.floor(this.d.rng.next() * HOLD_LINES.length) % HOLD_LINES.length], 'order');
      return;
    }
  }

  private tickOfficers(dt: number, pp: Vec2): void {
    const stars = this.d.wanted.stars;
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (stars === 0 && !this.busted && o.mode !== 'leave') { o.mode = 'leave'; o.run = false; o.goal = { x: o.body.pos.x + (o.body.pos.x - pp.x), z: o.body.pos.z + (o.body.pos.z - pp.z) }; }
      if (this.busted && o.mode !== 'hold' && o.mode !== 'leave') o.stop();
      const holding = this.hold?.officer === o;
      if (holding) { o.mode = 'hold'; o.reach = Math.min(1, o.reach + dt * 4); }
      else {
        if (o.mode === 'hold') o.mode = 'approach';
        o.reach = Math.max(0, o.reach - dt * 3);
        const target = this.d.player.vehicle ? this.d.player.vehicle.body.pos : pp;
        if (o.mode === 'approach' && !this.busted) {
          if (this.unseenFor >= LOSE_SECONDS && this.lastSeen) { o.run = false; if (o.steer(dt, this.lastSeen, 1.5) <= 1.6) o.stop(); }
          else { o.run = stars >= 2; o.steer(dt, target, this.d.player.vehicle ? 2.6 : 0.8); }
        } else if (o.mode === 'leave' && o.goal) o.steer(dt, o.goal, 0.5);
      }
      o.update(dt);
      const far = dist(o.body.pos, pp) > 160 || (o.mode === 'leave' && (dist(o.body.pos, pp) > 45 || o.age > 600));
      if (far || (o.mode === 'leave' && o.age > 600)) this.removeOfficer(i);
    }
  }

  private removeOfficer(i: number): void {
    const o = this.officers[i];
    this.officers.splice(i, 1);
    this.d.world.removeBody(o.body.id);
    o.dispose();
  }

  // ------------------------------------------------------------------ arrest

  private updateArrest(dt: number, pb: Body2D, pp: Vec2, stars: number): void {
    const pl = this.d.player;
    const inCar = pl.inVehicle;
    const speed = hyp(pb.vel.x, pb.vel.z);
    if (inCar && speed < CAR_STOPPED_SPEED) this.stoppedFor += dt; else this.stoppedFor = 0;

    if (this.hold) {
      const h = this.hold;
      h.t += dt;
      const dd = dist(h.officer.body.pos, pp);
      if (dd > GRAB_REACH + 1.2) { this.cancelHold(); return; }
      if (!this.breakFreeUsed && this.d.tryingToFlee() && h.t > 0.2) { this.breakFree('You broke free'); return; }
      h.officer.face(dt, pp);
      if (h.t >= ARREST_HOLD) this.bust();
      return;
    }
    if (pl.isDown) return;
    for (const o of this.officers) {
      if (o.mode !== 'approach' || o.cooldown > 0) continue;
      const dd = dist(o.body.pos, pp);
      let ok = false;
      if (!inCar) ok = dd <= GRAB_REACH && speed <= GRAB_MAX_SPEED && this.clear(o.body.pos, pp);
      else ok = dd <= 3.6 && this.stoppedFor >= CAR_STOPPED_SECONDS && stars >= 1 && this.clear(o.body.pos, pp);
      if (!ok) continue;
      if (inCar) this.d.ejectPlayer();
      this.hold = { officer: o, t: 0, fromCar: inCar };
      this.bark(o.body.pos, 'Stop. Hands where I can see them.', 'arrest');
      return;
    }
  }

  private onOfficerStruck(o: Officer): void {
    this.reportCrime('hitCop', o.body.pos, true);
    if (this.hold?.officer === o && !this.breakFreeUsed) this.breakFree('You hit an officer');
  }

  private breakFree(why: string): void {
    const h = this.hold;
    this.breakFreeUsed = true;
    this.resisted = true;
    this.hold = null;
    this.d.player.actionPose = null;
    if (h) { h.officer.cooldown = BREAK_FREE_COOLDOWN; h.officer.mode = 'approach'; h.officer.hitBy(this.d.player.body.pos, 'light'); }
    this.d.wanted.addStars(1, 'Resisting arrest');
    this.say('Resisting arrest');
    void why;
  }

  private cancelHold(): void {
    if (this.hold) { this.hold.officer.cooldown = 1; this.hold.officer.mode = 'approach'; }
    this.hold = null;
    if (this.d.player.actionPose && (this.d.player.actionPose.kind === 'held')) this.d.player.actionPose = null;
  }

  /** The player cannot move while held: no velocity, the held pose, facing the officer's grip. */
  private holdPlayer(): void {
    const b = this.d.player.body;
    b.vel.x = 0; b.vel.z = 0;
    const k = this.hold ? Math.min(1, this.hold.t / 0.4) : 1;
    this.d.player.actionPose = { kind: 'held', k };
  }

  private bust(): void {
    const stars = this.d.wanted.stars;
    const info = { stars, resisted: this.resisted };
    this.busted = true;
    const fine = fineFor(stars, this.resisted, 1e9); // the amount before the wallet clamp; the card shows what was actually taken after completeBust
    const site = this.d.precinct();
    this.hold = null;
    this.d.events.emit('busted', { stars, fine });
    this.d.onBusted?.({ ...info, fine, precinct: site.name });
  }

  /**
   * The BUSTED card has played and the screen is black: apply the consequences and put the player at the precinct door.
   * Returns what it cost (the fine is clamped to the cash in hand).
   */
  completeBust(host: BustHost): BustResult {
    const stars = this.d.wanted.stars;
    const res = applyBust({ ...host, cash: () => host.cash(), addCash: (n) => host.addCash(n), dropWeapons: () => host.dropWeapons(), teleport: (x) => host.teleport(x), advanceClock: (h) => host.advanceClock(h), clearWanted: () => { this.d.wanted.clear(); host.clearWanted(); }, addBust: () => { this.busts++; host.addBust(); } }, { stars, resisted: this.resisted }, this.d.precinct());
    this.busted = false;
    this.hold = null;
    this.d.player.actionPose = null;
    this.heat.reset();
    this.breakFreeUsed = false;
    this.resisted = false;
    this.unseenFor = 0;
    this.lastSeen = null;
    this.state = 'calm';
    for (let i = this.officers.length - 1; i >= 0; i--) this.removeOfficer(i);
    return res;
  }

  /** Restore the bust count from a save. */
  setBusts(n: number): void { this.busts = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)); }

  dispose(): void {
    for (const off of this.offs) off();
    for (let i = this.officers.length - 1; i >= 0; i--) this.removeOfficer(i);
    this.d.wanted.policeDriven = false;
    this.d.wanted.holdDecay = false;
    this.d.cops.gentleAtOneStar = false;
  }
}
