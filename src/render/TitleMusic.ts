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

function defaultContext(): AudioContext | null {
  try {
    const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch { return null; }
}
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'];

export function createTitleMusic(opts: TitleMusicOptions = {}): TitleMusic {
  const load = opts.load ?? (() => import('@/audio/titleTheme'));
  const makeContext = opts.makeContext ?? defaultContext;
  let volume = opts.volume ?? 0.8;
  let ctx: AudioContext | null = null;
  let theme: TitleThemeApi | null = null;
  let gen = 0; // bumped by every start() and stop(): a stale async start sees the change and gives up
  let busy = false;
  let usable = false;
  let unlock: (() => void) | null = null;

  const target = (): OptionalTarget => (opts.unlockTarget !== undefined ? opts.unlockTarget : (typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'function' ? (globalThis as unknown as OptionalTarget) : null));
  type OptionalTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  const unhook = (): void => {
    if (!unlock) return;
    const t = target(), f = unlock; unlock = null;
    if (t) for (const e of UNLOCK_EVENTS) { try { t.removeEventListener(e, f); } catch { /* ignore */ } }
  };
  const hook = (c: AudioContext): void => {
    const t = target();
    if (!t) return;
    unlock = () => { try { void c.resume(); } catch { /* ignore */ } if (c.state !== 'suspended') unhook(); };
    for (const e of UNLOCK_EVENTS) { try { t.addEventListener(e, unlock); } catch { /* ignore */ } }
  };
  const free = (c: AudioContext | null, fade: number): void => {
    if (!c) return;
    setTimeout(() => { try { void c.close(); } catch { /* already closed */ } }, Math.max(0, fade) * 1000 + 300);
  };

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
          const mod = await load();
          const factory = mod.createTitleTheme;
          if (typeof factory !== 'function') return;
          usable = true;
          if (my !== gen) return; // stopped while loading
          const c = makeContext();
          if (!c) return;
          ctx = c;
          try { await c.resume(); } catch { /* locked: the gesture hook below resumes it */ }
          if (my !== gen) { if (ctx === c) ctx = null; free(c, 0); return; }
          if (c.state === 'suspended') hook(c);
          theme = (factory as TitleThemeFactory)(c, c.destination, { volume, lookAhead: 0.4 });
          theme.start();
        } catch { theme = null; unhook(); const c = ctx; ctx = null; free(c, 0); } finally { busy = false; }
      })();
    },
    stop(fadeSec = 2.5): void {
      gen++;
      unhook();
      try { theme?.stop(fadeSec); } catch { /* ignore */ }
      theme = null;
      const c = ctx; ctx = null;
      free(c, fadeSec);
    },
  };
}
