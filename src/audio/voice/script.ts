/** Script helpers: stage-direction parsing, slot filling, sentence splitting, cache keys and lint. Pure. */
import type { CastMember, Direction, KokoroVoice, ScriptLine, Show } from './types';

/** Parses "words [pause 1] more words [laugh]" into ordered directions. Sentences are split for streaming. */
export function parseLine(text: string, maxChars = 160): Direction[] {
  const out: Direction[] = [];
  const re = /\[([a-z]+)(?:\s+([^\]]+))?\]/gi;
  let last = 0;
  const pushText = (t: string) => {
    for (const s of splitSentences(t, maxChars)) out.push({ t: 'say', text: s });
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[1].toLowerCase();
    const arg = (m[2] ?? '').trim();
    if (tag === 'pause') out.push({ t: 'pause', s: Math.min(4, Math.max(0.1, Number(arg) || 0.6)) });
    else if (tag === 'beat') out.push({ t: 'beat' });
    else if (tag === 'breath') out.push({ t: 'breath' });
    else if (tag === 'punch') out.push({ t: 'punch' });
    else if (tag === 'em') out.push({ t: 'em' });
    else if (tag === 'laugh') out.push({ t: 'laugh' });
    else if (tag === 'over') out.push({ t: 'over' });
    else if (tag === 'sfx') out.push({ t: 'sfx', name: arg || 'sting' });
  }
  pushText(text.slice(last));
  return out;
}

