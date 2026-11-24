/**
 * RADIO4: when the station announcer names the DJ of the mix that is playing.
 *
 * The owner's rule: once at the beginning, once near the end to thank the DJ, and between them no more than once every 30 to 40
 * minutes. `planDjMentions` is pure: set length, where the listener joined (stations start mid-mix), a seed -> timed mentions
 * in seconds of set position. `DjMentionTracker` hands each one out once. `DjMentionRunner` is the glue the radio director calls
 * each frame; it knows nothing about the widget except a small clock.
 */
import { Rotation } from '../voice/Scheduler';
import { fillSlots } from '../voice/script';
import { djLinePool, type DjLineKind } from './djLines';

export type DjMentionKind = 'intro' | 'listening' | 'mid' | 'thanks';

export interface DjMention {
  index: number;
  kind: DjMentionKind;
  /** Set position (seconds) at which the line is due. */
  at: number;
  /** After this position the mention is dropped, not spoken late (the thanks must never run into the end). */
  deadline: number;
}

/** A listener who tunes in within this many seconds of the set's start hears a real intro; later it is a "you are listening to" line. */
export const INTRO_JOIN_WINDOW_S = 60;
/** First mention comes this long after the listener joined (after the station ident), seeded in this range. */
export const FIRST_DELAY_S: readonly [number, number] = [20, 45];
/** Gap between mentions inside the set (seeded), which is also the minimum distance from the first mention and from the thanks. */
export const MID_GAP_S: readonly [number, number] = [30 * 60, 40 * 60];
export const MIN_SPACING_S = 30 * 60;
/** The thanks starts 2 to 3 minutes before the end of the set. */
export const THANKS_FROM_END_S: readonly [number, number] = [120, 180];
/** A line is assumed to run this long, and must be over this long before the set ends. */
export const LINE_S = 20;
export const END_MARGIN_S = 20;
/** Grace after the due time during which a busy announcer is retried. */
export const GRACE_S = 90;

export interface PlanOptions {
  lengthMin: number;
  joinedAtS: number;
  seed: number;
  hasDj?: boolean;
  /** The last mention of this set, when the listener comes back to it (a retune): nothing opens again within the spacing. */
  lastMentionAtS?: number;
  /** The set change was already announced with the DJ's name: no first mention. */
  skipFirst?: boolean;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit seed from text (FNV-1a). */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function planDjMentions(o: PlanOptions): DjMention[] {
  if (o.hasDj === false) return [];
  const L = o.lengthMin * 60;
  if (!(L > 0) || !Number.isFinite(L)) return [];
  const rnd = mulberry32(o.seed);
  // Draw in a fixed order so the plan only depends on the seed.
  const rFirst = rnd();
  const rThanks = rnd();
  const gaps: number[] = [];
  for (let i = 0; i < 24; i++) gaps.push(MID_GAP_S[0] + rnd() * (MID_GAP_S[1] - MID_GAP_S[0]));

  const J = Math.min(Math.max(Number.isFinite(o.joinedAtS) ? o.joinedAtS : 0, 0), L);
  const lastStart = L - LINE_S - END_MARGIN_S;
  if (J > lastStart) return [];

  // The thanks: 2 to 3 minutes before the end, never before the listener has had 10 s, and over 20 s before the end.
  let tThanks = L - (THANKS_FROM_END_S[0] + rThanks * (THANKS_FROM_END_S[1] - THANKS_FROM_END_S[0]));
  tThanks = Math.max(tThanks, J + 10);
  const hasThanks = tThanks <= lastStart && L >= 300;

  const out: Array<Omit<DjMention, 'index'>> = [];
  const dl = (at: number) => Math.min(at + GRACE_S, lastStart);

  let anchor = J;
  const recent = o.lastMentionAtS !== undefined && o.lastMentionAtS <= J && J - o.lastMentionAtS < MIN_SPACING_S;
  if (recent) anchor = o.lastMentionAtS as number;
  else if (!o.skipFirst) {
    const at = J + FIRST_DELAY_S[0] + rFirst * (FIRST_DELAY_S[1] - FIRST_DELAY_S[0]);
    // Close to the thanks it would only say the same thing twice.
    if (at <= lastStart && (!hasThanks || tThanks - at >= 180)) {
      out.push({ kind: J <= INTRO_JOIN_WINDOW_S ? 'intro' : 'listening', at, deadline: dl(at) });
      anchor = at;
    }
  }

  // Between: seeded 30 to 40 minute gaps, never closer than 30 minutes to the previous mention or to the thanks.
  const limit = hasThanks ? tThanks - MIN_SPACING_S : lastStart;
  let t = anchor;
  for (const g of gaps) {
    t += g;
    if (t > limit) break;
    if (t >= J) out.push({ kind: 'mid', at: t, deadline: dl(t) });
  }
  if (hasThanks) out.push({ kind: 'thanks', at: tThanks, deadline: dl(tThanks) });
  return out.map((m, index) => ({ ...m, index }));
}

/** Hands out the planned mentions of one set, each at most once. */
export class DjMentionTracker {
  private plan: DjMention[] = [];
  private finished = new Set<number>();
  private _key = '';
  get key(): string { return this._key; }
  get mentions(): readonly DjMention[] { return this.plan; }
  get remaining(): number { return this.plan.length - this.finished.size; }

