/**
 * Pause menu in the layout of a console-era open-world pause screen (original art, no third-party assets):
 * a dark translucent backdrop over the blurred game, a header (game title left, player info right), a tab bar
 * (MAP, MISSIONS, STATS, SETTINGS, SAVE, RADIO) and a body. SETTINGS is three columns: categories, option rows
 * with right-aligned values, and a description panel with a rough GPU load bar for graphics options.
 *
 * Opens on Esc, gamepad Start (via `toggle()`), the touch pause button, or when the browser releases pointer lock.
 * Keyboard: Q / E (or PageUp / PageDown) tabs, arrows or WASD select and change, Enter accepts, Backspace goes back, Esc resumes.
 * Gamepad: D-pad, A, B, LB / RB (`tab()`), Start. Mouse and touch: every row, arrow and bar is clickable / draggable.
 *
 * Settings persist to localStorage (wrapped; a blocked/absent store just means no persistence).
 * The root uses the `hidden` attribute and `data-ui-modal`, which `Input` uses to leave typing/focus keys alone.
 */
import './menu.css';
import type { InputMode } from '@/core/Input';
import type { NavDir } from '@/core/Gamepad';
import { clearPosition } from './SaveState';
import { MINIMAP_LEGEND } from './Minimap';
import { formatClock, formatDay, type SaveManager } from './GameSave';
import { SavePanel } from './SavePanel';
import { FullscreenControl } from './Fullscreen';
import { RowList, type RowSpec } from './menuRows';
import {
  GraphicsStore, supports, SHADOW_MODES, FPS_CAPS, RANGES, gpuLoad, optionLoad, loadLabel,
  type GraphicsKey, type GraphicsSettings, type ShadowMode,
} from './GraphicsSettings';
import type { Quality } from '@/render/Shadows';

export type MenuQuality = 'phone' | 'low' | 'medium' | 'high';
export const QUALITIES: readonly MenuQuality[] = ['phone', 'low', 'medium', 'high'];
export const SETTINGS_KEY = 'gta-bedstuy.settings.v1';

