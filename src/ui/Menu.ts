/**
 * Pause menu: Resume, graphics quality, master + radio volume, invert look Y, reset position,
 * and a controls reference for keyboard, touch and gamepad. Opens on Esc, gamepad Start (via `toggle()`),
 * the touch pause button, or when the browser releases pointer lock (Esc while locked is eaten by the browser).
 *
 * Settings persist to localStorage (wrapped; a blocked/absent store just means no persistence).
 * The root uses the `hidden` attribute and `data-ui-modal`, which `Input` uses to leave typing/focus keys alone.
 */
import './menu.css';
import type { InputMode } from '@/core/Input';
import type { NavDir } from '@/core/Gamepad';
import { clearPosition } from './SaveState';

export type MenuQuality = 'phone' | 'low' | 'medium' | 'high';
export const QUALITIES: readonly MenuQuality[] = ['phone', 'low', 'medium', 'high'];
export const SETTINGS_KEY = 'gta-bedstuy.settings.v1';

export interface MenuSettings {
  quality: MenuQuality;
  /** 0..1 */
  master: number;
  /** 0..1 */
  radio: number;
  invertY: boolean;
}

export interface MenuCallbacks {
  /** Game should freeze while true. Resume (false) is invoked inside a user gesture: a good place to re-request pointer lock. */
  onPause?: (paused: boolean) => void;
  onQuality?: (quality: MenuQuality) => void;
  onMasterVolume?: (volume: number) => void;
  onRadioVolume?: (volume: number) => void;
  onInvertLookY?: (invert: boolean) => void;
  onReset?: () => void;
}

export interface MenuOptions {
  /** Show the on-screen pause button (top-right). */
  touch?: boolean;
  /** Quality the game started with (URL param / device default) when nothing is saved. */
  initialQuality?: MenuQuality;
  /** Keep `initialQuality` even when a different one is saved (e.g. an explicit ?q= URL param). */
  ignoreSavedQuality?: boolean;
  /** Override storage (tests). `null` disables persistence. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Open when the browser exits pointer lock. Default true. */
  openOnPointerUnlock?: boolean;
}

const DEFAULTS: MenuSettings = { quality: 'medium', master: 1, radio: 1, invertY: false };

const CONTROLS: Record<InputMode, { title: string; rows: Array<[string, string]> }> = {
  keyboard: {
    title: 'Keyboard & mouse',
    rows: [['WASD', 'Move / drive'], ['Mouse', 'Look'], ['Shift', 'Run / handbrake'], ['Space', 'Brake'], ['F', 'Enter / exit car'], ['H', 'Horn'], ['E', 'Next radio station'], ['Esc', 'Pause']],
  },
  touch: {
    title: 'Touch',
    rows: [['Left stick', 'Move / drive'], ['Drag right side', 'Look'], ['CAR', 'Enter / exit car'], ['RUN / BRAKE', 'Run, brake'], ['HORN', 'Horn'], ['RADIO', 'Next station'], ['II', 'Pause']],
  },
  gamepad: {
    title: 'Gamepad',
    rows: [['Left stick', 'Move / steer'], ['Right stick', 'Look'], ['RT', 'Throttle'], ['LT', 'Brake'], ['X', 'Run / handbrake'], ['A', 'Enter / exit car'], ['LB', 'Horn'], ['Y', 'Next station'], ['Start', 'Pause']],
  },
};

