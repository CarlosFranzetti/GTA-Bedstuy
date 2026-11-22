/**
 * What the tutorial remembers, on this device: whether it has run, the Hints switch, and which hints were shown. It lives next to the
 * settings and the key bindings (localStorage), never in a save slot: a new game on the same machine does not replay anything unless
 * the player asks ("Replay tutorial", Settings, Game). Storage can be missing or throw (a private window): everything then runs in memory.
 */
export const TUTORIAL_STORE_KEY = 'gta-bedstuy.tutorial.v1';

export interface TutorialSaved {
  v: 1;
  /** The tutorial has begun at least once on this device. */
  started: boolean;
  /** How the last run ended. */
  outcome: '' | 'done' | 'skipped';
  /** Steps never offered because the thing was not near (a car); the first car the player gets into brings them back. */
  deferred: string[];
  /** Hints: On / Off. */
  hints: boolean;
  /** Hint ids already shown. */
  seen: string[];
}

const EMPTY = (): TutorialSaved => ({ v: 1, started: false, outcome: '', deferred: [], hints: true, seen: [] });

export type StoreLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StoreLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export class TutorialStore {
  private data: TutorialSaved = EMPTY();

  /** `storage` null = memory only (tests, private windows). Omit it for the browser's localStorage. */
  constructor(private readonly storage: StoreLike | null = defaultStorage()) { this.load(); }

  get started(): boolean { return this.data.started; }
  get outcome(): TutorialSaved['outcome'] { return this.data.outcome; }
  get deferred(): readonly string[] { return this.data.deferred; }
  get hintsOn(): boolean { return this.data.hints; }
  hintSeen(id: string): boolean { return this.data.seen.includes(id); }

  markStarted(): void { if (!this.data.started) { this.data.started = true; this.save(); } }
  finish(outcome: 'done' | 'skipped', deferred: readonly string[]): void { this.data.outcome = outcome; this.data.deferred = [...deferred]; this.save(); }
  setDeferred(ids: readonly string[]): void { this.data.deferred = [...ids]; this.save(); }
  setHints(on: boolean): void { this.data.hints = on; this.save(); }
  markHint(id: string): void { if (!this.data.seen.includes(id)) { this.data.seen.push(id); this.save(); } }
  /** "Replay tutorial": forget that it ran. The hints already shown stay shown. */
  resetTutorial(): void { this.data.started = false; this.data.outcome = ''; this.data.deferred = []; this.save(); }

  private load(): void {
    try {
      const raw = this.storage?.getItem(TUTORIAL_STORE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as Partial<TutorialSaved> | null;
      if (!o || typeof o !== 'object') return;
      const d = EMPTY();
      if (typeof o.started === 'boolean') d.started = o.started;
      if (o.outcome === 'done' || o.outcome === 'skipped') d.outcome = o.outcome;
      if (Array.isArray(o.deferred)) d.deferred = o.deferred.filter((x): x is string => typeof x === 'string').slice(0, 40);
      if (typeof o.hints === 'boolean') d.hints = o.hints;
      if (Array.isArray(o.seen)) d.seen = o.seen.filter((x): x is string => typeof x === 'string').slice(0, 80);
      this.data = d;
    } catch { /* corrupt or blocked: start fresh */ }
  }

  private save(): void {
    try { this.storage?.setItem(TUTORIAL_STORE_KEY, JSON.stringify(this.data)); } catch { /* storage full or blocked: memory only */ }
  }
}
