/**
 * Neural in-browser TTS (Kokoro-82M through kokoro-js), run inside a Web Worker so the game never stalls.
 *
 *  - Nothing is bundled: the worker (workerSource.ts) is started from a Blob and `import()`s kokoro-js from jsDelivr;
 *    the model comes from Hugging Face and is cached by transformers.js in the Cache API.
 *  - `load()` downloads/initialises the model, then renders a warm-up sentence to measure the real-time factor. A device
 *    that renders slower than `slowRtf` is flagged `slow` and the voice layer falls back to SpeechSynthesis.
 *  - `synth()` queues requests (priority 0 = needed now, 1 = background pre-render). One request is in flight at a
 *    time; each has a timeout. `cancelAll()` drops everything queued.
 *  - Failure of any kind (import, download, worker error, timeout) rejects and sets `failed`; the caller falls back and
 *    logs a single console warning.
 */
import type { Clip, TtsEngine, TtsRequest } from './types';
import { TTS_WORKER_SOURCE } from './workerSource';

export const KOKORO_LIB_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const WARMUP_TEXT = 'Good evening, Brooklyn. You are tuned to WBSY.';

export interface WorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: any }) => void) | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  onerror: ((e: unknown) => void) | null;
}

export interface NeuralOptions {
  createWorker?: () => WorkerLike;
  lib?: string;
  model?: string;
  /** 'wasm' (default, q8, about 92 MB) or 'webgpu' (fp32, about 326 MB; falls back to wasm inside the worker). */
  device?: 'wasm' | 'webgpu';
  loadTimeoutMs?: number;
  genTimeoutMs?: number;
  /** Above this seconds-of-compute per second-of-audio the engine counts as too slow for live speech. */
  slowRtf?: number;
  onProgress?: (loaded: number, total: number) => void;
  warn?: (msg: string) => void;
  now?: () => number;
}

interface Job {
  id: number;
  req: TtsRequest;
  priority: 0 | 1;
  resolve: (c: Clip) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export function defaultWorker(source: string): WorkerLike {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const w = new Worker(url, { type: 'module' });
  return w as unknown as WorkerLike;
}

export class NeuralTts implements TtsEngine {
  readonly kind = 'neural' as const;
  private worker: WorkerLike | null = null;
  private loading: Promise<void> | null = null;
  private _ready = false;
  private _failed = false;
  private _slow = false;
  private _rtf = 0;
  private _device = '';
  private audioSeconds = 0;
  private computeSeconds = 0;
  private nextId = 1;
  private readonly queue: Job[] = [];
  private inflight: Job | null = null;
  private warned = false;
  readonly progress = { loaded: 0, total: 0 };

  constructor(private readonly opts: NeuralOptions = {}) {}

  get ready(): boolean { return this._ready && !this._failed; }
  get failed(): boolean { return this._failed; }
  get slow(): boolean { return this._slow; }
  get usable(): boolean { return this.ready && !this._slow; }
  get rtf(): number { return this._rtf; }
  get device(): string { return this._device; }
  get queued(): number { return this.queue.length + (this.inflight ? 1 : 0); }

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.doLoad().catch((e) => { this.fail(e); throw e; });
    return this.loading;
  }

