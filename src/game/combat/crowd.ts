/**
 * COMBAT2: what a street does when somebody is hit or a gun goes off. Each person reacts by their own temperament
 * (src/entities/pedVitals.ts: flee, cower, film it, fight), so a street is never one crowd running one way:
 *
 *   a fight  within 9 m: runners run, cowerers freeze and cover up, filmers stand and film it, fighters stand and watch;
 *            within 18 m: filmers film, the rest look and shout; friends of the victim (a walking group, a chat partner) may join in
 *   a gun    within the gun's flee radius everybody who is not cowering runs (a filmer drops the phone); out to the shout radius
 *            they shout. People who were already running carry on
 *
 * Works on anything shaped like a Pedestrian (an Officer, which has no temperament, is left to PoliceSystem).
 */
import type { Vec2 } from '@/core/Math2';
import type { Pedestrian } from '@/entities/Pedestrian';
import type { Body2D } from '@/world/types';

export const FIGHT_FLEE_RADIUS = 9;
export const FIGHT_WATCH_RADIUS = 18;
export const WITNESS_RADIUS = 25;
/** Friends of a victim within this distance may join in. */
export const FRIEND_RADIUS = 14;
/** A friend joins when their own hash is under this (an adult's temperament still counts: kids never join). */
export const FRIEND_JOIN = 0.65;
/** Bystanders stand and look for about this long (s, 0.6 to 1.4 times it per person) before they run. */
export const LOOK_BEAT = 0.25;

/** The parts of a person the crowd needs; a Pedestrian has them all. */
export type Person = Pedestrian;

export interface CrowdDeps {
  peds: () => Iterable<Person>;
  /** the player's body: friends and victims who fight back go for it */
  player: () => Body2D;
  /** a punch from a person landed on the player */
  onPlayerHit: (damage: number, from: Vec2, by: Person) => void;
}

const isPerson = (o: unknown): o is Person => typeof (o as Person).flee === 'function' && (o as Person).vitals !== undefined;
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

export class Crowd {
  constructor(private readonly d: CrowdDeps) {}

  /** `a` and `b` belong together: the same walking group, or talking to each other. */
  static friends(a: Person, b: Person): boolean {
    if (a === b) return false;
    if (a.chatPartner === b || b.chatPartner === a) return true;
    const la = a.groupLeader ?? a, lb = b.groupLeader ?? b;
    return la === lb && (a.groupLeader !== null || b.groupLeader !== null);
  }

  /** The person hit starts to fight back, if that is who they are. Returns true when they did. */
  victimReacts(victim: Person): boolean {
    if (victim.vitals.temper !== 'fight' || victim.state === 'down') return false;
    victim.fightBack(this.d.player(), (dmg, from) => this.d.onPlayerHit(dmg, from, victim));
    return true;
  }

  /** A fight at `pos`: the street reacts. Returns how many other people could see it (witnesses within 25 m). */
  fight(pos: Vec2, victim: Person | null): number {
    let witnesses = 0;
    for (const o of this.d.peds()) {
      if (o === victim || !isPerson(o) || o.state === 'down') continue;
      const d = dist(o.body.pos, pos);
      if (d <= WITNESS_RADIUS) witnesses++;
      if (o.special?.mode === 'fight') continue;
      if (victim && d <= FRIEND_RADIUS && Crowd.friends(o, victim) && o.vitals.temper !== 'cower' && o.vitals.age !== 'kid' && hashJoin(o.id) < FRIEND_JOIN) {
        o.fightBack(this.d.player(), (dmg, from) => this.d.onPlayerHit(dmg, from, o));
        continue;
      }
      if (d > FIGHT_WATCH_RADIUS) continue;
      const t = o.vitals.temper;
      if (d <= FIGHT_FLEE_RADIUS) {
        if (t === 'cower') { if (o.special?.mode !== 'cower') o.cower(pos, 6); }
        else if (t === 'film') { if (o.special?.mode !== 'film') o.film(pos); }
        else if (t === 'fight') { if (!o.special) o.watch(pos, 7); }
        else o.flee(pos, 6, o.state === 'fleeing' ? 0 : LOOK_BEAT);
      } else if (!o.special && o.state !== 'fleeing') {
        // the ring of onlookers
        if (t === 'film') o.film(pos);
        else if (t === 'flee') o.react('shout', pos);
        else o.watch(pos, 6);
      }
    }
    return witnesses;
  }

  /** A gun went off at `pos`: run, cover up or shout by distance. */
  gunshot(pos: Vec2, fleeR: number, shoutR: number, victim: Person | null = null): number {
    let witnesses = 0;
    for (const o of this.d.peds()) {
      if (o === victim || !isPerson(o) || o.state === 'down') continue;
      const d = dist(o.body.pos, pos);
      if (d <= WITNESS_RADIUS) witnesses++;
      if (d <= fleeR) {
        if (o.vitals.temper === 'cower') { if (o.special?.mode !== 'cower') o.cower(pos, 8); }
        else o.flee(pos, 7, o.state === 'fleeing' ? 0 : LOOK_BEAT);
      } else if (d <= shoutR && !o.special) o.react('shout', pos);
    }
    return witnesses;
  }
}

function hashJoin(id: string): number {
  let h = 2166136261;
  const s = `${id}:join`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
