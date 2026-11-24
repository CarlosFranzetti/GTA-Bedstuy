/**
 * CAST (24 Nov): the named people of the Pedro Martinez story as data. Pure types, no three.js.
 * Everybody here is invented and an adult. Looks are fixed (`specs.ts` turns an entry into a PedSpec that never changes).
 */
import type { PedSpec, PopGroup } from '@/textures/painters/ped';
import type { BodyTypeId } from '@/entities/models/pedBodyTypes';
import type { WardrobeEntry } from '@/textures/painters/pedWardrobe';
import type { BarkKind } from '@/game/pedBarks';
import type { FxPreset, KokoroVoice } from '@/audio/voice/types';

export type CastId =
  | 'pedro' | 'lana' | 'adele' | 'stavros' | 'akira'
  | 'augie' | 'dom' | 'noor' | 'julian' | 'winston';

/** day: an ordinary day; night: out after dark; gig: the look for work (a set, a deal, a shift). */
export type OutfitKey = 'day' | 'night' | 'gig';
export const OUTFIT_KEYS: readonly OutfitKey[] = ['day', 'night', 'gig'];

/** A whole look as shop-style data: garment ids and colours from the wardrobe pools, optionally a one-piece (a dress) instead of top and bottom. */
export interface CastOutfit extends WardrobeEntry {
  /** shown in the wardrobe and the credits of a look */
  label: string;
  /** a dress or a boiler suit: [id in ONE_PIECE, colour, trim]; a `layer` goes over it */
  onePiece?: [id: string, color: string, trim?: string];
  gear?: PedSpec['gear']; gearColor?: string;
}

/** Venue ids are strings; these are MISSIONS' placeholder ids until the VENUES seat's registry lands. */
export type CastVenue = string;
export type StationKind = 'bar' | 'counter' | 'booth' | 'stand' | 'sit' | 'door' | 'corner';
export interface UsualPlace {
  venue: CastVenue;
  /** what they are doing there: where the placement puts them */
  station: StationKind;
  /** game hours they are usually there; `to` above 24 wraps past midnight (28 = 4 am) */
  hours: readonly [from: number, to: number];
  /** only on these weekdays (0 = Sunday); empty or absent = every day */
  days?: readonly number[];
}

export type CastRole = 'player' | 'playable' | 'contact' | 'foe' | 'love' | 'neighbour';
export type CastBarkKind = BarkKind | 'getUp' | 'recognise';

export interface CastVoice {
  /** the neural voice (src/audio/voice/StoryVoices.ts shape) */
  voice: KokoroVoice; speed: number; fx: FxPreset;
  /** the browser's SpeechSynthesis shaping, and the street bark voice (src/game/pedBarks.ts) */
  fallback: { role: 'host' | 'sidekick' | 'caller' | 'announcer'; pitch: number; rate: number };
}

export interface CastMember {
  id: CastId;
  /** the speaker tag on subtitles and in the HUD where the game shows the player's name */
  name: string;
  full: string;
  role: CastRole;
  /** one honest line; the WRITER's bible outranks it */
  note: string;
  group: PopGroup; sex: 'm' | 'f'; age: 'adult' | 'old';
  /** the build is fixed: body type id and the identity seed (`PedSpec.seed`) that draws the face and the personal spread */
  body: BodyTypeId; build: PedSpec['build'];
  skin: string; hair: PedSpec['hair']; hairColor: string;
  face: PedSpec['face'];
  /** day is required; a missing night or gig falls back to day */
  outfits: { day: CastOutfit; night?: CastOutfit; gig?: CastOutfit };
  voice: CastVoice;
  home: CastVenue;
  places: readonly UsualPlace[];
  /** short lines by situation (the pedestrian bark kinds plus `getUp` and `recognise`) */
  barks: Partial<Record<CastBarkKind, readonly string[]>>;
  /** playable later (Lana, Adele): their own wallet and home when you switch to them */
  playable?: { cash: number; home: CastVenue };
}
