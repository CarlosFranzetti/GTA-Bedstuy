/**
 * Pedestrian social life: a small scheduler that lets people near the player act like neighbours.
 *  - pairs (and the odd third person) stop, face each other, gesture, nod, laugh and part with a goodbye;
 *  - walkers who pass each other nod or wave; walkers wave to people on stoops, who wave back;
 *  - people glance at the player who passes close, stagger back when bumped (Pedestrian.onContact);
 *  - near misses, crashes, horns and rising wanted stars make nearby people react (shout, flinch, step away, flee from a crash);
 *  - a few short spoken barks, rate limited and only within earshot of the player, emitted as the `pedBark` event (PedVoice speaks them).
 * Everything is cheap: one pass every TICK seconds over the pedestrians within RADIUS of the player, a cap on concurrent conversations,
 * and per-person cooldowns. Conversations never start on or beside a crosswalk (Pedestrian.canSocialize) and a meeting that does not
 * turn into a conversation within MEET_TIMEOUT is dropped, so nobody waits for somebody who left (no deadlocks).
 */
import { hyp } from '@/core/Math2';
import type { EventBus } from '@/core/Events';
import type { Rng } from '@/core/Rng';
import type { Vec2 } from '@/core/Math2';
import { Pedestrian } from '@/entities/Pedestrian';
import { BARKS, LOUDNESS, greetKind, pickBark, voiceFor, type BarkKind } from './pedBarks';

export const TICK = 0.5;
/** only pedestrians within this range of the player are scheduled */
export const RADIUS = 42;
/** a bark is only said within this range of the player (m), and at most one every BARK_GAP seconds overall */
export const BARK_RANGE = 16;
export const BARK_GAP = 1.8;
export const BARK_PER_PED = 14;
/** pedestrians are matched when this far apart (m) */
export const PAIR_MIN = 1.6;
export const PAIR_MAX = 7;
export const MAX_PAIRS_DEFAULT = 4;

export interface SocialOptions { maxPairs?: number; rng: Rng }

/** how sociable the street is by hour: lunch and evening busiest, the small hours quiet */
export function socialHourFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 0.3; if (h < 8) return 0.7; if (h < 12) return 1; if (h < 14) return 1.3; if (h < 17) return 1.1; if (h < 22) return 1.4; return 0.6;
}

export class PedSocial {
  private acc = 0;
  private maxPairs: number;
  private clock = 0;
  private lastBark = -99;
  private lastGreet = -99;
  private hour = 12;
  private readonly rng: Rng;
  private readonly seen = new Map<string, number>();
  private readonly offs: Array<() => void> = [];
  /** barks emitted (for tests and the debug overlay) */
  barks = 0;
  chatsStarted = 0;
  private player: Vec2 = { x: 0, z: 0 };
  private readonly peds: Pedestrian[] = [];

  constructor(private readonly events: EventBus, opts: SocialOptions) {
    this.rng = opts.rng;
    this.maxPairs = opts.maxPairs ?? MAX_PAIRS_DEFAULT;
    Pedestrian.socialHook = (p, kind) => this.bark(p, kind);
    this.offs.push(
      events.on('impact', (e) => this.onImpact(e.pos, e.strength)),
      events.on('horn', (e) => this.onHorn(e.pos)),
      events.on('wantedChanged', (e) => this.onWanted(e.stars)),
    );
  }

  setMaxPairs(n: number): void { this.maxPairs = Math.max(0, Math.floor(n)); }
  setHour(h: number): void { this.hour = h; }
  dispose(): void { for (const o of this.offs) o(); this.offs.length = 0; if (Pedestrian.socialHook) Pedestrian.socialHook = null; }

  /** the list is only read; `peds` is TrafficSystem.peds */
  update(dt: number, peds: readonly Pedestrian[], player: Vec2): void {
    this.clock += dt;
    this.player = player;
    this.acc += dt;
    if (this.acc < TICK) return;
    this.acc = 0;
    // the scheduled set: pedestrians near the player
    const near = this.peds; near.length = 0;
    for (let i = 0; i < peds.length; i++) { const p = peds[i]; if (p.state !== 'down' && hyp(p.body.pos.x - player.x, p.body.pos.z - player.z) <= RADIUS) near.push(p); }
    this.scheduleChats(near);
    this.greetings(near);
    this.glances(near);
  }

  // ------------------------------------------------------------------ conversations

  private activePairs(near: readonly Pedestrian[]): number {
    let n = 0;
    for (const p of near) if (p.isTalking) n++;
    return Math.ceil(n / 2);
  }

