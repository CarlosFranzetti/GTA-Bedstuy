/**
 * Entry bundled by prosody-demo.mjs: the demo scenes, the old (sentence by sentence, fixed gap) and new (phrases,
 * rhythm profiles, turn gaps) item lists built from the real source files, and the timeline both are laid out on.
 */
import { CAST_MAP } from '../../src/audio/voice/cast';
import { expand, type ResolvedLine } from '../../src/audio/voice/SpeechPlayer';
import { parseLine, spokenText, hash32 } from '../../src/audio/voice/script';
import { planSpeech, pedRhythmId } from '../../src/audio/voice/prosody';
import { rhythmFor, RHYTHMS } from '../../src/audio/voice/rhythm';
import { PED_GROUPS } from '../../src/audio/voice/peds/groups';
import { DJ_COPY, ADS, TALK_SHOWS } from '../../src/audio/voice/shows';
import { planLine } from '../../src/audio/voice/prosody';

export interface Say { k: 'say'; who: string; voice: string; speed: number; text: string; line: number; first: boolean; gap: number; lead: number; over?: boolean }
export type Item = Say | { k: 'pause'; s: number };

export interface Scene { id: string; title: string; lines: ResolvedLine[] }

const fill = (t: string, s: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => s[k] ?? '');
const S = { station: 'Flashback 88', freq: 'eighty-eight point one', time: 'seven forty', weather: 'steady rain', street: 'Fulton Street', hood: 'Bed-Stuy' };
const dj = (who: string, ...t: string[]): ResolvedLine[] => t.map((x) => ({ who, text: fill(x, S) }));
const show = (id: string, from: number, n: number): ResolvedLine[] => (TALK_SHOWS.find((s) => s.id === id)?.lines ?? []).slice(from, from + n).map((l) => ({ who: l.who, text: fill(l.text, S) }));
const ad = (id: string): ResolvedLine[] => (ADS.find((s) => s.id === id)?.lines ?? []).map((l) => ({ who: l.who, text: fill(l.text, S).replace(/\[(laugh|sfx [a-z]+)\]/g, '') }));

export function scenes(): Scene[] {
  const tommy = Object.values(DJ_COPY).find((c) => c.who === 'tommy')!;
  const lou = Object.values(DJ_COPY).find((c) => c.who === 'lou')!;
  return [
    { id: 'host-tommy', title: 'Morning-zoo DJ (Tommy Tapedeck): ident, time check, shout-out', lines: dj('tommy', tommy.idents[0], tommy.hours[0], tommy.shouts[0]) },
    { id: 'host-lou', title: 'Late-night soul DJ (Velvet Lou): ident, time check, traffic', lines: dj('lou', lou.idents[1], lou.hours[0], lou.traffic[0]) },
    { id: 'talk-buck-dev', title: 'Talk show: Buck Mercer, Boards and a nervous caller (Dev)', lines: [...show('mercer-morning', 1, 5), ...show('mercer-morning', 21, 4)] },
    { id: 'ad-silo', title: 'Ad read: Trent and Noelle, Silo Milk', lines: ad('ad-silomilk') },
  ];
}

export const STREET = [
  { group: 'g00', text: 'Morning, baby. Did you eat yet?' },
  { group: 'g03', text: 'Sorry, sorry, coming through, coming through, bike on your left!' },
  { group: 'g06', text: 'Lovely day, is it not? Lovely until the landlord calls.' },
  { group: 'g09', text: 'Nah, nah, wait, hold up, that is not what I ordered.' },
];

/** The old behaviour: sentence by sentence at the cast speed, 0.14 s between sentences, explicit pauses as written, no turn gap. */
export function oldItems(lines: readonly ResolvedLine[]): Item[] {
  const out: Item[] = [];
  lines.forEach((l, li) => {
    const c = CAST_MAP.get(l.who)!;
    let first = true; let over = false;
    for (const d of parseLine(l.text)) {
      if (d.t === 'say') { out.push({ k: 'say', who: c.id, voice: c.voice, speed: c.speed, text: d.text, line: li, first, gap: 0.14, lead: 0, over }); first = false; over = false; }
      else if (d.t === 'pause') out.push({ k: 'pause', s: d.s });
      else if (d.t === 'over') over = true;
    }
  });
  return out;
}

