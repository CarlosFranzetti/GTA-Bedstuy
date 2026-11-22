/**
 * What is in the player's hands, and what the one action button does with it (GTA III style: one button, the meaning
 * follows the item). Fists are always there; everything else only once picked up. Pure state, no three.js.
 * COMBAT2: one melee weapon (bat, pipe, fish), thrown items (bottle, brick) and up to two guns (pistol, revolver, shotgun).
 */
import { GUNS, GUN_IDS, MAX_GUNS, MELEE, MELEE_IDS, type GunId, type MeleeId } from './arsenal';

export type HandItem = 'fists' | 'bottle' | 'brick' | 'pistol' | MeleeId | 'revolver' | 'shotgun';
export type ActionKind = 'punch' | 'throw' | 'shoot' | 'swing';
export type CarryKind = 'bottle' | 'brick' | GunId | MeleeId | 'ammo';

/** Cycle order (Tab, wheel, d-pad). Items the player does not own are skipped. */
export const HAND_ORDER: readonly HandItem[] = ['fists', 'bat', 'pipe', 'fish', 'bottle', 'brick', 'pistol', 'revolver', 'shotgun'];

/** What the action button does with each item. */
export function actionFor(item: HandItem): ActionKind {
  switch (item) {
    case 'fists': return 'punch';
    case 'bottle': case 'brick': return 'throw';
    case 'bat': case 'pipe': case 'fish': return 'swing';
    default: return 'shoot';
  }
}
export const isGun = (i: HandItem): i is GunId => i === 'pistol' || i === 'revolver' || i === 'shotgun';
export const isMelee = (i: HandItem): i is MeleeId => i === 'bat' || i === 'pipe' || i === 'fish';

export const PISTOL = {
  /** rounds per magazine */
  magSize: 12,
  /** seconds between shots (about 3 a second) */
  fireInterval: 1 / 3,
  reloadTime: 1.5,
  /** hitscan range, metres */
  range: 60,
  /** a spare magazine can be topped up to this many spare rounds */
  maxReserve: 60,
} as const;

/** What the HUD widget shows. `count` is null for fists (no number), `reserve` only for the pistol. */
export interface HandsHudState {
  item: HandItem;
  count: number | null;
  reserve: number | null;
  reloading: boolean;
  /** a pistol or a throwable is in hand on foot: the HUD shows the aiming reticle */
  aim?: boolean;
  /** counts up with every shot, so the reticle can kick */
  shots?: number;
  /** in a car: the widget stays, dimmed (the action button does nothing there yet) */
  dim?: boolean;
}

/** What the saved game keeps of the hands (ui/GameSave): the items, the rounds, and what was in hand. */
export interface SavedHands {
  bottles: number; bricks: number; pistol: boolean; mag: number; reserve: number; current: HandItem;
  /** COMBAT2 (absent in older saves) */
  melee?: MeleeId | null; meleeUses?: number; revolver?: { mag: number; reserve: number } | null; shotgun?: { mag: number; reserve: number } | null; gunOrder?: GunId[];
}

export interface GunState { has: boolean; mag: number; reserve: number }

export class Hands {
  bottles = 0;
  bricks = 0;
  /** the carried melee weapon, and blows left before it breaks (0 = never) */
  melee: MeleeId | null = null;
  meleeUses = 0;
  readonly guns: Record<GunId, GunState> = { pistol: { has: false, mag: 0, reserve: 0 }, revolver: { has: false, mag: 0, reserve: 0 }, shotgun: { has: false, mag: 0, reserve: 0 } };
  /** guns in the order they were picked up (at most MAX_GUNS) */
  gunOrder: GunId[] = [];
  current: HandItem = 'fists';
  /** Called whenever anything the HUD shows changes. */
  onChange: (() => void) | null = null;
  /** Set by Combat while a reload is running (shown as "reloading" by the HUD). */
  reloading = false;

