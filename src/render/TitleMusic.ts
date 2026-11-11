/**
 * Title-screen music: the synthesized boom-bap theme (src/audio/titleTheme.ts) on its own AudioContext.
 * Usage: start() when the title screen shows (after stopping the loading music), stop(3) a few seconds after the player
 * presses start, start() again under the credits. Restartable: every start() builds a fresh context and theme.
 *
 * Safe when the browser keeps the context locked: start() never throws, the theme simply waits (its clock does not run
 * while suspended) and a one-time pointer/key listener resumes it on the first gesture. The theme is imported lazily.
 */
export interface TitleThemeApi { start(): void; stop(fadeSec?: number): void; setVolume(v: number): void; readonly playing: boolean }
export type TitleThemeFactory = (ctx: BaseAudioContext, dest: AudioNode, opts?: { volume?: number; lookAhead?: number }) => TitleThemeApi;

export interface TitleMusicOptions {
  volume?: number;
  /** Override the module loader (tests). */
  load?: () => Promise<{ createTitleTheme?: unknown }>;
  /** Override the context factory (tests). Return null when Web Audio is unavailable. */
  makeContext?: () => AudioContext | null;
  /** Where the unlock listeners go (tests); defaults to globalThis when it has addEventListener. */
  unlockTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
}
export interface TitleMusic {
  /** Safe to call more than once; a no-op while playing or loading. */
  start(): void;
  /** Fade out and free everything. Safe before the module finished loading (the tune then never starts). */
  stop(fadeSec?: number): void;
  setVolume(v: number): void;
  readonly playing: boolean;
  /** true once a usable theme module was found */
  readonly available: boolean;
}

const UNLOCK = ['pointerdown', 'keydown', 'touchstart'];
type Hook = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;

export function createTitleMusic(opts: TitleMusicOptions = {}): TitleMusic {
  const load = opts.load ?? (() => import('@/audio/titleTheme'));
  const makeContext = opts.makeContext ?? ((): AudioContext | null => {
    try { const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }; const C = w.AudioContext ?? w.webkitAudioContext; return C ? new C() : null; } catch { return null; }
  });
  let volume = opts.volume ?? 0.8, ctx: AudioContext | null = null, theme: TitleThemeApi | null = null, gen = 0, busy = false, usable = false, unlock: (() => void) | null = null;
  const target = (): Hook => (opts.unlockTarget !== undefined ? opts.unlockTarget : typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'function' ? (globalThis as unknown as Hook) : null);
  const unhook = (): void => { const t = target(), f = unlock; unlock = null; if (t && f) for (const e of UNLOCK) t.removeEventListener(e, f); };
  const free = (c: AudioContext | null, fade: number): void => { if (c) setTimeout(() => { try { void c.close(); } catch { /* already closed */ } }, Math.max(0, fade) * 1000 + 300); };

  return {
    get playing(): boolean { return !!theme?.playing; },
    get available(): boolean { return usable; },
    setVolume(v: number): void { volume = v; try { theme?.setVolume(v); } catch { /* ignore */ } },
    start(): void {
      if (busy || theme) return;
      busy = true;
      const my = ++gen;
      void (async () => {
        try {
          const factory = (await load()).createTitleTheme;
          if (typeof factory !== 'function') return;
          usable = true;
          if (my !== gen) return; // stopped while loading
          const c = makeContext();
          if (!c) return;
          ctx = c;
          try { await c.resume(); } catch { /* locked: the gesture hook below resumes it */ }
          if (my !== gen) { if (ctx === c) ctx = null; free(c, 0); return; }
          const t = c.state === 'suspended' ? target() : null;
          if (t) { unlock = () => { void c.resume(); if (c.state !== 'suspended') unhook(); }; for (const e of UNLOCK) t.addEventListener(e, unlock); }
          theme = (factory as TitleThemeFactory)(c, c.destination, { volume, lookAhead: 0.4 });
          theme.start();
        } catch { theme = null; unhook(); free(ctx, 0); ctx = null; } finally { busy = false; }
      })();
    },
    stop(fadeSec = 2.5): void {
      gen++;
      unhook();
      try { theme?.stop(fadeSec); } catch { /* ignore */ }
      theme = null;
      free(ctx, fadeSec); ctx = null;
    },
  };
}
