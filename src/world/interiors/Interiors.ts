/**
 * Interiors: small procedural rooms parked 3 km off the map. The player walks to a door, presses F, the screen
 * fades, the player is moved into the room (walls are 2D static colliders, so normal movement just works),
 * and F at the exit spot brings them back out. All state lives here; main.ts only forwards F and shows `prompt`.
 *
 *   interiors.prompt(pos)        -> '' or 'F  Enter WAX DELI' (for the HUD prompt line)
 *   interiors.tryEnter(pos)      -> true if a door was used
 *   interiors.exit()             -> true if the player was inside
 *   interiors.interact(pos)      -> F handler: enter / exit / use a spot (shop, decks, bar...)
 *   interiors.update(dt, beat?)  -> every frame (fade, animation); `locked` is true while fading
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { Inventory } from '@/game/Inventory';
import type { IMaterialLibrary, IWorld2D } from '../types';
import { CLUB_SLOT_FLAG, CLUB_UNLOCK_FLAG, EVENT_ID, INTERIORS, INTERIOR_IDS, inDoorBand, isClubHours, isClubOpen, outwardHeading, type InteriorId } from './defs';
import { buildRoom, type Beat, type Room, type Spot } from './rooms';
import { box } from './parts';

export const FADE_SECONDS = 0.28;
export const DRINK_PRICE = 6;

export type InteriorAction =
  | { kind: 'shop'; interior: InteriorId }
  | { kind: 'listen'; interior: InteriorId }
  | { kind: 'dj'; interior: InteriorId; venue: 'home' | 'aftersloth' };

export interface InteriorsDeps {
  scene: THREE.Object3D;
  world: IWorld2D;
  materials: IMaterialLibrary;
  inventory: Inventory;
  /** Hour of day 0..24 (DayNight.timeOfDay). */
  getHour: () => number;
  /** Moves the player body (and snaps their render/camera pose) to a world position. */
  teleport: (x: number, z: number, heading: number) => void;
  events?: { emit(type: string, payload: unknown): void };
  onAction?: (a: InteriorAction) => void;
  /** Toast text (HUD): drinks, owner chatter, locked doors. */
  onMessage?: (text: string) => void;
  /** Black fade, 0..1 (a DOM overlay's opacity). */
  onFade?: (alpha: number) => void;
  /** Called when the interior changes (id) or the player is back outside (null): start/stop ambience. */
  onChange?: (id: InteriorId | null) => void;
  dancerCount?: number;
}

export type InteriorState = 'outside' | 'fadingIn' | 'inside' | 'fadingOut';

const OWNER_LINES = [
  'Owner: "Every sleeve in here is an original pressing. Of something."',
  'Owner: "Preview first. I do not do refunds, I do karma."',
  'Owner: "Bring me your own files and I will press them, free. Do not tell the label."',
  'Owner: "There is a door on Kosciuszko with no sign. I never told you that."',
];

export class Interiors {
  private st: InteriorState = 'outside';
  private cur: InteriorId | null = null;
  private pending: InteriorId | null = null;
  private fadeT = 0;
  private swapped = false;
  private readonly rooms = new Map<InteriorId, Room>();
  private readonly doors = new Map<InteriorId, THREE.Group>();
  private clubLamp: THREE.Mesh | null = null;
  private clock = 0;
  private lastPhase = 0;
  private beatIndex = 0;
  private talkIdx = 0;
  private dark = false;
  /** Where the player was last seen outside, so `exit()` can fall back to the door. */
  private readonly root = new THREE.Group();

  constructor(private readonly d: InteriorsDeps) {
    this.root.name = 'interiors';
    for (const id of INTERIOR_IDS) this.buildDoor(id);
    d.scene.add(this.root);
  }

  // ------------------------------------------------------------ queries

  get state(): InteriorState { return this.st; }
  /** The room the player is in (or fading into), else null. */
  get current(): InteriorId | null { return this.cur; }
  get inside(): boolean { return this.st === 'inside'; }
  /** True while the fade runs: main should ignore player input. */
  get locked(): boolean { return this.st === 'fadingIn' || this.st === 'fadingOut'; }
  get fade(): number { return this.fadeAlpha(); }