  // the pistol's own numbers (the original fields)
  get hasPistol(): boolean { return this.guns.pistol.has; }
  set hasPistol(v: boolean) { this.guns.pistol.has = v; this.order('pistol', v); }
  get mag(): number { return this.guns.pistol.mag; }
  set mag(v: number) { this.guns.pistol.mag = v; }
  get reserve(): number { return this.guns.pistol.reserve; }
  set reserve(v: number) { this.guns.pistol.reserve = v; }

  private order(id: GunId, has: boolean): void {
    const i = this.gunOrder.indexOf(id);
    if (has && i < 0) this.gunOrder.push(id);
    if (!has && i >= 0) this.gunOrder.splice(i, 1);
  }

  owns(item: HandItem): boolean {
    switch (item) {
      case 'fists': return true;
      case 'bottle': return this.bottles > 0;
      case 'brick': return this.bricks > 0;
      case 'bat': case 'pipe': case 'fish': return this.melee === item;
      default: return this.guns[item].has;
    }
  }

  /** The items that can be cycled to, in cycle order. */
  available(): HandItem[] { return HAND_ORDER.filter((i) => this.owns(i)); }

  /** Step to the next (+1) or previous (-1) owned item; returns the new current item. */
  cycle(dir: number): HandItem {
    const list = this.available();
    const at = Math.max(0, list.indexOf(this.current));
    const next = list[(at + (dir >= 0 ? 1 : list.length - 1)) % list.length];
    if (next !== this.current) { this.current = next; this.reloading = false; this.changed(); }
    return this.current;
  }

  /** Would picking this up change anything? (An ammo box is no use without a gun; a full gun takes no more.) */
  canTake(kind: CarryKind): boolean {
    if (kind !== 'ammo') return true;
    return GUN_IDS.some((g) => this.guns[g].has && this.guns[g].reserve < GUNS[g].maxReserve);
  }

  /** Pick something up. A gun arrives with two magazines; a third gun replaces the oldest one that is not in hand. */
  add(kind: CarryKind): void {
    if (kind === 'bottle') this.bottles++;
    else if (kind === 'brick') this.bricks++;
    else if (kind === 'ammo') { for (const g of GUN_IDS) if (this.guns[g].has) this.guns[g].reserve = Math.min(GUNS[g].maxReserve, this.guns[g].reserve + GUNS[g].box); }
    else if (isMelee(kind)) { this.melee = kind; this.meleeUses = MELEE[kind].uses; }
    else {
      const gs = this.guns[kind], def = GUNS[kind];
      if (!gs.has) {
        if (this.gunOrder.length >= MAX_GUNS) {
          const drop = this.gunOrder.find((g) => g !== this.current) ?? this.gunOrder[0];
          this.guns[drop] = { has: false, mag: 0, reserve: 0 }; this.order(drop, false);
        }
        gs.has = true; gs.mag = def.mag; gs.reserve = def.mag; this.order(kind, true);
      } else gs.reserve = Math.min(def.maxReserve, gs.reserve + def.mag);
    }
    this.changed();
  }

  /** Spend one throwable of the current kind. Returns the kind thrown, or null when there is none. Falls back to fists when the last goes. */
  takeThrowable(): 'bottle' | 'brick' | null {
    const k = this.current;
    if (k === 'bottle' && this.bottles > 0) { this.bottles--; }
    else if (k === 'brick' && this.bricks > 0) { this.bricks--; }
    else return null;
    if (!this.owns(k)) this.current = 'fists';
    this.changed();
    return k;
  }

  /** A swing landed: one use of the melee weapon is gone. Returns true when it just broke (fists again). */
  useMelee(): boolean {
    const m = this.melee;
    if (!m || MELEE[m].uses <= 0) return false;
    this.meleeUses--;
    if (this.meleeUses > 0) { this.changed(); return false; }
    this.melee = null; if (this.current === m) this.current = 'fists';
    this.changed();
    return true;
  }

