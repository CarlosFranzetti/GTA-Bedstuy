/**
 * WebGL context loss without a black screen. three.js re-creates its GL state on `webglcontextrestored` by itself, but only if the
 * lost event was default-prevented, and the game loop must not keep stepping the composer into a dead context. This guard
 * prevents the default, reports the state (so the loop can skip rendering and show a notice), and after a restore asks for a
 * full resize + shadow refresh. If no restore arrives within `giveUpMs`, `onGiveUp` is called (offer a reload).
 */
import { canvasStats } from '@/textures/texTier';

/**
 * A full-screen "tap to reload" notice (a plain DOM element: it must work when the renderer is dead). iOS Safari drops WebGL
 * contexts of backgrounded or memory-heavy tabs; a frozen page with no message looks like a crash. Idempotent; returns the element.
 */
export function showReloadNotice(doc: Document = document, reload: () => void = () => location.reload()): HTMLElement {
  const id = 'gta-context-lost';
  const have = doc.getElementById(id);
  if (have) return have;
  const el = doc.createElement('div');
  el.id = id;
  el.setAttribute('role', 'alertdialog');
  el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:rgba(8,8,12,.92);color:#fff;font:600 17px/1.35 system-ui,-apple-system,sans-serif;text-align:center;touch-action:manipulation;-webkit-user-select:none;user-select:none';
  const msg = doc.createElement('div');
  msg.textContent = 'The graphics were interrupted by your phone.';
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Tap to reload';
  btn.style.cssText = 'appearance:none;border:0;border-radius:10px;padding:14px 26px;font:700 17px system-ui,-apple-system,sans-serif;background:#f2c14e;color:#111;touch-action:manipulation';
  btn.addEventListener('click', reload);
  el.addEventListener('click', reload);
  el.append(msg, btn);
  (doc.body ?? doc.documentElement).appendChild(el);
  return el;
}

export interface ContextGuardOptions {
  onLost?: () => void;
  /** after a restore: re-apply sizes, force shadow / proxy refresh, drop caches that hold GL objects */
  onRestored?: () => void;
  onGiveUp?: () => void;
  giveUpMs?: number;
  /** After a restore: true when textures were emptied after upload (phone / low tiers), so the restored context would draw blanks and the page must reload. Default: some canvas was freed. */
  mustReload?: () => boolean;
  /** Shows the reload notice (default: `showReloadNotice`). */
  notify?: () => void;
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
    this.timer = (this.o.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => { this.timer = null; if (this.lost) { this.o.onGiveUp?.(); this.notify(); } }, this.o.giveUpMs ?? 8000);
  };

  private readonly handleRestored = (): void => {
    if (!this.lost) return;
    this.lost = false; this.restoredCount++;
    this.cancelTimer();
    // IPHONE: textures whose canvas was freed after upload cannot be re-uploaded; the restored context would draw white / 1 px textures
    if ((this.o.mustReload ?? (() => canvasStats.released > 0))()) { this.notify(); return; }
    this.o.onRestored?.();
  };

  private notify(): void {
    if (this.o.notify) this.o.notify();
    else if (typeof document !== 'undefined') showReloadNotice();
  }
}
