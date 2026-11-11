/**
 * WebGL context loss without a black screen. three.js re-creates its GL state on `webglcontextrestored` by itself, but only if the
 * lost event was default-prevented, and the game loop must not keep stepping the composer into a dead context. This guard
 * prevents the default, reports the state (so the loop can skip rendering and show a notice), and after a restore asks for a
 * full resize + shadow refresh. If no restore arrives within `giveUpMs`, `onGiveUp` is called (offer a reload).
 */
export interface ContextGuardOptions {
  onLost?: () => void;
  /** after a restore: re-apply sizes, force shadow / proxy refresh, drop caches that hold GL objects */
  onRestored?: () => void;
  onGiveUp?: () => void;
  giveUpMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export class ContextGuard {
  private lost = false;
  private timer: unknown = null;
  lostCount = 0;
  restoredCount = 0;

  constructor(private readonly target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, private readonly o: ContextGuardOptions = {}) {
    target.addEventListener('webglcontextlost', this.handleLost as EventListener);
    target.addEventListener('webglcontextrestored', this.handleRestored as EventListener);
  }

  /** True while the context is gone: skip render() and step the simulation only. */
  get isLost(): boolean { return this.lost; }

  dispose(): void {
    this.target.removeEventListener('webglcontextlost', this.handleLost as EventListener);
    this.target.removeEventListener('webglcontextrestored', this.handleRestored as EventListener);
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timer !== null) { (this.o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.timer); this.timer = null; }
  }

  private readonly handleLost = (e: Event): void => {
    e.preventDefault(); // without this the browser never restores the context
    if (this.lost) return;
    this.lost = true; this.lostCount++;
    this.o.onLost?.();
    this.cancelTimer();
    this.timer = (this.o.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => { this.timer = null; if (this.lost) this.o.onGiveUp?.(); }, this.o.giveUpMs ?? 8000);
  };

  private readonly handleRestored = (): void => {
    if (!this.lost) return;
    this.lost = false; this.restoredCount++;
    this.cancelTimer();
    this.o.onRestored?.();
  };
}
