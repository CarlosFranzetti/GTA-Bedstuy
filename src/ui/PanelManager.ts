/**
 * PanelManager (MENU2): the one place that knows which screens are open and what the mouse, keyboard and pad may do.
 *
 * The rule, in a player's words: open a screen and the mouse is yours and the game waits; Back (Esc, B, a right click, the
 * Back button) goes up one step and the last Back resumes; Resume puts the mouse back in the game.
 *
 * What it does:
 *  - Tracks the stack of open panels (pause menu, map, phone, shop, decks, radio list, credits). A panel registers once with
 *    `isOpen()` and `back()`; the manager re-reads them whenever `sync()` runs (panels call it from `setPanelClass`, which
 *    sets a body class the manager also watches).
 *  - Pointer policy: the first panel to open releases the pointer lock, and a lock that arrives while a panel is open is
 *    released again. The input gate closes, so keys, buttons and clicks never reach the game. When the last panel closes the
 *    gate opens again (one tick later when a key closed it, so the key is not also a game key) and, if the closing gesture
 *    can start a pointer lock (a click or a key that is not Esc), the pointer goes back to the game.
 *  - One Esc owner: Esc is handled here in the capture phase, before any panel sees it, and sent to the top panel's `back()`.
 *    With no panel open Esc opens the pause menu. A panel may keep Esc for itself while it is busy (`keepsEscape`: rebinding
 *    a key, typing in a field).
 *  - A browser lock exit with no panel open (Esc eaten by the browser, alt-tab, a lost window) lands in the pause menu.
 */
import { releasePointerLock } from './panelKeys';

export interface ManagedPanel {
  id: string;
  isOpen(): boolean;
  /** One step back; the panel closes itself when it has no step left. Default: `close()`. */
  back?(): void;
  close(): void;
  /** true while the panel needs Esc for something of its own (a key being rebound, text being typed). */
  keepsEscape?(): boolean;
  /** Opened inside another panel (the map tab of the pause menu): not a level of its own while that panel is open. */
  insideOf?: string;
}

/** What the manager needs of `Input` (a subset, so tests can pass a plain object). */
export interface InputGate { blocked: boolean; requestLock(): void; pointerLocked?: boolean; mode?: string }

export interface PanelManagerOptions {
  input?: InputGate;
  /** Opens the pause menu (browser lock exit, Esc with nothing open). */
  openPause?: () => void;
  /** false while the title screen is up or the game is not running: no pause menu, no gate. */
  canOpenPause?: () => boolean;
  /** Give the pointer back to the game when the last panel closes by a click or key. Default true except on touch. */
  relockOnClose?: boolean;
}

export class PanelManager {
  private readonly doc: Document;
  private readonly win: Window | null;
  private readonly panels: ManagedPanel[] = [];
  private order: string[] = [];
  private opts: PanelManagerOptions;
  private wasLocked = false;
  private lastGesture: 'key' | 'esc' | 'pointer' | 'none' = 'none';
  private gateTimer = 0;
  private mo: MutationObserver | null = null;
  private readonly cleanup: Array<() => void> = [];
  /** Counted for tests and the debug overlay. */
  escHandled = 0;

  constructor(doc: Document = document, opts: PanelManagerOptions = {}) {
    this.doc = doc;
    this.win = doc.defaultView;
    this.opts = opts;
    const w = this.win;
    if (w) {
      const onKey = (e: KeyboardEvent): void => this.onKeyCapture(e);
      w.addEventListener('keydown', onKey, true);
      this.cleanup.push(() => w.removeEventListener('keydown', onKey, true));
      const onPointer = (): void => { this.lastGesture = 'pointer'; };
      w.addEventListener('pointerdown', onPointer, true);
      this.cleanup.push(() => w.removeEventListener('pointerdown', onPointer, true));
      const onCtx = (e: MouseEvent): void => this.onContextMenu(e);
      w.addEventListener('contextmenu', onCtx, true);
      this.cleanup.push(() => w.removeEventListener('contextmenu', onCtx, true));
    }
    const onLock = (): void => this.onLockChange();
    doc.addEventListener('pointerlockchange', onLock);
    this.cleanup.push(() => doc.removeEventListener('pointerlockchange', onLock));
    if (typeof MutationObserver !== 'undefined' && doc.body) {
      this.mo = new MutationObserver(() => this.sync());
      this.mo.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
      this.cleanup.push(() => this.mo?.disconnect());
    }
    this.wasLocked = !!doc.pointerLockElement;
  }

  /** Late wiring (the manager is built before the input and the menu exist). */
  configure(opts: PanelManagerOptions): void { this.opts = { ...this.opts, ...opts }; }

  register(p: ManagedPanel): void {
    if (this.panels.some((x) => x.id === p.id)) return;
    this.panels.push(p);
    this.sync();
  }

