/**
 * Frame-time statistics, automatic quality drop and a JS heap growth watchdog.
 * All maths are pure/testable; `PerfMonitor` wires them to a quality callback.
 */
import type { Quality } from '@/render/Shadows';

/** Fixed-capacity ring buffer of frame times (ms). */
export class FrameRing {
  private readonly buf: Float32Array;
  private n = 0;
  private head = 0;
  constructor(readonly capacity = 600) { this.buf = new Float32Array(capacity); }
  push(ms: number): void {
    this.buf[this.head] = ms;
    this.head = (this.head + 1) % this.capacity;
    if (this.n < this.capacity) this.n++;
  }
  get length(): number { return this.n; }
  clear(): void { this.n = 0; this.head = 0; }
  /** Copy of the stored samples (unordered) into `out` (resized if needed); returns the sample count. */
  copyTo(out: Float32Array): number {
    out.set(this.buf.subarray(0, this.n));
    return this.n;
  }
  mean(): number {
    if (this.n === 0) return 0;
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.buf[i];
    return s / this.n;
  }
}

/**
 * "1% low" fps: the average fps over the slowest 1% of frames (at least one frame). `scratch` must have room for the
 * ring contents and is reused to avoid allocation. Returns 0 for an empty ring.
 */
export function onePercentLowFps(ring: FrameRing, scratch: Float32Array = new Float32Array(ring.capacity)): number {
  const n = ring.copyTo(scratch);
  if (n === 0) return 0;
  const view = scratch.subarray(0, n);
  view.sort(); // ascending, numeric for typed arrays
  const k = Math.max(1, Math.ceil(n * 0.01));
  let s = 0;
  for (let i = n - k; i < n; i++) s += view[i];
  const avgMs = s / k;
  return avgMs > 0 ? 1000 / avgMs : 0;
}

export interface HeapSample { t: number; bytes: number; }

/**
 * Heap growth in MB/min using the "floor" of two consecutive windows (GC makes the raw heap a saw-tooth, the minimum
 * of each window is what leaks show up in). Needs samples covering at least two windows; returns 0 otherwise.
 * `t` is in seconds.
 */
export function heapGrowthMBPerMin(samples: readonly HeapSample[], windowSec = 30): number {
  if (samples.length < 4) return 0;
  const tEnd = samples[samples.length - 1].t;
  if (tEnd - samples[0].t < windowSec * 2 * 0.9) return 0;
  let minA = Infinity, minB = Infinity;
  for (const s of samples) {
    if (s.t > tEnd - windowSec) minB = Math.min(minB, s.bytes);
    else if (s.t > tEnd - windowSec * 2) minA = Math.min(minA, s.bytes);
  }
  if (!isFinite(minA) || !isFinite(minB)) return 0;
  return ((minB - minA) / (1024 * 1024)) * (60 / windowSec);
}

/** Seconds of play before the touch low -> phone fallback starts counting. */
const PHONE_WARMUP_SECONDS = 2;

export interface PerfOptions {
  /** current quality getter */
  getQuality: () => Quality;
  /** applies a new quality (pipeline + shadows) */
  setQuality: (q: Quality) => void;
  /** seconds of play before the auto-drop check */
  settleSeconds?: number;
  /** 1% low fps threshold below which medium drops to low */
  minLowFps?: number;
  /** disable the auto-drop (explicit ?q= on the URL, review scripts) */
  autoDrop?: boolean;
  /** touch device: `low` steps down to `phone` when the frame rate stays under `phoneFps` for `phoneSeconds` */
  touch?: boolean;
  /** fps below which a touch device at `low` steps down to `phone` (default 30) */
  phoneFps?: number;
  /** seconds the rate must stay under `phoneFps` (default 8) */
  phoneSeconds?: number;
  /** MB/min that triggers the console warning */
  heapWarnMBPerMin?: number;
  log?: (msg: string) => void;
}

interface PerfMemory { usedJSHeapSize: number; }

