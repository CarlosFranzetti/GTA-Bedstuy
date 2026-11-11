/**
 * Full screen for the whole page (Fullscreen API on the document element, with the webkit prefixes Safari still uses on Mac).
 * Must be called from a user gesture. The choice ("play full screen") is remembered so the title screen can offer it again.
 *
 * Shortcut: Alt+Enter (Option+Enter on Mac). F11 belongs to the browser and F is the car key, so a modifier combo is used;
 * Input.ts has no Enter / Alt binding. Esc leaves full screen the browser's way and the Menu then opens the pause screen
 * (it listens to `onChange`).
 */
export const FULLSCREEN_KEY = 'gta-bedstuy.fullscreen.v1';

interface FsDoc extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface FsEl extends HTMLElement { webkitRequestFullscreen?: (opts?: FullscreenOptions) => Promise<void> | void }

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export class FullscreenControl {
  private readonly doc: FsDoc;
  private readonly storage: Store | null;
  private readonly listeners = new Set<(on: boolean, escaped?: boolean) => void>();
  private readonly cleanup: Array<() => void> = [];
  private prefValue: boolean;
  /** true while a leave was requested by us (button / shortcut), so the Menu does not treat it as an Esc exit */
  private selfExit = false;

  constructor(doc: Document = document, storage?: Store | null) {
    this.doc = doc as FsDoc;
    this.storage = storage === undefined ? FullscreenControl.defaultStorage() : storage;
    this.prefValue = this.readPref();
    const handler = (): void => {
      const on = this.active;
      if (on) this.writePref(true);
      const mine = this.selfExit;
      if (!on) this.selfExit = false;
      for (const fn of [...this.listeners]) fn(on, !on && !mine);
    };
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
      doc.addEventListener(ev, handler);
      this.cleanup.push(() => doc.removeEventListener(ev, handler));
    }
    const win = doc.defaultView;
    if (win) {
      const onKey = (e: KeyboardEvent): void => {
        if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) { e.preventDefault(); e.stopPropagation(); void this.toggle(); }
      };
      win.addEventListener('keydown', onKey, true);
      this.cleanup.push(() => win.removeEventListener('keydown', onKey, true));
    }
  }

  private static defaultStorage(): Store | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
  }

  /** Whether this browser can do it (iPhone Safari cannot: the page then offers the Add to Home Screen hint only). */
  get supported(): boolean {
    const d = this.doc;
    const root = d.documentElement as FsEl;
    const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled;
    return enabled !== false && (typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function');
  }

  get active(): boolean { return !!(this.doc.fullscreenElement ?? this.doc.webkitFullscreenElement); }

  /** The player asked for full screen last time (or entered it this session). */
  get preferred(): boolean { return this.prefValue; }

  /** `escaped` is true when full screen ended without our own toggle (Esc, or the browser's own control). */
  onChange(fn: (on: boolean, escaped?: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  async enter(): Promise<boolean> {
    if (!this.supported) return false;
    if (this.active) return true;
    const root = this.doc.documentElement as FsEl;
    try {
      const opts: FullscreenOptions = { navigationUI: 'hide' };
      const r = root.requestFullscreen ? root.requestFullscreen(opts) : root.webkitRequestFullscreen?.(opts);
      await r;
      this.writePref(true);
      return true;
    } catch { return false; /* no user gesture, or the browser refused */ }
  }

  async exit(): Promise<void> {
    if (!this.active) return;
    this.selfExit = true;
    this.writePref(false);
    try {
      const r = this.doc.exitFullscreen ? this.doc.exitFullscreen() : this.doc.webkitExitFullscreen?.();
      await r;
    } catch { this.selfExit = false; }
  }

  async toggle(): Promise<boolean> {
    if (this.active) { await this.exit(); return false; }
    return this.enter();
  }

  dispose(): void { this.cleanup.splice(0).forEach((fn) => fn()); this.listeners.clear(); }

  private readPref(): boolean {
    try { return this.storage?.getItem(FULLSCREEN_KEY) === '1'; } catch { return false; }
  }
  private writePref(on: boolean): void {
    this.prefValue = on;
    try { this.storage?.setItem(FULLSCREEN_KEY, on ? '1' : '0'); } catch { /* blocked: not remembered */ }
  }
}
