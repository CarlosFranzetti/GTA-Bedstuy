/**
 * A scripted player for mission tests: walks/drives in straight lines, presses F, forwards host signals and plays any
 * mission objective by kind. Shared by the content and kind tests.
 */
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef, ObjectiveDef } from '@/game/missions/types';

export const DT = 1 / 60;
const GAME_HOURS_PER_SECOND = 1 / 60;

export interface P2 { x: number; z: number }

export class Bot {
  x: number; z: number;
  inCar = false;
  /** Vehicle type the host reports while inCar ('' = unknown, which waives vehicle gates). */
  vehicle = '';
  /** Fork picks by fork id (the option's flag); a fork not listed takes its first available option. */
  choices: Record<string, string> = {};
  stars = 0;
  speed = 0;
  t = 0;
  hour: number;
  private sinceCrime = 0;
  /** While >= 0, walking stops as soon as the active objective changes (a real player does not walk on after a beat). */
  private watch = -2;
  constructor(readonly m: MissionSystem, start: P2, hour = 12) { this.x = start.x; this.z = start.z; this.hour = hour; }

  get pos(): P2 { return { x: this.x, z: this.z }; }

  tick(): void {
    if (this.stars > 0) { this.sinceCrime += DT; if (this.sinceCrime >= 20) { this.sinceCrime = 0; this.stars--; } }
    this.t += DT;
    this.hour = (this.hour + GAME_HOURS_PER_SECOND * DT) % 24;
    this.m.update(DT, this, this.inCar, this.stars, this.speed, this.hour, this.vehicle);
  }
  wait(seconds: number, speed = 0): void { this.speed = speed; for (let i = 0; i < seconds / DT; i++) { this.tick(); } }
  go(to: P2, mps: number): void {
    this.speed = mps;
    for (let guard = 0; guard < 60 * 900; guard++) {
      const dx = to.x - this.x, dz = to.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3 || this.m.isFailed || (this.watch !== -2 && this.m.objectiveIndex !== this.watch)) break;
      const s = Math.min(d, mps * DT);
      this.x += (dx / d) * s; this.z += (dz / d) * s;
      this.tick();
    }
    this.speed = 0;
  }
  teleport(to: P2): void { this.x = to.x; this.z = to.z; this.tick(); }
  raise(n: number): void { this.stars = Math.max(this.stars, n); this.sinceCrime = 0; }

  /** Arm the trigger from far away, then step into the giver zone. */
  startMission(def: MissionDef): void {
    this.teleport({ x: def.giver.x + 45, z: def.giver.z });
    this.teleport(def.giver);
  }

  /** Walk speed in m/s that respects an objective's speed cap. */
  private pace(ob: ObjectiveDef, base: number): number {
    return ob.maxKmh !== undefined ? Math.min(base, (ob.maxKmh / 3.6) * 0.7) : base;
  }

  /** Play the active objective to completion (one beat). */
  playObjective(ob: ObjectiveDef): void {
    const idx = this.m.objectiveIndex;
    this.watch = idx;
    try { this.playBeat(ob, idx); } finally { this.watch = -2; }
  }

  private playBeat(ob: ObjectiveDef, idx: number): void {
    const mps = (base: number) => this.pace(ob, base);
    const car = (p: 'onFoot' | 'inVehicle' | 'any' | undefined) => { this.inCar = p === 'inVehicle' || (p === 'any' && this.inCar); if (this.inCar && ob.vehicle) this.vehicle = ob.vehicle[0]; };
    if (ob.stayInVehicle !== undefined) this.inCar = true;
    switch (ob.kind) {
      case 'goTo': case 'pickUp': case 'deliver':
        car(ob.presence); this.go(ob.at, mps(ob.presence === 'inVehicle' ? 11 : 5)); this.wait(0.1);
        if (ob.kind === 'pickUp' && ob.prompt !== undefined) { this.press(); this.wait(0.1); }
        break;
      case 'enterVehicle': this.inCar = true; if (ob.vehicle) this.vehicle = ob.vehicle[0]; this.wait(0.1); break;
      case 'timer': this.wait(ob.seconds + 0.3); break;
      case 'holdSpeedBelow': if (ob.at) this.go(ob.at, 4); this.wait(ob.seconds + 0.3); break;
      case 'escapeRadius': this.go({ x: ob.from.x + ob.radius + 8, z: ob.from.z }, 11); this.wait(0.1); break;
      case 'loseWanted': case 'surviveWanted': this.wait(70); break;
      case 'talkTo':
        car(ob.presence ?? 'onFoot'); this.go(ob.at, mps(5)); this.wait(0.1);
        for (let i = 0; i < ob.lines.length; i++) { this.press(); this.wait(0.1); }
        break;
      case 'interact':
        car(ob.presence ?? 'onFoot'); this.go(ob.at, mps(5)); this.wait(0.1);
        for (let i = 0; i < (ob.presses ?? 1); i++) { this.press(); this.wait(0.1); }
        break;
      case 'collect':
        car(ob.presence);
        for (const p of ob.points) { this.go(p, mps(ob.presence === 'inVehicle' ? 11 : 5)); this.wait(0.1); }
        break;
      case 'tail': this.followTail(ob); break;
      case 'waitUntilHour':
        if (ob.at) this.go(ob.at, 5);
        for (let i = 0; i < 60 * 60 * 26 && this.m.objectiveIndex === idx && !this.m.isFailed; i++) this.tick();
        break;
      case 'enterInterior': this.m.notify({ type: 'interior:entered', id: ob.id }); this.wait(0.1); break;
      case 'exitInterior': this.m.notify({ type: 'interior:exited', id: ob.id }); this.wait(0.1); break;
      case 'djSet': this.wait(0.1); this.m.notify({ type: 'dj:setFinished', venue: ob.venue, score: Math.max(ob.minScore + 15, 70), minutes: ob.minutes }); this.wait(0.1); break;
      case 'buy':
        this.wait(0.1);
        for (const it of ob.items) { this.m.notify({ type: 'shop:bought', recordId: it, shop: ob.shop, price: 10 }); this.wait(0.1); }
        break;
      case 'sell': this.sellAll(ob); break;
      case 'spots':
        car(ob.presence ?? 'onFoot');
        for (const p of ob.points) { this.go(p, mps(this.inCar ? 11 : 5)); this.wait(0.1); this.press(); this.wait(0.1); }
        break;
      case 'pay': car(ob.presence ?? 'onFoot'); this.go(ob.at, mps(this.inCar ? 11 : 5)); this.wait(0.1); this.press(); this.wait(0.1); break;
      case 'fork': {
        car(ob.presence ?? 'onFoot');
        const open = ob.options.filter((o) => this.m.story.test(o.when));
        const pick = open.find((o) => o.flag === this.choices[ob.id]) ?? open[0];
        this.go(pick.at, mps(this.inCar ? 11 : 5)); this.wait(0.1); this.press(); this.wait(0.1);
        break;
      }
      case 'chase': this.chase(ob); break;
      case 'race':
        car(ob.presence ?? 'inVehicle');
        for (const p of ob.route.slice(1)) { this.go(p, 15); this.wait(0.05); }
        break;
      case 'stakeout': car(ob.presence); this.go(ob.at, 4); this.wait(ob.seconds + 0.6); break;
    }
  }

  followTail(ob: Extract<ObjectiveDef, { kind: 'tail' }>): void {
    const idx = this.m.objectiveIndex;
    // a stealth tail stays in the band between minDistance and maxDistance; others hug the target
    const gap = ob.minDistance !== undefined ? (ob.minDistance + ob.maxDistance) / 2 : 2;
    this.go({ x: ob.route[0].x + gap, z: ob.route[0].z }, 11);
    this.speed = ob.speed;
    for (let i = 0; i < 60 * 600 && this.m.objectiveIndex === idx && !this.m.isFailed; i++) {
      const mk = this.m.markers.find((k) => k.id.endsWith('tail'));
      if (mk) { this.x = mk.x + gap; this.z = mk.z; }
      this.tick();
    }
  }

  /** Run after the 'rival' marker at jogging speed until caught (or the target gets away). */
  chase(ob: Extract<ObjectiveDef, { kind: 'chase' }>): void {
    const idx = this.m.objectiveIndex;
    this.go(ob.route[0], 5);
    this.speed = 6;
    for (let i = 0; i < 60 * 300 && this.m.objectiveIndex === idx && !this.m.isFailed; i++) {
      const mk = this.m.markers.find((k) => k.id.endsWith('rival'));
      if (mk) {
        const dx = mk.x - this.x, dz = mk.z - this.z, d = Math.hypot(dx, dz) || 1;
        const s = Math.min(d, 6 * DT);
        this.x += (dx / d) * s; this.z += (dz / d) * s;
      }
      this.tick();
    }
    this.speed = 0;
  }

  sellAll(ob: Extract<ObjectiveDef, { kind: 'sell' }>): void {
    const idx = this.m.objectiveIndex;
    this.go(ob.at, 5);
    for (let i = 0; i < 60 * 600 && this.m.objectiveIndex === idx && !this.m.isFailed; i++) {
      const c = this.m.markers.find((k) => k.id.endsWith(':cust'));
      if (c) { this.x = c.x; this.z = c.z; this.press(); }
      this.tick();
    }
  }

  press(): boolean { return this.m.interact(this.pos); }

  /** Play objectives until the mission completes, fails or `until` is hit (objective index). */
  playUntil(def: MissionDef, until = Infinity): void {
    for (let guard = 0; guard < 40; guard++) {
      const i = this.m.objectiveIndex;
      if (i < 0 || this.m.isFailed || i >= until) return;
      this.playObjective(def.objectives[i]);
      if (this.m.objectiveIndex === i && !this.m.isFailed && this.m.activeId !== null) throw new Error(`${def.id}: stuck on objective ${i} (${def.objectives[i].kind}: ${def.objectives[i].text})`);
    }
  }
}

/** Starting hour that puts the mission inside its window with the whole window ahead. */
export function startHourFor(def: MissionDef): number {
  if (!def.availableHours) return 12;
  const [a, b] = def.availableHours;
  const span = (((b - a) % 24) + 24) % 24 || 24;
  return (a + Math.min(0.25, span / 4)) % 24;
}