  begin(key: string, plan: DjMention[]): void { this._key = key; this.plan = plan; this.finished = new Set(); }
  clear(): void { this._key = ''; this.plan = []; this.finished = new Set(); }

  /** The mention to speak at this position, or null. Missed ones (a seek past them, a long busy spell) are dropped. Call `ack` once spoken. */
  due(pos: number): DjMention | null {
    let hit: DjMention | null = null;
    for (const m of this.plan) {
      if (this.finished.has(m.index)) continue;
      if (pos > m.deadline) { this.finished.add(m.index); continue; }
      if (pos >= m.at && !hit) hit = m;
    }
    return hit;
  }

  ack(m: DjMention): void { this.finished.add(m.index); }
}

/* ---------- glue ---------- */

export interface DjClock {
  /** Identifies the mix (its URL). */
  key: string;
  /** Position in the mix, seconds. */
  pos: number;
  /** Length in seconds (0 when unknown). */
  durationS: number;
  /** The DJ's name as written in mixes.json (or the feed). */
  dj: string;
}

export interface DjRunnerEnv {
  /** The clock of the mix that is on air and playing, or null (radio off, paused, not a SoundCloud station, not settled yet). */
  clock: () => DjClock | null;
  /** The tuned SoundCloud station, or null. */
  station: () => { id: string; name: string } | null;
  /** Speaks and shows the line; false when the announcer is busy (tried again next frame, until the grace runs out). */
  say: (text: string, kind: DjMentionKind) => boolean;
  random: () => number;
  /** Makes the DJ name safe to read aloud (the exact name from mixes.json otherwise). */
  speakable?: (s: string) => string;
}

export class DjMentionRunner {
  readonly tracker = new DjMentionTracker();
  private stationId = '';
  private skipNext = false;
  private session = 0;
  /** Last mention of each mix this session, so a quick retune back to a mix does not open it again. */
  private readonly lastBy = new Map<string, number>();
  private readonly bags = new Map<string, Rotation<string>>();
  /** Everything spoken, newest last (tests and the transcript). */
  readonly spoken: Array<{ station: string; kind: DjMentionKind; text: string; at: number }> = [];

  constructor(private readonly env: DjRunnerEnv) {}

  /** The listener tuned to another station, switched the radio on, or left: the logic starts afresh. */
  reset(): void {
    this.tracker.clear();
    this.stationId = '';
    this.skipNext = false;
    this.session++;
  }

  /** A set change was announced with the new DJ's name: that announcement is the first mention of the next set. */
  noteSetAnnounced(): void { this.skipNext = true; }

  update(): void {
    const st = this.env.station();
    const clock = st ? this.env.clock() : null;
    if (!st || !clock) return;
    const dj = (this.env.speakable ? this.env.speakable(clock.dj) : clock.dj).trim();
    if (st.id !== this.stationId) { this.tracker.clear(); this.stationId = st.id; }
    if (clock.key !== this.tracker.key) {
      const skip = this.skipNext && clock.pos <= INTRO_JOIN_WINDOW_S;
      this.skipNext = false;
      this.tracker.begin(clock.key, planDjMentions({
        lengthMin: clock.durationS / 60, joinedAtS: clock.pos, seed: seedOf(`${st.id}|${clock.key}|${this.session}`), hasDj: dj.length > 0,
        lastMentionAtS: this.lastBy.get(clock.key), skipFirst: skip,
      }));
    }
    const m = this.tracker.due(clock.pos);
    if (!m) return;
    const text = this.line(st.id, st.name, m.kind, dj);
    if (!text) { this.tracker.ack(m); return; }
    if (this.env.say(text, m.kind)) {
      this.tracker.ack(m);
      this.lastBy.set(clock.key, clock.pos);
      if (this.lastBy.size > 30) this.lastBy.delete(this.lastBy.keys().next().value as string);
      this.spoken.push({ station: st.id, kind: m.kind, text, at: m.at });
      if (this.spoken.length > 100) this.spoken.shift();
    }
  }

  private line(stationId: string, stationName: string, kind: DjMentionKind, dj: string): string {
    const k: DjLineKind = kind === 'thanks' ? 'thanks' : kind === 'intro' ? 'intro' : 'mid';
    const bagKey = `${stationId}:${k}`;
    let bag = this.bags.get(bagKey);
    if (!bag) {
      const pool = djLinePool(stationId, k);
      if (pool.length === 0) return '';
      bag = new Rotation(pool, this.env.random);
      this.bags.set(bagKey, bag);
    }
    return fillSlots(bag.next(), { dj, station: stationName });
  }
}