  private doLoad(): Promise<void> {
    const o = this.opts;
    return new Promise<void>((resolve, reject) => {
      let w: WorkerLike;
      try {
        w = (o.createWorker ?? (() => defaultWorker(TTS_WORKER_SOURCE)))();
      } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); return; }
      this.worker = w;
      const timer = setTimeout(() => reject(new Error('HD voices: model load timed out')), o.loadTimeoutMs ?? 240_000);
      w.onerror = (e) => { clearTimeout(timer); reject(new Error(`HD voices worker error: ${String((e as { message?: string })?.message ?? e)}`)); this.fail(e); };
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') { this.progress.loaded = m.loaded; this.progress.total = m.total; o.onProgress?.(m.loaded, m.total); }
        else if (m.type === 'ready') {
          clearTimeout(timer);
          this._device = m.device ?? 'wasm';
          this._ready = true;
          w.onmessage = (ev) => this.onMessage(ev.data);
          // Warm-up: first inference is slow and tells us the real-time factor before anyone depends on it.
          this.synth({ text: WARMUP_TEXT, voice: 'af_heart', speed: 1 }, 0).then(
            () => { if (this._rtf > (o.slowRtf ?? 1.6)) { this._slow = true; this.warn(`HD voices render at ${this._rtf.toFixed(1)}x real time on this device; using system voices`); } resolve(); },
            (err) => reject(err instanceof Error ? err : new Error(String(err))),
          );
        } else if (m.type === 'error') { clearTimeout(timer); reject(new Error(m.message)); }
      };
      w.postMessage({ type: 'init', lib: o.lib ?? KOKORO_LIB_URL, model: o.model ?? KOKORO_MODEL, dtype: o.device === 'webgpu' ? 'fp32' : 'q8', device: o.device ?? 'wasm' });
    });
  }

  synth(req: TtsRequest, priority: 0 | 1 = 0): Promise<Clip> {
    if (this._failed) return Promise.reject(new Error('HD voices unavailable'));
    if (!this.worker) return Promise.reject(new Error('HD voices not loaded'));
    return new Promise<Clip>((resolve, reject) => {
      const job: Job = { id: this.nextId++, req, priority, resolve, reject, timer: null };
      this.queue.push(job);
      this.queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
      this.pump();
    });
  }

  cancelAll(): void {
    const dropped = this.queue.splice(0);
    for (const j of dropped) j.reject(new Error('cancelled'));
  }

  /** Cancels queued background pre-renders only. */
  cancelBackground(): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].priority === 1) { const [j] = this.queue.splice(i, 1); j.reject(new Error('cancelled')); }
    }
  }

  dispose(): void {
    this.cancelAll();
    if (this.inflight) { this.inflight.reject(new Error('disposed')); if (this.inflight.timer) clearTimeout(this.inflight.timer); this.inflight = null; }
    try { this.worker?.terminate(); } catch { /* ignore */ }
    this.worker = null;
    this._ready = false;
    this.loading = null;
  }

  private pump(): void {
    if (this.inflight || !this.worker || !this._ready) return;
    const job = this.queue.shift();
    if (!job) return;
    this.inflight = job;
    job.timer = setTimeout(() => { this.fail(new Error('HD voices: render timed out')); }, this.opts.genTimeoutMs ?? 90_000);
    this.worker.postMessage({ type: 'gen', id: job.id, text: job.req.text, voice: job.req.voice, speed: job.req.speed });
  }

  private onMessage(m: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    const job = this.inflight;
    if (m.type === 'clip' && job && m.id === job.id) {
      if (job.timer) clearTimeout(job.timer);
      this.inflight = null;
      const dur = m.samples.length / m.sr;
      if (dur > 0.3) {
        this.audioSeconds += dur;
        this.computeSeconds += m.ms / 1000;
        this._rtf = this.computeSeconds / this.audioSeconds;
      }
      job.resolve({ samples: m.samples, sampleRate: m.sr });
      this.pump();
    } else if (m.type === 'error') {
      if (job && (m.id === undefined || m.id === job.id)) {
        if (job.timer) clearTimeout(job.timer);
        this.inflight = null;
        job.reject(new Error(m.message));
        this.pump();
      }
    }
  }

  private fail(e: unknown): void {
    if (this._failed) return;
    this._failed = true;
    this._ready = false;
    this.warn(`HD voices failed (${e instanceof Error ? e.message : String(e)}); using system voices`);
    const err = e instanceof Error ? e : new Error(String(e));
    if (this.inflight) { if (this.inflight.timer) clearTimeout(this.inflight.timer); this.inflight.reject(err); this.inflight = null; }
    for (const j of this.queue.splice(0)) j.reject(err);
    try { this.worker?.terminate(); } catch { /* ignore */ }
    this.worker = null;
  }

  private warn(msg: string): void {
    if (this.warned) return;
    this.warned = true;
    (this.opts.warn ?? ((m: string) => console.warn(m)))(msg);
  }
}
