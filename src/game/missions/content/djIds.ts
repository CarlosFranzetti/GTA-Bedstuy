/**
 * Ids the DJ storyline shares with CLUB's interiors, shop and DJ game (src/world/interiors/defs.ts,
 * src/game/records.ts). Kept in one place so a rename on either side is a one-line fix.
 */
import { INTERIORS, doorTrigger } from '@/world/interiors/defs';
import type { Vec2 } from '@/core/Math2';

/** Interior ids as the host reports them in interior:entered / interior:exited. */
export const INTERIOR_DELI = 'deli';
export const INTERIOR_CLUB = 'club';

/** DJ venue ids as dj:setFinished reports them. 'blockparty' is the portable decks on Van Buren St. */
export const VENUE_BLOCKPARTY = 'blockparty';
export const VENUE_CLUB = 'aftersloth';

/** The shop that sells the records. */
export const SHOP_WAX_DELI = 'wax-deli';

/** The three records Ms. Odette wants you to own before she trusts you (record ids from src/game/records.ts). */
export const CRATE_RECORDS = ['wax-03', 'wax-04', 'wax-11'] as const;

/** Sidewalk spot in front of the Wax Deli door and the unmarked Aftersloth door. */
export function deliDoor(): Vec2 { return doorTrigger(INTERIORS.deli); }
export function clubDoor(): Vec2 { return doorTrigger(INTERIORS.club); }

/** Progress flags CLUB reads. */
export const FLAG_CLUB_UNLOCKED = 'aftersloth.unlocked';
export const FLAG_CLUB_SLOT = 'aftersloth.slot';
