/**
 * StoryState: the branch flags, the fork choices and the news the player has already heard. Pure (no DOM/three).
 * MissionSystem owns one (`missions.story`), embeds it in its own save and GameSave carries it as `story` (v3).
 */
import type { FlagRule } from '@/game/missions/types';
import { ALIGN } from './flags';

export interface StorySave { v: 1; flags: string[]; choices: Record<string, string>; seenNews: string[] }

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 80;
const MAX_FLAGS = 200;

export class StoryState {
  private readonly flags = new Set<string>();
  private readonly choices = new Map<string, string>();
  private readonly seen = new Set<string>();
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
  get isEmpty(): boolean { return this.flags.size === 0 && this.choices.size === 0 && this.seen.size === 0; }
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
    this.flags.clear(); this.choices.clear(); this.seen.clear();
    this.changed();
  }

  serialize(): StorySave {
    return { v: 1, flags: [...this.flags], choices: Object.fromEntries(this.choices), seenNews: [...this.seen] };
  }

  /** Validates before touching anything: false (state untouched) for anything that is not a story save. */
  restore(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const o = data as Partial<StorySave>;
    if (o.v !== 1 || !Array.isArray(o.flags) || !o.flags.every(isStr) || o.flags.length > MAX_FLAGS) return false;
    if (typeof o.choices !== 'object' || o.choices === null || Array.isArray(o.choices)) return false;
    const ch = Object.entries(o.choices);
    if (!ch.every(([k, v]) => isStr(k) && isStr(v))) return false;
    if (!Array.isArray(o.seenNews) || !o.seenNews.every(isStr)) return false;
    this.flags.clear(); this.choices.clear(); this.seen.clear();
    for (const f of o.flags) this.flags.add(f);
    for (const [k, v] of ch) this.choices.set(k, v);
    for (const n of o.seenNews) this.seen.add(n);
    this.changed();
    return true;
  }

  private changed(): void { this.version++; this.onChange?.(); }
}
