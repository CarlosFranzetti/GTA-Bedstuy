/**
 * Pause menu in the layout of a console-era open-world pause screen (original art, no third-party assets):
 * a dark translucent backdrop over the blurred game, a header (game title left, player info right), a tab bar
 * (MAP, MISSIONS, STATS, SETTINGS, SAVE, RADIO) and a body. SETTINGS is three columns: categories, option rows
 * with right-aligned values, and a description panel with a rough GPU load bar for graphics options.
 *
 * Opens on Esc, gamepad Start (via `toggle()`), the touch pause button, or when the browser releases pointer lock.
 * MENU2: every change applies at once (no Apply step). Settings are grouped Game / Controls / Audio / Graphics / Map; each group
 * ends with a "Reset to defaults" row that asks once. One focus: the highlighted row is what hover, the keyboard and the pad all
 * act on, moved by whichever device was used last. Back (Esc, B, a right click, the Back button) cancels a pending question, then
 * resumes. Resume re-locks the pointer from the same click or key (the PanelManager decides; see src/ui/PanelManager.ts).
 * Keyboard: Q / E (or PageUp / PageDown) tabs, arrows or WASD select and change, Enter accepts, Backspace goes back, Esc resumes.
 * Gamepad: D-pad, A, B, LB / RB (`tab()`), Start. Mouse and touch: every row, arrow and bar is clickable / draggable.
 *
 * Settings persist to localStorage (wrapped; a blocked/absent store just means no persistence).
 * The root uses the `hidden` attribute and `data-ui-modal`, which `Input` uses to leave typing/focus keys alone.
 */
import { ControlsPane } from './ControlsPane';
import { glyphFor } from '@/core/Bindings';
import { TOUCH_ROWS } from '@/core/ControlsHelp';
import './menu.css';
import type { InputMode } from '@/core/Input';
import type { NavDir } from '@/core/Gamepad';
import { clearPosition } from './SaveState';
import { MINIMAP_LEGEND } from './Minimap';
import { formatClock, formatDay, type SaveManager } from './GameSave';
import { SavePanel } from './SavePanel';
import { FullscreenControl } from './Fullscreen';
import { RowList, type RowSpec } from './menuRows';
import { setPanelClass } from './panelKeys';
import { menuArtSvg } from './menuArt';
import { MIX_LABELS, MIX_DESC, type MixKey } from '@/audio/Mixer';
import { isNativeApp, nativeQuit, nativeShell } from '@/native/NativeBridge';
import { currentMap, mapSwitchUrl, type MapChoice } from '@/world/mapChoice';
import {
  GraphicsStore, supports, presetFor, SHADOW_MODES, FPS_CAPS, RANGES, gpuLoad, optionLoad, loadLabel,
  type GraphicsKey, type GraphicsSettings, type ShadowMode,
} from './GraphicsSettings';
import type { Quality } from '@/render/Shadows';

export type MenuQuality = 'phone' | 'low' | 'medium' | 'high';
export const QUALITIES: readonly MenuQuality[] = ['phone', 'low', 'medium', 'high'];
export const SETTINGS_KEY = 'gta-bedstuy.settings.v1';

export type MenuTab = 'map' | 'missions' | 'stats' | 'settings' | 'controls' | 'save' | 'radio';
export const MENU_TABS: ReadonlyArray<{ id: MenuTab; label: string }> = [
  { id: 'map', label: 'Map' }, { id: 'missions', label: 'Missions' }, { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' }, { id: 'controls', label: 'Controls' }, { id: 'save', label: 'Save' }, { id: 'radio', label: 'Radio' },
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
  /** Last Engine Sound position (0..1) above zero: what the Engine sound switch restores when turned back On. */
  engineLast: number;
}

/** The settings groups, in order. */
export type SettingsGroup = 'game' | 'controls' | 'audio' | 'graphics' | 'map';
export const SETTINGS_GROUPS: ReadonlyArray<{ id: SettingsGroup; label: string }> = [
  { id: 'game', label: 'Game' }, { id: 'controls', label: 'Controls' }, { id: 'audio', label: 'Audio' }, { id: 'graphics', label: 'Graphics' }, { id: 'map', label: 'Map' },
];

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
  /** Opens the credits roll (Settings > Game > Credits). Omit and the row is not shown. */
  onCredits?: () => void;
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
  /** HD voices switch (the host's AudioSystem: hdVoices / setHdVoices / hdLabel). Omit and the row is not shown. */
  hdVoices?: { get(): boolean; set(on: boolean): void; label?(): string };
  /** The audio mixer (AudioSystem.mixer): five volume sliders in the Audio group, saved by the mixer. Omit and only Master and Radio show, on the menu's own settings. */
  mixer?: { get(k: MixKey): number; set(k: MixKey, v: number): void; onChange?(fn: (k: MixKey) => void): () => void };
  /** Show the "install as app" hint (hosted build only). Default: true when built with VITE_HOSTED=1. */
  installable?: boolean;
  /** The "Map" row (Real streets / Classic grid): hosted and native builds only. Defaults read the build flag and `location`; tests inject. `go` gets the address of the other map. */
  mapSwitch?: { available: boolean; current: MapChoice; go(url: string): void; handheld?: boolean };
}