export function newItems(lines: readonly ResolvedLine[]): Item[] {
  return expand(lines).flatMap((i): Item[] => {
    if (i.k === 'say') return [{ k: 'say', who: i.cast.id, voice: i.cast.voice, speed: i.speed, text: i.text, line: i.line, first: i.first, gap: i.gap, lead: i.lead }];
    if (i.k === 'pause') return [{ k: 'pause', s: i.s }];
    return [];
  });
}

/** Mirrors SpeechPlayer.runNeural's timeline: cursor moves by clip + gap, pauses add, a line's lead precedes its first phrase. */
export function timeline(items: readonly Item[], dur: (s: Say) => number): Array<{ s: Say; at: number; end: number }> {
  const out: Array<{ s: Say; at: number; end: number }> = [];
  let cursor = 0; let clipEnd = 0;
  for (const it of items) {
    if (it.k === 'pause') { cursor += it.s; continue; }
    const at = Math.max(0, it.over ? clipEnd - 0.45 : cursor + (it.first ? it.lead : 0));
    const end = at + dur(it);
    out.push({ s: it, at, end });
    clipEnd = end; cursor = end + it.gap;
  }
  return out;
}

export function streetOld(): Array<{ group: string; voice: string; items: Say[] }> {
  return STREET.map((b) => { const g = PED_GROUPS.find((x) => x.id === b.group)!; return { group: g.id, voice: g.voice, items: [{ k: 'say', who: g.id, voice: g.voice, speed: g.speed, text: b.text, line: 0, first: true, gap: 0, lead: 0 }] as Say[] }; });
}
export function streetNew(): Array<{ group: string; voice: string; items: Say[] }> {
  return STREET.map((b) => {
    const g = PED_GROUPS.find((x) => x.id === b.group)!;
    return { group: g.id, voice: g.voice, items: planSpeech(b.text, pedRhythmId(g.voice), g.speed, rhythmFor(pedRhythmId(g.voice))).map((p, i) => ({ k: 'say' as const, who: g.id, voice: g.voice, speed: p.speed, text: p.text, line: 0, first: i === 0, gap: p.gap, lead: 0 })) };
  });
}

/** Planned pauses and speeds per speaker over every line they have in the shows, ads and DJ copy (no audio; slots filled with sample values). */
export function planStatsBySpeaker(): Record<string, { lines: number; phrases: number; gaps: number[]; speeds: number[]; baseSpeed: number }> {
  const out: Record<string, { lines: number; phrases: number; gaps: number[]; speeds: number[]; baseSpeed: number }> = {};
  const add = (who: string, text: string) => {
    const c = CAST_MAP.get(who); if (!c) return;
    const e = (out[who] ??= { lines: 0, phrases: 0, gaps: [], speeds: [], baseSpeed: c.speed });
    e.lines++;
    const items = planLine(fill(text, S), who, c.speed, rhythmFor(who));
    items.forEach((d, i) => {
      if (d.k === 'say') { e.phrases++; e.speeds.push(d.speed); if (d.gap > 0.03 && items.slice(i + 1).some((x) => x.k === 'say')) e.gaps.push(d.gap); }
      else if (d.k === 'pause') e.gaps.push(d.s);
    });
  };
  for (const s of [...TALK_SHOWS, ...ADS]) for (const l of s.lines) add(l.who, l.text);
  for (const c of Object.values(DJ_COPY)) for (const cat of ['idents', 'intros', 'outros', 'blind', 'hours', 'traffic', 'shouts'] as const) for (const t of c[cat]) add(c.who, t);
  return out;
}
export { spokenText, hash32, RHYTHMS };