  /** Is this door usable right now? */
  doorOpen(id: InteriorId): boolean {
    if (id !== 'club') return true;
    return isClubOpen(this.d.getHour(), this.d.inventory.hasFlag(CLUB_UNLOCK_FLAG));
  }

  /** Door within reach of an outdoor position, if any. */
  doorAt(pos: Vec2): InteriorId | null {
    for (const id of INTERIOR_IDS) {
      if (inDoorBand(INTERIORS[id], pos.x, pos.z)) return id;
    }
    return null;
  }

  /** Prompt text for the HUD, '' when nothing is in reach. */
  prompt(pos: Vec2): string {
    if (this.locked) return '';
    if (this.st === 'outside') {
      const id = this.doorAt(pos);
      if (!id) return '';
      if (id === 'club') {
        // hidden entrance: no hint at all until the password mission flagged it
        if (!this.d.inventory.hasFlag(CLUB_UNLOCK_FLAG)) return '';
        if (!isClubHours(this.d.getHour())) return 'Closed. Doors open 11 PM to 4 AM';
      }
      return `F  Enter ${INTERIORS[id].name}`;
    }
    const s = this.spotAt(pos);
    return s ? `F  ${s.label}` : '';
  }

  /** Power cut (mission twist): lights, lasers and strobe go out in the club until switched back on. */
  setBlackout(on: boolean): void { this.dark = on; }

  // ------------------------------------------------------------ actions

  /** Uses a door near `pos`. */
  tryEnter(pos: Vec2): boolean {
    if (this.st !== 'outside') return false;
    const id = this.doorAt(pos);
    if (!id) return false;
    if (!this.doorOpen(id)) {
      if (id === 'club' && this.d.inventory.hasFlag(CLUB_UNLOCK_FLAG)) this.d.onMessage?.('The door is locked. Come back between 11 PM and 4 AM.');
      return false;
    }
    this.begin(id);
    return true;
  }

  /** Leaves the current room (fade, then the player stands outside the door). */
  exit(): boolean {
    if (this.st !== 'inside') return false;
    this.begin(null);
    return true;
  }

  /** The F key: enter a door, leave by the exit, or use whatever is at hand. */
  interact(pos: Vec2): boolean {
    if (this.locked) return true;
    if (this.st === 'outside') return this.tryEnter(pos);
    const s = this.spotAt(pos);
    if (!s || !this.cur) return false;
    const interior = this.cur;
    switch (s.kind) {
      case 'exit': return this.exit();
      case 'shop': this.d.onAction?.({ kind: 'shop', interior }); return true;
      case 'listen': this.d.onAction?.({ kind: 'listen', interior }); return true;
      case 'dj':
        if (interior === 'club' && !this.d.inventory.hasFlag(CLUB_SLOT_FLAG)) { this.d.onMessage?.('DJ Sloth waves you off: "Slots are for regulars. Earn one."'); return true; }
        this.d.onAction?.({ kind: 'dj', interior, venue: interior === 'club' ? 'aftersloth' : 'home' });
        return true;
      case 'bar':
        if (this.d.inventory.spend(DRINK_PRICE)) this.d.onMessage?.(`You buy a drink for $${DRINK_PRICE}. It is cold and mostly ice.`);
        else this.d.onMessage?.(`A drink is $${DRINK_PRICE}. You are short.`);
        return true;
      case 'talk': this.d.onMessage?.(OWNER_LINES[this.talkIdx++ % OWNER_LINES.length]); return true;
      case 'couch': this.d.onMessage?.('You sink into the couch. Nobody has called. Peaceful.'); return true;
      case 'window': this.d.onMessage?.('Throop Ave goes about its business below.'); return true;
    }
    return false;
  }

  /** World position of an interior spot. */
  private spotAt(pos: Vec2): (Spot & { wx: number; wz: number }) | null {
    if (!this.cur) return null;
    const room = this.rooms.get(this.cur); const o = INTERIORS[this.cur].origin;
    if (!room) return null;
    let best: (Spot & { wx: number; wz: number }) | null = null; let bd = Infinity;
    for (const s of room.spots) {
      const wx = o.x + s.x, wz = o.z + s.z; const dist = Math.hypot(pos.x - wx, pos.z - wz);
      if (dist <= s.r && dist < bd) { bd = dist; best = { ...s, wx, wz }; }
    }
    return best;
  }

