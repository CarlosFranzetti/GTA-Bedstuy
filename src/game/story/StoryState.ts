/**
 * StoryState: the branch flags, the fork choices and the news the player has already heard. Pure (no DOM/three).
 * MissionSystem owns one (`missions.story`), embeds it in its own save and GameSave carries it as `story` (v3).
 */
import type { FlagRule } from '@/game/missions/types';
import { ALIGN } from './flags';

/** v1: flags, choices, news. v2 (24 Nov) adds `ext`: named JSON blocks for later systems (nightlife). A v1 save loads as v2 with no ext. */
export interface StorySave { v: 1 | 2; flags: string[]; choices: Record<string, string>; seenNews: string[]; ext?: Record<string, unknown> }

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80;
const MAX_FLAGS = 200;
const MAX_EXT_BYTES = 60_000;
const isPlain = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export class StoryState {
  private readonly flags = new Set<string>();
  private readonly choices = new Map<string, string>();
  private readonly seen = new Set<string>();
  private ext: Record<string, unknown> = {};
  /** Bumps on every change (flags, choices, news). */
  version = 0;
  onChange?: () => void;

  has(flag: string): boolean { return this.flags.has(flag); }
  /** Set a flag. Returns true when it was new. */
  set(flag: string): boolean {
    if (this.flags.has(flag) || this.flags.size >= MAX_FLAGS) return false;
    this.flags.add(flag); this.changed(); return true;
  }
  clear(flag: string): void { if (this.flags.delete(flag)) this.changed(); }
  /** `flag` set (if given) and `not` clear (if given). An empty or missing rule always passes. */
  test(rule?: FlagRule): boolean {
    if (!rule) return true;
    if (rule.flag !== undefined && !this.flags.has(rule.flag)) return false;
    if (rule.not !== undefined && this.flags.has(rule.not)) return false;
    return true;
  }
  /** Record a fork decision: the option's flag is set and remembered under the fork id. */
  choose(forkId: string, flag: string): void {
    this.choices.set(forkId, flag);
    this.flags.add(flag);
    this.changed();
  }
  choiceOf(forkId: string): string | null { return this.choices.get(forkId) ?? null; }
  /** Nothing set, chosen or heard (a fresh game: the save then carries no story block). */
  get isEmpty(): boolean { return this.flags.size === 0 && this.choices.size === 0 && this.seen.size === 0 && Object.keys(this.ext).length === 0; }

  /** A named JSON block owned by another system (stored in the save as `ext`). The value must be plain JSON. */
  setExt(key: string, value: unknown): void { this.ext[key] = JSON.parse(JSON.stringify(value)); }
  getExt(key: string): unknown { return this.ext[key]; }
  get flagList(): string[] { return [...this.flags]; }

  /** News bulletins already read out (so each is spoken once). */
  newsSeen(id: string): boolean { return this.seen.has(id); }
  markNews(id: string): void { if (!this.seen.has(id)) { this.seen.add(id); this.changed(); } }

  /** How many of the player's choices lean each way. */
  get alignment(): { hustle: number; loyalty: number; sellout: number } {
    const a = { hustle: 0, loyalty: 0, sellout: 0 };
    for (const f of this.flags) { const k = ALIGN[f]; if (k) a[k]++; }
    return a;
  }

  reset(): void {
    this.flags.clear(); this.choices.clear(); this.seen.clear(); this.ext = {};
    this.changed();
  }

  serialize(): StorySave {
    const base = { flags: [...this.flags], choices: Object.fromEntries(this.choices), seenNews: [...this.seen] };
    return Object.keys(this.ext).length === 0 ? { v: 1, ...base } : { v: 2, ...base, ext: this.ext };
  }

  /** Validates before touching anything: false (state untouched) for anything that is not a story save. */
  restore(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const o = data as Partial<StorySave>;
    if ((o.v !== 1 && o.v !== 2) || !Array.isArray(o.flags) || !o.flags.every(isStr) || o.flags.length > MAX_FLAGS) return false;
    if (typeof o.choices !== 'object' || o.choices === null || Array.isArray(o.choices)) return false;
    const ch = Object.entries(o.choices);
    if (!ch.every(([k, v]) => isStr(k) && isStr(v))) return false;
    if (!Array.isArray(o.seenNews) || !o.seenNews.every(isStr)) return false;
    // ext is optional and never blocks the rest: anything that is not a small plain object of plain objects is dropped
    let ext: Record<string, unknown> = {};
    if (o.v === 2 && isPlain(o.ext)) {
      try { if (JSON.stringify(o.ext).length <= MAX_EXT_BYTES && Object.values(o.ext).every(isPlain)) ext = JSON.parse(JSON.stringify(o.ext)) as Record<string, unknown>; } catch { ext = {}; }
    }
    this.flags.clear(); this.choices.clear(); this.seen.clear(); this.ext = ext;
    for (const f of o.flags) this.flags.add(f);
    for (const [k, v] of ch) this.choices.set(k, v);
    for (const n of o.seenNews) this.seen.add(n);
    this.changed();
    return true;
  }

  private changed(): void { this.version++; this.onChange?.(); }
}
