/**
 * Pedro as the player. A new game (no save, or "New game") starts as Pedro in his day outfit; a save with a cast look restores that
 * character; a save made before this change keeps the random look it had. The player model is built once at boot, so the look is
 * set before `new Player(...)`: `installCastLook` registers the named spec and tells pedRoster to use it.
 */
import { setPlayerCastSpec, type PlayerLook } from '@/textures/painters/pedRoster';
import { castMember, isCastId } from './cast';
import { castSpec } from './specs';
import { registerSpec } from '@/textures/painters/ped';
import type { CastId, OutfitKey } from './types';

export const PEDRO_LOOK: PlayerLook = { group: 'la', variant: 0, cast: 'pedro', outfit: 'day' };
const isOutfit = (o: unknown): o is OutfitKey => o === 'day' || o === 'night' || o === 'gig';

/** the look a character plays in (the roster `group` and `variant` are only placeholders where `cast` is set) */
export function lookOf(id: CastId, outfit: OutfitKey = 'day'): PlayerLook {
  const m = castMember(id)!;
  return { group: m.group, variant: 0, cast: id, outfit };
}

/**
 * What the boot look should be. `saved` is `saves.bootSave()?.playerLook`; `hasSave` says whether any save was loaded.
 * Returns the look to apply (a cast look), or null to leave the roster's own look alone (an old save keeps its random look).
 */
export function castBootLook(saved: unknown, hasSave: boolean): PlayerLook | null {
  const l = saved as Partial<PlayerLook> | null | undefined;
  if (l && typeof l.cast === 'string' && isCastId(l.cast)) return lookOf(l.cast, isOutfit(l.outfit) ? l.outfit : 'day');
  if (hasSave) return null;
  return { ...PEDRO_LOOK };
}

/** Register the look's named spec and make it the player's. A look without a valid cast id clears the override. Returns the spec id or null. */
export function installCastLook(look: { cast?: string; outfit?: string } | null | undefined): string | null {
  if (!look || !look.cast || !isCastId(look.cast)) { setPlayerCastSpec(null); return null; }
  const spec = castSpec(look.cast, isOutfit(look.outfit) ? look.outfit : 'day');
  registerSpec(spec);
  setPlayerCastSpec(spec.id);
  return spec.id;
}

/** Where the game shows the player's name: the active character's, Pedro by default (also on saves from before the cast, which keep their look). */
export function playerName(look: { cast?: string } | null | undefined): string {
  return (look?.cast && castMember(look.cast)?.name) || castMember('pedro')!.name;
}
