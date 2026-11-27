/**
 * AMBIENT, 27 Nov 2026 (owner: "don't have the theme song playing while loading cuz the buffering stops it"): the loading screen
 * is SILENT by default. The theme is a main-thread sequencer (a timer, 0.6 s of notes scheduled ahead, a late note is dropped), and
 * the world build blocks the main thread for longer than that, so the beat stopped and the notes came back off the grid. The title
 * theme starts on the title screen as before. `enabled` (or `?loadmusic=1` in the address) brings the old behaviour back for comparison.
 *
 * Loading-screen music (when enabled): starts the synthesized loading theme (src/audio/loadingTheme.ts) on the first user gesture and
 * fades it out when loading completes. Self-contained: it makes its own AudioContext (the game's AudioSystem does not
 * exist yet while the world builds) and closes it again after the fade, so nothing is left behind.
 *
 * Feature-detected: if the theme module is missing or incomplete, if the browser has no Web Audio, or if anything throws,
 * start() quietly does nothing. The theme is imported lazily, so it never delays the first paint.
 */
import { storedMusicGain } from '@/audio/Mixer';

export interface ThemeApi {
  start(): void;
  stop(fadeSec?: number): void;
  setVolume(v: number): void;
  readonly playing: boolean;
}
export type ThemeFactory = (ctx: BaseAudioContext, dest: AudioNode, opts?: { volume?: number; lookAhead?: number }) => ThemeApi;

export interface LoadingMusicOptions {
  volume?: number;
  /** Play the theme at all. Default false (silent loading), or true when the address has `?loadmusic=1`. */
  enabled?: boolean;
  /** Override the module loader (tests). */
  load?: () => Promise<{ createLoadingTheme?: unknown }>;
  /** Override the context factory (tests). Return null when Web Audio is unavailable. */
  makeContext?: () => AudioContext | null;
}

export interface LoadingMusic {
  /** Call from the first user gesture. Safe to call more than once. */
  start(): void;
  /** Fade out and free everything. Safe before start() finished loading (the tune then never starts). */
  stop(fadeSec?: number): void;
  readonly playing: boolean;
  /** true when start() found a usable theme module */
  readonly available: boolean;
}

function wantedByUrl(): boolean {
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('loadmusic') === '1'; } catch { return false; }
}

function defaultContext(): AudioContext | null {
  try {
    const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch { return null; }
}

export function createLoadingMusic(opts: LoadingMusicOptions = {}): LoadingMusic {
  const enabled = opts.enabled ?? wantedByUrl();
  const load = opts.load ?? (() => import('@/audio/loadingTheme'));
  const makeContext = opts.makeContext ?? defaultContext;
  let ctx: AudioContext | null = null;
  let theme: ThemeApi | null = null;
  let started = false;
  let stopped = false;
  let usable = false;

  const free = (fade: number): void => {
    const c = ctx;
    ctx = null;
    if (!c) return;
    setTimeout(() => { try { void c.close(); } catch { /* already closed */ } }, Math.max(0, fade) * 1000 + 300);
  };

  return {
    get playing(): boolean { return !!theme?.playing; },
    get available(): boolean { return usable; },
    start(): void {
      if (started || stopped || !enabled) return;
      started = true;
      void (async () => {
        try {
          const mod = await load();
          const factory = mod.createLoadingTheme;
          if (typeof factory !== 'function') return;
          usable = true;
          if (stopped) return; // loading already finished
          ctx = makeContext();
          if (!ctx) return;
          try { await ctx.resume(); } catch { /* resumes with the gesture anyway */ }
          if (stopped) { free(0); return; }
          // a long lookahead rides out the short main-thread stalls of the synchronous build stages
          theme = (factory as ThemeFactory)(ctx, ctx.destination, { volume: (opts.volume ?? 0.8) * storedMusicGain(), lookAhead: 0.6 });
          theme.start();
        } catch { theme = null; free(0); }
      })();
    },
    stop(fadeSec = 0.8): void {
      stopped = true;
      try { theme?.stop(fadeSec); } catch { /* ignore */ }
      theme = null;
      free(fadeSec);
    },
  };
}
