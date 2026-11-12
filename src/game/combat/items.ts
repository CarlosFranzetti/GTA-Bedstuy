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
}

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

  private changed(): void { this.onChange?.(); }
}