const clamp01 = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export class Menu {
  readonly root: HTMLElement;
  readonly pauseButton: HTMLButtonElement;
  private readonly doc: Document;
  private readonly panel: HTMLElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly qualityBtns = new Map<MenuQuality, HTMLButtonElement>();
  private readonly masterInput: HTMLInputElement;
  private readonly masterOut: HTMLOutputElement;
  private readonly radioInput: HTMLInputElement;
  private readonly radioOut: HTMLOutputElement;
  private readonly invertInput: HTMLInputElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly controlSections = new Map<InputMode, HTMLElement>();
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private readonly cleanup: Array<() => void> = [];
  private state: MenuSettings;
  private opened = false;
  private wasLocked = false;
  private restoreFocus: HTMLElement | null = null;
  private readonly touchEnabled: boolean;

  constructor(parent: HTMLElement, private readonly cb: MenuCallbacks = {}, opts: MenuOptions = {}) {
    this.doc = parent.ownerDocument;
    this.touchEnabled = !!opts.touch;
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    const saved = this.load();
    this.state = { ...DEFAULTS, quality: opts.initialQuality ?? DEFAULTS.quality, ...saved };
    if (opts.ignoreSavedQuality && opts.initialQuality) this.state.quality = opts.initialQuality;

    // ---- DOM
    this.root = this.el('div', 'menu-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'menu-title');
    this.root.setAttribute('data-ui-modal', '');
    this.panel = this.el('div', 'menu-panel');

    const title = this.el('h2', 'menu-title');
    title.id = 'menu-title';
    title.textContent = 'Paused';

    this.resumeBtn = this.button('Resume', 'menu-btn menu-primary');
    this.resumeBtn.addEventListener('click', () => this.close());

    // Quality radiogroup
    const quality = this.el('div', 'menu-row');
    const qLabel = this.el('span', 'menu-label');
    qLabel.id = 'menu-quality-label';
    qLabel.textContent = 'Graphics quality';
    const group = this.el('div', 'menu-seg');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', 'menu-quality-label');
    for (const q of QUALITIES) {
      const b = this.button(q[0].toUpperCase() + q.slice(1), 'menu-seg-btn');
      b.setAttribute('role', 'radio');
      b.dataset.quality = q;
      b.addEventListener('click', () => this.setQuality(q));
      this.qualityBtns.set(q, b);
      group.appendChild(b);
    }
    quality.append(qLabel, group);

    const [masterRow, masterInput, masterOut] = this.slider('Master volume', 'menu-master');
    const [radioRow, radioInput, radioOut] = this.slider('Radio volume', 'menu-radio');
    this.masterInput = masterInput; this.masterOut = masterOut;
    this.radioInput = radioInput; this.radioOut = radioOut;
    masterInput.addEventListener('input', () => this.setMaster(Number(masterInput.value) / 100));
    radioInput.addEventListener('input', () => this.setRadio(Number(radioInput.value) / 100));

    const invertRow = this.el('label', 'menu-row menu-check');
    this.invertInput = this.el('input', '');
    this.invertInput.type = 'checkbox';
    this.invertInput.id = 'menu-invert';
    const invertText = this.el('span', 'menu-label');
    invertText.textContent = 'Invert look Y';
    invertRow.append(invertText, this.invertInput);
    this.invertInput.addEventListener('change', () => this.setInvertY(this.invertInput.checked));

    this.resetBtn = this.button('Reset position', 'menu-btn');
    this.resetBtn.addEventListener('click', () => { clearPosition(); this.cb.onReset?.(); this.close(); });

    // Controls reference
    const controls = this.el('div', 'menu-controls');
    const cTitle = this.el('h3', 'menu-subtitle');
    cTitle.textContent = 'Controls';
    controls.appendChild(cTitle);
    const cols = this.el('div', 'menu-cols');
    for (const mode of ['keyboard', 'touch', 'gamepad'] as const) {
      const sec = this.el('section', 'menu-col');
      sec.dataset.mode = mode;
      const h = this.el('h4', 'menu-col-title');
      h.textContent = CONTROLS[mode].title;
      const dl = this.el('dl', 'menu-keys');
      for (const [k, v] of CONTROLS[mode].rows) {
        const dt = this.el('dt', ''); dt.textContent = k;
        const dd = this.el('dd', ''); dd.textContent = v;
        dl.append(dt, dd);
      }
      sec.append(h, dl);
      cols.appendChild(sec);
      this.controlSections.set(mode, sec);
    }
    controls.appendChild(cols);

    const hint = this.el('p', 'menu-hint');
    hint.textContent = 'Esc / Start to resume';

    this.panel.append(title, this.resumeBtn, quality, masterRow, radioRow, invertRow, this.resetBtn, controls, hint);
    this.root.appendChild(this.panel);
    parent.appendChild(this.root);

    // Touch pause button lives outside the modal root so it can show while the menu is closed.
    this.pauseButton = this.button('⏸', 'menu-pause-btn');
    this.pauseButton.setAttribute('aria-label', 'Pause');
    this.pauseButton.hidden = !this.touchEnabled;
    this.pauseButton.addEventListener('click', () => this.open());
    parent.appendChild(this.pauseButton);

    this.syncUi();
    this.setInputMode(opts.touch ? 'touch' : 'keyboard');

    // ---- global listeners
    const win = this.doc.defaultView;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); this.toggle(); }
    };
    win?.addEventListener('keydown', onKey);
    this.cleanup.push(() => win?.removeEventListener('keydown', onKey));

    this.root.addEventListener('keydown', (e) => this.onPanelKey(e));

    if (opts.openOnPointerUnlock !== false) {
      const onLock = () => {
        const locked = !!this.doc.pointerLockElement;
        if (this.wasLocked && !locked && !this.opened) this.open();
        this.wasLocked = locked;
      };
      this.doc.addEventListener('pointerlockchange', onLock);
      this.cleanup.push(() => this.doc.removeEventListener('pointerlockchange', onLock));
    }

    // ---- push persisted values into the game
    if (saved.master !== undefined) this.cb.onMasterVolume?.(this.state.master);
    if (saved.radio !== undefined) this.cb.onRadioVolume?.(this.state.radio);
    if (saved.invertY !== undefined) this.cb.onInvertLookY?.(this.state.invertY);
    if (saved.quality !== undefined && !opts.ignoreSavedQuality && saved.quality !== opts.initialQuality) this.cb.onQuality?.(this.state.quality);
  }

  get isOpen(): boolean { return this.opened; }
  get settings(): MenuSettings { return { ...this.state }; }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.restoreFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    this.root.hidden = false;
    this.pauseButton.hidden = true;
    try { this.doc.exitPointerLock?.(); } catch { /* not locked / unsupported */ }
    this.cb.onPause?.(true);
    this.resumeBtn.focus();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    this.pauseButton.hidden = !this.touchEnabled;
    const prev = this.restoreFocus;
    this.restoreFocus = null;
    if (prev && prev.isConnected && prev.tagName !== 'CANVAS') prev.focus(); else (this.doc.activeElement as HTMLElement | null)?.blur?.();
    this.cb.onPause?.(false);
  }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  /** Highlights the controls column for the device in use. */
  setInputMode(mode: InputMode): void {
    for (const [m, sec] of this.controlSections) {
      sec.classList.toggle('current', m === mode);
      if (m === mode) sec.setAttribute('aria-current', 'true'); else sec.removeAttribute('aria-current');
    }
  }

  /** Gamepad / programmatic navigation. No-op while closed. */
  navigate(dir: NavDir): void {
    if (!this.opened) return;
    const items = this.focusables();
    const active = this.doc.activeElement as HTMLElement | null;
    const i = active ? items.indexOf(active) : -1;
    switch (dir) {
      case 'up': items[(i <= 0 ? items.length : i) - 1]?.focus(); break;
      case 'down': items[(i + 1) % items.length]?.focus(); break;
      case 'left':
      case 'right': this.adjust(active, dir === 'left' ? -1 : 1); break;
      case 'confirm': if (active && items.includes(active)) active.click(); break;
      case 'back': this.close(); break;
    }
  }

  dispose(): void {
    this.cleanup.splice(0).forEach((fn) => fn());
    this.root.remove();
    this.pauseButton.remove();
  }

  /* ---------- settings ---------- */

  private setQuality(q: MenuQuality): void {
    if (this.state.quality === q) { this.syncUi(); return; }
    this.state.quality = q; this.save(); this.syncUi(); this.cb.onQuality?.(q);
  }
  private setMaster(v: number): void { this.state.master = clamp01(v, 1); this.save(); this.syncUi(); this.cb.onMasterVolume?.(this.state.master); }
  private setRadio(v: number): void { this.state.radio = clamp01(v, 1); this.save(); this.syncUi(); this.cb.onRadioVolume?.(this.state.radio); }
  private setInvertY(b: boolean): void { this.state.invertY = b; this.save(); this.syncUi(); this.cb.onInvertLookY?.(b); }

  private syncUi(): void {
    for (const [q, b] of this.qualityBtns) {
      const on = q === this.state.quality;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('on', on);
      b.tabIndex = on ? 0 : -1;
    }
    const m = Math.round(this.state.master * 100), r = Math.round(this.state.radio * 100);
    this.masterInput.value = String(m); this.masterOut.value = `${m}%`;
    this.radioInput.value = String(r); this.radioOut.value = `${r}%`;
    this.invertInput.checked = this.state.invertY;
  }

  private load(): Partial<MenuSettings> {
    if (!this.storage) return {};
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw) as Record<string, unknown>;
      const out: Partial<MenuSettings> = {};
      if (QUALITIES.includes(o.quality as MenuQuality)) out.quality = o.quality as MenuQuality;
      if (typeof o.master === 'number') out.master = clamp01(o.master, 1);
      if (typeof o.radio === 'number') out.radio = clamp01(o.radio, 1);
      if (typeof o.invertY === 'boolean') out.invertY = o.invertY;
      return out;
    } catch { return {}; }
  }

  private save(): void {
    try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.state)); } catch { /* quota / blocked: settings just won't persist */ }
  }

  /* ---------- keyboard ---------- */

  private focusables(): HTMLElement[] {
    // Roving tabindex: only the selected quality button is a stop; arrows move within the group.
    return Array.from(this.panel.querySelectorAll<HTMLElement>('button, input')).filter((n) => n.tabIndex >= 0 && !n.hidden);
  }

  private adjust(active: HTMLElement | null, delta: number): void {
    if (!active) return;
    if (active instanceof HTMLInputElement && active.type === 'range') {
      const v = Math.min(100, Math.max(0, Number(active.value) + delta * 5));
      active.value = String(v);
      active.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (active.dataset.quality) {
      const i = QUALITIES.indexOf(active.dataset.quality as MenuQuality);
      const next = QUALITIES[Math.min(QUALITIES.length - 1, Math.max(0, i + delta))];
      this.setQuality(next);
      this.qualityBtns.get(next)?.focus();
    }
  }

  private onPanelKey(e: KeyboardEvent): void {
    const active = this.doc.activeElement as HTMLElement | null;
    const items = this.focusables();
    if (e.code === 'Tab' && items.length) {
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    } else if (e.code === 'ArrowDown') { e.preventDefault(); this.navigate('down'); }
    else if (e.code === 'ArrowUp') { e.preventDefault(); this.navigate('up'); }
    else if (e.code === 'ArrowLeft' && active?.dataset.quality) { e.preventDefault(); this.adjust(active, -1); }
    else if (e.code === 'ArrowRight' && active?.dataset.quality) { e.preventDefault(); this.adjust(active, 1); }
  }

  /* ---------- DOM helpers ---------- */

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const n = this.doc.createElement(tag);
    if (className) n.className = className;
    return n;
  }

  private button(text: string, className: string): HTMLButtonElement {
    const b = this.el('button', className);
    b.type = 'button';
    b.textContent = text;
    return b;
  }

  private slider(label: string, id: string): [HTMLElement, HTMLInputElement, HTMLOutputElement] {
    const row = this.el('div', 'menu-row');
    const lab = this.el('label', 'menu-label');
    lab.htmlFor = id;
    lab.textContent = label;
    const wrap = this.el('div', 'menu-slider');
    const input = this.el('input', '');
    input.type = 'range'; input.id = id; input.min = '0'; input.max = '100'; input.step = '5';
    const out = this.el('output', 'menu-value');
    out.htmlFor = id;
    wrap.append(input, out);
    row.append(lab, wrap);
    return [row, input, out];
  }
}
