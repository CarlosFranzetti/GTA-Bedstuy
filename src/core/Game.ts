/** Fixed-step simulation (60 Hz) + per-frame render. */
export interface Updatable { update(dt: number): void; }

export class Game {
  readonly step = 1 / 60;
  private acc = 0;
  private last = 0;
  private raf = 0;
  paused = false;
  readonly systems: Updatable[] = [];
  constructor(private render: (alpha: number) => void, private endFrame: () => void = () => {}) {}
  add(s: Updatable): this { this.systems.push(s); return this; }
  start(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const frame = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      let n = 0;
      if (!this.paused) {
        this.acc += frame;
        while (this.acc >= this.step && n++ < 5) { for (const s of this.systems) s.update(this.step); this.acc -= this.step; }
      }
      this.render(this.acc / this.step);
      // Only reset edge-triggered input once a simulation step has had the chance to consume it
      // (at >60 Hz display rates some frames run zero steps).
      if (n > 0) this.endFrame();
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop(): void { cancelAnimationFrame(this.raf); }
}
