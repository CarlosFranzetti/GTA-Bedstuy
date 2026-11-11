/**
 * `?debug=gfx` only. Reads a few pixels of the frame that was just drawn and counts frames whose brightness jumps away
 * from the recent usual value (a whole-screen blink) or is black while the usual frame is not. A person who sees flicker
 * on real hardware can then tell us which kind it is: if the screen blinks and these counters stay at zero, the drawn
 * picture is steady and the blink happens after us (page overlay, browser compositor); if they climb, the renderer drew it.
 */
export interface PixelReader {
  /** fills `out` (RGBA, one pixel) with the drawing-buffer pixel at device coordinates x, y */
  read(x: number, y: number, out: Uint8Array): void;
}

/** Sample points as fractions of the buffer: centre and four inner corners. */
const POINTS: ReadonlyArray<readonly [number, number]> = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]];
const HISTORY = 90;
/** brightness jump (0..255) against the usual value that counts as a blink */
export const BLINK_JUMP = 45;

export class BlinkProbe {
  private readonly px = new Uint8Array(4);
  private readonly hist = new Float32Array(HISTORY);
  private readonly sorted = new Float32Array(HISTORY);
  private n = 0;
  private at = 0;
  private wasOff = false;
  frames = 0;
  /** frames that jumped away from the usual brightness (counted once per jump, not per frame it lasts) */
  blinks = 0;
  /** frames that were black while the usual frame is not */
  blackFrames = 0;
  /** brightness of the last blink frame and the usual brightness at that moment (0..255) */
  lastBlinkLuma = -1;
  lastUsualLuma = -1;
  /** counters the host bumps: buffer reallocations and quality switches also blink the screen */
  resizes = 0;
  tierSwitches = 0;

  /** Usual brightness: median of the recent frames (0 until there is history). */
  get usual(): number {
    if (this.n < 10) return 0;
    for (let i = 0; i < this.n; i++) this.sorted[i] = this.hist[i];
    const s = this.sorted.subarray(0, this.n).sort();
    return s[this.n >> 1];
  }

  /** Call right after the frame was drawn, in the same task. `w`, `h`: drawing-buffer size in device pixels. */
  sample(reader: PixelReader, w: number, h: number): void {
    if (!(w > 1 && h > 1)) return;
    let sum = 0;
    for (const [fx, fy] of POINTS) {
      reader.read(Math.floor(w * fx), Math.floor(h * fy), this.px);
      sum += 0.2126 * this.px[0] + 0.7152 * this.px[1] + 0.0722 * this.px[2];
    }
    this.push(sum / POINTS.length);
  }

  /** Records one frame's mean brightness (0..255). Split from `sample` so it can be tested without a GL context. */
  push(luma: number): void {
    this.frames++;
    const usual = this.usual;
    const off = this.n >= 10 && Math.abs(luma - usual) > BLINK_JUMP;
    if (off && !this.wasOff) { this.blinks++; this.lastBlinkLuma = Math.round(luma); this.lastUsualLuma = Math.round(usual); }
    if (this.n >= 10 && luma < 2 && usual > 12) this.blackFrames++;
    this.wasOff = off;
    // a frame that is far off does not enter the history, so one blink cannot drag the usual value towards itself
    if (!off || this.n < 10) { this.hist[this.at] = luma; this.at = (this.at + 1) % HISTORY; if (this.n < HISTORY) this.n++; }
    // a lasting change (day turning to night, a tunnel) must be accepted as the new usual: after a second of "off", reset
    if (off) { if (++this.offRun > 60) { this.n = 0; this.at = 0; this.offRun = 0; this.wasOff = false; } } else this.offRun = 0;
  }
  private offRun = 0;

  /** Numbers for the overlay's stats line. */
  report(): Record<string, number> {
    return {
      'frames sampled': this.frames, 'blink frames': this.blinks, 'black frames': this.blackFrames,
      'last blink brightness': this.lastBlinkLuma, 'usual brightness then': this.lastUsualLuma,
      'buffer resizes': this.resizes, 'quality switches': this.tierSwitches,
    };
  }
}
