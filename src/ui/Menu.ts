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
import { MINIMAP_LEGEND } from './Minimap';
import type { SaveManager } from './GameSave';
import { SavePanel } from './SavePanel';
import { FullscreenControl } from './Fullscreen';
import {
  GraphicsStore, supports, SHADOW_MODES, FPS_CAPS, RANGES,
  type GraphicsKey, type GraphicsSettings, type ShadowMode,
} from './GraphicsSettings';
import type { Quality } from '@/render/Shadows';

export type MenuQuality = 'phone' | 'low' | 'medium' | 'high';
export const QUALITIES: readonly MenuQuality[] = ['phone', 'low', 'medium', 'high'];
export const SETTINGS_KEY = 'gta-bedstuy.settings.v1';

export interface MenuSettings {
  quality: MenuQuality;
  /** Auto preset: the device default tier, with the automatic drop when the frame rate is poor. A tier button turns it off. */
  auto: boolean;
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
  /** Auto preset switched on / off: the host turns the automatic quality drop (PerfMonitor.setAutoDrop) on / off. */
  onAuto?: (auto: boolean) => void;
  /** An advanced graphics setting changed (or a persisted override was loaded): re-derive and apply (live, no reload). */
  onGraphics?: (settings: GraphicsSettings, changed: readonly GraphicsKey[]) => void;
  onMasterVolume?: (volume: number) => void;
  onRadioVolume?: (volume: number) => void;
  onRadioLibrary?: () => void;
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
  /** Adds "Save / Load game" (3 slots + autosave, export / import, new game). Omit and the menu has no save screen. */
  saves?: SaveManager;
  /** false while a save would store a nonsense pose (inside a room). */
  canSave?: () => boolean;
  /** Shared store of the advanced graphics overrides (main.ts also reads it on a tier switch). Default: a new one on `storage`. */
  graphics?: GraphicsStore;
  /** Current tier of the game (the automatic drop changes it behind the menu's back): read when the menu opens. */
  getQuality?: () => MenuQuality;
  /** Full screen control (tests inject a mocked one). Default: one on the real document. */
  fullscreen?: FullscreenControl | null;
  /** Auto preset on when nothing is saved (the host: no ?q= and no ?perf=0). Default false. */
  auto?: boolean;
  /** Show a "Play full screen" button on the title screen (`.hud-splash`). Default true. */
  titleFullscreen?: boolean;
}

const DEFAULTS: MenuSettings = { quality: 'medium', auto: false, master: 1, radio: 1, invertY: false };

const CONTROLS: Record<InputMode, { title: string; rows: Array<[string, string]> }> = {
  keyboard: {
    title: 'Keyboard & mouse',
    rows: [['WASD', 'Move / drive'], ['Mouse', 'Look'], ['Shift', 'Run / handbrake'], ['Space', 'Brake'], ['F', 'Enter / exit car'], ['H', 'Horn'], ['E', 'Next radio station'], ['N', 'Point at HOME / WAX DELI'], ['Esc', 'Pause']],
  },
  touch: {
    title: 'Touch',
    rows: [['Left stick', 'Move / drive'], ['Drag right side', 'Look'], ['CAR', 'Enter / exit car'], ['RUN / BRAKE', 'Run, brake'], ['HORN', 'Horn'], ['RADIO', 'Next station'], ['Tap Offer/Nav chip', 'Point at HOME / WAX DELI'], ['II', 'Pause']],
  },
  gamepad: {
    title: 'Gamepad',
    rows: [['Left stick', 'Move / steer'], ['Right stick', 'Look'], ['RT', 'Throttle'], ['LT', 'Brake'], ['X', 'Run / handbrake'], ['A', 'Enter / exit car'], ['LB', 'Horn'], ['Y', 'Next station'], ['Start', 'Pause']],
  },
};

const clamp01 = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

type AdvControl =
  | { kind: 'range'; min: number; max: number; step: number; scale: number; fmt: (v: number) => string }
  | { kind: 'bool' }
  | { kind: 'seg'; options: ReadonlyArray<readonly [string | number, string]> };
