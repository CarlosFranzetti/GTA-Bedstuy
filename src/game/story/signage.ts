/**
 * STORY2 signage: the small jokes the block puts on its own walls (shop signs, stoop rules, taped notices, posters) and the ones
 * the side jobs leave behind. Same pipeline as ambientItems (AmbientNotices paints each onto a canvas once, when it first shows),
 * same placement rule (on the lot frontage line, facing the street). Items with an empty `show` are always there; the rest follow
 * the story flags so a loaded save shows the right block.
 *
 * Voice: dry, deadpan, aimed at landlords, jargon and forms; the neighbours' own signs are warm and a bit bossy.
 * Every name, shop and brand is an invented parody.
 */
import type { GridModel, Side } from '@/world/types';
import { F } from './flags';
import type { AmbientItem, AmbientKind } from './AmbientNotices';
import type { FlagRule } from '@/game/missions/types';

function frontage(grid: GridModel, blockId: string, side: Side, t: number) {
  const face = grid.blockById(blockId).faces.find((f) => f.side === side);
  if (!face) throw new Error(`no face ${blockId}/${side}`);
  const k = Math.min(1, Math.max(0, t));
  return { x: face.a.x + (face.b.x - face.a.x) * k, z: face.a.z + (face.b.z - face.a.z) * k, nx: face.outward.x, nz: face.outward.z };
}

interface Spec { id: string; at: [string, Side, number]; kind: AmbientKind; y: number; w: number; h: number; title: string; body: string; show?: FlagRule }

