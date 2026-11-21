/**
 * PEOPLE9: the street palette. DIRECTION.md: people wear black, navy, charcoal, grey, olive, khaki, brown, denim blues, off-white, burgundy and forest; ordinary
 * garments sit under about 35 percent saturation and between about 0.05 and 0.72 in value; ONE accent at most per person (a puffer, a cap, the sneakers) and
 * accents are on few people. Every PedSpec passes through `muteSpec` once (named roster at load, generated people in registerSpec), so a table that still holds
 * a loud colour cannot put it on the street. Uniforms (not civilians) keep readable but dulled colours. Deterministic by id.
 */
import type { PedSpec } from './ped';

const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
function toHsv(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d > 0) hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, mx === 0 ? 0 : d / mx, mx];
}
function fromHsv(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${hex2((r + m) * 255)}${hex2((g + m) * 255)}${hex2((b + m) * 255)}`;
}
/** soft limit: below `cap` unchanged, above it only a fifth of the excess survives */
const soft = (x: number, cap: number): number => (x <= cap ? x : cap + (x - cap) * 0.2);
/** a colour pulled into the street palette: sat capped (default 0.32), value between 0.06 and 0.72, blues and greens a little greyer than warm earth */
export function muteColour(hex: string, satCap = 0.27, vMax = 0.72): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [h, s, v] = toHsv(hex);
  const cold = h > 70 && h < 260 ? 0.9 : 1;                         // green, cyan, blue read louder on screen: hold them lower
  let v2 = v > vMax ? vMax + (v - vMax) * 0.08 : v;
  v2 = Math.max(0.06, v2);
  return fromHsv(h, soft(s, satCap * cold), v2);
}
/** an accent keeps most of its colour but is worn: sat <= 0.62, value <= 0.7 */
export const accentColour = (hex: string): string => muteColour(hex, 0.62, 0.7);

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const sat = (hex: string): number => toHsv(hex)[1] * Math.min(1, toHsv(hex)[2] * 1.4);

type Slot = [get: () => string | undefined, set: (c: string) => void];
/** the colours of a spec that are clothes (skin, hair, lips are not touched) */
function slots(s: PedSpec): { main: Slot[]; minor: Slot[] } {
  const t = s.top, b = s.bottom, sh = s.shoes;
  const mk = (o: Record<string, any>, k: string): Slot => [() => o[k], (c) => { o[k] = c; }];
  const main: Slot[] = [mk(t, 'color'), mk(b, 'color'), mk(sh, 'color')];
  if (s.hat !== 'none') main.push(mk(s, 'hatColor'));
  if (s.gear !== 'none') main.push(mk(s, 'gearColor'));
  const minor: Slot[] = [mk(t, 'trim'), mk(t, 'printColor'), mk(t, 'under'), mk(t, 'tie'), mk(b, 'trim'), mk(sh, 'sole'), mk(sh, 'accent'), mk(sh, 'sock'), mk(s, 'hatTrim')];
  return { main, minor };
}
const ACCENT_P = { kid: 0.35, teen: 0.3, adult: 0.17, old: 0.06 } as const;

export function muteSpec(s: PedSpec): PedSpec {
  const r = s.role ?? 'civilian';
  const { main, minor } = slots(s);
  if (r !== 'civilian' && r !== 'player') {          // uniforms: dulled, still readable
    for (const [g, st] of [...main, ...minor]) { const c = g(); if (c) st(muteColour(c, 0.55, 0.8)); }
    return s;
  }
  // the accent: the most saturated main garment, for a few people (the player always carries one)
  const roll = (hash(s.id + 'acc') % 1000) / 1000, wants = r === 'player' || roll < ACCENT_P[s.age ?? 'adult'];
  let accent = -1, best = 0.2;
  if (wants) main.forEach(([g], i) => { const c = g(); if (c && sat(c) > best) { best = sat(c); accent = i; } });
  main.forEach(([g, st], i) => { const c = g(); if (c) st(i === accent ? accentColour(c) : muteColour(c)); });
  // trims follow: loud trims on a non-accent garment are muted; accent shoe soles stay near their colour
  for (const [g, st] of minor) { const c = g(); if (c) st(muteColour(c, 0.3, 0.96)); }
  if (accent >= 0 && main[accent][0]() === s.top.color) s.top.trim = muteColour(s.top.trim, 0.5, 0.96);
  return s;
}
