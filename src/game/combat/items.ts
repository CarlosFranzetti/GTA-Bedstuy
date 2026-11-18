/**
 * What is in the player's hands, and what the one action button does with it (GTA III style: one button, the meaning
 * follows the item). Fists are always there; a bottle, a brick or a pistol only once picked up. Pure state, no three.js.
 */
export type HandItem = 'fists' | 'bottle' | 'brick' | 'pistol';
export type ActionKind = 'punch' | 'throw' | 'shoot';

/** Cycle order (Q, d-pad). Items the player does not own are skipped. */
export const HAND_ORDER: readonly HandItem[] = ['fists', 'bottle', 'brick', 'pistol'];

/** What the action button does with each item. */
export function actionFor(item: HandItem): ActionKind {
  switch (item) {
    case 'fists': return 'punch';
    case 'bottle': case 'brick': return 'throw';
    case 'pistol': return 'shoot';
  }
}

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
export interface SavedHands { bottles: number; bricks: number; pistol: boolean; mag: number; reserve: number; current: HandItem }

export class Hands {
  bottles = 0;
  bricks = 0;
  hasPistol = false;
  /** rounds in the pistol */
  mag = 0;
  /** spare rounds */
  reserve = 0;
  current: HandItem = 'fists';
  /** Called whenever anything the HUD shows changes. */
  onChange: (() => void) | null = null;
  /** Set by Combat while a reload is running (shown as "reloading" by the HUD). */
  reloading = false;

  owns(item: HandItem): boolean {
    switch (item) {
      case 'fists': return true;
      case 'bottle': return this.bottles > 0;
      case 'brick': return this.bricks > 0;
      case 'pistol': return this.hasPistol;
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

  /** Pick something up. A pistol arrives with two magazines (12 in the gun and 12 spare); more pistols add a spare magazine. */
  add(kind: 'bottle' | 'brick' | 'pistol'): void {
    if (kind === 'bottle') this.bottles++;
    else if (kind === 'brick') this.bricks++;
    else if (!this.hasPistol) { this.hasPistol = true; this.mag = PISTOL.magSize; this.reserve = PISTOL.magSize; }
    else this.reserve = Math.min(PISTOL.maxReserve, this.reserve + PISTOL.magSize);
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

  /** The gun is short of rounds and there are spares to load. */
  get needsReload(): boolean { return this.hasPistol && this.mag < PISTOL.magSize && this.reserve > 0; }

  /** Fire one round. False when the magazine is empty. */
  fireRound(): boolean {
    if (!this.hasPistol || this.mag <= 0) return false;
    this.mag--;
    this.changed();
    return true;
  }

  /** Move spare rounds into the gun. Returns how many went in. */
  reload(): number {
    const n = Math.min(PISTOL.magSize - this.mag, this.reserve);
    if (n <= 0) return 0;
    this.mag += n; this.reserve -= n;
    this.changed();
    return n;
  }

  state(): HandsHudState {
    const item = this.current;
    return {
      item,
      count: item === 'fists' ? null : item === 'bottle' ? this.bottles : item === 'brick' ? this.bricks : this.mag,
      reserve: item === 'pistol' ? this.reserve : null,
      reloading: this.reloading && item === 'pistol',
    };
  }

  /** The hands as they go into a save. */
  serialize(): SavedHands {
    return { bottles: this.bottles, bricks: this.bricks, pistol: this.hasPistol, mag: this.mag, reserve: this.reserve, current: this.current };
  }

  /** Put the hands back from a save (any shape: bad or missing fields give an empty pair of hands). Returns true when something was restored. */
  restore(d: unknown): boolean {
    const o = (typeof d === 'object' && d !== null ? d : null) as Partial<Record<keyof SavedHands, unknown>> | null;
    const num = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    this.bottles = num(o?.bottles, 99); this.bricks = num(o?.bricks, 99);
    this.hasPistol = o?.pistol === true;
    this.mag = this.hasPistol ? num(o?.mag, PISTOL.magSize) : 0;
    this.reserve = this.hasPistol ? num(o?.reserve, PISTOL.maxReserve) : 0;
    const cur = o?.current;
    this.current = HAND_ORDER.includes(cur as HandItem) && this.owns(cur as HandItem) ? (cur as HandItem) : 'fists';
    this.reloading = false;
    this.changed();
    return o !== null;
  }

  /** Back to bare fists and nothing in the pockets (a new game). */
  reset(): void { this.restore(null); }

  private changed(): void { this.onChange?.(); }
}
