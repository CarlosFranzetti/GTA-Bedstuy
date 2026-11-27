/** BOOMBOX: a short burst of synthesised dial static between stations. Only when the page's audio context is already running. */
export function playStatic(ctx: AudioContext | null, volume: number, ms = 220): boolean {
  if (!ctx || ctx.state !== 'running') return false;
  try {
    const n = Math.max(1, Math.floor(ctx.sampleRate * (ms / 1000)));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.06, 0.07 * Math.max(0, Math.min(1, volume)));
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start();
    return true;
  } catch { return false; }
}
