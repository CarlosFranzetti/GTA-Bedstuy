/** Keyboard + mouse state. Poll `isDown` for held keys, `pressed` for edge-triggered actions (consumed per frame). */
export class Input {
  private down = new Set<string>();
  private justPressed = new Set<string>();
  /** Mouse movement since last `endFrame()`, pixels. */
  mouseDX = 0; mouseDY = 0;
  wheel = 0;
  pointerLocked = false;
  private firstGesture = false;
  onFirstGesture: (() => void) | null = null;

  constructor(private el: HTMLElement = document.body) {
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.gesture();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('mousemove', (e) => { if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    el.addEventListener('mousedown', () => { this.gesture(); this.requestLock(); });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === el; });
  }
  private gesture() { if (!this.firstGesture) { this.firstGesture = true; this.onFirstGesture?.(); } }
  /** Must be called from inside a user-gesture handler. Failures (phones, some embedded views) are silent. */
  requestLock(): void {
    if (this.pointerLocked) return;
    try { const r = (this.el.requestPointerLock as undefined | (() => unknown))?.call(this.el); (r as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* unsupported */ }
  }
  /** External trigger for the first gesture (e.g. a click on the splash overlay). */
  notifyGesture(): void { this.gesture(); this.requestLock(); }
  isDown(code: string): boolean { return this.down.has(code); }
  /** True only on the frame the key went down. */
  pressed(code: string): boolean { return this.justPressed.has(code); }
  /** Returns -1..1 from two keys. */
  axis(neg: string[], pos: string[]): number {
    const n = neg.some((c) => this.down.has(c)) ? 1 : 0;
    const p = pos.some((c) => this.down.has(c)) ? 1 : 0;
    return p - n;
  }
  endFrame(): void { this.justPressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
}