export type MenuTab = 'map' | 'missions' | 'stats' | 'settings' | 'save' | 'radio';
export const MENU_TABS: ReadonlyArray<{ id: MenuTab; label: string }> = [
  { id: 'map', label: 'Map' }, { id: 'missions', label: 'Missions' }, { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' }, { id: 'save', label: 'Save' }, { id: 'radio', label: 'Radio' },
];

export interface MenuSettings {
  quality: MenuQuality;
  /** Auto preset: the device default tier, with the automatic drop when the frame rate is poor. A tier choice turns it off. */
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

/** Live values for the header and the STATS / RADIO tabs. Every field is optional: a missing one is simply not shown. */
export interface MenuInfo {
  cash?: number;
  /** 0..24 */
  hour?: number;
  /** 0-based game day */
  day?: number;
  street?: string;
  station?: string;
  /** Real counters, label / value. */
  stats?: ReadonlyArray<readonly [string, string]>;
}

export interface MissionLogEntry {
  id: string;
  title: string;
  state: 'active' | 'done' | 'failed' | 'open' | 'locked';
  act?: number;
  objective?: string;
  /** 'story' | 'side' */
  tag?: string;
}

/** The part of MapScreen the menu embeds (it reparents `root` into the MAP tab while the menu is open). */
export interface MapEmbed {
  readonly root: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
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
  /** Adds the SAVE tab (3 slots + autosave, export / import, new game). Omit and the tab is not shown. */
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
  /** The existing MapScreen: it fills the MAP tab. Omit and the tab is not shown. */
  map?: MapEmbed;
  /** Header / stats values, read when the menu opens and once a second while it is open. */
  info?: () => MenuInfo;
  /** Mission log for the MISSIONS tab (feature-detected: without it the tab shows the active mission only). */
  missionLog?: () => readonly MissionLogEntry[];
  /** Show the "install as app" hint (hosted build only). Default: true when built with VITE_HOSTED=1. */
  installable?: boolean;
}

const DEFAULTS: MenuSettings = { quality: 'medium', auto: false, master: 1, radio: 1, invertY: false };

const CONTROLS: Record<InputMode, { title: string; rows: Array<[string, string]> }> = {
  keyboard: {
    title: 'Keyboard & mouse',
    rows: [['WASD', 'Move / drive'], ['Mouse', 'Look'], ['Shift', 'Run / handbrake'], ['Space', 'Brake'], ['F', 'Enter / exit car'], ['H', 'Horn'], ['E', 'Next radio station'], ['P', 'Phone'], ['M', 'Map'], ['N', 'Point at HOME / WAX DELI'], ['Alt+Enter', 'Full screen'], ['Esc', 'Pause']],
  },
  touch: {
    title: 'Touch',
    rows: [['Left stick', 'Move / drive'], ['Drag right side', 'Look'], ['CAR', 'Enter / exit car'], ['RUN / BRAKE', 'Run, brake'], ['HORN', 'Horn'], ['RADIO', 'Next station'], ['PHONE / MAP', 'Open the phone or the map'], ['Tap Offer/Nav chip', 'Point at HOME / WAX DELI'], ['II', 'Pause']],
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

/** Graphics rows, in menu order. A row shows only when GraphicsSettings.supports(tier) lists its key. */
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

const GFX_DESC: Record<GraphicsKey, string> = {
  resolution: 'Renders the 3D view at a share of the screen resolution and scales it up. Lower is faster; the HUD stays sharp.',
  nativeDpr: 'Ignores the preset’s pixel-ratio cap and renders at your display’s full density (up to 3x). Sharp on retina screens, much heavier.',
  shadows: 'Off: none. Blob: soft dark spots under cars and people. Low to High: real sun shadows, sharper and farther as you go up.',
  drawDistance: 'How far buildings, props, parked cars and people are drawn. Farther looks better and costs CPU and GPU.',
  treeRange: 'How far street trees and street furniture are drawn.',
  crowd: 'Pedestrian density. 0% empties the sidewalks.',
  traffic: 'Moving traffic and police patrol density. Parked cars can only be thinned out, not added.',
  aa: 'SMAA smooths jagged edges on buildings and wires. Costs a little GPU.',
  ao: 'Ambient occlusion darkens creases, corners and the ground under cars. Medium and High presets only.',
  bloom: 'Soft glow around bright lights, signs and the sun.',
  dof: 'Depth of field blurs the far distance slightly. Medium and High presets only.',
  vignette: 'Darkens the edges of the screen.',
  grain: 'Fine film grain over the image.',
  textures: 'Texture sharpness and surface detail. Low also turns normal maps off.',
  fpsCap: 'Limits how many frames are drawn per second. A lower cap saves battery and heat on laptops and phones.',
  fov: 'Vertical field of view on foot; the car view moves with it. 64° is the default.',
  showFps: 'Shows a frames-per-second counter in the corner of the screen.',
};

interface Category { id: string; label: string; desc: string; gpu?: boolean }
const CATEGORIES: readonly Category[] = [
  { id: 'display', label: 'Display', desc: 'Full screen, frame rate and render resolution.', gpu: true },
  { id: 'graphics', label: 'Graphics', desc: 'The quality preset, shadows, textures and anti-aliasing.', gpu: true },
  { id: 'advanced', label: 'Advanced Graphics', desc: 'Draw distance, crowds, traffic and the post effects, one by one. Changed rows are marked on the left.', gpu: true },
  { id: 'audio', label: 'Audio', desc: 'Master volume for the whole game.' },
  { id: 'controls', label: 'Controls', desc: 'The controls for the device you are using now.' },
  { id: 'camera', label: 'Camera', desc: 'Field of view and look direction.' },
  { id: 'radio', label: 'Radio / Voices', desc: 'Radio volume and the radio library.' },
  { id: 'game', label: 'Game', desc: 'Reset, and what the minimap symbols mean.' },
];

const GFX_ROW_LABEL = new Map<GraphicsKey, AdvSpec>(ADVANCED_ROWS.map((r) => [r.key, r]));

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function hostedBuild(): boolean {
  try { return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_HOSTED === '1'; } catch { return false; }
}

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export class Menu {
  readonly root: HTMLElement;
  readonly pauseButton: HTMLButtonElement;
  readonly graphics: GraphicsStore;
  readonly fullscreen: FullscreenControl | null;
  private readonly doc: Document;
  private readonly shell: HTMLElement;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private readonly cleanup: Array<() => void> = [];
  private state: MenuSettings;
  private opened = false;
  private wasLocked = false;
  private restoreFocus: HTMLElement | null = null;
  private readonly touchEnabled: boolean;
  private readonly opts: MenuOptions;

  // shell
  private readonly tabBtns = new Map<MenuTab, HTMLButtonElement>();
  private readonly panes = new Map<MenuTab, HTMLElement>();
  private readonly tabHintL: HTMLButtonElement;
  private readonly tabHintR: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly cashEl: HTMLElement;
  private readonly whenEl: HTMLElement;
  private readonly streetEl: HTMLElement;
  private readonly footEl: HTMLElement;
  private tabId: MenuTab = 'settings';
  private col: 'cats' | 'opts' = 'cats';
  private inputMode: InputMode = 'keyboard';
  private infoTimer = 0;

  // settings / lists
  private readonly catList: RowList;
  private readonly optList: RowList;
  private readonly radioList: RowList;
  private readonly missionList: RowList;
  private readonly statList: RowList;
  private readonly settingsPane: HTMLElement;
  private readonly descs = new Map<string, DescPanel>();
  private catId = 'display';
  private readonly gfxRows = new Map<GraphicsKey, RowSpec>();
  private readonly specs = new Map<string, RowSpec>();
  private resetArmed = false;
  private resetTimer = 0;

  // embeds
  private savePanel: SavePanel | null = null;
  private readonly mapHost: HTMLElement;
  private mapHome: Node | null = null;
  private mapSwitching = false;

  // title screen / fps
  private readonly fsCorner: HTMLButtonElement;
  private readonly fsTitle: HTMLButtonElement;
  private readonly fpsEl: HTMLElement;
  private fpsRaf = 0;
  /** the tier the game runs now (the automatic drop can differ from the chosen one) */
  private liveTier: MenuQuality;
  private readonly deviceTier: MenuQuality;
  private readonly getLive: (() => MenuQuality) | undefined;

  // real counters
  private readonly born: number;
  private pausedMs = 0;
  private openedAt = 0;
  private pauses = 0;

  constructor(parent: HTMLElement, private readonly cb: MenuCallbacks = {}, opts: MenuOptions = {}) {
    this.doc = parent.ownerDocument;
    this.opts = opts;
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
    this.born = this.now();

    // ---- DOM: root > shell > header, tab bar, body, footer
    this.root = this.el('div', 'menu-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'menu-title');
    this.root.setAttribute('data-ui-modal', '');
    this.shell = this.el('div', 'gp-shell');

    const head = this.el('header', 'gp-head');
    this.backBtn = this.button('‹', 'gp-back');
    this.backBtn.setAttribute('aria-label', 'Back');
    this.backBtn.addEventListener('click', () => this.back());
    const titleBox = this.el('div', 'gp-titlebox');
    const title = this.el('h2', 'menu-title gp-title');
    title.id = 'menu-title';
    title.textContent = 'Paused';
    const sub = this.el('span', 'gp-game');
    sub.textContent = 'GTA Bed-Stuy';
    titleBox.append(sub, title);
    const player = this.el('div', 'gp-player');
    this.cashEl = this.el('b', 'gp-cash');
    this.whenEl = this.el('span', 'gp-when');
    this.streetEl = this.el('span', 'gp-street');
    player.append(this.cashEl, this.whenEl, this.streetEl);
    head.append(this.backBtn, titleBox, player);

    const bar = this.el('div', 'gp-tabbar');
    this.tabHintL = this.button('Q', 'gp-tabhint l');
    this.tabHintR = this.button('E', 'gp-tabhint r');
    this.tabHintL.setAttribute('aria-label', 'Previous tab');
    this.tabHintR.setAttribute('aria-label', 'Next tab');
    this.tabHintL.tabIndex = -1; this.tabHintR.tabIndex = -1;
    this.tabHintL.addEventListener('click', () => this.tab(-1));
    this.tabHintR.addEventListener('click', () => this.tab(1));
    const nav = this.el('nav', 'menu-tabs');
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Pause menu');
    for (const t of MENU_TABS) {
      const b = this.button(t.label, 'menu-tab');
      b.setAttribute('role', 'tab');
      b.dataset.tab = t.id;
      b.tabIndex = -1;
      b.addEventListener('click', () => this.showTab(t.id));
      b.hidden = (t.id === 'save' && !opts.saves) || (t.id === 'map' && !opts.map);
      this.tabBtns.set(t.id, b);
      nav.appendChild(b);
    }
    bar.append(this.tabHintL, nav, this.tabHintR);

    const body = this.el('div', 'gp-body');
    for (const t of MENU_TABS) {
      const pane = this.el('section', `gp-pane gp-pane-${t.id}`);
      pane.dataset.tab = t.id;
      pane.setAttribute('role', 'tabpanel');
      pane.hidden = true;
      this.panes.set(t.id, pane);
      body.appendChild(pane);
    }

    this.footEl = this.el('footer', 'gp-foot');

    // ---- lists
    const mkList = (cls: string, label: string, onHi: (r: RowSpec | null) => void, which: 'cats' | 'opts' | 'single'): RowList => new RowList(this.doc, {
      label,
      canHover: () => which !== 'cats' || this.col === 'cats',
      onHighlight: onHi,
      onChange: () => { this.afterChange(); },
      onPointer: () => { if (which === 'opts') this.focusCol('opts'); },
    }, cls);
    this.catList = mkList('gp-cats', 'Settings categories', (r) => { if (r) this.onCategory(r); }, 'cats');
    this.optList = mkList('gp-opts', 'Options', (r) => this.showDesc('settings', r), 'opts');
    this.radioList = mkList('gp-opts', 'Radio', (r) => this.showDesc('radio', r), 'single');
    this.missionList = mkList('gp-opts gp-missions', 'Missions', (r) => this.showDesc('missions', r), 'single');
    this.statList = mkList('gp-opts gp-stats', 'Stats', (r) => this.showDesc('stats', r), 'single');

    this.settingsPane = this.panes.get('settings')!;
    this.settingsPane.dataset.view = 'cats';
    const catsBox = this.column('gp-col gp-col-cats', this.catList.el);
    const optsBox = this.column('gp-col gp-col-opts', this.optList.el);
    this.settingsPane.append(catsBox, optsBox, this.descPanel('settings'));

    this.panes.get('radio')!.append(this.column('gp-col gp-col-opts', this.radioList.el), this.descPanel('radio'));
    this.panes.get('missions')!.append(this.column('gp-col gp-col-opts', this.missionList.el), this.descPanel('missions'));
    this.panes.get('stats')!.append(this.column('gp-col gp-col-opts', this.statList.el), this.descPanel('stats'));

    this.mapHost = this.el('div', 'gp-maphost');
    this.panes.get('map')!.appendChild(this.mapHost);
    if (opts.saves) {
      this.savePanel = new SavePanel(null, opts.saves, { canSave: opts.canSave, newGame: true, onDone: () => this.close() });
      const host = this.el('div', 'gp-savehost');
      host.appendChild(this.savePanel.root);
      this.panes.get('save')!.appendChild(host);
    }

    this.shell.append(head, bar, body, this.footEl);
    this.root.appendChild(this.shell);
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

    this.buildSpecs();
    this.catList.setRows(CATEGORIES.map((c) => this.catRow(c)));
    this.loadCategory(this.catId);
    this.radioList.setRows(this.rowsFor('radio-tab'));
    this.statList.setRows([]);
    this.missionList.setRows([]);

    this.setInputMode(opts.touch ? 'touch' : 'keyboard');
    this.showTab('settings', true);
    this.syncFs();
    this.syncFps();
    this.syncInfo();

    // ---- global listeners
    const win = this.doc.defaultView;
    const onKey = (e: KeyboardEvent) => this.onWindowKey(e);
    win?.addEventListener('keydown', onKey);
    this.cleanup.push(() => win?.removeEventListener('keydown', onKey));

    // advanced graphics: any change (slider, toggle, reset) re-syncs the rows and tells the host
    this.cleanup.push(this.graphics.onChange((changed) => { this.refreshAll(); this.syncFps(); this.cb.onGraphics?.(this.graphics.effective(this.liveTier), changed); }));

    // full screen: Esc (or the browser's own exit) leaves it, then the pause screen opens; a late resize event fixes Safari's stale size
    if (this.fullscreen) {
      this.cleanup.push(this.fullscreen.onChange((on, escaped) => {
        this.syncFs();
        this.refreshAll();
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

    // the embedded map: closing it (Esc / M inside the MAP tab) closes the menu; opening it elsewhere selects the tab
    if (opts.map) {
      const map = opts.map;
      const prevClose = map.onClose;
      map.onClose = () => { prevClose?.(); if (!this.mapSwitching && this.opened && this.tabId === 'map') this.close(); };
      this.cleanup.push(() => { map.onClose = prevClose; });
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
  get tabName(): MenuTab { return this.tabId; }
  get category(): string { return this.catId; }
  /** Which settings column has the focus. */
  get focusColumn(): 'cats' | 'opts' { return this.col; }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.pauses++;
    this.openedAt = this.now();
    this.restoreFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    this.root.hidden = false;
    this.root.classList.remove('gp-in'); void this.root.offsetWidth; this.root.classList.add('gp-in');
    this.pauseButton.hidden = true;
    this.syncLiveTier();
    this.syncInfo();
    try { this.doc.exitPointerLock?.(); } catch { /* not locked / unsupported */ }
    this.cb.onPause?.(true);
    const win = this.doc.defaultView;
    if (win) this.infoTimer = win.setInterval(() => this.syncInfo(), 1000);
    this.showTab(this.tabId, true);
    this.focusList();
  }

  close(): void {
    if (!this.opened) return;
    this.leaveMap();
    this.opened = false;
    this.pausedMs += this.now() - this.openedAt;
    this.doc.defaultView?.clearInterval(this.infoTimer);
    this.root.hidden = true;
    this.pauseButton.hidden = !this.touchEnabled;
    this.disarmReset();
    const prev = this.restoreFocus;
    this.restoreFocus = null;
    if (prev && prev.isConnected && prev.tagName !== 'CANVAS') prev.focus(); else (this.doc.activeElement as HTMLElement | null)?.blur?.();
    this.cb.onPause?.(false);
  }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  /** Selects a tab (the SAVE and MAP tabs exist only with `saves` / `map`). */
  showTab(id: MenuTab, force = false): void {
    if (this.tabBtns.get(id)?.hidden) return;
    if (id === this.tabId && !force) { this.focusList(); return; }
    if (this.tabId === 'map' && id !== 'map') this.leaveMap();
    this.tabId = id;
    for (const [k, b] of this.tabBtns) {
      const on = k === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    for (const [k, p] of this.panes) p.hidden = k !== id;
    const pane = this.panes.get(id)!;
    pane.classList.remove('gp-swap'); void pane.offsetWidth; pane.classList.add('gp-swap');
    this.root.dataset.tab = id;
    if (id === 'settings') { this.col = 'cats'; this.settingsPane.dataset.view = 'cats'; }
    if (this.opened) this.enterTab(id);
    this.syncFoot();
    this.syncBack();
    this.syncLists();
    if (this.opened) this.focusList();
  }

  /** Next / previous tab (Q / E, LB / RB), skipping tabs that are not shown. */
  tab(delta: -1 | 1): void {
    const ids = MENU_TABS.map((t) => t.id).filter((id) => !this.tabBtns.get(id)?.hidden);
    const at = ids.indexOf(this.tabId);
    this.showTab(ids[(at + delta + ids.length) % ids.length]);
  }

  /** Highlights the controls for the device in use. */
  setInputMode(mode: InputMode): void {
    this.inputMode = mode;
    this.root.dataset.input = mode;
    this.tabHintL.textContent = mode === 'gamepad' ? 'LB' : mode === 'touch' ? '‹' : 'Q';
    this.tabHintR.textContent = mode === 'gamepad' ? 'RB' : mode === 'touch' ? '›' : 'E';
    if (this.catId === 'controls') this.loadCategory('controls', true);
    this.syncFoot();
  }

  /** Gamepad / programmatic navigation. No-op while closed. */
  navigate(dir: NavDir): void {
    if (!this.opened) return;
    switch (dir) {
      case 'up': this.moveList(-1); break;
      case 'down': this.moveList(1); break;
      case 'left': this.sideways(-1); break;
      case 'right': this.sideways(1); break;
      case 'confirm': this.confirm(); break;
      case 'back': this.back(); break;
    }
  }

  dispose(): void {
    this.cleanup.splice(0).forEach((fn) => fn());
    this.savePanel?.dispose();
    this.leaveMap();
    const win = this.doc.defaultView;
    win?.cancelAnimationFrame?.(this.fpsRaf);
    win?.clearInterval(this.infoTimer);
    win?.clearTimeout(this.resetTimer);
    this.fullscreen?.dispose();
    this.root.remove();
    this.pauseButton.remove();
    this.fsCorner.remove(); this.fsTitle.remove(); this.fpsEl.remove();
  }

  /* ---------- navigation ---------- */

  private activeList(): RowList | null {
    switch (this.tabId) {
      case 'settings': return this.col === 'cats' ? this.catList : this.optList;
      case 'radio': return this.radioList;
      case 'missions': return this.missionList;
      case 'stats': return this.statList;
      default: return null;
    }
  }

  private syncLists(): void {
    const act = this.activeList();
    for (const l of [this.catList, this.optList, this.radioList, this.missionList, this.statList]) l.setActive(l === act);
    // the categories column stays "selected" (dim bar) while the options column has the focus
    this.catList.el.classList.toggle('dim', this.tabId === 'settings' && this.col === 'opts');
  }

  private focusList(): void {
    const l = this.activeList();
    if (l && this.opened) l.highlight(l.index, true);
    else if (this.opened) (this.tabBtns.get(this.tabId))?.focus();
  }

  private focusCol(c: 'cats' | 'opts'): void {
    if (this.tabId !== 'settings') return;
    this.col = c;
    this.settingsPane.dataset.view = c;
    this.syncLists();
    this.syncBack();
    this.syncFoot();
    const l = this.activeList();
    l?.highlight(l.index, true);
    if (c === 'opts') this.showDesc('settings', this.optList.current);
    else this.showDesc('settings', this.catList.current);
  }

  private moveList(d: 1 | -1): void {
    const l = this.activeList();
    if (!l) return;
    l.move(d);
    this.syncFoot();
  }

  private sideways(d: -1 | 1): void {
    if (this.tabId === 'settings' && this.col === 'cats') { if (d > 0) this.focusCol('opts'); return; }
    const l = this.activeList();
    if (l?.adjust(d)) this.syncFoot();
  }

  private confirm(): void {
    if (this.tabId === 'settings' && this.col === 'cats') { this.focusCol('opts'); return; }
    this.activeList()?.activate();
  }

  /** B / Backspace / the back arrow: out of the options column, else resume. */
  back(): void {
    if (this.tabId === 'settings' && this.col === 'opts') { this.focusCol('cats'); return; }
    this.close();
  }

  private onWindowKey(e: KeyboardEvent): void {
    if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); this.toggle(); return; }
    if (!this.opened || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox' && (t as HTMLInputElement).type !== 'range'));
    if (typing) return;
    if (e.code === 'KeyQ' || e.code === 'PageUp') { e.preventDefault(); this.tab(-1); return; }
    if (e.code === 'KeyE' || e.code === 'PageDown') { e.preventDefault(); this.tab(1); return; }
    const onBtn = t?.tagName === 'BUTTON' && !t.classList.contains('gp-arrow');
    const lists = this.activeList();
    if (!lists) {
      if (e.code === 'Tab' && this.trapTab(e)) return;
      if (e.code === 'Backspace' && this.tabId !== 'save') { e.preventDefault(); this.back(); }
      return;
    }
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': e.preventDefault(); this.moveList(-1); break;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); this.moveList(1); break;
      case 'ArrowLeft': case 'KeyA': e.preventDefault(); this.sideways(-1); break;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); this.sideways(1); break;
      case 'Enter': case 'NumpadEnter': case 'Space':
        if (onBtn && !t.classList.contains('menu-tab')) return; // a focused button handles its own Enter / Space
        if (t?.classList.contains('menu-tab')) { e.preventDefault(); this.focusList(); return; }
        e.preventDefault(); this.confirm(); break;
      case 'Backspace': e.preventDefault(); this.back(); break;
      case 'Tab': this.trapTab(e); break;
      default: break;
    }
  }

  /** Tab / Shift+Tab stay inside the dialog. */
  private trapTab(e: KeyboardEvent): boolean {
    const items = Array.from(this.root.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')).filter((n) => n.tabIndex >= 0 && !(n as HTMLButtonElement).disabled && !n.closest('[hidden]'));
    if (!items.length) return false;
    const first = items[0], last = items[items.length - 1];
    const active = this.doc.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !active || !this.root.contains(active))) { e.preventDefault(); last.focus(); return true; }
    if (!e.shiftKey && (active === last || !active || !this.root.contains(active))) { e.preventDefault(); first.focus(); return true; }
    return false;
  }

  /* ---------- tabs: content ---------- */

  private enterTab(id: MenuTab): void {
    if (id === 'map') this.enterMap();
    else if (id === 'save') this.savePanel?.refresh();
    else if (id === 'missions') this.fillMissions();
    else if (id === 'stats') this.fillStats();
    else if (id === 'radio') { this.radioList.refresh(); }
    this.syncInfo();
  }

  private enterMap(): void {
    const map = this.opts.map;
    if (!map) return;
    if (!this.mapHome) this.mapHome = map.root.parentNode;
    this.mapHost.appendChild(map.root);
    this.mapSwitching = true;
    try { if (!map.isOpen) map.open(); } finally { this.mapSwitching = false; }
  }

  private leaveMap(): void {
    const map = this.opts.map;
    if (!map || !this.mapHome) return;
    this.mapSwitching = true;
    try { if (map.isOpen) map.close(); } finally { this.mapSwitching = false; }
    if (map.root.parentNode === this.mapHost) this.mapHome.appendChild(map.root);
  }

  private fillMissions(): void {
    const log = this.opts.missionLog?.();
    const rows: RowSpec[] = [];
    if (!log) {
      rows.push({ id: 'm:none', label: 'No mission log in this build', kind: 'info', desc: 'The mission log lists every job with its act and state. It is not wired into this menu yet.', text: () => '' });
    } else if (log.length === 0) {
      rows.push({ id: 'm:empty', label: 'No missions yet', kind: 'info', desc: 'Walk up to a gold marker on the street to be offered a job.', text: () => '' });
    } else {
      const order: Record<MissionLogEntry['state'], number> = { active: 0, open: 1, failed: 2, done: 3, locked: 4 };
      const sorted = [...log].sort((a, b) => (a.act ?? 9) - (b.act ?? 9) || order[a.state] - order[b.state]);
      const label: Record<MissionLogEntry['state'], string> = { active: 'In progress', open: 'Available', failed: 'Failed', done: 'Done', locked: 'Locked' };
      for (const m of sorted) {
        rows.push({
          id: `m:${m.id}`, label: m.title, kind: 'info',
          desc: [m.act ? `Act ${m.act}` : '', m.tag === 'side' ? 'Side job' : '', label[m.state]].filter(Boolean).join(' · ') + (m.objective ? `\n${m.objective}` : ''),
          text: () => label[m.state], state: () => m.state, dim: () => m.state === 'locked',
        });
      }
    }
    this.missionList.setRows(rows);
    this.syncLists();
  }

  private fillStats(keep = false): void {
    const info = this.opts.info?.() ?? {};
    const played = Math.max(0, this.now() - this.born - this.pausedMs - (this.opened ? this.now() - this.openedAt : 0));
    const rows: Array<readonly [string, string]> = [
      ...(typeof info.cash === 'number' ? [['Cash', money(info.cash)] as const] : []),
      ...(typeof info.day === 'number' ? [['Day', formatDay(info.day)] as const] : []),
      ...(info.stats ?? []),
      ['Time played', formatPlayed(played)],
      ['Times paused', String(this.pauses)],
    ];
    this.statList.setRows(rows.map(([k, v]) => ({ id: `s:${k}`, label: k, kind: 'info' as const, desc: `${k}: ${v}`, text: () => v })), keep);
    this.syncLists();
  }

  /* ---------- header / footer ---------- */

  private syncInfo(): void {
    const i = this.opts.info?.() ?? {};
    const set = (el: HTMLElement, text: string): void => { el.hidden = text === ''; if (el.textContent !== text) el.textContent = text; };
    set(this.cashEl, typeof i.cash === 'number' ? money(i.cash) : '');
    set(this.whenEl, typeof i.hour === 'number' ? `${typeof i.day === 'number' ? `${formatDay(i.day)}  ` : ''}${formatClock(i.hour)}` : '');
    set(this.streetEl, i.street ?? '');
    if (this.opened && this.tabId === 'radio') this.radioList.refresh();
    if (this.opened && this.tabId === 'stats') this.fillStats(true);
  }

  private syncBack(): void {
    const inner = this.tabId === 'settings' && this.col === 'opts';
    this.backBtn.setAttribute('aria-label', inner ? 'Back to categories' : 'Resume');
    this.backBtn.dataset.mode = inner ? 'back' : 'resume';
  }

  private syncFoot(): void {
    const m = this.inputMode;
    const lists = this.activeList() !== null;
    const opts = this.tabId !== 'settings' || this.col === 'opts';
    const prompts: Array<[string, string]> = [];
    if (m === 'keyboard') {
      if (lists) prompts.push(['↑↓', 'Select']);
      if (lists && opts && this.tabId !== 'missions' && this.tabId !== 'stats') prompts.push(['←→', 'Change']);
      if (lists) prompts.push(['Enter', 'Accept']);
      if (this.tabId === 'settings' && this.col === 'opts') prompts.push(['Backspace', 'Back']);
      prompts.push(['Q E', 'Tabs'], ['Esc', 'Resume']);
    } else if (m === 'gamepad') {
      if (lists) prompts.push(['D-pad', 'Select']);
      if (lists) prompts.push(['A', 'Accept']);
      prompts.push(['B', this.tabId === 'settings' && this.col === 'opts' ? 'Back' : 'Resume'], ['LB RB', 'Tabs'], ['Start', 'Resume']);
    } else {
      prompts.push(['Tap', 'Select'], ['‹', 'Back']);
    }
    this.footEl.textContent = '';
    for (const [k, t] of prompts) {
      const s = this.el('span', 'gp-prompt');
      const key = this.el('kbd', 'gp-key');
      key.textContent = k;
      s.append(key, this.doc.createTextNode(t));
      this.footEl.appendChild(s);
    }
    const hint = this.el('span', 'gp-foot-fill');
    this.footEl.insertBefore(hint, this.footEl.firstChild);
  }

  /* ---------- settings: specs ---------- */

  private sup(): ReturnType<typeof supports> { return supports(this.liveTier as Quality); }
  private eff(): GraphicsSettings { return this.graphics.effective(this.liveTier as Quality); }

  private gfxRow(key: GraphicsKey): RowSpec {
    const adv = GFX_ROW_LABEL.get(key)!;
    const c = adv.control;
    const base: RowSpec = {
      id: `g:${key}`, label: adv.label, desc: GFX_DESC[key], gfx: key, kind: 'toggle',
      visible: () => this.sup().keys.has(key),
      custom: () => this.graphics.isOverridden(key),
      get: () => this.eff()[key] as string | number | boolean,
    };
    if (c.kind === 'range') {
      return { ...base, kind: 'slider', min: c.min, max: c.max, step: c.step, fmt: (v) => c.fmt(v / c.scale),
        get: () => Math.round((this.eff()[key] as number) * c.scale),
        set: ((v: number) => { this.graphics.set(key, (v / c.scale) as never); }) as RowSpec['set'] };
    }
    if (c.kind === 'bool') return { ...base, kind: 'toggle', set: ((v: boolean) => { this.graphics.set(key, v as never); }) as RowSpec['set'] };
    return {
      ...base, kind: 'seg',
      options: () => c.options.map(([value, label]) => ({ value, label, hidden: key === 'shadows' && !this.sup().shadows.includes(value as ShadowMode) })),
      set: ((v: string | number) => { this.graphics.set(key, v as never); }) as RowSpec['set'],
    };
  }

  private buildSpecs(): void {
    for (const r of ADVANCED_ROWS) this.gfxRows.set(r.key, this.gfxRow(r.key));
    const fs = this.fullscreen;
    const S = this.specs;
    S.set('fullscreen', {
      id: 'fullscreen', label: 'Full screen', kind: 'toggle', desc: 'Fills the whole screen with no browser bars. Alt+Enter also toggles it. Esc leaves full screen and opens this menu.',
      visible: () => !!fs?.supported, get: () => !!fs?.active, set: (() => { void fs?.toggle(); }) as RowSpec['set'],
    });
    S.set('install', {
      id: 'install', label: 'Install as app', kind: 'info', desc: 'Chrome: menu, Cast, save and share, Install page as app. Safari: File, Add to Dock. It then opens in its own window with no browser bars.',
      visible: () => (this.opts.installable ?? hostedBuild()) && !this.isStandalone(), text: () => 'How to',
    });
    S.set('quality', {
      id: 'quality', label: 'Quality preset', kind: 'seg', gfx: 'preset',
      desc: 'A preset sets shadows, effects, draw distance and traffic together. Auto starts at your device’s default and steps down by itself when the frame rate drops. Changes you make in the rows below are kept on top of the preset.',
      options: () => [{ value: 'auto', label: this.state.auto ? `Auto (${cap(this.liveTier)})` : 'Auto' }, ...QUALITIES.map((q) => ({ value: q, label: cap(q) }))],
      get: () => (this.state.auto ? 'auto' : this.state.quality),
      set: ((v: string) => { if (v === 'auto') this.setAuto(true); else this.setQuality(v as MenuQuality); }) as RowSpec['set'],
    });
    S.set('master', { id: 'master', label: 'Master volume', kind: 'slider', min: 0, max: 100, step: 5, desc: 'Volume of everything in the game.', fmt: (v) => `${v}%`, get: () => Math.round(this.state.master * 100), set: ((v: number) => this.setMaster(v / 100)) as RowSpec['set'] });
    S.set('radiovol', { id: 'radiovol', label: 'Radio volume', kind: 'slider', min: 0, max: 100, step: 5, desc: 'Volume of the radio stations, relative to the master volume.', fmt: (v) => `${v}%`, get: () => Math.round(this.state.radio * 100), set: ((v: number) => this.setRadio(v / 100)) as RowSpec['set'] });
    S.set('radiolib', { id: 'radiolib', label: 'Radio library', kind: 'action', desc: 'Opens the radio library: tracks, stations and the playlist.', press: () => { this.cb.onRadioLibrary?.(); } });
    S.set('station', { id: 'station', label: 'Tuned to', kind: 'info', desc: 'The station playing now. Press E in the game (Y on a gamepad) to change it.', text: () => this.opts.info?.().station || 'Off' });
    S.set('invert', { id: 'invert', label: 'Invert look Y', kind: 'toggle', desc: 'Inverts vertical look for the mouse, the right stick and touch drag.', get: () => this.state.invertY, set: ((v: boolean) => this.setInvertY(v)) as RowSpec['set'] });
    S.set('reset', {
      id: 'reset', label: 'Reset position', kind: 'action',
      desc: 'Moves you back to the starting spot and clears missions, records, phone messages and cash. Press twice to confirm.',
      text: () => (this.resetArmed ? 'PRESS AGAIN' : '›'),
      press: () => {
        if (!this.resetArmed) { this.resetArmed = true; this.refreshAll(); const w = this.doc.defaultView; if (w) this.resetTimer = w.setTimeout(() => this.disarmReset(), 3500); return; }
        this.disarmReset(); clearPosition(); this.cb.onReset?.(); this.close();
      },
    });
    S.set('gfxreset', {
      id: 'gfxreset', label: 'Reset to preset', kind: 'action', desc: 'Drops every change below and follows the quality preset again.',
      text: () => (this.graphics.hasOverrides ? `${Object.keys(this.graphics.raw).length} changed` : 'No changes'),
      dim: () => !this.graphics.hasOverrides, press: () => { this.graphics.reset(); },
    });
  }

  private isStandalone(): boolean {
    try {
      const mm = this.doc.defaultView?.matchMedia;
      return !!mm && ['fullscreen', 'standalone'].some((m) => mm.call(this.doc.defaultView, `(display-mode: ${m})`).matches);
    } catch { return false; }
  }

  private disarmReset(): void {
    this.doc.defaultView?.clearTimeout(this.resetTimer);
    if (this.resetArmed) { this.resetArmed = false; this.refreshAll(); }
  }

  private rowsFor(cat: string): RowSpec[] {
    const S = this.specs, G = this.gfxRows;
    const g = (...keys: GraphicsKey[]): RowSpec[] => keys.map((k) => G.get(k)!);
    switch (cat) {
      case 'display': return [S.get('fullscreen')!, S.get('install')!, ...g('fpsCap', 'showFps', 'resolution', 'nativeDpr')];
      case 'graphics': return [S.get('quality')!, ...g('shadows', 'textures', 'aa')];
      case 'advanced': return [...g('drawDistance', 'treeRange', 'crowd', 'traffic', 'ao', 'bloom', 'dof', 'vignette', 'grain'), S.get('gfxreset')!];
      case 'audio': return [S.get('master')!];
      case 'controls': return CONTROLS[this.inputMode].rows.map(([k, v]) => ({ id: `c:${k}`, label: k, kind: 'info' as const, desc: `${k}: ${v}. These are the ${CONTROLS[this.inputMode].title.toLowerCase()} controls; the list follows the device you are using.`, text: () => v }));
      case 'camera': return [...g('fov'), S.get('invert')!];
      case 'radio': case 'radio-tab': return [...(cat === 'radio-tab' ? [S.get('station')!] : []), S.get('radiovol')!, S.get('radiolib')!];
      case 'game': return [S.get('reset')!, ...MINIMAP_LEGEND.map((item) => ({ id: `l:${item.text}`, label: item.text, kind: 'info' as const, desc: `On the minimap: ${item.text}.`, text: () => '', swatch: { color: item.swatch, shape: item.shape } }))];
      default: return [];
    }
  }

  private catRow(c: Category): RowSpec {
    return { id: `cat:${c.id}`, label: c.label, kind: 'action', desc: c.desc, gfx: c.gpu ? 'cat' : undefined, text: () => '›', press: () => { this.focusCol('opts'); } };
  }

  private onCategory(r: RowSpec): void {
    const id = r.id.slice(4);
    if (id !== this.catId) this.loadCategory(id);
    this.showDesc('settings', r);
  }

  private loadCategory(id: string, keep = false): void {
    this.catId = id;
    this.optList.setRows(this.rowsFor(id), keep);
    this.optList.el.dataset.cat = id;
    this.syncLists();
  }

  private afterChange(): void {
    this.refreshAll();
    this.syncFoot();
  }

  private refreshAll(): void {
    this.optList.refresh(); this.radioList.refresh(); this.catList.refresh();
    this.showDesc(this.tabId === 'settings' ? 'settings' : (this.tabId as string), (this.activeList() ?? this.optList).current);
  }

  /* ---------- description panel ---------- */

  private column(cls: string, content: HTMLElement): HTMLElement {
    const c = this.el('div', cls);
    c.appendChild(content);
    return c;
  }

  private descPanel(key: string): HTMLElement {
    const root = this.el('aside', 'gp-desc');
    const title = this.el('h3', 'gp-desc-title');
    const text = this.el('p', 'gp-desc-text');
    const meta = this.el('p', 'gp-desc-meta');
    const gpu = this.el('div', 'gp-gpu');
    gpu.hidden = true;
    const h1 = this.el('div', 'gp-gpu-h');
    const l1 = this.el('span', ''); l1.textContent = 'GPU load';
    const v1 = this.el('b', '');
    h1.append(l1, v1);
    const m1 = this.el('div', 'gp-meter');
    const f1 = this.el('i', '');
    m1.appendChild(f1);
    const h2 = this.el('div', 'gp-gpu-h sub');
    const l2 = this.el('span', ''); l2.textContent = 'This setting';
    const v2 = this.el('b', '');
    h2.append(l2, v2);
    const m2 = this.el('div', 'gp-meter thin');
    const f2 = this.el('i', '');
    m2.appendChild(f2);
    const note = this.el('p', 'gp-gpu-note');
    note.textContent = 'A rough guide for this device tier, not a benchmark.';
    gpu.append(h1, m1, h2, m2, note);
    root.append(title, text, meta, gpu);
    this.descs.set(key, { root, title, text, meta, gpu, total: f1, totalLabel: v1, own: f2, ownLabel: v2, ownBox: [h2, m2] });
    return root;
  }

  private showDesc(key: string, row: RowSpec | null): void {
    const d = this.descs.get(key);
    if (!d) return;
    d.root.hidden = false;
    if (!row) { d.title.textContent = ''; d.text.textContent = ''; d.meta.textContent = ''; d.gpu.hidden = true; return; }
    d.title.textContent = row.label;
    d.text.textContent = row.desc ?? '';
    d.text.style.whiteSpace = row.desc?.includes('\n') ? 'pre-line' : '';
    let meta = '';
    if (row.kind === 'seg' || row.kind === 'toggle' || row.kind === 'slider') {
      const v = row.get?.();
      const shown = row.kind === 'toggle' ? (v ? 'On' : 'Off') : row.kind === 'slider' ? (row.fmt ? row.fmt(Number(v)) : String(v)) : row.options?.().find((o) => o.value === v)?.label ?? String(v);
      meta = `Now: ${shown}`;
      if (row.custom?.()) meta += '  ·  changed from the preset';
    }
    d.meta.textContent = meta;
    const tier = this.liveTier as Quality;
    const showGpu = !!row.gfx;
    d.gpu.hidden = !showGpu;
    if (showGpu) {
      const load = gpuLoad(this.eff(), tier);
      d.total.style.width = `${Math.round(load * 100)}%`;
      d.totalLabel.textContent = loadLabel(load);
      const key2 = row.gfx as GraphicsKey;
      const own = row.gfx && row.gfx in GFX_DESC;
      for (const n of d.ownBox) n.hidden = !own;
      if (own) {
        const o = optionLoad(key2, this.eff());
        d.own.style.width = `${Math.round(o * 100)}%`;
        d.ownLabel.textContent = loadLabel(o);
      }
    }
  }

  /* ---------- settings: state ---------- */

  /** A tier choice: picks the tier and turns Auto off. */
  private setQuality(q: MenuQuality): void {
    const wasAuto = this.state.auto;
    this.state.auto = false;
    if (wasAuto) this.cb.onAuto?.(false);
    this.liveTier = q;
    if (this.state.quality === q) { this.save(); this.afterTier(); if (wasAuto) this.cb.onQuality?.(q); return; }
    this.state.quality = q; this.save(); this.afterTier(); this.cb.onQuality?.(q);
  }

  /** Auto preset: the device's default tier and the automatic drop. */
  private setAuto(on: boolean): void {
    if (!on) { this.setQuality(this.state.quality); return; }
    const was = this.state.auto, prevTier = this.liveTier;
    this.state.auto = true; this.state.quality = this.deviceTier; this.liveTier = this.deviceTier;
    this.save(); this.afterTier();
    if (!was) this.cb.onAuto?.(true);
    if (prevTier !== this.deviceTier) this.cb.onQuality?.(this.deviceTier);
  }

  private afterTier(): void { this.refreshAll(); this.syncFps(); }

  private syncLiveTier(): void {
    const q = this.getLive?.();
    if (q && q !== this.liveTier) { this.liveTier = q; this.afterTier(); }
  }
  private setMaster(v: number): void { this.state.master = clamp01(v, 1); this.save(); this.cb.onMasterVolume?.(this.state.master); }
  private setRadio(v: number): void { this.state.radio = clamp01(v, 1); this.save(); this.cb.onRadioVolume?.(this.state.radio); }
  private setInvertY(b: boolean): void { this.state.invertY = b; this.save(); this.cb.onInvertLookY?.(b); }

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

  /* ---------- full screen / FPS ---------- */

  private splashShowing(): boolean {
    const el = this.root.parentElement?.querySelector<HTMLElement>('.hud-splash');
    return !!el && el.style.display !== 'none' && !el.classList.contains('fading');
  }

  private syncFs(): void {
    const fs = this.fullscreen;
    const ok = !!fs?.supported;
    const on = !!fs?.active;
    this.fsCorner.hidden = this.touchEnabled || !ok;
    this.fsCorner.textContent = on ? '✕' : '⛶';
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

  /* ---------- helpers ---------- */

  private now(): number { return this.doc.defaultView?.performance?.now() ?? Date.now(); }

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
}

interface DescPanel {
  root: HTMLElement; title: HTMLElement; text: HTMLElement; meta: HTMLElement; gpu: HTMLElement;
  total: HTMLElement; totalLabel: HTMLElement; own: HTMLElement; ownLabel: HTMLElement; ownBox: HTMLElement[];
}

const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

function formatPlayed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

/** Builds the MISSIONS entries from a MissionSystem (feature-detect the pieces: older builds lack `act` / `tag`). */
export function missionLogOf(sys: {
  missions: ReadonlyArray<{ id: string; title: string; act?: number; tag?: string; requires?: string[] }>;
  statusOf(id: string): string | null;
  isOffered?(id: string): boolean;
  activeId?: string | null;
}): MissionLogEntry[] {
  return sys.missions.map((m) => {
    const st = sys.statusOf(m.id);
    const state: MissionLogEntry['state'] = st === 'active' ? 'active' : st === 'complete' ? 'done' : st === 'failed' ? 'failed'
      : sys.isOffered ? (sys.isOffered(m.id) ? 'open' : 'locked') : 'open';
    return { id: m.id, title: m.title, act: m.act, tag: m.tag, state };
  });
}