const SPECS: readonly Spec[] = [
  // ---- always there: the block's own signs
  { id: 'sg-landlord-feed', at: ['r2c0', 'W', 0.05], kind: 'sign', y: 2.0, w: 1.5, h: 0.8, title: 'DO NOT FEED THE LANDLORD', body: 'He is already full.' },
  { id: 'sg-komat', at: ['r2c0', 'E', 0.28], kind: 'sign', y: 2.1, w: 1.5, h: 0.8, title: 'NOT RESPONSIBLE', body: 'for socks, hearts\nor loan terms' },
  { id: 'sg-cutz', at: ['r2c1', 'E', 0.3], kind: 'sign', y: 2.0, w: 1.5, h: 0.8, title: 'WALK-INS WELCOME', body: 'Appointments also welcome.\nThe clock is not.' },
  { id: 'sg-bodega', at: ['r1c1', 'W', 0.3], kind: 'sign', y: 2.2, w: 1.6, h: 0.8, title: 'WE HAVE EVERYTHING', body: 'except what you came for.' },
  { id: 'sg-cowork', at: ['r0c0', 'W', 0.38], kind: 'sign', y: 2.0, w: 1.4, h: 0.9, title: 'HOT DESK $450', body: 'Cold desk $390\nFloor $200' },
  { id: 'sg-stoop-rules', at: ['r1c0', 'E', 0.25], kind: 'sign', y: 1.9, w: 1.6, h: 1.0, title: 'STOOP RULES', body: '1 Sit.  2 Wave.\n3 Do not ask what I am\nlooking at.  - G.' },
  { id: 'sg-church', at: ['r0c1', 'S', 0.62], kind: 'sign', y: 2.0, w: 1.5, h: 0.8, title: 'SERMON AT 11', body: 'Being late at 11:20.\nCoffee in the back.' },
  { id: 'sg-funeral', at: ['r1c1', 'N', 0.75], kind: 'sign', y: 2.0, w: 1.5, h: 0.8, title: 'PLAN AHEAD', body: 'Need is the only\nguarantee.' },
  { id: 'sg-dollar', at: ['r4c1', 'W', 0.3], kind: 'sign', y: 2.1, w: 1.5, h: 0.8, title: 'EVERYTHING 99 CENTS', body: 'Some things more.\nThe sign is brave.' },
  { id: 'sg-rx', at: ['r0c0', 'E', 0.3], kind: 'sign', y: 2.0, w: 1.5, h: 0.8, title: 'NO, WE CANNOT', body: 'discuss your landlord\'s\nboiler.' },
  { id: 'sg-cb3', at: ['r0c1', 'W', 0.5], kind: 'poster', y: 1.9, w: 0.8, h: 1.1, title: 'CB3 MEETING 7 PM', body: 'Free chairs.\nThree minutes each.\nNot negotiable.' },
  { id: 'sg-copy', at: ['r3c1', 'W', 0.7], kind: 'sign', y: 2.0, w: 1.5, h: 0.8, title: 'COPIES 10 CENTS', body: 'Originals priceless.\nForms: ask.' },
  { id: 'sg-tow', at: ['r3c0', 'W', 0.5], kind: 'sign', y: 2.0, w: 1.4, h: 0.7, title: 'NO PARKING ANYTIME', body: '(except when)' },
  { id: 'sg-quiet', at: ['r3c1', 'E', 0.9], kind: 'sign', y: 2.0, w: 1.6, h: 0.9, title: 'QUIET HOURS 10 PM TO 7 AM', body: 'Loud hours 7 AM to 10 PM.\nWe are a neighbourhood.' },
  // ---- the arc's weather: they begin when the story does
  { id: 'sg-stillwater-price', at: ['r0c0', 'W', 0.62], kind: 'sign', y: 2.0, w: 1.5, h: 0.9, title: 'BREATHE IN: $35', body: 'Breathe out: included.\nSilence: extra.', show: { not: F.ACT3 } },
  { id: 'sg-blockblock', at: ['r0c0', 'E', 0.55], kind: 'poster', y: 1.9, w: 0.8, h: 1.1, title: 'BLOCKBLOCK', body: 'Own your block.\n(You do not own\nyour block.)', show: { flag: F.ACT1 } },
  { id: 'sg-parallax-listen', at: ['r1c1', 'S', 0.8], kind: 'sign', y: 2.0, w: 1.6, h: 0.9, title: 'LISTENING SESSION 6 PM', body: 'Snacks are listening too.\n- Parallax Living', show: { flag: F.ACT1 } },
  { id: 'sg-union', at: ['r3c0', 'E', 0.2], kind: 'poster', y: 1.9, w: 0.8, h: 1.1, title: 'FREE: ONE TENANT UNION', body: 'Ask at the stoop.\nBring a chair.', show: { flag: F.ACT2 } },
  { id: 'sg-original-character', at: ['r2c1', 'W', 0.6], kind: 'decal', y: 3.2, w: 1.4, h: 0.7, title: 'NOW LEASING APT 5C', body: 'Original character.', show: { flag: F.ACT2 } },
  { id: 'sg-kale', at: ['r2c1', 'N', 0.65], kind: 'sign', y: 2.0, w: 1.5, h: 0.9, title: 'GRIEF BOWL $14', body: 'Remembrance smoothie $11.\nOat.', show: { flag: F.ACT3 } },
  // ---- left behind by the side jobs
  { id: 'sg-pigeons-lost', at: ['r1c1', 'N', 0.2], kind: 'poster', y: 1.9, w: 0.8, h: 1.1, title: 'LOST: 40 PIGEONS', body: 'Answer to "come home".\n- Tito, the roof', show: { not: F.S_BIRDS } },
  { id: 'sg-pigeons-home', at: ['r1c1', 'N', 0.2], kind: 'poster', y: 1.9, w: 0.8, h: 1.1, title: 'FOUND: 40 PIGEONS', body: 'Mrs. Abernathy was one.\n- Tito', show: { flag: F.S_BIRDS } },
  { id: 'sg-moisture', at: ['r2c0', 'W', 0.62], kind: 'notice', y: 1.6, w: 1.0, h: 1.0, title: 'MOISTURE EVENT IN PROGRESS', body: 'Please remain calm.\nPlease remain.', show: { flag: F.S_NOTICES_DELIVERED } },
  { id: 'sg-seaworthy', at: ['r2c0', 'W', 0.62], kind: 'poster', y: 1.7, w: 0.8, h: 1.0, title: 'SEAWORTHY', body: 'Paper boats, 2A.\nNo landlord needed.', show: { flag: F.S_NOTICES_BINNED } },
  { id: 'sg-binder-home', at: ['r2c0', 'W', 0.5], kind: 'poster', y: 1.9, w: 0.8, h: 1.1, title: 'THE BINDER IS HOME', body: 'Thank you, the train.\n- 2A', show: { flag: F.S_BINDER } },
  { id: 'sg-boiler', at: ['r4c1', 'E', 0.4], kind: 'notice', y: 1.6, w: 1.1, h: 1.0, title: 'BOILER INSPECTED', body: '12 (twelve) times.\nSignature: "Signature".', show: { flag: F.S_CARBON } },
  { id: 'sg-van-score', at: ['r2c1', 'S', 0.3], kind: 'notice', y: 1.6, w: 1.1, h: 1.0, title: 'STOOP SCORE: 7.2', body: 'Likelihood of vacating:\nlow. For now.', show: { flag: F.S_VAN } },
  { id: 'sg-hollis', at: ['r2c0', 'E', 0.5], kind: 'poster', y: 1.9, w: 0.8, h: 1.1, title: 'FOR VERNITA', body: 'Fifty-one years, 5C.\nThe stoop is saved.', show: { flag: F.S_SLOW } },
];

/** The STORY2 signs for this grid, in the shape AmbientNotices takes. */
export function signageItems(grid: GridModel): AmbientItem[] {
  return SPECS.map((s): AmbientItem => {
    const f = frontage(grid, s.at[0], s.at[1], s.at[2]);
    return {
      id: s.id, kind: s.kind, x: f.x + f.nx * 0.08, z: f.z + f.nz * 0.08, nx: f.nx, nz: f.nz,
      y: s.y, w: s.w, h: s.h, title: s.title, body: s.body, show: s.show ?? {},
    };
  });
}

export const SIGNAGE_IDS: readonly string[] = SPECS.map((s) => s.id);
