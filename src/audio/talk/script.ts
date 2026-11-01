/**
 * "WBSY Talk" script: shape, tolerant parser, voice roles and timing helpers.
 * The script file (src/audio/talk/script.json) is plain data: segments of speech with an optional length.
 */
import type { TalkStingKind } from '../synth';

export type TalkKind = 'host' | 'caller' | 'ad' | 'jingle' | 'news' | 'sting';
/** Which of the (up to four) distinct speaking voices reads a segment. */
export type VoiceRole = 'host' | 'sidekick' | 'caller' | 'announcer';

export interface TalkSegment {
  id: string;
  kind: TalkKind;
  speaker: string;
  /** Raw voice tag from the script ('host', 'sidekick', 'caller1', 'announcer', 'ad', 'jingle' ...). */
  voice: string;
  text: string;
  /** Planned length in seconds (script value, or estimated from the word count). */
  seconds: number;
}

const KINDS: TalkKind[] = ['host', 'caller', 'ad', 'jingle', 'news', 'sting'];

export const TALK_WORDS_PER_SECOND = 2.6;

export function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round((words / TALK_WORDS_PER_SECOND + 0.8) * 10) / 10);
}

/** Accepts `[...]` or `{ segments: [...] }`; drops malformed entries. */
export function parseScript(raw: unknown): TalkSegment[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? (raw as { segments?: unknown }).segments : null;
  if (!Array.isArray(list)) return [];
  const out: TalkSegment[] = [];
  for (let i = 0; i < list.length; i++) {
    const o = list[i] as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') continue;
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    const voice = typeof o.voice === 'string' ? o.voice.toLowerCase() : '';
    let kind = typeof o.kind === 'string' ? (o.kind.toLowerCase() as TalkKind) : undefined;
    if (!kind || !KINDS.includes(kind)) {
      kind = voice === 'ad' || voice === 'jingle' ? (voice as TalkKind) : voice.startsWith('caller') ? 'caller' : 'host';
    }
    if (!text && kind !== 'sting' && kind !== 'jingle') continue;
    const sec = typeof o.seconds === 'number' && Number.isFinite(o.seconds) && o.seconds > 0 ? o.seconds : estimateSeconds(text);
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : `seg-${i}`,
      kind,
      speaker: typeof o.speaker === 'string' ? o.speaker : kind,
      voice: voice || kind,
      text,
      seconds: sec,
    });
  }
  return out;
}

export function voiceRole(seg: TalkSegment): VoiceRole {
  const v = seg.voice;
  if (v === 'sidekick') return 'sidekick';
  if (v.startsWith('caller') || seg.kind === 'caller') return 'caller';
  if (v === 'announcer' || v === 'ad' || v === 'jingle' || seg.kind === 'ad' || seg.kind === 'jingle' || seg.kind === 'news' || seg.kind === 'sting') return 'announcer';
  return 'host';
}

/** 1, 2, 3 for caller1..caller3; 0 otherwise. Varies the pitch between callers. */
export function callerIndex(seg: TalkSegment): number {
  const m = /^caller(\d+)$/.exec(seg.voice);
  return m ? Number(m[1]) : 0;
}

/** The procedural sting that opens a segment, or null for plain speech. */
export function openingSting(seg: TalkSegment, prev: TalkSegment | null): TalkStingKind | null {
  switch (seg.kind) {
    case 'jingle': return 'jingle';
    case 'sting': return 'segment';
    case 'ad': return 'ad';
    case 'news': return 'news';
    default: return prev && prev.kind !== 'host' && prev.kind !== 'caller' ? 'segment' : null;
  }
}

export function totalSeconds(segs: readonly TalkSegment[]): number {
  return segs.reduce((n, s) => n + s.seconds, 0);
}

/** Splits text into sentence groups of at most `max` characters (Chrome cuts long utterances short). */
export function chunkText(text: string, max = 180): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) ?? [];
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const sRaw of sentences) {
    let s = sRaw;
    while (s.length > max) {
      const cut = s.lastIndexOf(',', max) > max * 0.4 ? s.lastIndexOf(',', max) + 1 : s.lastIndexOf(' ', max) > 0 ? s.lastIndexOf(' ', max) : max;
      if (cur) push();
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut);
    }
    if ((cur + s).length > max) push();
    cur += s;
  }
  push();
  return out;
}

/** Bundled script (empty until src/audio/talk/script.json exists). */
export function loadBundledScript(): TalkSegment[] {
  const mods = import.meta.glob('./script.json', { eager: true, import: 'default' }) as Record<string, unknown>;
  const first = Object.values(mods)[0];
  return first ? parseScript(first) : [];
}
