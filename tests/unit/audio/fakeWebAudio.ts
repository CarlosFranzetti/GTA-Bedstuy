/**
 * A recording fake of Web Audio for lifecycle tests (AUDIOFIX). Unlike the permissive fakes in the other audio tests it keeps a
 * timeline per AudioParam (events with times, pruned the way a browser prunes them as the clock passes), rejects NaN and Infinity,
 * counts sources that were started and not stopped, and lets suspend() and resume() settle LATER (`settle()`), as they do in a
 * real browser: the context state does not change in the same task as the call.
 */

export interface ParamEvent { kind: 'set' | 'lin' | 'exp' | 'target'; v: number; t: number; tc?: number }

export class RecParam {
  value = 0;
  events: ParamEvent[] = [];
  total = 0;
  /** most events ever held at once (what the audio thread has to keep sorted) */
  peak = 0;
  constructor(private readonly ctx: RecCtx, public readonly name: string, def = 0) { this.value = def; }
  private add(e: ParamEvent): void {
    if (!Number.isFinite(e.v) || !Number.isFinite(e.t) || (e.tc !== undefined && !Number.isFinite(e.tc))) { this.ctx.bad.push(`${this.name}: ${e.kind}(${e.v}, ${e.t}, ${e.tc})`); return; }
    this.total++;
    this.ctx.writes++;
    this.events.push(e);
    this.events.sort((a, b) => a.t - b.t);
    // a browser drops events that are behind the clock, keeping the last one as the starting point
    const now = this.ctx.currentTime;
    while (this.events.length > 1 && this.events[1].t <= now) this.events.shift();
    this.peak = Math.max(this.peak, this.events.length);
    this.value = e.v;
  }
  setValueAtTime(v: number, t: number) { this.add({ kind: 'set', v, t }); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.add({ kind: 'lin', v, t }); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.add({ kind: 'exp', v, t }); return this; }
  setTargetAtTime(v: number, t: number, tc: number) { this.add({ kind: 'target', v, t, tc }); return this; }
  cancelScheduledValues(t: number) { this.events = this.events.filter((e) => e.t < t); return this; }
}

export class RecNode {
  started = false; stopped = false; connections: unknown[] = []; disconnected = false;
  type = 'sine'; loop = false; buffer: unknown = null; curve: unknown = null;
  gain: RecParam; frequency: RecParam; detune: RecParam; Q: RecParam; pan: RecParam;
  constructor(readonly ctx: RecCtx, readonly kind: string) {
    this.gain = new RecParam(ctx, `${kind}.gain`, 1); this.frequency = new RecParam(ctx, `${kind}.frequency`, 440); this.detune = new RecParam(ctx, `${kind}.detune`);
    this.Q = new RecParam(ctx, `${kind}.Q`, 1); this.pan = new RecParam(ctx, `${kind}.pan`);
  }
  connect(d: unknown) { this.connections.push(d); return d; }
  disconnect() { this.disconnected = true; }
  setPeriodicWave() { /* nothing */ }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}

export class RecCtx {
  currentTime = 0;
  sampleRate = 44100;
  state: 'running' | 'suspended' | 'closed' = 'running';
  nodes: RecNode[] = [];
  bad: string[] = [];
  writes = 0;
  suspends = 0; resumes = 0;
  private pending: Array<'suspended' | 'running'> = [];
  destination = new RecNode(this, 'destination');
  private mk(kind: string): RecNode { const n = new RecNode(this, kind); this.nodes.push(n); return n; }
  createGain() { return this.mk('gain'); }
  createOscillator() { return this.mk('osc'); }
  createBiquadFilter() { return this.mk('biquad'); }
  createBufferSource() { return this.mk('src'); }
  createStereoPanner() { return this.mk('pan'); }
  createWaveShaper() { return this.mk('shaper'); }
  createDynamicsCompressor() { const n = this.mk('comp'); (n as unknown as Record<string, RecParam>).threshold = new RecParam(this, 'th'); (n as unknown as Record<string, RecParam>).knee = new RecParam(this, 'kn'); (n as unknown as Record<string, RecParam>).ratio = new RecParam(this, 'ra'); (n as unknown as Record<string, RecParam>).attack = new RecParam(this, 'at'); (n as unknown as Record<string, RecParam>).release = new RecParam(this, 're'); return n; }
  createPeriodicWave() { return {}; }
  createBuffer(_c: number, len: number) { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
  suspend() { this.suspends++; this.pending.push('suspended'); return Promise.resolve(); }
  resume() { this.resumes++; this.pending.push('running'); return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  /** the audio thread processes the queued suspend and resume requests, in order */
  settle(): void { for (const s of this.pending.splice(0)) this.state = s; }
  /** a clock tick: only a running context advances */
  advance(dt: number): void { if (this.state === 'running') this.currentTime += dt; }
  get liveSources(): RecNode[] { return this.nodes.filter((n) => (n.kind === 'osc' || n.kind === 'src') && n.started && !n.stopped); }
  get maxPeak(): number { return Math.max(0, ...this.nodes.flatMap((n) => [n.gain.peak, n.frequency.peak, n.detune.peak, n.Q.peak, n.pan.peak])); }
}
