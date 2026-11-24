/**
 * CHANGING CHARACTER: Pedro, then Lana and Adele later. The world, the story flags, the clock, the weather and the records stay; the
 * person changes: look (spec and outfit), wallet, home and the outfit worn. The player model is built once at boot, so a switch is
 * applied the way a new look already is: the host saves and reloads (main.ts `pendingLook`).
 *
 *   switcher.switchTo('lana')  ->  stash Pedro's wallet, home and outfit; load Lana's; ask the host to apply the look.
 *
 * Save field: `playerLook.castState` (inside the existing playerLook object, which GameSave keeps whole), see `serialize`.
 * Reachable today only from the debug call and a mission hook (`castSwitcher.switchTo`); there is no menu.
 */
import type { PlayerLook } from '@/textures/painters/pedRoster';
import { castMember, isCastId, PLAYABLE_IDS } from './cast';
import { lookOf } from './player';
import type { CastId, CastVenue, OutfitKey } from './types';

export interface CastProfile { cash: number; home: CastVenue; outfit: OutfitKey }
export interface CastSaveState { v: 1; active: CastId; /** the active character's home and outfit (their wallet is the game's cash) */ home?: CastVenue; outfit?: OutfitKey; stash: Partial<Record<CastId, CastProfile>> }

/** What the switcher needs from the game; main.ts wires it. */
export interface SwitchHost {
  getCash(): number; setCash(n: number): void;
  /** make this look the player's (save, then reload) */
  applyLook(look: PlayerLook): void;
  /** put the player at the new character's home (venue id); optional */
  moveHome?(home: CastVenue): void;
}

export type SwitchResult = { ok: true; reload: boolean; from: CastId; to: CastId } | { ok: false; reason: 'unknown' | 'notPlayable' | 'same' | 'noHost' };

const isOutfit = (o: unknown): o is OutfitKey => o === 'day' || o === 'night' || o === 'gig';
const startProfile = (id: CastId): CastProfile => {
  const m = castMember(id)!;
  return { cash: m.playable?.cash ?? 0, home: m.playable?.home ?? m.home, outfit: 'day' };
};

export class CastSwitcher {
  active: CastId = 'pedro';
  private current: CastProfile = startProfile('pedro');
  private readonly stash = new Map<CastId, CastProfile>();
  private host: SwitchHost | null = null;
  /** called after a switch has been requested (the mission system can listen) */
  onSwitch: ((from: CastId, to: CastId) => void) | null = null;

  bind(host: SwitchHost | null): void { this.host = host; }
  get home(): CastVenue { return this.current.home; }
  get outfit(): OutfitKey { return this.current.outfit; }
  isPlayable(id: string): id is CastId { return isCastId(id) && PLAYABLE_IDS.includes(id); }

  /** Wear another of the active character's outfits (applied like a switch: the look reloads). */
  setOutfit(outfit: OutfitKey): boolean {
    if (!this.host) return false;
    this.current.outfit = outfit;
    this.host.applyLook(lookOf(this.active, outfit));
    return true;
  }

  switchTo(id: string, outfit?: OutfitKey): SwitchResult {
    if (!isCastId(id)) return { ok: false, reason: 'unknown' };
    if (!this.isPlayable(id)) return { ok: false, reason: 'notPlayable' };
    if (id === this.active) return { ok: false, reason: 'same' };
    const host = this.host;
    if (!host) return { ok: false, reason: 'noHost' };
    const from = this.active;
    // stash who we were, with the wallet as it is now
    this.stash.set(from, { ...this.current, cash: host.getCash() });
    const next = this.stash.get(id) ?? startProfile(id);
    this.stash.delete(id);
    this.active = id;
    this.current = { ...next, outfit: outfit ?? next.outfit };
    host.setCash(this.current.cash);
    host.moveHome?.(this.current.home);
    host.applyLook(lookOf(id, this.current.outfit));
    this.onSwitch?.(from, id);
    return { ok: true, reload: true, from, to: id };
  }

  /** the field that goes into the save (inside `playerLook`); the wallet of the ACTIVE character is the game's own cash */
  serialize(): CastSaveState {
    const stash: CastSaveState['stash'] = {};
    for (const [k, p] of this.stash) stash[k] = { ...p };
    return { v: 1, active: this.active, home: this.current.home, outfit: this.current.outfit, stash };
  }

  /** Validates before touching anything; false (state untouched) for anything that is not a cast save. A save without the field means Pedro, no stash. */
  restore(data: unknown, cashNow = 0): boolean {
    const o = data as Partial<CastSaveState> | null | undefined;
    if (!o || o.v !== 1 || !isCastId(o.active) || typeof o.stash !== 'object' || o.stash === null) return false;
    const next = new Map<CastId, CastProfile>();
    for (const [k, p] of Object.entries(o.stash)) {
      const q = p as Partial<CastProfile> | undefined;
      if (!isCastId(k) || !q || typeof q.cash !== 'number' || !Number.isFinite(q.cash) || typeof q.home !== 'string' || !isOutfit(q.outfit)) return false;
      next.set(k, { cash: Math.max(0, Math.round(q.cash)), home: q.home, outfit: q.outfit });
    }
    this.stash.clear(); for (const [k, p] of next) this.stash.set(k, p);
    this.active = o.active;
    this.current = { ...startProfile(o.active), cash: cashNow, ...(typeof o.home === 'string' ? { home: o.home } : {}), ...(isOutfit(o.outfit) ? { outfit: o.outfit } : {}) };
    return true;
  }

  reset(): void { this.active = 'pedro'; this.current = startProfile('pedro'); this.stash.clear(); }
}

export const castSwitcher = new CastSwitcher();