  // ------------------------------------------------------------ frame

  /** `beat`: what the room hears (DjGame.roomBeat) or null for the house beat. */
  update(dt: number, beat: { phase: number; bpm: number; level: number } | null = null): void {
    const step = Math.min(dt, 0.1);
    this.clock += step;
    if (this.clubLamp) (this.clubLamp.material as THREE.MeshBasicMaterial).color.set(this.doorOpen('club') ? '#2cff72' : '#552222');
    if (this.st === 'fadingIn' || this.st === 'fadingOut') {
      this.fadeT += step;
      if (!this.swapped && this.fadeT >= FADE_SECONDS) this.swap();
      if (this.fadeT >= FADE_SECONDS * 2) { this.st = this.pending ? 'inside' : 'outside'; this.fadeT = 0; this.swapped = false; this.d.onFade?.(0); }
      else this.d.onFade?.(this.fadeAlpha());
    }
    const room = this.cur ? this.rooms.get(this.cur) : undefined;
    if (room && this.st !== 'outside') {
      const bpm = beat?.bpm ?? 124;
      let phase: number;
      if (beat) phase = beat.phase; else phase = (this.clock * bpm / 60) % 1;
      if (phase < this.lastPhase - 0.5) this.beatIndex++;
      this.lastPhase = phase;
      const b: Beat = { phase, bpm, level: beat ? beat.level : 0.7, index: this.beatIndex, dark: this.dark };
      room.update(this.clock, b);
    }
  }

  private fadeAlpha(): number {
    if (this.st !== 'fadingIn' && this.st !== 'fadingOut') return 0;
    const t = this.fadeT / FADE_SECONDS;
    return t < 1 ? t : Math.max(0, 2 - t);
  }

  private begin(target: InteriorId | null): void {
    this.pending = target;
    this.st = target ? 'fadingIn' : 'fadingOut';
    this.fadeT = 0; this.swapped = false;
    if (target) this.cur = target;
  }

  /** At full black: teleport and swap what is visible. */
  private swap(): void {
    this.swapped = true;
    if (this.pending) {
      const id = this.pending; const def = INTERIORS[id];
      let room = this.rooms.get(id);
      if (!room) {
        room = buildRoom(id, { world: this.d.world, materials: this.d.materials, dancerCount: this.d.dancerCount });
        room.group.position.set(def.origin.x, 0, def.origin.z);
        this.root.add(room.group); this.rooms.set(id, room);
      }
      for (const [rid, r] of this.rooms) r.group.visible = rid === id;
      this.d.teleport(def.origin.x + room.spawn.x, def.origin.z + room.spawn.z, room.spawn.heading);
      this.d.events?.emit('interior:entered', { id: EVENT_ID[id] });
      this.d.onChange?.(id);
    } else {
      const id = this.cur!; const def = INTERIORS[id];
      for (const r of this.rooms.values()) r.group.visible = false;
      this.d.teleport(def.door.x + def.door.outX * 1.9, def.door.z + def.door.outZ * 1.9, outwardHeading(def));
      this.d.events?.emit('interior:exited', { id: EVENT_ID[id] });
      this.cur = null;
      this.d.onChange?.(null);
    }
  }

  // ------------------------------------------------------------ doors on the street

