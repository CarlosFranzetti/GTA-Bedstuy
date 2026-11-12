/**
 * Prosody layer (lane PROSODY): turns one sentence of script text into phrases with their own speed and the silences
 * between them. Pure and seeded: the same sentence, speaker and profile always give the same plan, so live synthesis
 * (SpeechPlayer, PedVoicePlayer) and the offline bake (packPlan) ask for exactly the same clips. Only the clips are
 * baked; the silences are laid on the WebAudio timeline by the player, so pause lengths can change without a re-bake.
 */
import { hash32, parseLine, splitSentences } from './script';

/** How one speaker paces speech. 1 = neutral. See rhythm.ts for the cast. */
export interface Rhythm {
  /** Tempo multiplier on the cast speed. */
  rate: number;
  /** Per-phrase tempo variation (fraction of speed, about one standard deviation). */
  spread: number;
  /** Scale on every pause. */
  pause: number;
  /** Random spread on pause lengths (fraction). */
  pauseSpread: number;
  /** Chance a phrase is rushed (faster, short pause after). */
  rush: number;
  /** Chance a phrase is dragged (slower, longer pause after). */
  drag: number;
  /** How much the last phrase of a sentence slows (fraction). */
  finalSlow: number;
  /** Chance a sentence gets one slowed, emphasised phrase. */
  emphasis: number;
  /** Scale on the gap when this speaker takes a turn. */
  turn: number;
  /** Chance of starting before the other speaker has quite finished. */
  pickup: number;
}

export type Brk = 'cont' | 'sense' | 'comma' | 'dash' | 'ellipsis' | 'stop' | 'excl' | 'q';

/** Base silence (seconds) after a phrase, by the kind of break that follows it. Human speech: commas 150 to 250 ms, full stops 350 to 600 ms. */
export const BREAK_GAP: Readonly<Record<Brk, number>> = { cont: 0.04, sense: 0.09, comma: 0.17, dash: 0.26, ellipsis: 0.52, stop: 0.4, excl: 0.36, q: 0.46 };

export interface Phrase {
  /** What the synthesiser is given (a clip is keyed by this text, the voice and `speed`). */
  text: string;
  speed: number;
  /** Silence after this phrase before the next one (seconds; the last phrase of a sentence: the sentence-end gap). */
  gap: number;
  brk: Brk;
  em: boolean;
}

/* ---------- seeded randomness ---------- */

