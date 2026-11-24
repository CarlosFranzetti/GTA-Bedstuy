/**
 * Turns a cast entry into a fixed PedSpec and registers it with the people system. Pure but for `registerSpec`, which appends
 * to PED_SPECS (one texture bake per outfit). A person keeps one face and one build in every outfit: `spec.seed` is the person,
 * `spec.id` is the person in that outfit.
 */
import { registerSpec, type PedSpec } from '@/textures/painters/ped';
import { ONE_PIECE, dress, shade } from '@/textures/painters/pedWardrobe';
import { castMember } from './cast';
import { OUTFIT_KEYS, type CastId, type CastMember, type CastOutfit, type OutfitKey } from './types';

export const castSpecId = (id: CastId, outfit: OutfitKey): string => `cast-${id}-${outfit}`;
export const castSeed = (id: CastId): string => `cast-${id}`;

/** the outfit worn for `key`: night and gig fall back to day where a person has no such look */
export function outfitOf(m: CastMember, key: OutfitKey): { key: OutfitKey; outfit: CastOutfit } {
  const o = m.outfits[key];
  return o ? { key, outfit: o } : { key: 'day', outfit: m.outfits.day };
}

export function castSpec(id: CastId, outfitKey: OutfitKey = 'day'): PedSpec {
  const m = castMember(id);
  if (!m) throw new Error(`unknown cast id ${id}`);
  const { key, outfit: o } = outfitOf(m, outfitKey);
  const spec: PedSpec = {
    id: castSpecId(id, key), seed: castSeed(id),
    role: m.role === 'player' || m.role === 'playable' ? 'player' : 'civilian',
    group: m.group, sex: m.sex, age: m.age,
    skin: m.skin, hair: m.hair, hairColor: m.hairColor,
    hat: 'none', hatColor: '#222222', hatTrim: '#ffffff', hatLogo: '',
    face: { ...m.face },
    top: { kind: 'tee', color: '#8a8a8a', trim: '#6a6a6a', sleeves: 'short', print: 'none', printColor: '#ffffff' },
    bottom: { kind: 'jeans', color: '#34506f', trim: '#243a52' },
    shoes: { color: '#f2f2f2', sole: '#d8d8d8', accent: '#c0392b' },
    gear: o.gear ?? 'none', gearColor: o.gearColor ?? '#334455',
    build: m.build, body: m.body, weight: 0,
  };
  Object.assign(spec, dress(o));
  if (o.onePiece) {
    const [pid, c, tr] = o.onePiece, op = ONE_PIECE[pid];
    if (!op) throw new Error(`unknown one-piece ${pid}`);
    const trim = tr ?? shade(c, 0.72);
    const under = c;
    spec.top = { kind: 'dress', color: c, trim, sleeves: 'short', print: 'none', printColor: trim, ...op.top } as PedSpec['top'];
    spec.bottom = { kind: 'skirt', color: c, trim: shade(c, 0.78), ...op.bottom } as PedSpec['bottom'];
    if (o.layer) spec.top = { ...spec.top, under } as PedSpec['top'];
  }
  if (o.hat === 'hood' || o.hat === 'hoodDown') { spec.hatColor = spec.top.color; spec.hatTrim = spec.top.trim; }
  return spec;
}

const registered = new Map<string, number>();
/** register (once) and return the variant index of a cast outfit */
export function castVariant(id: CastId, outfit: OutfitKey = 'day'): number {
  const spec = castSpec(id, outfit);
  let v = registered.get(spec.id);
  if (v === undefined) { v = registerSpec(spec); registered.set(spec.id, v); }
  return v;
}
export const allOutfitSpecs = (id: CastId): PedSpec[] => OUTFIT_KEYS.map((k) => castSpec(id, k));