const DEFAULTS: MenuSettings = { quality: 'medium', auto: false, master: 1, radio: 1, invertY: false, engineLast: 1 };

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
  private readonly resumeBtn: HTMLButtonElement;
  private readonly footBack: HTMLButtonElement;
  private readonly cashEl: HTMLElement;
  private readonly whenEl: HTMLElement;
  private readonly streetEl: HTMLElement;
  private readonly footEl: HTMLElement;
  private tabId: MenuTab = 'settings';
  private controlsPane!: ControlsPane;
  private inputMode: InputMode = 'keyboard';
  private infoTimer = 0;

  // settings / lists
  private readonly optList: RowList;
  private readonly radioList: RowList;
  private readonly missionList: RowList;
  private readonly statList: RowList;
  private readonly settingsPane: HTMLElement;
  private group: SettingsGroup = 'game';
  private onChips = false;
  private readonly chipBtns = new Map<SettingsGroup, HTMLButtonElement>();
  private readonly groupSpecs = new Map<SettingsGroup, RowSpec[]>();
  private resetGroupArmed: SettingsGroup | null = null;
  private resetGroupTimer = 0;
  private readonly titleEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly descs = new Map<string, DescPanel>();
  private readonly gfxRows = new Map<GraphicsKey, RowSpec>();
  private readonly specs = new Map<string, RowSpec>();
  private nativeFs = false;
  private quitArmed = false;
  private resetArmed = false;
  private resetTimer = 0;
  private mapArmed = false;
  private mapTimer = 0;

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
    const art = this.el('div', 'gp-art');
    art.innerHTML = menuArtSvg();
    this.root.appendChild(art);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'menu-title');
    this.root.setAttribute('data-ui-modal', '');
    // Right click goes back one step, like Esc (the PanelManager does this first when it is attached).
    this.root.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.opened && (e as PointerEvent).pointerType !== 'touch') this.back(); });
    this.shell = this.el('div', 'gp-shell');

    const head = this.el('header', 'gp-head');
    const titleBox = this.el('div', 'gp-titlebox');
    const title = this.el('h2', 'menu-title gp-title');
    title.id = 'menu-title';
    title.textContent = 'Settings';
    this.titleEl = title;
    const sub = this.el('span', 'gp-game');
    sub.textContent = 'GTA Bed-Stuy';
    titleBox.append(sub, title);
    const player = this.el('div', 'gp-player');
    this.cashEl = this.el('b', 'gp-cash');
    this.whenEl = this.el('span', 'gp-when');
    this.streetEl = this.el('span', 'gp-street');
    player.append(this.cashEl, this.whenEl, this.streetEl);
    this.resumeBtn = this.button('Resume', 'gp-x gp-resume');
    this.resumeBtn.setAttribute('aria-label', 'Resume');
    this.resumeBtn.addEventListener('click', () => this.close());
    head.append(titleBox, player, this.resumeBtn);

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
    this.footBack = this.button('Back', 'gp-foot-back');
    this.footBack.setAttribute('aria-label', 'Back');
    this.footBack.addEventListener('click', () => this.back());

    // ---- lists
    const mkList = (cls: string, label: string, onHi: (r: RowSpec | null) => void, which: 'opts' | 'single'): RowList => new RowList(this.doc, {
      label,
      onHighlight: onHi,
      onChange: () => { this.afterChange(); },
      onPointer: () => { if (which === 'opts') this.setChips(false); },
    }, cls);
    this.optList = mkList('gp-opts', 'Options', (r) => this.showDesc('settings', r), 'opts');
    this.radioList = mkList('gp-opts', 'Radio', (r) => this.showDesc('radio', r), 'single');
    this.missionList = mkList('gp-opts gp-missions', 'Missions', (r) => this.showDesc('missions', r), 'single');
    this.statList = mkList('gp-opts gp-stats', 'Stats', (r) => this.showDesc('stats', r), 'single');

    this.settingsPane = this.panes.get('settings')!;
    const optsBox = this.column('gp-col gp-col-opts', this.optList.el);
    const chips = this.el('div', 'gp-groups');
    chips.setAttribute('role', 'tablist');
    chips.setAttribute('aria-label', 'Settings groups');
    for (const g of SETTINGS_GROUPS) {
      const b = this.button(g.label, 'gp-chip');
      b.dataset.group = g.id;
      b.setAttribute('role', 'tab');
      b.tabIndex = -1;
      b.addEventListener('click', () => this.showGroup(g.id));
      this.chipBtns.set(g.id, b);
      chips.appendChild(b);
    }
    this.statusEl = this.el('p', 'gp-status');
    this.statusEl.setAttribute('role', 'status');
    chips.appendChild(this.statusEl);
    this.settingsPane.append(chips, optsBox, this.descPanel('settings'));

    this.controlsPane = new ControlsPane(this.doc);
    this.panes.get('controls')!.append(this.column('gp-col gp-col-opts', this.controlsPane.root), this.controlsPane.side);
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
    this.buildGroups();
    this.optList.setRows(this.settingsRows());
    this.syncChips();
    this.radioList.setRows(this.radioRows());
    this.statList.setRows([]);
    this.missionList.setRows([]);

    this.setInputMode(opts.touch ? 'touch' : 'keyboard');
    this.showTab(opts.map ? 'map' : 'settings', true); // the pause menu opens on the map
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
        if (!on && escaped && !this.opened && !this.otherPanelOpen()) this.open();
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
        if (this.wasLocked && !locked && !this.opened && !this.otherPanelOpen()) this.open();
        this.wasLocked = locked;
      };
      this.doc.addEventListener('pointerlockchange', onLock);
      this.cleanup.push(() => this.doc.removeEventListener('pointerlockchange', onLock));
    }

    // ---- push persisted values into the game
    if (this.graphics.hasOverrides) this.cb.onGraphics?.(this.graphics.effective(this.liveTier), Object.keys(this.graphics.raw) as GraphicsKey[]);
    if (this.state.auto !== (opts.auto ?? false)) this.cb.onAuto?.(this.state.auto);
    if (!opts.mixer && saved.master !== undefined) this.cb.onMasterVolume?.(this.state.master);
    if (!opts.mixer && saved.radio !== undefined) this.cb.onRadioVolume?.(this.state.radio);
    if (saved.invertY !== undefined) this.cb.onInvertLookY?.(this.state.invertY);
    if (saved.quality !== undefined && !opts.ignoreSavedQuality && saved.quality !== opts.initialQuality) this.cb.onQuality?.(this.state.quality);
  }

  get isOpen(): boolean { return this.opened; }
  get settings(): MenuSettings { return { ...this.state }; }
  get tabName(): MenuTab { return this.tabId; }
  /** 'chips' while the group chips have the focus, 'list' while the rows do. */
  get focusZone(): 'list' | 'chips' { return this.onChips ? 'chips' : 'list'; }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.pauses++;
    this.openedAt = this.now();
    this.restoreFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    this.root.hidden = false;
    setPanelClass(this.doc, 'menu-open', true);
    this.root.classList.remove('gp-in'); void this.root.offsetWidth; this.root.classList.add('gp-in');
    this.pauseButton.hidden = true;
    this.syncLiveTier();
    this.syncInfo();
    try { this.doc.exitPointerLock?.(); } catch { /* not locked / unsupported */ }
    this.cb.onPause?.(true);
    const win = this.doc.defaultView;
    if (win) this.infoTimer = win.setInterval(() => this.syncInfo(), 1000);
    if (this.tabBtns.get('map') && !this.tabBtns.get('map')!.hidden) this.tabId = 'map'; // always opens on the map, as in the GTA pause menu
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
    setPanelClass(this.doc, 'menu-open', false);
    this.pauseButton.hidden = !this.touchEnabled;
    this.disarmAll();
    this.statusEl.textContent = ''; this.onChips = false;
    this.optList.refresh();
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
    this.titleEl.textContent = MENU_TABS.find((t) => t.id === id)!.label;
    if (id === 'settings') this.onChips = false;
    if (this.opened) this.enterTab(id);
    this.syncFoot();
    this.syncLists();
    if (this.opened) this.focusList();
  }

  /** Selects a settings group (Game, Controls, Audio, Graphics, Map). The Settings tab shows it. */
  showGroup(id: SettingsGroup): void {
    if (!this.chipBtns.has(id)) return;
    this.disarmAll();
    this.group = id;
    this.syncChips();
    this.optList.refresh();
    this.optList.snapToFirst();
    this.statusEl.textContent = '';
    this.showDesc('settings', this.optList.current);
    this.syncFoot();
  }

  /** Which group a settings row sits in (tests, the harness). */
  groupOfRow(id: string): SettingsGroup | null {
    for (const [g, rows] of this.groupSpecs) if (rows.some((r) => r.id === id)) return g;
    return null;
  }
  get settingsGroup(): SettingsGroup { return this.group; }

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
    this.optList.setRows(this.settingsRows(), true);
    this.syncFoot();
  }

  /** Gamepad / programmatic navigation. No-op while closed. */
  navigate(dir: NavDir): void {
    if (!this.opened) return;
    if (this.tabId === 'controls') {
      const c = this.controlsPane;
      if (c.capturing) { c.cancel(); return; }
      if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') c.move(dir); else if (dir === 'confirm') c.confirm(); else this.back();
      return;
    }
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
    this.controlsPane.dispose();
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
      case 'settings': return this.optList;
      case 'radio': return this.radioList;
      case 'missions': return this.missionList;
      case 'stats': return this.statList;
      default: return null;
    }
  }

  private syncLists(): void {
    const act = this.activeList();
    for (const l of [this.optList, this.radioList, this.missionList, this.statList]) l.setActive(l === act && !(l === this.optList && this.onChips));
    this.syncChips();
  }

  private syncChips(): void {
    for (const [g, b] of this.chipBtns) {
      const on = g === this.group;
      b.classList.toggle('on', on);
      b.classList.toggle('hi', on && this.onChips);
      b.setAttribute('aria-selected', String(on));
    }
    this.root.dataset.group = this.group;
  }

  private focusList(): void {
    const l = this.activeList();
    if (l && this.opened) { if (this.tabId === 'settings' && this.onChips) this.chipBtns.get(this.group)?.focus(); else l.highlight(l.index, true); }
    else if (this.opened && this.tabId === 'controls') this.controlsPane.focusFirst();
    else if (this.opened) (this.tabBtns.get(this.tabId))?.focus();
  }

  /** The group chips share the one focus with the rows: Up from the first row reaches them, Left / Right change group, Down returns. */
  private setChips(on: boolean): void {
    if (this.tabId !== 'settings' || this.onChips === on) return;
    this.onChips = on;
    this.syncLists();
    if (on) { this.chipBtns.get(this.group)?.focus(); this.showDesc('settings', null); }
    else { this.optList.highlight(this.optList.index, true); this.showDesc('settings', this.optList.current); }
    this.syncFoot();
  }

  private moveList(d: 1 | -1): void {
    const l = this.activeList();
    if (!l) return;
    if (this.tabId === 'settings') {
      if (this.onChips) { if (d > 0) this.setChips(false); return; }
      if (d < 0 && l.atStart()) { this.setChips(true); return; }
    }
    l.move(d);
    this.syncFoot();
  }

  private sideways(d: -1 | 1): void {
    if (this.tabId === 'settings' && this.onChips) {
      const ids = SETTINGS_GROUPS.map((g) => g.id);
      this.showGroup(ids[(ids.indexOf(this.group) + d + ids.length) % ids.length]);
      this.chipBtns.get(this.group)?.focus();
      return;
    }
    const l = this.activeList();
    if (l?.adjust(d)) this.syncFoot();
  }

  private confirm(): void {
    if (this.tabId === 'settings' && this.onChips) { this.setChips(false); return; }
    this.activeList()?.activate();
  }

  private disarmAll(): void {
    const w = this.doc.defaultView;
    w?.clearTimeout(this.resetTimer); w?.clearTimeout(this.mapTimer); w?.clearTimeout(this.resetGroupTimer);
    const was = this.resetArmed || this.quitArmed || this.mapArmed || this.resetGroupArmed !== null;
    this.resetArmed = false; this.quitArmed = false; this.mapArmed = false; this.resetGroupArmed = null;
    if (was) this.refreshAll();
  }

  /** True while a "press again to confirm" question is open. */
  get asking(): boolean { return this.resetArmed || this.quitArmed || this.mapArmed || this.resetGroupArmed !== null; }

  /**
   * Back: cancels a rebinding or a "press again" question first, then resumes. Esc, B, Backspace, a right click and the Back and
   * Resume buttons all come here, so the same thing happens whichever the player uses.
   */
  back(): void {
    if (this.tabId === 'controls' && this.controlsPane.capturing) { this.controlsPane.cancel(); return; }
    if (this.asking) { this.disarmAll(); this.statusEl.textContent = 'Cancelled'; return; }
    this.close();
  }

  /** The panel manager leaves Esc to the menu while a key is being rebound. */
  get keepsEscape(): boolean { return this.opened && this.tabId === 'controls' && !!this.controlsPane.capturing; }

  private onWindowKey(e: KeyboardEvent): void {
    if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); if (this.opened) this.back(); else this.open(); return; }
    if (!this.opened || e.ctrlKey || e.metaKey || e.altKey) return;
    this.setDevice('keyboard');
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox' && (t as HTMLInputElement).type !== 'range'));
    if (typing) return;
    if (e.code === 'KeyQ' || e.code === 'PageUp') { e.preventDefault(); this.tab(-1); return; }
    if (e.code === 'KeyE' || e.code === 'PageDown') { e.preventDefault(); this.tab(1); return; }
    const onBtn = t?.tagName === 'BUTTON' && !t.classList.contains('gp-arrow') && !t.classList.contains('gp-chip');
    const lists = this.activeList();
    if (!lists) {
      if (this.tabId === 'controls') {
        const c = this.controlsPane;
        switch (e.code) {
          case 'ArrowUp': case 'KeyW': e.preventDefault(); c.move('up'); return;
          case 'ArrowDown': case 'KeyS': e.preventDefault(); c.move('down'); return;
          case 'ArrowLeft': case 'KeyA': e.preventDefault(); c.move('left'); return;
          case 'ArrowRight': case 'KeyD': e.preventDefault(); c.move('right'); return;
          default: break;
        }
      }
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

  /** Mouse / touch moved the one focus: the footer shows the matching prompts. */
  private setDevice(m: InputMode): void { if (m !== this.inputMode) { this.inputMode = m; this.root.dataset.input = m; this.syncFoot(); } }

  /* ---------- tabs: content ---------- */

  private enterTab(id: MenuTab): void {
    if (id === 'map') this.enterMap();
    else if (id === 'save') this.savePanel?.refresh();
    else if (id === 'missions') this.fillMissions();
    else if (id === 'stats') this.fillStats();
    else if (id === 'radio') { this.radioList.refresh(); }
    if (id === 'controls') this.controlsPane.refresh(); else this.controlsPane.cancel();
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

  private syncFoot(): void {
    const m = this.inputMode;
    const lists = this.activeList() !== null;
    const opts = true;
    const prompts: Array<[string, string]> = [];
    if (m === 'keyboard') {
      if (lists) prompts.push(['↑↓', 'Select']);
      if (lists && opts && this.tabId !== 'missions' && this.tabId !== 'stats') prompts.push(['←→', 'Change']);
      if (lists) prompts.push(['Enter', 'Accept']);
      prompts.push(['Q E', 'Tabs'], ['Esc', 'Back'], ['Right click', 'Back']);
    } else if (m === 'gamepad') {
      if (lists) prompts.push(['D-pad', 'Select']);
      if (lists) prompts.push(['A', 'Accept']);
      prompts.push(['B', 'Back'], ['LB RB', 'Tabs'], ['Start', 'Resume']);
    } else {
      prompts.push(['Tap', 'Select']);
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
    this.footEl.appendChild(this.footBack);
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
      def: () => presetFor(this.liveTier as Quality)[key] as string | number | boolean,
    };
    const put = (v: unknown): void => { if (v === presetFor(this.liveTier as Quality)[key]) this.graphics.unset(key); else this.graphics.set(key, v as never); };
    if (c.kind === 'range') {
      return { ...base, kind: 'slider', min: c.min, max: c.max, step: c.step, fmt: (v) => c.fmt(v / c.scale),
        get: () => Math.round((this.eff()[key] as number) * c.scale),
        set: ((v: number) => { put(v / c.scale); }) as RowSpec['set'],
        def: () => Math.round((presetFor(this.liveTier as Quality)[key] as number) * c.scale) };
    }
    if (c.kind === 'bool') return { ...base, kind: 'toggle', set: ((v: boolean) => { put(v); }) as RowSpec['set'] };
    return {
      ...base, kind: 'seg',
      options: () => c.options.map(([value, label]) => ({ value, label, hidden: key === 'shadows' && !this.sup().shadows.includes(value as ShadowMode) })),
      set: ((v: string | number) => { put(v); }) as RowSpec['set'],
    };
  }

  private buildSpecs(): void {
    for (const r of ADVANCED_ROWS) this.gfxRows.set(r.key, this.gfxRow(r.key));
    const fs = this.fullscreen;
    const S = this.specs;
    S.set('windowmode', {
      id: 'windowmode', label: 'Window Mode', kind: 'seg', desc: 'Windowed, or full screen with no browser bars. Alt+Enter also toggles it. Esc leaves full screen and opens this menu.',
      visible: () => !!fs?.supported || isNativeApp(), options: () => [{ value: 'window', label: 'Windowed' }, { value: 'full', label: 'Full screen' }],
      get: () => ((nativeShell() ? this.nativeFs : fs?.active) ? 'full' : 'window'), def: () => 'window',
      set: ((v: string) => {
        const n = nativeShell();
        if (n) { this.nativeFs = v === 'full'; n.setFullscreen(this.nativeFs); return; }
        if ((v === 'full') !== !!fs?.active) void fs?.toggle();
      }) as RowSpec['set'],
    });
    S.set('map', {
      id: 'map', label: 'Map', kind: 'action',
      desc: 'Real streets is the Bedford-Stuyvesant street map. Classic grid is the older stylised map. Each map keeps its own saves. Press twice to reload on the other map.',
      visible: () => this.mapSwitchInfo().available,
      text: () => `${this.mapSwitchInfo().current === 'real' ? 'Real streets' : 'Classic grid'}${this.mapArmed ? ' · PRESS AGAIN for ' + (this.mapSwitchInfo().current === 'real' ? 'Classic grid' : 'Real streets') : ' ›'}`,
      press: () => {
        if (!this.mapArmed) { this.mapArmed = true; this.refreshAll(); const w = this.doc.defaultView; if (w) this.mapTimer = w.setTimeout(() => { this.mapArmed = false; this.refreshAll(); }, 3500); return; }
        this.doc.defaultView?.clearTimeout(this.mapTimer); this.mapArmed = false;
        const info = this.mapSwitchInfo(); const w = this.doc.defaultView;
        const href = w ? w.location.href : 'http://localhost/';
        this.opts.saves?.autosave(Date.now(), true, true); // the pagehide autosave also fires, but a reload from a menu should not depend on it
        info.go(mapSwitchUrl(href, info.current === 'real' ? 'grid' : 'real', info.handheld === true));
      },
    });
    S.set('install', {
      id: 'install', label: 'Install as app', kind: 'info', desc: 'Chrome: menu, Cast, save and share, Install page as app. Safari: File, Add to Dock. It then opens in its own window with no browser bars.',
      visible: () => (this.opts.installable ?? hostedBuild()) && !this.isStandalone() && !isNativeApp(), text: () => 'How to',
    });
    S.set('quality', {
      id: 'quality', label: 'Quality Preset', kind: 'seg', gfx: 'preset',
      desc: 'A preset sets shadows, effects, draw distance and traffic together. Your changes below stay on top of the preset.',
      options: () => QUALITIES.map((q) => ({ value: q, label: cap(q) })),
      get: () => this.state.quality, def: () => this.deviceTier,
      set: ((v: string) => { this.setQuality(v as MenuQuality); }) as RowSpec['set'],
    });
    S.set('autodetect', {
      id: 'autodetect', label: 'Auto Detect Settings', kind: 'toggle',
      desc: 'On: starts at your device\u2019s default preset and steps down by itself when the frame rate drops. Choosing a preset turns it off.',
      get: () => this.state.auto, def: () => this.opts.auto ?? false,
      set: ((v: boolean) => { if (v) this.setAuto(true); else this.setQuality(this.state.quality); }) as RowSpec['set'],
    });
    const mx = this.opts.mixer;
    const mixRow = (id: string, k: MixKey, legacy?: { get(): number; set(v: number): void }, label?: string): void => {
      S.set(id, { id, label: label ?? MIX_LABELS[k], kind: 'slider', live: !!mx, min: 0, max: 100, step: 5, def: () => 100, desc: MIX_DESC[k], fmt: (v) => (k === 'engine' && v === 0 ? 'Off' : `${v}%`),
        visible: legacy || mx ? undefined : () => false,
        get: () => Math.round((mx ? mx.get(k) : legacy ? legacy.get() : 1) * 100),
        set: ((v: number) => { if (mx) { mx.set(k, v / 100); if (k === 'engine' && v > 0) this.rememberEngine(v / 100); } else legacy?.set(v / 100); }) as RowSpec['set'] });
    };
    mixRow('master', 'master', { get: () => this.state.master, set: (v) => this.setMaster(v) });
    // Engine sound On / Off (22 Nov, the owner: "make sure the engine on off option is in settings"). Off is the slider's 0 (no engine voice is
    // created, AUDIOFIX); On puts the slider back where it was before it went Off (100% = the engine bus at its default 0.55 on first use).
    S.set('engineon', {
      id: 'engineon', label: 'Engine sound', kind: 'toggle', visible: mx ? undefined : () => false,
      desc: 'On or Off for every engine, yours and the traffic\u2019s. Off removes engine sound altogether (tyres, horns, crashes and doors stay). On brings the Engine Sound slider back to where you left it.',
      get: () => (mx ? mx.get('engine') > 0 : true), def: () => true,
      set: ((v: boolean) => { this.setEngineOn(v); }) as RowSpec['set'],
    });
    mixRow('radiovol', 'radio', { get: () => this.state.radio, set: (v) => this.setRadio(v) });
    mixRow('sfxvol', 'sfx'); mixRow('enginevol', 'engine', undefined, 'Engine volume'); mixRow('voicevol', 'voices'); mixRow('ambvol', 'ambience');
    S.set('radiolib', { id: 'radiolib', label: 'Radio library', kind: 'action', desc: 'Opens the radio library: tracks, stations and the playlist.', press: () => { this.cb.onRadioLibrary?.(); } });
    S.set('credits', { id: 'credits', label: 'Credits', kind: 'action', desc: 'Who made the game, and who we thank.', visible: () => !!this.cb.onCredits, press: () => { this.cb.onCredits?.(); } });
    S.set('quit', {
      id: 'quit', label: 'Quit to Desktop', kind: 'action', desc: 'Closes the game window. Your autosave is kept. Press twice to confirm.',
      visible: () => nativeQuit() !== null, text: () => (this.quitArmed ? 'PRESS AGAIN' : '\u203A'),
      press: () => { if (!this.quitArmed) { this.quitArmed = true; this.refreshAll(); return; } nativeQuit()?.(); },
    });
    S.set('hdvoices', {
      id: 'hdvoices', label: 'HD Voices', kind: 'toggle',
      desc: 'Neural speech for the radio hosts and talk shows. It downloads a voice model the first time. Off keeps the lightweight built-in voices.',
      visible: () => !!this.opts.hdVoices, get: () => !!this.opts.hdVoices?.get(), def: () => false,
      set: ((v: boolean) => { this.opts.hdVoices?.set(v); }) as RowSpec['set'],
      text: () => this.opts.hdVoices?.label?.() ?? '',
    });
    S.set('station', { id: 'station', label: 'Tuned to', kind: 'info', desc: `The station playing now. In a vehicle press ${glyphFor('radioNext', { mode: 'keyboard' })} for the next one and ${glyphFor('radioPrev', { mode: 'keyboard' })} for the previous (the d-pad left and right on a pad).`, text: () => this.opts.info?.().station || 'Off' });
    S.set('keys', { id: 'keys', label: 'Keys and buttons', kind: 'action', desc: 'Opens the Controls tab: see and change every key, mouse button and pad button.', press: () => { this.showTab('controls'); } });
    S.set('invert', { id: 'invert', label: 'Invert Look Y', kind: 'toggle', def: () => false, desc: 'Inverts vertical look for the mouse, the right stick and touch drag.', get: () => this.state.invertY, set: ((v: boolean) => this.setInvertY(v)) as RowSpec['set'] });
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

  private mapSwitchInfo(): { available: boolean; current: MapChoice; go(url: string): void; handheld?: boolean } {
    if (this.opts.mapSwitch) return this.opts.mapSwitch;
    const hosted = hostedBuild(), w = this.doc.defaultView;
    // main.ts publishes the map in play and whether this is a handheld (phone tier: opens the grid unless `?map=real`)
    const info = (w as unknown as { __gtaMap?: { name?: string; handheld?: boolean } } | null)?.__gtaMap;
    const handheld = info?.handheld === true;
    const current: MapChoice = info?.name === 'real' || info?.name === 'grid' ? info.name : currentMap(hosted, w ? w.location.search : '', handheld);
    return { available: hosted, current, go: (url) => { try { w?.location.assign(url); } catch { /* blocked */ } }, handheld };
  }

  private disarmReset(): void {
    this.doc.defaultView?.clearTimeout(this.resetTimer);
    if (this.resetArmed) { this.resetArmed = false; this.refreshAll(); }
  }

  private radioRows(): RowSpec[] {
    const S = this.specs;
    return [S.get('station')!, S.get('radiovol')!, S.get('radiolib')!];
  }

  /** The settings rows by group. Each group ends with a "Reset to defaults" row that asks once. */
  private buildGroups(): void {
    const S = this.specs, G = this.gfxRows;
    const g = (...keys: GraphicsKey[]): RowSpec[] => keys.map((k) => G.get(k)!);
    const touchRows: RowSpec[] = TOUCH_ROWS.map(([k, v]) => ({ id: `c:${k}`, label: k, kind: 'info' as const, desc: `${k}: ${v}`, text: () => v, visible: () => this.inputMode === 'touch' }));
    const defs: Array<[SettingsGroup, RowSpec[]]> = [
      ['game', [S.get('install')!, S.get('radiolib')!, S.get('reset')!, S.get('credits')!, S.get('quit')!]],
      ['controls', [S.get('invert')!, S.get('keys')!, ...touchRows]],
      ['audio', [S.get('master')!, S.get('radiovol')!, S.get('sfxvol')!, S.get('engineon')!, S.get('enginevol')!, S.get('voicevol')!, S.get('ambvol')!, S.get('hdvoices')!]],
      ['graphics', [S.get('windowmode')!, S.get('quality')!, S.get('autodetect')!, ...g('fpsCap', 'resolution', 'nativeDpr', 'showFps', 'shadows', 'drawDistance', 'treeRange', 'crowd', 'traffic', 'aa', 'textures', 'ao', 'bloom', 'dof', 'vignette', 'grain', 'fov')]],
      ['map', [S.get('map')!, ...MINIMAP_LEGEND.map((item) => ({ id: `l:${item.text}`, label: item.text, kind: 'info' as const, desc: `On the minimap: ${item.text}.`, text: () => '', swatch: { color: item.swatch, shape: item.shape } }))]],
    ];
    for (const [id, rows] of defs) {
      const resettable = rows.filter((r) => r.def && r.set);
      this.groupSpecs.set(id, [...rows, ...(resettable.length ? [this.resetRow(id, resettable)] : [])]);
    }
  }

  private resetRow(id: SettingsGroup, rows: RowSpec[]): RowSpec {
    const label = SETTINGS_GROUPS.find((x) => x.id === id)!.label;
    return {
      id: `reset:${id}`, label: `Reset ${label} to defaults`, kind: 'action',
      desc: `Puts every ${label} setting back the way it came. Press once to ask, press again to do it. Back cancels.`,
      text: () => (this.resetGroupArmed === id ? 'PRESS AGAIN' : '›'),
      press: () => {
        if (this.resetGroupArmed !== id) {
          this.disarmAll(); this.resetGroupArmed = id; this.refreshAll();
          const w = this.doc.defaultView; if (w) this.resetGroupTimer = w.setTimeout(() => this.disarmAll(), 4000);
          this.statusEl.textContent = `Press again to reset ${label}`;
          return;
        }
        this.doc.defaultView?.clearTimeout(this.resetGroupTimer); this.resetGroupArmed = null;
        this.resetRows(rows);
        this.statusEl.textContent = `${label} reset`;
        this.refreshAll();
      },
    };
  }

  /** Sets every row to its default (the quality preset first, so the rest sit on the right tier). */
  private resetRows(rows: readonly RowSpec[]): void {
    const order = [...rows].sort((a, b) => (a.id === 'quality' ? -2 : a.id === 'autodetect' ? -1 : 0) - (b.id === 'quality' ? -2 : b.id === 'autodetect' ? -1 : 0));
    for (const r of order) {
      if (!r.def || !r.set) continue;
      const want = r.def(), cur = r.get?.();
      if (want !== cur) r.set(want as never);
    }
  }

  /** The one settings list: the rows of the chosen group only. */
  private settingsRows(): RowSpec[] {
    const out: RowSpec[] = [];
    for (const [id, rows] of this.groupSpecs) {
      for (const r of rows) {
        const vis = r.visible;
        out.push({ ...r, visible: () => id === this.group && (vis ? vis() : true) });
      }
    }
    return out;
  }

  /** Engine sound On / Off. Off is the Engine Sound slider at 0; On restores the position it had. */
  private setEngineOn(on: boolean): void {
    const mx = this.opts.mixer;
    if (!mx) return;
    const cur = mx.get('engine');
    if (!on) { if (cur > 0) { this.state.engineLast = cur; this.save(); } mx.set('engine', 0); return; }
    if (cur > 0) return;
    mx.set('engine', this.state.engineLast > 0 ? this.state.engineLast : 1);
  }

  private rememberEngine(v: number): void { if (v > 0 && v !== this.state.engineLast) { this.state.engineLast = v; this.save(); } }

  private afterChange(): void {
    this.refreshAll();
    this.syncFoot();
  }

  private refreshAll(): void {
    this.optList.refresh(); this.radioList.refresh();
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
      if (typeof o.engineLast === 'number' && o.engineLast > 0) out.engineLast = clamp01(o.engineLast, 1);
      return out;
    } catch { return {}; }
  }

  private save(): void {
    try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.state)); } catch { /* quota / blocked: settings just won't persist */ }
  }

  /* ---------- full screen / FPS ---------- */

  /** The title's start key was pressed (a key press is a user gesture too): enter full screen if the player chose "play full screen" before. */
  startGesture(): void { const fs = this.fullscreen; if (fs?.preferred && !fs.active) void fs.enter(); }

  /** Another screen (phone, shop, decks, radio list, a stand-alone map) is open: a pointer-lock exit or full-screen exit is not the pause menu's business then. */
  private otherPanelOpen(): boolean {
    const cl = this.doc.body.classList;
    return ['shop-open', 'dj-open', 'phone-open', 'radio-open', 'map-open'].some((c) => cl.contains(c));
  }

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