  /** The gun in hand is short of rounds and there are spares to load. */
  needsReloadFor(g: GunId): boolean { const s = this.guns[g]; return s.has && s.mag < GUNS[g].mag && s.reserve > 0; }
  get needsReload(): boolean { return this.needsReloadFor('pistol'); }

  /** Fire one round of `g` (the pistol when omitted). False when the magazine is empty. */
  fireRound(g: GunId = 'pistol'): boolean {
    const s = this.guns[g];
    if (!s.has || s.mag <= 0) return false;
    s.mag--;
    this.changed();
    return true;
  }

  /** Move spare rounds into the gun. Returns how many went in. */
  reload(g: GunId = 'pistol'): number {
    const s = this.guns[g];
    const n = Math.min(GUNS[g].mag - s.mag, s.reserve);
    if (n <= 0) return 0;
    s.mag += n; s.reserve -= n;
    this.changed();
    return n;
  }

  state(): HandsHudState {
    const item = this.current;
    const gun = isGun(item) ? this.guns[item] : null;
    return {
      item,
      count: item === 'fists' ? null : item === 'bottle' ? this.bottles : item === 'brick' ? this.bricks : gun ? gun.mag : isMelee(item) && MELEE[item].uses > 0 ? this.meleeUses : null,
      reserve: gun ? gun.reserve : null,
      reloading: this.reloading && !!gun,
    };
  }

  /** The hands as they go into a save. */
  serialize(): SavedHands {
    const g = (id: GunId): { mag: number; reserve: number } | null => (this.guns[id].has ? { mag: this.guns[id].mag, reserve: this.guns[id].reserve } : null);
    return {
      bottles: this.bottles, bricks: this.bricks, pistol: this.hasPistol, mag: this.mag, reserve: this.reserve, current: this.current,
      melee: this.melee, meleeUses: this.meleeUses, revolver: g('revolver'), shotgun: g('shotgun'), gunOrder: [...this.gunOrder],
    };
  }

  /** Put the hands back from a save (any shape: bad or missing fields give an empty pair of hands; an older save has fists and a pistol at most). Returns true when something was restored. */
  restore(d: unknown): boolean {
    const o = (typeof d === 'object' && d !== null ? d : null) as Partial<Record<keyof SavedHands, unknown>> | null;
    const num = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    this.bottles = num(o?.bottles, 99); this.bricks = num(o?.bricks, 99);
    for (const g of GUN_IDS) this.guns[g] = { has: false, mag: 0, reserve: 0 };
    this.gunOrder = [];
    if (o?.pistol === true) { this.guns.pistol = { has: true, mag: num(o?.mag, GUNS.pistol.mag), reserve: num(o?.reserve, GUNS.pistol.maxReserve) }; this.gunOrder.push('pistol'); }
    for (const g of ['revolver', 'shotgun'] as const) {
      const v = o?.[g] as { mag?: unknown; reserve?: unknown } | null | undefined;
      if (v && typeof v === 'object' && this.gunOrder.length < MAX_GUNS) { this.guns[g] = { has: true, mag: num(v.mag, GUNS[g].mag), reserve: num(v.reserve, GUNS[g].maxReserve) }; this.gunOrder.push(g); }
    }
    const m = o?.melee;
    this.melee = MELEE_IDS.includes(m as MeleeId) ? (m as MeleeId) : null;
    this.meleeUses = this.melee ? Math.max(1, num(o?.meleeUses, 99)) : 0;
    if (this.melee && MELEE[this.melee].uses === 0) this.meleeUses = 0;
    const cur = o?.current;
    this.current = HAND_ORDER.includes(cur as HandItem) && this.owns(cur as HandItem) ? (cur as HandItem) : 'fists';
    this.reloading = false;
    this.changed();
    return o !== null;
  }

  /** Back to bare fists and nothing in the pockets (a new game, a bust, waking in hospital). */
  reset(): void { this.restore(null); }

  private changed(): void { this.onChange?.(); }
}