export class PerfMonitor {
  readonly ring = new FrameRing(600);
  private readonly scratch = new Float32Array(600);
  private playTime = 0;
  private dropped = false;
  /** smoothed frame time (s) and how long it has stayed above the phone-fallback threshold */
  private lastDt = 0;
  private emaDt = 0;
  private slowSeconds = 0;
  private lowFps = 0;
  private sinceLow = 0;
  private heap: HeapSample[] = [];
  private sinceHeap = 0;
  private lastHeapWarn = -Infinity;
  private clock = 0;
  heapMBPerMin = 0;
  private readonly opts: Required<Omit<PerfOptions, 'getQuality' | 'setQuality'>> & Pick<PerfOptions, 'getQuality' | 'setQuality'>;

  constructor(opts: PerfOptions) {
    this.opts = {
      settleSeconds: 8, minLowFps: 40, autoDrop: true, heapWarnMBPerMin: 50, touch: false, phoneFps: 30, phoneSeconds: 8,
      log: (m) => console.warn(m),
      ...opts,
    };
  }

  /** Menu > Graphics > Auto: turns the automatic tier drop on or off at run time. */
  setAutoDrop(on: boolean): void { this.opts.autoDrop = on; }

  /** 1% low fps over the last ~600 frames (0 until at least one frame was recorded). */
  get fps1pctLow(): number { return this.lowFps; }
  get droppedQuality(): boolean { return this.dropped; }

  /** Call once per rendered frame with the real frame time in seconds. Hitches over 1 s (tab switches) are ignored. */
  frame(dtSeconds: number): void {
    if (!(dtSeconds > 0) || dtSeconds > 1) return;
    this.lastDt = dtSeconds;
    this.ring.push(dtSeconds * 1000);
    this.playTime += dtSeconds;
    this.clock += dtSeconds;
    this.sinceLow += dtSeconds;
    if (this.sinceLow >= 0.5) { this.sinceLow = 0; this.lowFps = onePercentLowFps(this.ring, this.scratch); }
    this.checkDrop();
    this.sinceHeap += dtSeconds;
    if (this.sinceHeap >= 2) { this.sinceHeap = 0; this.sampleHeap(); }
  }

  /** Forget history (call after a quality change so old frames do not count against the new setting). */
  reset(): void { this.ring.clear(); this.playTime = 0; this.lowFps = 0; this.sinceLow = 0; this.emaDt = 0; this.slowSeconds = 0; }

  private checkDrop(): void {
    const o = this.opts;
    if (!o.autoDrop) return;
    // touch devices: low -> phone once the (smoothed) frame rate has stayed under phoneFps for phoneSeconds in a row
    // (counting starts after a short warm-up so the first frames' shader compiles do not count)
    if (o.touch && o.getQuality() === 'low') {
      if (this.playTime < PHONE_WARMUP_SECONDS) return;
      this.emaDt = this.emaDt === 0 ? this.lastDt : this.emaDt + (this.lastDt - this.emaDt) * 0.1;
      if (this.emaDt > 1 / o.phoneFps) this.slowSeconds += this.lastDt; else this.slowSeconds = 0;
      if (this.slowSeconds >= o.phoneSeconds) {
        o.log(`[perf] ${(1 / this.emaDt).toFixed(1)} fps < ${o.phoneFps} for ${o.phoneSeconds} s at low on a touch device: dropping to phone quality`);
        o.setQuality('phone');
        this.reset();
      }
      return;
    }
    if (this.playTime < o.settleSeconds || this.dropped || this.ring.length < 120) return;
    if (o.getQuality() !== 'medium') return;
    const low = onePercentLowFps(this.ring, this.scratch);
    this.lowFps = low;
    if (low < o.minLowFps) {
      this.dropped = true;
      o.log(`[perf] 1% low ${low.toFixed(1)} fps < ${o.minLowFps} at medium: dropping to low quality`);
      o.setQuality('low');
      this.reset();
    }
  }

  private readHeap(): number | null {
    const m = (globalThis.performance as unknown as { memory?: PerfMemory } | undefined)?.memory;
    return m && typeof m.usedJSHeapSize === 'number' ? m.usedJSHeapSize : null;
  }