  /** Open panels, bottom to top, in the order they opened. A panel inside another (the map tab) is not listed while its host is open. */
  get stack(): readonly string[] { return this.order.slice(); }
  get top(): string | null { return this.order.length ? this.order[this.order.length - 1] : null; }
  get anyOpen(): boolean { return this.order.length > 0; }
  isOpen(id: string): boolean { return this.order.includes(id); }

  /** Re-reads every panel and applies the pointer and input policy. Cheap; safe to call at any time. */
  sync(): void {
    const open = new Set<string>();
    for (const p of this.panels) {
      let o = false;
      try { o = p.isOpen(); } catch { o = false; }
      if (o && p.insideOf && this.panels.some((h) => h.id === p.insideOf && safeOpen(h))) o = false;
      if (o) open.add(p.id);
    }
    const before = this.order.length;
    this.order = this.order.filter((id) => open.has(id));
    for (const p of this.panels) if (open.has(p.id) && !this.order.includes(p.id)) this.order.push(p.id);
    const now = this.order.length;
    if (now > 0) {
      this.doc.defaultView?.clearTimeout(this.gateTimer);
      this.gateTimer = 0;
      if (this.opts.input && !this.opts.input.blocked) this.opts.input.blocked = true;
      if (this.doc.pointerLockElement) releasePointerLock(this.doc); // a lock that is still on, or arrived late
      this.wasLocked = false;
    } else if (before > 0) {
      this.closedLast();
    }
  }

  /** One step back on the top panel. Returns false when nothing was open. */
  back(): boolean {
    const id = this.top;
    if (!id) return false;
    const p = this.panels.find((x) => x.id === id);
    if (!p) return false;
    (p.back ?? p.close).call(p);
    this.sync();
    return true;
  }

  /** Closes every panel (a teleport, a mission start, the title screen). */
  closeAll(): void {
    for (const id of [...this.order].reverse()) this.panels.find((x) => x.id === id)?.close();
    this.sync();
  }

  dispose(): void {
    this.cleanup.splice(0).forEach((fn) => fn());
    this.doc.defaultView?.clearTimeout(this.gateTimer);
    if (this.opts.input) this.opts.input.blocked = false;
  }

  /* ---------- internals ---------- */

  private canPause(): boolean { return this.opts.canOpenPause ? this.opts.canOpenPause() : true; }

  private closedLast(): void {
    const input = this.opts.input;
    const gesture = this.lastGesture;
    const open = (): void => {
      this.gateTimer = 0;
      if (this.order.length > 0 || !input) return; // something opened again in the meantime
      input.blocked = false;
      // Resume puts the pointer back in the game from the same click or key press (a browser wants a user gesture; Esc is not one).
      const relock = this.opts.relockOnClose !== false && (input.mode ?? 'keyboard') === 'keyboard' && (gesture === 'pointer' || gesture === 'key');
      if (relock) input.requestLock();
    };
    // A key closed it: open the gate one tick later, after the whole key event has been delivered.
    if (gesture === 'key' || gesture === 'esc') this.gateTimer = this.win ? this.win.setTimeout(open, 0) : 0;
    if (!this.gateTimer) open();
    this.lastGesture = 'none';
  }

  private onKeyCapture(e: KeyboardEvent): void {
    const isEsc = e.code === 'Escape' || e.key === 'Escape';
    this.lastGesture = isEsc ? 'esc' : 'key';
    if (!isEsc) return;
    const top = this.top;
    if (!top) {
      if (e.repeat || !this.canPause() || !this.opts.openPause) return;
      this.swallow(e);
      this.opts.openPause();
      this.sync();
      return;
    }
    const p = this.panels.find((x) => x.id === top);
    if (p?.keepsEscape?.()) return; // the panel's own handler takes this Esc (it is mid-rebind or typing)
    this.swallow(e);
    if (!e.repeat) this.back();
  }

  private swallow(e: Event): void {
    this.escHandled++;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  /** Right click: back one step while a panel is open (the browser's own menu never opens over a panel). */
  private onContextMenu(e: MouseEvent): void {
    if (!this.anyOpen) return;
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest('input, textarea, select, [contenteditable="true"]')) return; // keep paste for text fields
    e.preventDefault();
    e.stopImmediatePropagation();
    if ((e as PointerEvent).pointerType === 'touch') return; // a long press is not a right click: no menu, but no Back either
    this.lastGesture = 'pointer';
    this.back();
  }

  private onLockChange(): void {
    const locked = !!this.doc.pointerLockElement;
    if (locked && this.anyOpen) { releasePointerLock(this.doc); return; }
    // The browser took the lock away with nothing open (Esc, alt-tab, a lost window): the pause menu is where that lands.
    if (this.wasLocked && !locked && !this.anyOpen && this.canPause() && this.opts.openPause) { this.opts.openPause(); this.sync(); }
    this.wasLocked = locked;
  }
}

function safeOpen(p: ManagedPanel): boolean { try { return p.isOpen(); } catch { return false; } }
