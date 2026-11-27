/**
 * AudioContext for the title and loading music (AMBIENT, 27 Nov 2026). Music has no use for the smallest output buffer: `playback`
 * asks the browser for a larger one, which rides out a busy main thread or GPU better than the default `interactive`. The game's own
 * context (AudioSystem) already asks for `balanced`; sound effects and engines there need the shorter buffer.
 */
export function makeMusicContext(Ctor: new (o?: AudioContextOptions) => AudioContext): AudioContext {
  try { return new Ctor({ latencyHint: 'playback' }); } catch { return new Ctor(); }
}