/** Splits into sentences of at most `max` characters (commas, then spaces, when a sentence is too long). */
export function splitSentences(text: string, max = 160): string[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return [];
  const parts = flat.match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) ?? [flat];
  const out: string[] = [];
  for (const raw of parts) {
    let s = raw.trim();
    while (s.length > max) {
      const c = s.lastIndexOf(',', max);
      const cut = c > max * 0.4 ? c + 1 : s.lastIndexOf(' ', max) > 0 ? s.lastIndexOf(' ', max) : max;
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

/** The words that would be spoken (no directions, no slots left unfilled). */
export function spokenText(text: string): string {
  return text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Rough seconds a line takes to read, at the cast member's speed. */
export function lineSeconds(text: string, speed = 1): number {
  const dirs = parseLine(text);
  let s = 0;
  for (const d of dirs) {
    if (d.t === 'say') s += Math.max(0.6, d.text.split(/\s+/).length / (2.6 * speed) + 0.25);
    else if (d.t === 'pause') s += d.s;
    else if (d.t === 'laugh') s += 0.9;
    else if (d.t === 'beat' || d.t === 'punch') s += 0.4;
    else if (d.t === 'breath') s += 0.2;
  }
  return s;
}

export type Slots = Record<string, string | number | undefined>;

/** Fills {slot} markers; an unknown slot is dropped (with its surrounding space collapsed) so no brace is ever spoken. */
export function fillSlots(template: string, slots: Slots): string {
  return template
    .replace(/\{([a-zA-Z]+)\}/g, (_, k: string) => {
      const v = slots[k];
      return v === undefined || v === null ? '' : String(v);
    })
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slotsIn(template: string): string[] {
  return [...template.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]);
}

/** Stable 32-bit FNV-1a hash as 8 hex chars. */
export function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Cache key for one rendered sentence: model version + voice + speed (2 decimals) + normalised text. */
export function clipKey(text: string, voice: KokoroVoice | string, speed: number, model = 'k1'): string {
  return `${model}:${voice}:${speed.toFixed(2)}:${hash32(text.replace(/\s+/g, ' ').trim().toLowerCase())}`;
}

/* ---------- lint (used by tests and by anyone adding content) ---------- */

/** Real brands / people / outlets that must never appear in parody copy (lowercase, whole-word match). */
export const REAL_NAME_DENYLIST: readonly string[] = [
  'coca-cola', 'coca cola', 'pepsi', 'mcdonald', 'burger king', 'starbucks', 'dunkin', 'subway sandwich', 'amazon', 'walmart', 'target corp',
  'apple', 'google', 'microsoft', 'facebook', 'meta', 'instagram', 'tiktok', 'twitter', 'netflix', 'uber', 'lyft', 'airbnb', 'tesla', 'nike', 'adidas',
  'whole foods', 'trader joe', 'tinder', 'venmo', 'paypal', 'zillow', 'redfin', 'wework', 'goldman', 'blackrock', 'fox news', 'cnn', 'msnbc', 'nbc', 'new york times',
  'daily news', 'pfizer', 'peloton', 'soulcycle', 'lululemon', 'spotify', 'soundcloud', 'youtube', 'gta', 'rockstar', 'grand theft',
  'oatly', 'zelda', 'nintendo', 'trump', 'biden', 'obama', 'cuomo', 'de blasio', 'bloomberg', 'mamdani', 'hochul', 'musk', 'bezos', 'zuckerberg', 'jay-z', 'biggie', 'notorious',
  'nypd', 'mta', 'con ed', 'conedison', 'verizon', 'comcast', 'chase bank', 'citibank', 'wells fargo', 'bank of america',
];

/** Slurs and similar, matched on word starts (stems) or whole words so ordinary words like "suspicious" pass. */
export const BLOCKED_PATTERNS: readonly RegExp[] = [/\bnigg/i, /\bfagg/i, /\bretard/i, /\bchink\b/i, /\bspics?\b/i, /\bkikes?\b/i, /\btranny/i, /\bwetback/i, /\bcoons?\b/i, /\bgooks?\b/i, /\bdykes?\b/i];

export function findDenied(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ')} `;
  return REAL_NAME_DENYLIST.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[-.]/g, '\\$&')}($|[^a-z])`).test(t));
}

export function findBlocked(text: string): string[] {
  return BLOCKED_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}

export interface LintIssue { where: string; problem: string }

export const MAX_SENTENCE_CHARS = 200;
export const MAX_LINE_CHARS = 520;

export function lintLines(where: string, lines: readonly ScriptLine[], cast: ReadonlyMap<string, CastMember>): LintIssue[] {
  const issues: LintIssue[] = [];
  lines.forEach((l, i) => {
    const w = `${where}#${i}`;
    if (!cast.has(l.who)) issues.push({ where: w, problem: `unknown speaker ${l.who}` });
    const spoken = spokenText(l.text);
    if (!spoken && !/\[(sfx|laugh)/.test(l.text)) issues.push({ where: w, problem: 'empty line' });
    if (l.text.length > MAX_LINE_CHARS) issues.push({ where: w, problem: `line too long (${l.text.length})` });
    for (const s of splitSentences(spoken.replace(/\{[a-zA-Z]+\}/g, 'xxxxxxxxxxxx'), MAX_SENTENCE_CHARS)) {
      if (s.length > MAX_SENTENCE_CHARS) issues.push({ where: w, problem: 'sentence too long' });
    }
    const bad = findDenied(l.text);
    if (bad.length) issues.push({ where: w, problem: `real name: ${bad.join(', ')}` });
    const slur = findBlocked(l.text);
    if (slur.length) issues.push({ where: w, problem: `blocked word: ${slur.join(', ')}` });
    for (const m of l.text.matchAll(/\[([a-z]+)/gi)) {
      if (!['pause', 'beat', 'breath', 'punch', 'em', 'laugh', 'over', 'sfx'].includes(m[1].toLowerCase())) issues.push({ where: w, problem: `unknown direction [${m[1]}]` });
    }
    if ((l.text.match(/\[/g) ?? []).length !== (l.text.match(/\]/g) ?? []).length) issues.push({ where: w, problem: 'unbalanced bracket' });
  });
  return issues;
}

export function showVoices(show: Show): string[] {
  return [...new Set(show.lines.map((l) => l.who))];
}
