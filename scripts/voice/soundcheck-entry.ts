/**
 * Entry bundled by soundcheck-speech.mjs (it also runs against a checked-out older tree for the "before" side, so it only
 * imports what both trees have): two conversations from the talk shows as the player lays them out
 * (SpeechPlayer.expand: phrases, rhythm, turn gaps, [over] overlaps) and the timeline they are placed on.
 */
import { expand, type ResolvedLine } from '../../src/audio/voice/SpeechPlayer';
import { TALK_SHOWS } from '../../src/audio/voice/shows';
import { spokenText } from '../../src/audio/voice/script';

export interface Say { k: 'say'; who: string; voice: string; speed: number; text: string; line: number; first: boolean; gap: number; lead: number; over: boolean }
export type Item = Say | { k: 'pause'; s: number };

const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => ({ station: 'Flashback 88', time: 'seven forty', weather: 'steady rain', street: 'Fulton Street', hood: 'Bed-Stuy' } as Record<string, string>)[k] ?? '');
const slice = (show: string, from: string, n: number): ResolvedLine[] => {
  const lines = TALK_SHOWS.find((s) => s.id === show)!.lines;
  const i = lines.findIndex((l) => l.text.includes(from));
  return lines.slice(i, i + n).map((l) => ({ who: l.who, text: fill(l.text).replace(/\[sfx [a-z]+\]/g, '') }));
};

export function scenes(): Array<{ id: string; title: string; lines: ResolvedLine[] }> {
  return [
    { id: 'conv-deadair', title: 'Call-in: Lorraine, Gus, Boards and Rosa (late night)', lines: slice('dead-air', 'Who benefits? [beat] The meter company', 9) },
    { id: 'conv-board', title: 'Community board: the chair, Mr. Abernathy, Mrs. Delacroix and Garrett', lines: slice('board-live', 'The chair is calling the meeting back to order', 10) },
  ];
}

export function items(lines: readonly ResolvedLine[]): Item[] {
  const out: Item[] = [];
  let over = false;
  for (const i of expand(lines)) {
    if (i.k === 'over') over = true;
    else if (i.k === 'pause') out.push({ k: 'pause', s: i.s });
    else if (i.k === 'say') { out.push({ k: 'say', who: i.cast.id, voice: i.cast.voice, speed: i.speed, text: i.text, line: i.line, first: i.first, gap: i.gap, lead: i.lead, over }); over = false; }
  }
  return out;
}

/** Mirrors SpeechPlayer.runNeural: the cursor moves by clip + gap, a pause adds, a line's lead precedes its first phrase, [over] starts 0.45 s before the last clip ends. `dur` is the clip's length on the timeline. */
export function timeline(its: readonly Item[], dur: (s: Say) => number): Array<{ s: Say; at: number; end: number }> {
  const out: Array<{ s: Say; at: number; end: number }> = [];
  let cursor = 0.06, clipEnd = 0.06;
  for (const it of its) {
    if (it.k === 'pause') { cursor += it.s; continue; }
    const at = Math.max(0.06, it.over ? clipEnd - 0.45 : cursor + (it.first ? it.lead : 0));
    const end = at + dur(it);
    out.push({ s: it, at, end });
    clipEnd = end; cursor = end + it.gap;
  }
  return out;
}
export { spokenText };
