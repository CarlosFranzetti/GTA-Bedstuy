/**
 * `?debug=audio`: an on-screen panel for a person who still hears the stutter (AMBIENT, 27 Nov 2026). It shows the audio context's state,
 * sample rate and base and output latency, how many audio nodes the game makes a second and how many sources are alive, how many
 * parameter writes a second, and any main-thread callback that ran more than 100 ms late (the thing that starves a sequencer). A line per
 * environment source can be clicked to mute it, so the owner can find out which sound he hears (same switch as `?mute=`, see mutes.ts).
 * Off unless the address has `debug=audio` (or `debug=...,audio`); costs nothing when off.
 */
import { AMBIENT_SOURCES, type SourceMutes } from './mutes';

export function audioDebugWanted(search: string): boolean {
  try { return (new URLSearchParams(search).get('debug') ?? '').split(',').includes('audio'); } catch { return false; }
}

export interface DebugRates { nodes: number; writes: number }
const counts = { nodes: 0, writes: 0, live: 0, patched: false };

/** Wraps node creation and AudioParam writes once per page, counting them. Only ever called when the panel is wanted. */
export function patchAudioForDebug(): void {
  if (counts.patched || typeof BaseAudioContext === 'undefined') return;
  counts.patched = true;
  const P = AudioParam.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'setValueCurveAtTime']) {
    const orig = P[m];
    if (typeof orig === 'function') P[m] = function (this: AudioParam, ...a: unknown[]) { counts.writes++; return orig.apply(this, a); };
  }
  const C = BaseAudioContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    const orig = C[k];
    if (!k.startsWith('create') || k === 'createBuffer' || k === 'createPeriodicWave' || typeof orig !== 'function') continue;
    const source = k === 'createBufferSource' || k === 'createOscillator' || k === 'createConstantSource';
    C[k] = function (this: BaseAudioContext, ...a: unknown[]) {
      counts.nodes++;
      const n = orig.apply(this, a);
      if (source && n && typeof (n as AudioScheduledSourceNode).addEventListener === 'function') { counts.live++; (n as AudioScheduledSourceNode).addEventListener('ended', () => { counts.live--; }); }
      return n;
    };
  }
}

export interface LateEntry { at: number; ms: number }

export class AudioDebug {
  private ctx: BaseAudioContext | null = null;
  private el: HTMLElement | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private last = { n: 0, w: 0, t: 0 };
  private rates: DebugRates = { nodes: 0, writes: 0 };
  readonly late: LateEntry[] = [];
  /** how far the audio clock fell behind the wall clock in the worst 50 ms interval of the last 10 s (a device underrun or a suspended context) */
  clockLagMs = 0;

  constructor(private readonly mutes: SourceMutes, private readonly doc: Document | null = typeof document !== 'undefined' ? document : null, private readonly now: () => number = () => performance.now()) {}

  attach(ctx: BaseAudioContext): void {
    patchAudioForDebug();
    this.ctx = ctx;
    this.last = { n: counts.nodes, w: counts.writes, t: this.now() };
    this.start();
  }

  /** Called by the watchdog every 50 ms; exposed so a test can drive it. */
  beat(expectedMs: number, actualMs: number, atSec: number): void {
    const over = actualMs - expectedMs;
    if (over > 100) { this.late.push({ at: atSec, ms: Math.round(over) }); if (this.late.length > 40) this.late.shift(); }
  }

  private start(): void {
    if (this.timers.length || !this.doc) return;
    let prev = this.now(), prevAudio = this.ctx?.currentTime ?? 0;
    const lagHist: number[] = [];
    this.timers.push(setInterval(() => {
      const t = this.now();
      this.beat(50, t - prev, t / 1000);
      const a = this.ctx?.currentTime ?? 0;
      if (this.ctx && (this.ctx as AudioContext).state === 'running') {
        const lag = (t - prev) - (a - prevAudio) * 1000;
        lagHist.push(lag); if (lagHist.length > 200) lagHist.shift();
        this.clockLagMs = Math.max(0, Math.round(Math.max(...lagHist)));
      }
      prev = t; prevAudio = a;
    }, 50));
    this.timers.push(setInterval(() => this.draw(), 250));
  }

  private draw(): void {
    const d = this.doc, c = this.ctx as AudioContext | null;
    if (!d || !c) return;
    const t = this.now(), dt = Math.max(1, (t - this.last.t) / 1000);
    if (dt >= 1) { this.rates = { nodes: Math.round((counts.nodes - this.last.n) / dt), writes: Math.round((counts.writes - this.last.w) / dt) }; this.last = { n: counts.nodes, w: counts.writes, t }; }
    if (!this.el) {
      const el = d.createElement('div'); el.setAttribute('data-audio-debug', '');
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(0,0,0,.78);color:#cfe;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:6px 8px;border-radius:4px;max-width:340px;pointer-events:auto;white-space:pre-wrap';
      d.body.appendChild(el); this.el = el;
    }
    const lateNow = this.late.filter((l) => l.at > t / 1000 - 10);
    const lines = [
      `audio  ${c.state}  ${c.sampleRate} Hz`,
      `latency  base ${((c.baseLatency ?? 0) * 1000).toFixed(1)} ms  output ${(((c as AudioContext).outputLatency ?? 0) * 1000).toFixed(1)} ms`,
      `nodes made/s ${this.rates.nodes}  live sources ${counts.live}  param writes/s ${this.rates.writes}`,
      `late callbacks (>100 ms) last 10 s: ${lateNow.length}${lateNow.length ? '  worst ' + Math.max(...lateNow.map((l) => l.ms)) + ' ms' : ''}`,
      `audio clock fell behind by up to ${this.clockLagMs} ms`,
      'click a source to mute it:',
    ];
    this.el.textContent = lines.join('\n') + '\n';
    for (const s of AMBIENT_SOURCES) {
      const b = d.createElement('button'); b.type = 'button';
      const off = this.mutes.muted(s.id);
      b.textContent = `${off ? '[x]' : '[ ]'} ${s.id}`;
      b.title = s.label;
      b.style.cssText = `margin:1px 3px 1px 0;font:inherit;padding:0 4px;color:${off ? '#f88' : '#cfe'};background:#123;border:1px solid #456;border-radius:3px;cursor:pointer`;
      b.addEventListener('click', () => { this.mutes.toggle(s.id); this.draw(); });
      this.el.appendChild(b);
    }
  }

  dispose(): void { for (const t of this.timers) clearInterval(t); this.timers = []; this.el?.remove(); this.el = null; }
}