interface AdvSpec { key: GraphicsKey; label: string; control: AdvControl }
const asPct = (v: number): string => `${Math.round(v * 100)}%`;
const frac = (r: { min: number; max: number; step: number }): AdvControl => ({ kind: 'range', min: Math.round(r.min * 100), max: Math.round(r.max * 100), step: Math.round(r.step * 100), scale: 100, fmt: asPct });
const SHADOW_LABEL: Record<ShadowMode, string> = { off: 'Off', blob: 'Blob', low: 'Low', medium: 'Medium', high: 'High' };

/** Advanced graphics rows, in menu order. A row shows only when GraphicsSettings.supports(tier) lists its key. */
export const ADVANCED_ROWS: readonly AdvSpec[] = [
  { key: 'resolution', label: 'Resolution scale', control: frac(RANGES.resolution) },
  { key: 'nativeDpr', label: 'Native display resolution', control: { kind: 'bool' } },
  { key: 'shadows', label: 'Shadows', control: { kind: 'seg', options: SHADOW_MODES.map((m) => [m, SHADOW_LABEL[m]] as const) } },
  { key: 'drawDistance', label: 'Draw distance', control: frac(RANGES.drawDistance) },
  { key: 'treeRange', label: 'Tree & prop range', control: frac(RANGES.treeRange) },
  { key: 'crowd', label: 'Crowd density', control: frac(RANGES.crowd) },
  { key: 'traffic', label: 'Traffic density', control: frac(RANGES.traffic) },
  { key: 'aa', label: 'Anti-aliasing', control: { kind: 'seg', options: [['off', 'Off'], ['smaa', 'SMAA']] } },
  { key: 'ao', label: 'Ambient occlusion', control: { kind: 'bool' } },
  { key: 'bloom', label: 'Bloom', control: { kind: 'bool' } },
  { key: 'dof', label: 'Depth of field', control: { kind: 'bool' } },
  { key: 'vignette', label: 'Vignette', control: { kind: 'bool' } },
  { key: 'grain', label: 'Film grain', control: { kind: 'bool' } },
  { key: 'textures', label: 'Texture quality', control: { kind: 'seg', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] } },
  { key: 'fpsCap', label: 'Frame rate cap', control: { kind: 'seg', options: FPS_CAPS.map((c) => [c, c === 0 ? 'None' : String(c)] as const) } },
  { key: 'fov', label: 'Field of view', control: { kind: 'range', min: RANGES.fov.min, max: RANGES.fov.max, step: RANGES.fov.step, scale: 1, fmt: (v) => `${Math.round(v)}°` } },
  { key: 'showFps', label: 'Show FPS', control: { kind: 'bool' } },
];

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
  private readonly mainBox: HTMLElement;
  private readonly saveBox: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private savePanel: SavePanel | null = null;
  private readonly controlSections = new Map<InputMode, HTMLElement>();
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private readonly cleanup: Array<() => void> = [];
  private state: MenuSettings;
  private opened = false;
  private wasLocked = false;
  private restoreFocus: HTMLElement | null = null;
  private readonly touchEnabled: boolean;
  readonly graphics: GraphicsStore;
  readonly fullscreen: FullscreenControl | null;
  private readonly advBox: HTMLElement;
  private readonly advToggle: HTMLButtonElement;
  private readonly advReset: HTMLButtonElement;
  private readonly advSummary: HTMLElement;
  private readonly advRows = new Map<GraphicsKey, { row: HTMLElement; spec: AdvSpec; input?: HTMLInputElement; out?: HTMLOutputElement; btns?: HTMLButtonElement[] }>();
  private readonly autoBtn: HTMLButtonElement;
  private readonly fsBtn: HTMLButtonElement;
  private readonly fsCorner: HTMLButtonElement;
  private readonly fsTitle: HTMLButtonElement;
  private readonly installNote: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private fpsRaf = 0;
  /** the tier the game runs now (the automatic drop can differ from the chosen one) */
  private liveTier: MenuQuality;
  private readonly deviceTier: MenuQuality;
  private readonly getLive: (() => MenuQuality) | undefined;

  constructor(parent: HTMLElement, private readonly cb: MenuCallbacks = {}, opts: MenuOptions = {}) {
    this.doc = parent.ownerDocument;
    this.touchEnabled = !!opts.touch;
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    const saved = this.load();
    this.state = { ...DEFAULTS, quality: opts.initialQuality ?? DEFAULTS.quality, auto: opts.auto ?? false, ...saved };
    if (opts.ignoreSavedQuality && opts.initialQuality) { this.state.quality = opts.initialQuality; this.state.auto = false; }
    this.deviceTier = opts.initialQuality ?? DEFAULTS.quality;
    this.liveTier = this.state.quality;
    this.getLive = opts.getQuality;
    this.graphics = opts.graphics ?? new GraphicsStore(this.storage);
    this.fullscreen = opts.fullscreen === undefined ? new FullscreenControl(this.doc, this.storage) : opts.fullscreen;

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
    this.autoBtn = this.button('Auto', 'menu-seg-btn');
    this.autoBtn.setAttribute('role', 'radio');
    this.autoBtn.dataset.quality = 'auto';
    this.autoBtn.addEventListener('click', () => this.setAuto(true));
    group.appendChild(this.autoBtn);
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
    const libBtn = this.button('Radio library…', 'menu-btn');
    libBtn.addEventListener('click', () => this.cb.onRadioLibrary?.());

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

    // Minimap legend: what each dot on the map means
    const legend = this.el('div', 'menu-legend');
    const lTitle = this.el('h3', 'menu-subtitle');
    lTitle.textContent = 'Minimap';
    const lList = this.el('ul', 'menu-legend-list');
    for (const item of MINIMAP_LEGEND) {
      const li = this.el('li', '');
      const sw = this.el('span', `menu-legend-sw ${item.shape}`);
      sw.style.setProperty('--sw', item.swatch);
      sw.setAttribute('aria-hidden', 'true');
      const tx = this.el('span', '');
      tx.textContent = item.text;
      li.append(sw, tx);
      lList.appendChild(li);
    }
    legend.append(lTitle, lList);

    const hint = this.el('p', 'menu-hint');
    hint.textContent = 'Esc / Start to resume';

    this.mainBox = this.el('div', 'menu-main');
    this.saveBtn = this.button('Save / Load game', 'menu-btn menu-save-btn');
    this.saveBtn.hidden = !opts.saves;
    this.saveBtn.addEventListener('click', () => this.showSave(true));

    // Display: full screen + install hint
    const fsRow = this.el('div', 'menu-row menu-fs-row');
    const fsLabel = this.el('span', 'menu-label');
    fsLabel.textContent = 'Full screen';
    this.fsBtn = this.button('', 'menu-btn menu-fs-btn');
    this.fsBtn.addEventListener('click', () => { void this.fullscreen?.toggle(); });
    fsRow.append(fsLabel, this.fsBtn);
    this.installNote = this.el('p', 'menu-note menu-install');
    this.installNote.textContent = 'Install as app: Chrome, menu > Cast, save and share > Install page as app. Safari, File > Add to Dock. It then opens in its own window with no browser bars.';

    // Advanced graphics (collapsed): individual settings over the tier
    this.advToggle = this.button('Advanced graphics', 'menu-btn menu-adv-toggle');
    this.advToggle.setAttribute('aria-expanded', 'false');
    this.advToggle.setAttribute('aria-controls', 'menu-adv');
    this.advToggle.addEventListener('click', () => this.setAdvOpen(this.advToggle.getAttribute('aria-expanded') !== 'true'));
    this.advBox = this.el('div', 'menu-adv menu-section');
    this.advBox.id = 'menu-adv';
    this.advBox.hidden = true;
    this.advSummary = this.el('p', 'menu-note menu-adv-summary');
    this.advReset = this.button('Reset to preset', 'menu-btn menu-adv-reset');
    this.advReset.addEventListener('click', () => this.graphics.reset());
    this.advBox.appendChild(this.advSummary);
    for (const spec of ADVANCED_ROWS) this.advBox.appendChild(this.buildAdvRow(spec));
    this.advBox.appendChild(this.advReset);

    this.mainBox.append(this.resumeBtn, this.saveBtn, quality, fsRow, this.installNote, masterRow, radioRow, libBtn, invertRow, this.advToggle, this.advBox, this.resetBtn, controls, legend, hint);
    this.saveBox = this.el('div', 'menu-main menu-savebox');
    this.saveBox.hidden = true;
    if (opts.saves) {
      const back = this.button('Back', 'menu-btn menu-save-back');
      back.addEventListener('click', () => this.showSave(false));
      this.savePanel = new SavePanel(null, opts.saves, { canSave: opts.canSave, newGame: true, onDone: () => this.close() });
      this.saveBox.append(back, this.savePanel.root);
    }
    this.panel.append(title, this.mainBox, this.saveBox);
    this.root.appendChild(this.panel);
    parent.appendChild(this.root);

    // Touch pause button lives outside the modal root so it can show while the menu is closed.
    this.pauseButton = this.button('⏸', 'menu-pause-btn');
    this.pauseButton.setAttribute('aria-label', 'Pause');
    this.pauseButton.hidden = !this.touchEnabled;
    this.pauseButton.addEventListener('click', () => this.open());
    parent.appendChild(this.pauseButton);

    // Small corner button (mouse and keyboard players) and the title-screen offer. Both need a user gesture, which a click is.
    this.fsCorner = this.button('', 'menu-fs-corner');
    this.fsCorner.addEventListener('click', () => { void this.fullscreen?.toggle(); });
    this.fsCorner.hidden = this.touchEnabled || !this.fullscreen?.supported;
    parent.appendChild(this.fsCorner);
    this.fsTitle = this.button('Play full screen', 'menu-fs-title');
    this.fsTitle.hidden = true;
    parent.appendChild(this.fsTitle);
    this.fpsEl = this.el('div', 'fps-counter');
    this.fpsEl.hidden = true;
    this.fpsEl.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.fpsEl);
    this.installNote.hidden = this.isStandalone();

    this.syncUi();
    this.syncAdv();
    this.syncFs();
    this.syncFps();
    this.setInputMode(opts.touch ? 'touch' : 'keyboard');

    // ---- global listeners
    const win = this.doc.defaultView;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); if (this.opened && this.savingView) this.showSave(false); else this.toggle(); }
    };
    win?.addEventListener('keydown', onKey);
    this.cleanup.push(() => win?.removeEventListener('keydown', onKey));

    this.root.addEventListener('keydown', (e) => this.onPanelKey(e));

    // advanced graphics: any change (slider, toggle, reset) re-syncs the rows and tells the host
    this.cleanup.push(this.graphics.onChange((changed) => { this.syncAdv(); this.syncFps(); this.cb.onGraphics?.(this.graphics.effective(this.liveTier), changed); }));

    // full screen: Esc (or the browser's own exit) leaves it, then the pause screen opens; a late resize event fixes Safari's stale size
    if (this.fullscreen) {
      this.cleanup.push(this.fullscreen.onChange((on, escaped) => {
        this.syncFs();
        win?.setTimeout(() => win.dispatchEvent(new Event('resize')), 150);
        if (!on && escaped && !this.opened && !this.doc.body.classList.contains('ui-panel-open')) this.open();
      }));
      const fs = this.fullscreen;
      this.fsTitle.addEventListener('click', () => { void fs.enter(); });
      // "Play full screen" remembered: the click that starts the game on the title screen also enters it
      if (opts.titleFullscreen !== false) {
        const gesture = (): void => { if (fs.preferred && !fs.active && this.splashShowing()) void fs.enter(); };
        parent.addEventListener('mousedown', gesture, true);
        parent.addEventListener('click', gesture, true);
        this.cleanup.push(() => { parent.removeEventListener('mousedown', gesture, true); parent.removeEventListener('click', gesture, true); });
        const splash = parent.querySelector('.hud-splash');
        if (splash && typeof MutationObserver !== 'undefined') {
          const mo = new MutationObserver(() => this.syncFs());
          mo.observe(splash, { attributes: true, attributeFilter: ['style', 'class'] });
          this.cleanup.push(() => mo.disconnect());
        }
      }
    }

    if (opts.openOnPointerUnlock !== false) {
      const onLock = () => {
        const locked = !!this.doc.pointerLockElement;
        if (this.wasLocked && !locked && !this.opened && !this.doc.body.classList.contains('ui-panel-open')) this.open();
        this.wasLocked = locked;
      };
      this.doc.addEventListener('pointerlockchange', onLock);
      this.cleanup.push(() => this.doc.removeEventListener('pointerlockchange', onLock));
    }

    // ---- push persisted values into the game
    if (this.graphics.hasOverrides) this.cb.onGraphics?.(this.graphics.effective(this.liveTier), Object.keys(this.graphics.raw) as GraphicsKey[]);
    if (this.state.auto !== (opts.auto ?? false)) this.cb.onAuto?.(this.state.auto);
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
    this.syncLiveTier();
    try { this.doc.exitPointerLock?.(); } catch { /* not locked / unsupported */ }
    this.cb.onPause?.(true);
    this.resumeBtn.focus();
  }

  close(): void {
    if (!this.opened) return;
    this.showSave(false);
    this.opened = false;
    this.root.hidden = true;
    this.pauseButton.hidden = !this.touchEnabled;
    const prev = this.restoreFocus;
    this.restoreFocus = null;
    if (prev && prev.isConnected && prev.tagName !== 'CANVAS') prev.focus(); else (this.doc.activeElement as HTMLElement | null)?.blur?.();
    this.cb.onPause?.(false);
  }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  /** Swaps the settings for the save / load screen and back. No-op without `saves`. */
  showSave(on: boolean): void {
    if (!this.savePanel) return;
    this.mainBox.hidden = on; this.saveBox.hidden = !on;
    if (on) { this.savePanel.refresh(); this.saveBox.querySelector<HTMLElement>('.menu-save-back')?.focus(); }
    else if (this.opened && this.doc.activeElement && this.saveBox.contains(this.doc.activeElement)) this.saveBtn.focus();
  }
  get savingView(): boolean { return !this.saveBox.hidden; }

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
      case 'back': if (this.savingView) this.showSave(false); else this.close(); break;
    }
  }

  dispose(): void {
    this.cleanup.splice(0).forEach((fn) => fn());
    this.savePanel?.dispose();
    this.doc.defaultView?.cancelAnimationFrame?.(this.fpsRaf);
    this.fullscreen?.dispose();
    this.root.remove();
    this.pauseButton.remove();
    this.fsCorner.remove(); this.fsTitle.remove(); this.fpsEl.remove();
  }

  /* ---------- settings ---------- */

  /** A tier button: picks the tier and turns Auto off. */
  private setQuality(q: MenuQuality): void {
    const wasAuto = this.state.auto;
    this.state.auto = false;
    if (wasAuto) this.cb.onAuto?.(false);
    this.liveTier = q;
    if (this.state.quality === q) { this.save(); this.syncUi(); this.syncAdv(); if (wasAuto) this.cb.onQuality?.(q); return; }
    this.state.quality = q; this.save(); this.syncUi(); this.syncAdv(); this.cb.onQuality?.(q);
  }

  /** Auto preset: the device's default tier and the automatic drop. */
  private setAuto(on: boolean): void {
    if (!on) { this.setQuality(this.state.quality); return; }
    const was = this.state.auto, prevTier = this.liveTier;
    this.state.auto = true; this.state.quality = this.deviceTier; this.liveTier = this.deviceTier;
    this.save(); this.syncUi(); this.syncAdv();
    if (!was) this.cb.onAuto?.(true);
    if (prevTier !== this.deviceTier) this.cb.onQuality?.(this.deviceTier);
  }

  private syncLiveTier(): void {
    const q = this.getLive?.();
    if (q && q !== this.liveTier) { this.liveTier = q; this.syncUi(); this.syncAdv(); }
  }
  private setMaster(v: number): void { this.state.master = clamp01(v, 1); this.save(); this.syncUi(); this.cb.onMasterVolume?.(this.state.master); }
  private setRadio(v: number): void { this.state.radio = clamp01(v, 1); this.save(); this.syncUi(); this.cb.onRadioVolume?.(this.state.radio); }
  private setInvertY(b: boolean): void { this.state.invertY = b; this.save(); this.syncUi(); this.cb.onInvertLookY?.(b); }

  private syncUi(): void {
    const auto = this.state.auto;
    this.autoBtn.setAttribute('aria-checked', String(auto));
    this.autoBtn.classList.toggle('on', auto);
    this.autoBtn.tabIndex = auto ? 0 : -1;
    this.autoBtn.textContent = auto ? `Auto (${this.liveTier[0].toUpperCase()}${this.liveTier.slice(1)})` : 'Auto';
    for (const [q, b] of this.qualityBtns) {
      const on = !auto && q === this.state.quality;
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
      if (typeof o.auto === 'boolean') out.auto = o.auto;
      if (typeof o.master === 'number') out.master = clamp01(o.master, 1);
      if (typeof o.radio === 'number') out.radio = clamp01(o.radio, 1);
      if (typeof o.invertY === 'boolean') out.invertY = o.invertY;
      return out;
    } catch { return {}; }
  }

  private save(): void {
    try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.state)); } catch { /* quota / blocked: settings just won't persist */ }
  }

  /* ---------- advanced graphics ---------- */

  private setAdvOpen(open: boolean): void {
    this.advBox.hidden = !open;
    this.advToggle.setAttribute('aria-expanded', String(open));
    this.advToggle.classList.toggle('open', open);
    if (open) this.syncAdv();
  }

  private buildAdvRow(spec: AdvSpec): HTMLElement {
    const c = spec.control;
    const id = `menu-adv-${spec.key}`;
    const entry: { row: HTMLElement; spec: AdvSpec; input?: HTMLInputElement; out?: HTMLOutputElement; btns?: HTMLButtonElement[] } = { row: this.el('div', `menu-row menu-adv-row menu-adv-${spec.key}`), spec };
    entry.row.dataset.key = spec.key;
    if (c.kind === 'range') {
      const [row, input, out] = this.slider(spec.label, id);
      input.min = String(c.min); input.max = String(c.max); input.step = String(c.step);
      input.addEventListener('input', () => this.graphics.set(spec.key, Number(input.value) / c.scale as never));
      row.className = entry.row.className;
      row.dataset.key = spec.key;
      Object.assign(entry, { row, input, out });
    } else if (c.kind === 'bool') {
      const row = this.el('label', `menu-row menu-check menu-adv-row menu-adv-${spec.key}`);
      row.dataset.key = spec.key;
      const text = this.el('span', 'menu-label'); text.textContent = spec.label;
      const input = this.el('input', ''); input.type = 'checkbox'; input.id = id;
      input.addEventListener('change', () => this.graphics.set(spec.key, input.checked as never));
      row.append(text, input);
      Object.assign(entry, { row, input });
    } else {
      const label = this.el('span', 'menu-label'); label.id = `${id}-label`; label.textContent = spec.label;
      const group = this.el('div', 'menu-seg');
      group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-labelledby', label.id);
      const btns = c.options.map(([value, text]) => {
        const b = this.button(text, 'menu-seg-btn');
        b.setAttribute('role', 'radio'); b.dataset.value = String(value);
        b.addEventListener('click', () => this.graphics.set(spec.key, value as never));
        group.appendChild(b);
        return b;
      });
      entry.row.append(label, group);
      entry.btns = btns;
    }
    this.advRows.set(spec.key, entry);
    return entry.row;
  }

  private syncAdv(): void {
    const tier = this.liveTier as Quality;
    const sup = supports(tier);
    const eff = this.graphics.effective(tier);
    for (const [key, e] of this.advRows) {
      e.row.hidden = !sup.keys.has(key);
      e.row.classList.toggle('is-custom', this.graphics.isOverridden(key));
      const v = eff[key];
      const c = e.spec.control;
      if (c.kind === 'range' && e.input && e.out) { e.input.value = String(Math.round((v as number) * c.scale)); e.out.value = c.fmt(v as number); }
      else if (c.kind === 'bool' && e.input) e.input.checked = v as boolean;
      else if (c.kind === 'seg' && e.btns) {
        for (const b of e.btns) {
          const on = b.dataset.value === String(v);
          b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1;
          b.hidden = key === 'shadows' && !sup.shadows.includes(b.dataset.value as ShadowMode);
        }
      }
    }
    const n = Object.keys(this.graphics.raw).length;
    const name = this.liveTier[0].toUpperCase() + this.liveTier.slice(1);
    this.advSummary.textContent = n ? `${name} preset with ${n} change${n === 1 ? '' : 's'} (marked)` : `${name} preset, no changes`;
    this.advReset.disabled = n === 0;
  }

  /* ---------- full screen / FPS ---------- */

  private isStandalone(): boolean {
    try {
      const mm = this.doc.defaultView?.matchMedia;
      return !!mm && ['fullscreen', 'standalone'].some((m) => mm.call(this.doc.defaultView, `(display-mode: ${m})`).matches);
    } catch { return false; }
  }

  private splashShowing(): boolean {
    const el = this.root.parentElement?.querySelector<HTMLElement>('.hud-splash');
    return !!el && el.style.display !== 'none' && !el.classList.contains('fading');
  }

  private syncFs(): void {
    const fs = this.fullscreen;
    const ok = !!fs?.supported;
    const on = !!fs?.active;
    this.fsBtn.hidden = !ok;
    this.fsBtn.textContent = on ? 'Exit full screen (Alt+Enter)' : 'Enter full screen (Alt+Enter)';
    this.fsBtn.setAttribute('aria-pressed', String(on));
    this.fsCorner.hidden = this.touchEnabled || !ok;
    this.fsCorner.textContent = on ? '\u2715' : '\u26F6';
    this.fsCorner.title = this.fsCorner.ariaLabel = on ? 'Exit full screen (Alt+Enter)' : 'Full screen (Alt+Enter)';
    this.fsTitle.hidden = !ok || on || !this.splashShowing() || this.opened;
    this.fsTitle.classList.toggle('remembered', !!fs?.preferred);
  }

  /** Small FPS counter (display refresh rate as seen by requestAnimationFrame), only while "Show FPS" is on. */
  private syncFps(): void {
    const on = this.graphics.effective(this.liveTier as Quality).showFps;
    this.fpsEl.hidden = !on;
    const win = this.doc.defaultView;
    if (!on || !win?.requestAnimationFrame) { win?.cancelAnimationFrame?.(this.fpsRaf); this.fpsRaf = 0; return; }
    if (this.fpsRaf) return;
    let frames = 0, t0 = win.performance.now();
    const tick = (now: number): void => {
      frames++;
      if (now - t0 >= 500) { this.fpsEl.textContent = `${Math.round((frames * 1000) / (now - t0))} FPS`; frames = 0; t0 = now; }
      this.fpsRaf = win.requestAnimationFrame(tick);
    };
    this.fpsRaf = win.requestAnimationFrame(tick);
  }

  /* ---------- keyboard ---------- */

  private focusables(): HTMLElement[] {
    // Roving tabindex: only the selected quality button is a stop; arrows move within the group.
    return Array.from(this.panel.querySelectorAll<HTMLElement>('button, input, select, textarea')).filter((n) => n.tabIndex >= 0 && !(n as HTMLButtonElement).disabled && !n.closest('[hidden]'));
  }

  private adjust(active: HTMLElement | null, delta: number): void {
    if (!active) return;
    if (active instanceof HTMLInputElement && active.type === 'range') {
      const step = Number(active.step) || 5, lo = Number(active.min), hi = Number(active.max);
      const v = Math.min(hi, Math.max(lo, Number(active.value) + delta * step));
      active.value = String(v);
      active.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (active.getAttribute('role') === 'radio') {
      // any segmented group (quality, shadows, AA, ...): the neighbour in the direction pressed, skipping hidden options
      const sibs = Array.from(active.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []).filter((b) => !b.hidden);
      const next = sibs[Math.min(sibs.length - 1, Math.max(0, sibs.indexOf(active as HTMLButtonElement) + delta))];
      if (next && next !== active) { next.click(); next.focus(); }
    }
  }

  private onPanelKey(e: KeyboardEvent): void {
    const active = this.doc.activeElement as HTMLElement | null;
    if (active?.tagName === 'TEXTAREA' || active?.tagName === 'SELECT') return;
    const items = this.focusables();
    if (e.code === 'Tab' && items.length) {
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    } else if (e.code === 'ArrowDown') { e.preventDefault(); this.navigate('down'); }
    else if (e.code === 'ArrowUp') { e.preventDefault(); this.navigate('up'); }
    else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && active && (active.getAttribute('role') === 'radio' || (active instanceof HTMLInputElement && active.type === 'range'))) {
      e.preventDefault(); this.adjust(active, e.code === 'ArrowLeft' ? -1 : 1);
    }
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