export function rngFor(seed: string): () => number {
  let a = parseInt(hash32(seed), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}
/** Roughly normal, sd 1, within about +/- 3. */
const gauss = (r: () => number): number => (r() + r() + r() - 1.5) * 2;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/* ---------- phrase splitting ---------- */

const CONJ = new Set(['but', 'and', 'so', 'because', 'which', 'while', 'though', 'yet', 'or', 'then', 'until', 'unless', 'since', 'although', 'when', 'where', 'if', 'that']);
const words = (s: string): number => (s.match(/[\p{L}\p{N}']+/gu) ?? []).length;

export function terminal(s: string): Brk {
  const c = s.trim().replace(/["')\]]+$/, '').slice(-1);
  return c === '.' ? 'stop' : c === '?' ? 'q' : c === '!' ? 'excl' : c === '…' ? 'ellipsis' : 'cont';
}

/**
 * Splits one sentence into phrases at dashes, colons, semicolons and ellipses, at commas between two stretches of real
 * length ("Good morning, Brooklyn" stays whole), and at a conjunction when a run of 13+ words has no comma. A phrase
 * keeps a comma at its end so the voice carries on instead of falling as if the sentence had ended.
 */
export function splitPhrases(sentence: string): Array<{ text: string; brk: Brk }> {
  const s = sentence.replace(/\s+/g, ' ').trim();
  const end = terminal(s);
  const seg: Array<{ t: string; b: Brk }> = [];
  const re = /(\.\.\.|…)(?=\s*\S)|\s(?:—|--|-)\s|—|;|:(?=\s)|,/g;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(s)); ) {
    const b: Brk = m[1] ? 'ellipsis' : m[0] === ',' ? 'comma' : 'dash';
    seg.push({ t: s.slice(last, m.index).trim(), b });
    last = m.index + m[0].length;
  }
  seg.push({ t: s.slice(last).trim(), b: end });
  const out: Array<{ text: string; brk: Brk }> = [];
  let acc = '';
  for (let i = 0; i < seg.length; i++) {
    const { t, b } = seg[i];
    acc = acc ? `${acc} ${t}` : t;
    if (i === seg.length - 1) { out.push({ text: acc, brk: b }); break; }
    const rest = seg.slice(i + 1).map((x) => x.t).join(' ');
    const next = rest.split(' ')[0].toLowerCase().replace(/\W/g, '');
    const ok = !!acc && !!rest && (b !== 'comma' || (words(acc) >= 3 && words(rest) >= 2) || (CONJ.has(next) && words(acc) >= 2 && words(rest) >= 2));
    if (!ok) { acc += ','; continue; }
    out.push({ text: acc + (b === 'ellipsis' ? '...' : ','), brk: b });
    acc = '';
  }
  // A long run without a comma: break before a conjunction near the middle.
  const fin: Array<{ text: string; brk: Brk }> = [];
  for (const p of out) {
    const w = p.text.split(' ');
    if (w.length < 13) { fin.push(p); continue; }
    let best = -1;
    for (let i = 4; i < w.length - 3; i++) if (CONJ.has(w[i].toLowerCase()) && (best < 0 || Math.abs(i - w.length / 2) < Math.abs(best - w.length / 2))) best = i;
    if (best < 0) { fin.push(p); continue; }
    fin.push({ text: `${w.slice(0, best).join(' ').replace(/[,;:]$/, '')},`, brk: 'sense' }, { text: w.slice(best).join(' '), brk: p.brk });
  }
  return fin;
}

/* ---------- the plan for one sentence ---------- */

export interface PlanOpts {
  /** Whole sentence as one phrase (the SpeechSynthesis fallback speaks sentence by sentence). */
  whole?: boolean;
  /** Marked [em]: one phrase, slowed. */
  em?: boolean;
}

const q2 = (x: number): number => Math.round(x * 50) / 50;

/** Phrases of one sentence for a speaker: text, speed (quantised to 0.02 so repeats share clips) and the silence after each. */
export function planSentence(sentence: string, who: string, baseSpeed: number, r: Rhythm, o: PlanOpts = {}): Phrase[] {
  const raw = o.em || o.whole ? [{ text: sentence.trim(), brk: terminal(sentence) }] : splitPhrases(sentence);
  const rng = rngFor(`${who}|${sentence}`);
  const n = raw.length;
  // One phrase per sentence may be leaned on: a mid-sentence phrase of 3+ words.
  let lean = o.em ? 0 : -1;
  if (lean < 0 && !o.whole) {
    const cand = raw.map((p, i) => i).filter((i) => i < n - 1 && words(raw[i].text) >= 3);
    if (cand.length && rng() < r.emphasis * 1.4) lean = cand[Math.floor(rng() * cand.length)];
  }
  const out: Phrase[] = raw.map((p, i) => {
    let f = r.rate * (1 + r.spread * gauss(rng));
    const roll = rng();
    const last = i === n - 1;
    // The last phrase of a sentence already slows by finalSlow; a dragged flag on top would stack into a crawl.
    const rush = roll < r.rush; const drag = !rush && !last && roll < r.rush + r.drag;
    if (rush) f *= 1.07; else if (drag) f *= 0.92;
    if (last && (p.brk === 'stop' || p.brk === 'excl')) f *= 1 - r.finalSlow;
    const em = i === lean;
    if (em) f *= o.em ? 0.88 : 0.9;
    const base = BREAK_GAP[p.brk] * r.pause * (1 + r.pauseSpread * gauss(rng)) * (rush ? 0.8 : drag ? 1.25 : 1) * (last && words(p.text) > 14 ? 1.2 : 1);
    return { text: p.text, speed: q2(clamp(baseSpeed * f, baseSpeed * 0.84, Math.min(1.45, baseSpeed * 1.25))), gap: clamp(base, 0.03, 1.4), brk: p.brk, em };
  });
  // A beat before the phrase that is leaned on.
  for (let i = 1; i < out.length; i++) if (out[i].em) out[i - 1].gap += 0.07 * r.pause;
  return out;
}

/** A free-standing pause token: jittered by the speaker's spread (and by a seed so the same line always breathes the same). */
export function jitterPause(seconds: number, r: Rhythm, seed: string, scaled = true): number {
  const z = gauss(rngFor(seed));
  return clamp(seconds * (scaled ? r.pause : 1) * (1 + (scaled ? r.pauseSpread : 0.08) * z), 0.05, 4.5);
}

/**
 * Gap between the end of one speaker's line and the start of the next: shorter after a question, longer after a joke,
 * sometimes negative (a quick pickup: the next voice starts up to 0.2 s before the last one has finished).
 */
export function turnGap(prev: { text: string; laugh: boolean; same: boolean }, nextText: string, next: Rhythm): number {
  const rng = rngFor(`${prev.text}>${nextText}`);
  const tail = terminal(prev.text.replace(/\[[^\]]*\]/g, ' ').trim());
  let g = 0.3 * next.turn * (1 + 0.35 * gauss(rng));
  if (prev.same) g = 0.55 * next.pause * (1 + 0.25 * gauss(rng));
  else if (tail === 'q') g *= 0.8;
  if (prev.laugh) g += 0.3 + 0.2 * rng();
  else if (!prev.same && rng() < next.pickup * (tail === 'q' || tail === 'excl' ? 1 : 0.5)) g = -(0.06 + 0.14 * rng());
  return clamp(g, -0.2, 1.3);
}

/* ---------- clip edges ---------- */

/**
 * A copy of a clip ready to be joined: silence beyond 30 ms at both ends trimmed (baked clips already carry 30 ms, so
 * this changes nothing for them) and a 6 ms raised-cosine fade in and out, so a join between phrases never clicks.
 */
export function shapeClip(x: Float32Array, rate: number): Float32Array {
  let a = 0; let b = x.length - 1;
  while (a < b && Math.abs(x[a]) < 0.004) a++;
  while (b > a && Math.abs(x[b]) < 0.004) b--;
  const k = Math.round(0.03 * rate);
  const y = x.slice(Math.max(0, a - k), Math.min(x.length, b + 1 + k));
  const n = Math.min(y.length >> 1, Math.round(0.006 * rate));
  for (let i = 0; i < n; i++) { const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / n); y[i] *= g; y[y.length - 1 - i] *= g; }
  return y;
}

/* ---------- a whole script line ---------- */

export type LineItem =
  | { k: 'say'; text: string; speed: number; gap: number; first: boolean; em: boolean }
  | { k: 'pause'; s: number }
  | { k: 'laugh' }
  | { k: 'sfx'; name: string }
  | { k: 'over' };

/**
 * A script line (words plus [pause 0.6] [beat] [breath] [punch] [em] [laugh] [over] [sfx x]) as phrases and pauses.
 * [breath] is a short human breath (0.2 s), [beat] a beat (0.35 s), [punch] a beat before a punchline that also leans on
 * the next words, [em] leans on the next words (one slowed phrase). Every pause is jittered by the speaker's profile
 * and seeded by the text, so a line always breathes the same way. `whole` keeps sentences whole (SpeechSynthesis).
 */
export function planLine(text: string, who: string, baseSpeed: number, r: Rhythm, whole = false): LineItem[] {
  const out: LineItem[] = [];
  let em = false; let first = true;
  const trim = (cap: number) => { const p = out[out.length - 1]; if (p?.k === 'say') p.gap = Math.min(p.gap, cap); };
  parseLine(text).forEach((d, i) => {
    const seed = `${who}|${text}|${i}`;
    if (d.t === 'say') {
      for (const p of planSentence(d.text, who, baseSpeed, r, { em, whole })) { out.push({ k: 'say', text: p.text, speed: p.speed, gap: p.gap, first, em: p.em }); first = false; }
      em = false;
    } else if (d.t === 'pause') { trim(0.05); out.push({ k: 'pause', s: jitterPause(d.s, r, seed, !!d.soft) }); }
    else if (d.t === 'breath') { trim(0.04); out.push({ k: 'pause', s: jitterPause(0.2, r, seed) }); }
    else if (d.t === 'punch') { trim(0.05); out.push({ k: 'pause', s: jitterPause(0.55, r, seed) }); em = true; }
    else if (d.t === 'em') em = true;
    else if (d.t === 'laugh') { trim(0.06); out.push({ k: 'laugh' }); }
    else if (d.t === 'over') out.push({ k: 'over' });
    else out.push({ k: 'sfx', name: d.name });
  });
  return out;
}

/** Plain text with no directions (a bark, a story line) as phrases, sentence by sentence. `who` picks the rhythm profile. */
export function planSpeech(text: string, who: string, baseSpeed: number, r: Rhythm): Phrase[] {
  return splitSentences(text).flatMap((x) => planSentence(x, who, baseSpeed, r));
}

/** Rhythm id of a pedestrian voice (profiles are per voice preset; story characters use their own name). */
export const pedRhythmId = (kokoroVoice: string): string => `ped:${kokoroVoice}`;