  private scheduleChats(near: readonly Pedestrian[]): void {
    const active = this.activePairs(near);
    if (active >= this.maxPairs || near.length < 2) return;
    const chance = 0.45 * socialHourFactor(this.hour);
    if (this.rng.next() > chance) return;
    // the best free pair: close, and not walking apart; ties broken by a little randomness
    let best: [Pedestrian, Pedestrian] | null = null, bestScore = Infinity;
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      if (!a.canSocialize) continue;
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        if (!b.canSocialize) continue;
        const dx = b.body.pos.x - a.body.pos.x, dz = b.body.pos.z - a.body.pos.z, d = hyp(dx, dz);
        if (d < PAIR_MIN || d > PAIR_MAX) continue;
        // walking away from each other fast: they will not stop (closing speed in the line between them)
        const closing = ((a.body.vel.x - b.body.vel.x) * dx + (a.body.vel.z - b.body.vel.z) * dz) / d;
        if (closing < -0.8) continue;
        const score = d - closing * 0.5 + this.rng.next() * 1.5;
        if (score < bestScore) { bestScore = score; best = [a, b]; }
      }
    }
    if (!best) return;
    const [a, b] = best;
    a.meet(b, true); b.meet(a, false);
    this.chatsStarted++;
    // sometimes a third person walking by joins in
    if (this.rng.chance(0.25)) {
      const mx = (a.body.pos.x + b.body.pos.x) / 2, mz = (a.body.pos.z + b.body.pos.z) / 2;
      for (const c of near) if (c !== a && c !== b && c.canSocialize && hyp(c.body.pos.x - mx, c.body.pos.z - mz) < 5) { c.meet(a, false); break; }
    }
  }

  // ------------------------------------------------------------------ greetings, stoops, the player

  private greetings(near: readonly Pedestrian[]): void {
    if (this.clock - this.lastGreet < 2) return;
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      if (a.state !== 'walking' || a.currentReaction) continue;
      for (let j = 0; j < near.length; j++) {
        const b = near[j];
        if (a === b) continue;
        const dx = b.body.pos.x - a.body.pos.x, dz = b.body.pos.z - a.body.pos.z, d = hyp(dx, dz);
        if (d > 4.2 || d < 0.4) continue;
        const key = `${a.id}>${b.id}`;
        if ((this.seen.get(key) ?? -99) > this.clock - 40) continue;
        if (b.isSeatedOnStoop && b.state === 'sitting' && d < 4.2) {
          // a walker waves to a neighbour on a stoop, who waves back a moment later
          if (!this.rng.chance(0.22)) continue;
          this.seen.set(key, this.clock); this.lastGreet = this.clock;
          a.react('wave', b.body.pos); b.react('wave', a.body.pos, 0.8);
          a.say('stoopHello'); b.say('stoopReply');
          return;
        }
        if (b.state !== 'walking' || d > 2.8) continue;
        // two walkers coming towards each other: a nod or a wave, sometimes a word
        const ahead = (Math.sin(a.body.heading) * dx - Math.cos(a.body.heading) * dz) / d;
        if (ahead < 0.4) continue;
        if (!this.rng.chance(0.14)) continue;
        this.seen.set(key, this.clock); this.seen.set(`${b.id}>${a.id}`, this.clock); this.lastGreet = this.clock;
        const wave = this.rng.chance(0.5);
        a.react(wave ? 'wave' : 'nod', b.body.pos); b.react(wave ? 'wave' : 'nod', a.body.pos, 0.35);
        if (this.rng.chance(0.4)) a.say(greetKind(this.hour));
        if (this.seen.size > 400) this.seen.clear();
        return;
      }
    }
  }

  private glances(near: readonly Pedestrian[]): void {
    const pl = this.player;
    for (const p of near) {
      if (p.currentReaction || p.state === 'down') continue;
      const d = hyp(pl.x - p.body.pos.x, pl.z - p.body.pos.z);
      if (d > 4.5 || d < 0.2) continue;
      if (this.rng.chance(0.2)) { p.react('glance', pl); if (d < 2.2 && p.state === 'walking' && this.rng.chance(0.25)) p.say('excuse'); }
    }
  }

  // ------------------------------------------------------------------ the street makes noise

  private onImpact(pos: Vec2, strength: number): void {
    if (strength < 6) return;
    let spoke = 0;
    for (const p of this.nearPos(pos, 16)) {
      const d = hyp(p.body.pos.x - pos.x, p.body.pos.z - pos.z);
      p.dropChat(false, 8);
      p.react('startle', pos);
      if (strength > 11 && d < 9) p.flee(pos, 3);
      if (spoke < 2 && this.rng.chance(0.5)) { p.say('crash'); spoke++; }
    }
  }
  private onHorn(pos: Vec2): void {
    let spoke = false;
    for (const p of this.nearPos(pos, 12)) {
      p.react('glance', pos);
      if (!spoke && this.rng.chance(0.12)) { p.say('horn'); spoke = true; }
    }
  }
  private onWanted(stars: number): void {
    if (stars < 1) return;
    let spoke = false;
    for (const p of this.nearPos(this.player, 24)) {
      p.dropChat(false, 10);
      p.react('glance', this.player);
      if (stars >= 3) p.flee(this.player, 4);
      if (!spoke && this.rng.chance(0.3)) { p.say('sirens'); spoke = true; }
    }
  }
  private nearPos(c: Vec2, r: number): Pedestrian[] {
    // the scheduled list is refreshed every tick; for events use it as is (it holds everybody within RADIUS of the player)
    return this.peds.filter((p) => p.state !== 'down' && hyp(p.body.pos.x - c.x, p.body.pos.z - c.z) <= r);
  }

  // ------------------------------------------------------------------ barks

  private bark(p: Pedestrian, kind: BarkKind): void {
    const pos = p.body.pos;
    const d = hyp(pos.x - this.player.x, pos.z - this.player.z);
    if (d > BARK_RANGE) return;
    const loud = LOUDNESS[kind];
    if (d > BARK_RANGE * (0.4 + 0.6 * loud)) return;
    if (this.clock - this.lastBark < BARK_GAP && loud < 1) return;
    if ((this.seen.get(`bark:${p.id}`) ?? -99) > this.clock - BARK_PER_PED && loud < 1) return;
    const who = p.person;
    if (!who || !BARKS[kind]) return;
    this.lastBark = this.clock;
    this.seen.set(`bark:${p.id}`, this.clock);
    const v = voiceFor(who.id + ':' + p.id, who.sex, who.age);
    this.barks++;
    this.events.emit('pedBark', { id: p.id, text: pickBark(kind, this.rng), kind, pos: { x: pos.x, z: pos.z }, pitch: v.pitch, rate: v.rate, sex: who.sex, age: who.age, loud });
  }
}