  private sampleHeap(): void {
    const bytes = this.readHeap();
    if (bytes === null) return;
    this.heap.push({ t: this.clock, bytes });
    const cutoff = this.clock - 61;
    let drop = 0;
    while (drop < this.heap.length && this.heap[drop].t < cutoff) drop++;
    if (drop > 0) this.heap.splice(0, drop);
    this.heapMBPerMin = heapGrowthMBPerMin(this.heap);
    if (this.heapMBPerMin > this.opts.heapWarnMBPerMin && this.clock - this.lastHeapWarn > 60) {
      this.lastHeapWarn = this.clock;
      this.opts.log(`[perf] JS heap growing ${this.heapMBPerMin.toFixed(0)} MB/min (allocation in a hot loop?)`);
    }
  }
}

// ---------------------------------------------------------------- per-pass draw-call counter

/** Minimal slice of THREE.WebGLRenderer that PassCounter needs (keeps this file free of a three import). */
export interface CountableRenderer {
  render(scene: unknown, camera: unknown): void;
  shadowMap: { render(lights: unknown, scene: unknown, camera: unknown): void };
  info: { render: { calls: number; triangles: number } };
}

/**
 * Splits renderer.info.render.calls into passes. The composer calls renderer.render once per pass (the shadow map is
 * rendered from inside the first call), so the n-th call of a frame is pass n:
 *   pass 0 = the main scene render (minus the shadow pass nested in it),
 *   pass `gbufferIndex` = GTAO's scene re-render with the normal override material (medium/high only),
 *   everything else = full-screen post quads.
 * Call `beginFrame()` right before the composer renders. No allocation per frame.
 */
export class PassCounter {
  shadow = 0;
  scene = 0;
  gbuffer = 0;
  post = 0;
  /** Index of the G-buffer pass (1 when GTAO is on, -1 otherwise). */
  gbufferIndex = -1;
  /** Triangles per pass (same split as the draw calls). */
  shadowTris = 0;
  sceneTris = 0;
  gbufferTris = 0;
  private pass = 0;
  private shadowInPass = 0;
  private shadowTrisInPass = 0;

  get total(): number { return this.shadow + this.scene + this.gbuffer + this.post; }
  get totalTris(): number { return this.shadowTris + this.sceneTris + this.gbufferTris; }

  beginFrame(): void {
    this.shadow = 0; this.scene = 0; this.gbuffer = 0; this.post = 0; this.pass = 0; this.shadowInPass = 0;
    this.shadowTris = 0; this.sceneTris = 0; this.gbufferTris = 0; this.shadowTrisInPass = 0;
  }

  /** Adds the calls of one renderer.render invocation (`shadowCalls` of them were the nested shadow pass). */
  record(calls: number, tris = 0): void {
    const own = Math.max(0, calls - this.shadowInPass);
    const ownTris = Math.max(0, tris - this.shadowTrisInPass);
    this.shadowInPass = 0; this.shadowTrisInPass = 0;
    if (this.pass === 0) { this.scene += own; this.sceneTris += ownTris; }
    else if (this.pass === this.gbufferIndex) { this.gbuffer += own; this.gbufferTris += ownTris; }
    else this.post += own;
    this.pass++;
  }
  recordShadow(calls: number, tris = 0): void { this.shadow += calls; this.shadowInPass += calls; this.shadowTris += tris; this.shadowTrisInPass += tris; }

  /** Wraps renderer.render and renderer.shadowMap.render. Returns a function that restores the originals. */
  attach(renderer: CountableRenderer): () => void {
    const render = renderer.render, shadowRender = renderer.shadowMap.render;
    renderer.render = (scene, camera) => {
      const before = renderer.info.render.calls, t0 = renderer.info.render.triangles;
      render.call(renderer, scene, camera);
      this.record(renderer.info.render.calls - before, renderer.info.render.triangles - t0);
    };
    renderer.shadowMap.render = (lights, scene, camera) => {
      const before = renderer.info.render.calls, t0 = renderer.info.render.triangles;
      shadowRender.call(renderer.shadowMap, lights, scene, camera);
      this.recordShadow(renderer.info.render.calls - before, renderer.info.render.triangles - t0);
    };
    return () => { renderer.render = render; renderer.shadowMap.render = shadowRender; };
  }
}