  /** A sign board that glows (emissive copy of the sign texture) so it stays readable at dusk and from far down the block. */
  private litSign(text: string, bg: string, fg: string): THREE.Material {
    const base = this.d.materials.sign(text, bg, fg);
    const m = base.clone() as THREE.MeshStandardMaterial;
    if ('emissive' in m && m.map) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = m.map; m.emissiveIntensity = 0.85; }
    m.side = THREE.DoubleSide;
    return m;
  }

  private buildDoor(id: InteriorId): void {
    const def = INTERIORS[id]; const dr = def.door;
    const g = new THREE.Group(); g.name = `door-${id}`;
    const alongX = dr.outX === 0; // door in a z-facing wall: wide along x
    const W = 1.1, T = 0.14;
    const sx = alongX ? W : T, sz = alongX ? T : W;
    const leaf = id === 'deli' ? '#c9a24a' : id === 'club' ? '#3a3d42' : '#6b4226';
    g.add(box(sx, 2.1, sz, leaf, dr.x, 1.05, dr.z));
    const fw = alongX ? W + 0.3 : 0.2, fz = alongX ? 0.2 : W + 0.3;
    g.add(box(fw, 2.3, fz, id === 'club' ? '#2a2c30' : '#2b2118', dr.x - dr.outX * 0.03, 1.15, dr.z - dr.outZ * 0.03));
    if (id === 'home') {
      // a green awning over the door and a lit "HOME" board, so the player's own door reads from down the block
      const awn = alongX ? [1.9, 0.12, 1.0] : [1.0, 0.12, 1.9];
      g.add(box(awn[0], awn[1], awn[2], '#2f6b4a', dr.x + dr.outX * 0.5, 2.5, dr.z + dr.outZ * 0.5));
      // H7: nobody found HOME on a full walk of Throop. A big self-lit board over the door, HOME lettering on the
      // awning valance, and a blade sign sticking out over the sidewalk so it reads from up and down the block.
      const lit = this.litSign(def.sign, '#1f4d36', '#fff3c4');
      const rot = Math.atan2(dr.outX, dr.outZ);
      const hs = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), lit);
      hs.position.set(dr.x + dr.outX * 0.13, 3.15, dr.z + dr.outZ * 0.13);
      hs.rotation.y = rot;
      hs.name = 'home-board';
      g.add(hs);
      const val = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), this.litSign('HOME', '#2f6b4a', '#ffffff'));
      val.position.set(dr.x + dr.outX * 1.02, 2.3, dr.z + dr.outZ * 1.02);
      val.rotation.y = rot;
      val.name = 'home-valance';
      g.add(val);
      // blade sign: perpendicular to the wall, one plane per street direction
      const bx = dr.x + dr.outX * 1.5, bz = dr.z + dr.outZ * 1.5;
      const along = alongX ? { x: 1, z: 0 } : { x: 0, z: 1 };
      g.add(box(alongX ? 0.05 : 1.5, 0.05, alongX ? 1.5 : 0.05, '#1b1b1b', dr.x + dr.outX * 0.75, 3.75, dr.z + dr.outZ * 0.75));
      for (const dir of [1, -1]) {
        const bl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), this.litSign('HOME', '#1f4d36', '#fff3c4'));
        bl.position.set(bx + along.x * 0.02 * dir, 3.4, bz + along.z * 0.02 * dir);
        bl.rotation.y = alongX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
        bl.name = 'home-blade';
        g.add(bl);
      }
      g.add(box(0.14, 0.14, 0.02, '#e7d27a', dr.x + (alongX ? 0 : dr.outX * 0.09), 1.75, dr.z + (alongX ? dr.outZ * 0.09 : 0)));
    } else if (id === 'deli') {
      const m = this.d.materials.sign(def.sign, '#1b1b1b', '#ffd23f');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), m);
      sign.position.set(dr.x + dr.outX * 0.12, 2.65, dr.z + dr.outZ * 0.12);
      sign.rotation.y = Math.atan2(dr.outX, dr.outZ);
      g.add(sign);
      g.add(box(alongX ? 0.8 : 0.02, 1.2, alongX ? 0.02 : 0.8, '#9ed8e6', dr.x + dr.outX * 0.08, 1.1, dr.z + dr.outZ * 0.08));
    } else if (id === 'club') {
      // unmarked steel door; a tiny status lamp beside the handle (green when open)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: '#552222', fog: false }));
      lamp.position.set(dr.x + (alongX ? 0.7 : dr.outX * 0.12), 1.5, dr.z + (alongX ? dr.outZ * 0.12 : 0.7));
      this.clubLamp = lamp; g.add(lamp);
    } else {
      g.add(box(0.14, 0.14, 0.02, '#e7d27a', dr.x + (alongX ? 0 : dr.outX * 0.09), 1.75, dr.z + (alongX ? dr.outZ * 0.09 : 0)));
    }
    this.root.add(g); this.doors.set(id, g);
  }

  dispose(): void {
    this.d.scene.remove(this.root);
    this.root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
  }
}
