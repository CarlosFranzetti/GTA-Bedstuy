/**
 * Click-free cancel for scheduled speech (SOUNDCHECK). A speech clip is a buffer source that may be stopped at any
 * moment (the listener walks away from a pedestrian, the radio is retuned, the line is interrupted). Stopping a source
 * mid-word cuts the waveform at a non-zero sample, a step of up to the whole speech amplitude: a click. Every source is
 * routed through its own gate gain, and cancelling ramps that gate to zero over FADE_SEC before the source is stopped.
 */
export const FADE_SEC = 0.025;

export interface Gated { src: AudioScheduledSourceNode; gate: GainNode }

/** `src` -> gate -> `to`. The gate stays at 1 until a fade. */
export function gate(ctx: BaseAudioContext, src: AudioScheduledSourceNode, to: AudioNode): GainNode {
  const g = ctx.createGain();
  src.connect(g);
  g.connect(to);
  return g;
}

/**
 * Fades the gates to zero over `sec` and stops the sources just after (sources that have not started yet never start).
 * Disconnects once the fade is over; `defer` schedules that cleanup (setTimeout by default, a test can run it at once).
 */
export function fadeOutAndStop(ctx: BaseAudioContext, items: readonly Gated[], sec = FADE_SEC, defer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)): void {
  const now = ctx.currentTime;
  for (const { src, gate: g } of items) {
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(1, now);
      g.gain.linearRampToValueAtTime(0, now + sec);
    } catch { /* a node of a closed context */ }
    try { src.stop(now + sec + 0.005); } catch { /* never started or already ended */ }
  }
  defer(() => { for (const { src, gate: g } of items) { try { src.disconnect(); } catch { /* gone */ } try { g.disconnect(); } catch { /* gone */ } } }, Math.ceil(sec * 1000) + 40);
}
