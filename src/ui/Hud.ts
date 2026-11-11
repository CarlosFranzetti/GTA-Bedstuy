import './hud.css';
import type { HudState } from '@/world/types';
import type { InputMode } from '@/core/Input';
import { menuArtSvg } from './menuArt';
import { DISCLAIMER } from './creditsData';

/** Optional radio extras next to `HudState.radioStation`: the now-playing file/speaker and the talk-show loop position. */
export interface RadioHudState {
  radioTrack?: string;
  /** 0..1 through the WBSY Talk loop; 0 or absent when another station is tuned. */
  talkProgress?: number;
}

/** Seconds the player's car has been pushed into something it cannot move (Vehicle.blockedSeconds); hint shows past BLOCKED_HINT_AFTER. */
export interface BlockedHudState {
  blockedSeconds?: number;
}
export const BLOCKED_HINT_AFTER = 1.5;
/** The prompt pill text while wedged, per input device (replaces "Exit car" until the car is free). */
export const BLOCKED_HINT: Record<InputMode, string> = {
  keyboard: 'Blocked: S to reverse, Shift handbrake',
  touch: 'Blocked: pull back to reverse',
  gamepad: 'Blocked: LT to reverse, B handbrake',
};

/** Optional real player vitals (0..1). The game has no health model yet: bars show HEAT (wanted) and SPEED until these are supplied. */
export interface VitalsHudState {
  health?: number;
  armour?: number;
}

/** Station banner: how long it stays after a tune, and how many stations the strip shows around the current one. */
export const STATION_BANNER_MS = 2600;
export const STATION_STRIP_SLOTS = 5;
const AREA_NAME = 'Bed-Stuy';
/** Speed bar full-scale (km/h). */
const SPEED_BAR_MAX = 140;

const FADE_MS = 400;
const MAX_STARS = 3;
const CONTROLS = [
  'WASD move',
  'Shift run',
  'F enter/exit car',
  'Space brake',
  'H horn',
  'E radio',
  'mouse look',
  'touch: left stick, drag right to look',
  'gamepad: sticks, RT/LT drive, A enter/exit',
];

/** Glyph shown in the prompt pill for the "enter/exit" action, per input device. */
const ACTION_GLYPH: Record<InputMode, string> = { keyboard: 'F', touch: 'CAR', gamepad: 'A' };
/** Prompt prefixes M4 may send (any device's glyph); they are rewritten to the active device's glyph. */
const GLYPH_ALIASES = new Set(['F', 'CAR', 'A']);

const WELCOME_TITLE = 'Welcome to Bed-Stuy';
const WELCOME_SUB = 'Brooklyn, New York';
const CARD_HOLD_MS = 3600;
const CARD_FADE_MS = 900;
const TOAST_MS = 2600;

const finite = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);

/** Writes only when the value actually changed, to avoid needless DOM churn each frame. */
function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * Plain-DOM HUD overlay built inside `root` (the root gets the `hud-root` class).
 * Works on a detached root too; `update()` never requires the DOM to be attached.
 */
export class Hud {
  private readonly doc: Document;
  private readonly rootEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly starsEl: HTMLElement;
  private readonly starEls: HTMLElement[] = [];
  private readonly promptEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly speedValueEl: HTMLElement;
  private readonly streetEl: HTMLElement;
  private readonly areaEl: HTMLElement;
  private readonly locationEl: HTMLElement;
  private readonly barsEl: HTMLElement;
  private readonly bars = new Map<string, { row: HTMLElement; fill: HTMLElement }>();
  private readonly stationBanner: HTMLElement;
  private readonly stationNameEl: HTMLElement;
  private readonly stationSubEl: HTMLElement;
  private readonly stationStripEl: HTMLElement;
  private stations: string[] = [];
  private lastStation = '';
  private stationTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStreet = '';
  private readonly radioEl: HTMLElement;
  private readonly splashEl: HTMLElement;
  /** The title screen appeared (true: showSplash) or the player started (false: hideSplash). The host starts / fades the title theme here. */
  onSplash: ((shown: boolean) => void) | null = null;
  /** The CREDITS button on the title screen was pressed: the host opens the roll. */
  onCredits: (() => void) | null = null;
  private readonly cardEl: HTMLElement;
  private readonly cardTitleEl: HTMLElement;
  private readonly cardSubEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private cardTimers: Array<ReturnType<typeof setTimeout>> = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private welcomed = false;
  private lastStars = -1;
  private lastSpeedText = '';
  private lastPrompt = '';
  private inputMode: InputMode = 'keyboard';

  constructor(root: HTMLElement) {
    this.doc = root.ownerDocument;
    this.rootEl = root;
    root.classList.add('hud-root');

    this.fpsEl = this.make('div', 'hud-fps');

    this.starsEl = this.make('div', 'hud-stars');
    for (let i = 0; i < MAX_STARS; i++) {
      const star = this.make('span', 'hud-star');
      this.starsEl.appendChild(star);
      this.starEls.push(star);
    }

    this.promptEl = this.make('div', 'hud-prompt');
    this.promptEl.hidden = true;
    this.promptEl.dataset.mode = this.inputMode;

    this.speedEl = this.make('div', 'hud-speed');
    this.speedEl.hidden = true;
    this.speedValueEl = this.make('span', 'hud-speed-value');
    const unit = this.make('span', 'hud-speed-unit');
    unit.textContent = 'km/h';
    this.speedEl.append(this.speedValueEl, unit);

    // Bottom-right: street name (fades in on change), area name, radio caption.
    const location = this.make('div', 'hud-location');
    this.locationEl = location;
    this.streetEl = this.make('span', 'hud-street');
    this.areaEl = this.make('span', 'hud-area');
    this.areaEl.textContent = AREA_NAME;
    this.radioEl = this.make('span', 'hud-radio');
    location.append(this.speedEl, this.streetEl, this.areaEl, this.radioEl); // the speed sits in the same column, so a long radio line can never overlap it

    // Bars under the minimap (bottom-left).
    this.barsEl = this.make('div', 'hud-bars');
    for (const [id, label] of [['health', 'HP'], ['armour', 'AR'], ['heat', 'HEAT'], ['speed', 'SPD']] as const) {
      const row = this.make('div', `hud-bar hud-bar-${id}`);
      row.hidden = true;
      const lbl = this.make('span', 'hud-bar-lbl');
      lbl.textContent = label;
      const track = this.make('span', 'hud-bar-track');
      const fill = this.make('i', 'hud-bar-fill');
      track.appendChild(fill);
      row.append(lbl, track);
      this.barsEl.appendChild(row);
      this.bars.set(id, { row, fill });
    }

    // Station banner: big name + horizontal strip, top-centre, shown briefly when the station changes.
    this.stationBanner = this.make('div', 'hud-station');
    this.stationBanner.hidden = true;
    this.stationNameEl = this.make('div', 'hud-station-name');
    this.stationSubEl = this.make('div', 'hud-station-sub');
    this.stationStripEl = this.make('div', 'hud-station-strip');
    this.stationBanner.append(this.stationNameEl, this.stationSubEl, this.stationStripEl);

    // GTA-style neighbourhood card, bottom-centre-left, fades on its own.
    this.cardEl = this.make('div', 'hud-card');
    this.cardEl.hidden = true;
    this.cardTitleEl = this.make('div', 'hud-card-title');
    this.cardSubEl = this.make('div', 'hud-card-sub');
    this.cardEl.append(this.cardTitleEl, this.cardSubEl);

    this.toastEl = this.make('div', 'hud-toast');
    this.toastEl.hidden = true;
    this.toastEl.setAttribute('role', 'status');

    // Splash is appended last so it paints over everything else.
    this.splashEl = this.make('div', 'hud-splash');
    const art = this.make('div', 'hud-art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = menuArtSvg('t');
    const shade = this.make('div', 'hud-shade');
    const by = this.make('p', 'hud-by');
    by.textContent = 'Carlos Franzetti presents';
    const title = this.make('h1', 'hud-title');
    const gta = this.make('span', 'hud-title-a');
    gta.textContent = 'GTA';
    const stuy = this.make('span', 'hud-title-b');
    stuy.textContent = 'BED-STUY';
    title.append(gta, this.doc.createTextNode(' '), stuy);
    const subtitle = this.make('p', 'hud-subtitle');
    subtitle.textContent = DISCLAIMER;
    const start = this.make('p', 'hud-start');
    start.textContent = 'press start';
    const startSub = this.make('p', 'hud-start-sub');
    startSub.textContent = 'click, tap or press any key';
    const credits = this.make('button', 'hud-credits');
    credits.type = 'button';
    credits.textContent = 'Credits';
    // a press on the button is not "start the game": keep it from reaching the overlay's first-gesture handler
    for (const t of ['pointerdown', 'mousedown', 'touchstart']) credits.addEventListener(t, (e) => e.stopPropagation());
    credits.addEventListener('click', (e) => { e.stopPropagation(); this.onCredits?.(); });
    const fold = this.make('details', 'hud-fold');
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click']) fold.addEventListener(t, (e) => e.stopPropagation());
    const summary = this.doc.createElement('summary');
    summary.textContent = 'Controls';
    const controls = this.make('ul', 'hud-controls');
    for (const label of CONTROLS) {
      const li = this.doc.createElement('li');
      li.textContent = label;
      controls.appendChild(li);
    }
    fold.append(summary, controls);
    const menu = this.make('div', 'hud-title-menu');
    menu.append(start, startSub, credits, fold);
    this.splashEl.append(art, shade, by, title, subtitle, menu);

    root.append(
      this.fpsEl,
      this.starsEl,
      this.promptEl,
      this.barsEl,
      location,
      this.stationBanner,
      this.cardEl,
      this.toastEl,
      this.splashEl,
    );
  }

  update(state: HudState & RadioHudState & BlockedHudState & VitalsHudState): void {
    const stars = Math.round(Math.min(MAX_STARS, Math.max(0, finite(state.stars))));
    this.starEls.forEach((el, i) => {
      const on = i < stars;
      setText(el, on ? '★' : '☆');
      el.classList.toggle('on', on);
    });
    if (this.lastStars !== -1 && stars !== this.lastStars) this.pulseStars();
    if (stars !== this.lastStars) this.starsEl.setAttribute('aria-label', `Wanted level ${stars} of ${MAX_STARS}`);
    this.lastStars = stars;

    this.setSpeed(String(Math.round(Math.abs(finite(state.speedKmh)))));
    this.speedEl.hidden = !state.inVehicle;

    const blocked = state.inVehicle && finite(state.blockedSeconds ?? 0) > BLOCKED_HINT_AFTER;
    const prompt = blocked ? BLOCKED_HINT[this.inputMode] : state.prompt ?? '';
    this.setPrompt(prompt);
    this.promptEl.hidden = prompt.trim() === '';
    this.rootEl.classList.toggle('has-help', !this.promptEl.hidden); // the objective box makes room for the help text above it

    const street = state.streetName ?? '';
    setText(this.streetEl, street);
    if (street !== this.lastStreet) {
      if (street !== '' && this.lastStreet !== '') this.restart(this.locationEl, 'fresh');
      this.lastStreet = street;
    }
    this.locationEl.hidden = street === '' && !state.radioStation && !state.inVehicle;
    const radio = state.radioStation ?? '';
    if (radio !== this.lastStation) {
      if (radio !== '' && this.lastStation !== '') this.showStationBanner(radio);
      this.lastStation = radio;
    }
    this.updateBars(state);
    const track = state.radioTrack ?? '';
    setText(this.radioEl, track ? `${radio} \u2014 ${track}` : radio);
    const talk = finite(state.talkProgress ?? 0);
    if (talk > 0 && talk <= 1) { this.radioEl.dataset.talk = '1'; this.radioEl.style.setProperty('--talk', talk.toFixed(3)); }
    else if (this.radioEl.dataset.talk) { delete this.radioEl.dataset.talk; this.radioEl.style.removeProperty('--talk'); }
    this.radioEl.hidden = !(state.inVehicle && radio !== '');

    setText(this.fpsEl, `${Math.round(finite(state.fps))} FPS`);
  }

  /** Switch glyphs (prompt pill) to the device the player is using. */
  setInputMode(mode: InputMode): void {
    if (mode === this.inputMode) return;
    this.inputMode = mode;
    this.promptEl.dataset.mode = mode;
    this.renderPrompt(this.lastPrompt, true);
  }

  getInputMode(): InputMode { return this.inputMode; }

  /** Station names for the banner's strip, in dial order. */
  setStations(names: readonly string[]): void { this.stations = [...names]; }

  /** Banner for `station`: big name (before the dash), tagline, and up to STATION_STRIP_SLOTS stations around it. */
  showStationBanner(station: string): void {
    const [head, ...rest] = station.split(/\s+[\u2014-]\s+/);
    setText(this.stationNameEl, head);
    setText(this.stationSubEl, rest.join(' \u2014 '));
    this.stationSubEl.hidden = rest.length === 0;
    this.stationStripEl.textContent = '';
    const list = this.stations.length > 0 && this.stations.includes(station) ? this.stations : [station];
    const n = list.length;
    const slots = Math.min(STATION_STRIP_SLOTS, n);
    const cur = list.indexOf(station);
    for (let k = 0; k < slots; k++) {
      const name = list[(((cur + k - Math.floor(slots / 2)) % n) + n) % n];
      const chip = this.make('span', 'hud-station-chip');
      chip.textContent = name.split(/\s+[\u2014-]\s+/)[0];
      if (k === Math.floor(slots / 2)) chip.classList.add('on');
      this.stationStripEl.appendChild(chip);
    }
    this.stationBanner.hidden = false;
    this.restart(this.stationBanner, 'in');
    if (this.stationTimer !== null) clearTimeout(this.stationTimer);
    this.stationTimer = setTimeout(() => { this.stationBanner.hidden = true; this.stationTimer = null; }, STATION_BANNER_MS);
  }

  private updateBars(state: VitalsHudState & HudState): void {
    const frac = (v: number): number => Math.min(1, Math.max(0, finite(v)));
    const set = (id: string, show: boolean, v = 0): void => {
      const b = this.bars.get(id);
      if (!b) return;
      b.row.hidden = !show;
      if (show) b.fill.style.width = `${Math.round(frac(v) * 100)}%`;
    };
    const hasHealth = typeof state.health === 'number';
    set('health', hasHealth, state.health);
    set('armour', typeof state.armour === 'number' && state.armour > 0, state.armour);
    set('heat', true, Math.round(Math.min(MAX_STARS, Math.max(0, finite(state.stars)))) / MAX_STARS);
    set('speed', !!state.inVehicle, Math.abs(finite(state.speedKmh)) / SPEED_BAR_MAX);
  }

  private restart(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(cls);
  }

  /** Short message at the top-centre (e.g. "Controller connected"). */
  showToast(message: string, ms = TOAST_MS): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('out');
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('out');
      this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; this.toastTimer = null; }, 300);
    }, ms);
  }

  /** Neighbourhood card: holds, then fades out. */
  showLocationCard(title: string, sub = ''): void {
    for (const t of this.cardTimers) clearTimeout(t);
    this.cardTimers = [];
    this.cardTitleEl.textContent = title;
    this.cardSubEl.textContent = sub;
    this.cardSubEl.hidden = sub === '';
    this.cardEl.hidden = false;
    this.cardEl.classList.remove('out');
    void this.cardEl.offsetWidth; // restart the CSS entrance animation
    this.cardEl.classList.add('in');
    this.cardTimers.push(setTimeout(() => {
      this.cardEl.classList.remove('in');
      this.cardEl.classList.add('out');
      this.cardTimers.push(setTimeout(() => { this.cardEl.hidden = true; }, CARD_FADE_MS));
    }, CARD_HOLD_MS));
  }

  private pulseStars(): void {
    this.starsEl.classList.remove('pulse');
    void this.starsEl.offsetWidth; // restart the animation
    this.starsEl.classList.add('pulse');
  }

  /** One fixed-width cell per digit so the readout never jitters. */
  private setSpeed(text: string): void {
    if (text === this.lastSpeedText) return;
    this.lastSpeedText = text;
    this.speedValueEl.textContent = '';
    for (const ch of text) {
      const d = this.doc.createElement('span');
      d.className = 'hud-digit';
      d.textContent = ch;
      this.speedValueEl.appendChild(d);
    }
  }

  private setPrompt(prompt: string): void {
    if (prompt === this.lastPrompt) return;
    this.lastPrompt = prompt;
    this.renderPrompt(prompt, false);
  }

  private renderPrompt(prompt: string, force: boolean): void {
    if (!force && this.promptEl.dataset.src === prompt) return;
    this.promptEl.dataset.src = prompt;
    const m = /^(\S+)\s{2}(.*)$/.exec(prompt);
    this.promptEl.textContent = '';
    if (m) {
      const glyph = GLYPH_ALIASES.has(m[1]) ? ACTION_GLYPH[this.inputMode] : m[1];
      const key = this.doc.createElement('span');
      key.className = 'hud-key';
      key.textContent = glyph;
      this.promptEl.append(key, this.doc.createTextNode(`  ${m[2]}`));
    } else {
      this.promptEl.textContent = prompt;
    }
  }

  showSplash(): void {
    this.clearFadeTimer();
    this.splashEl.classList.remove('fading');
    this.splashEl.style.display = '';
    this.onSplash?.(true);
  }

  hideSplash(): void {
    this.clearFadeTimer();
    this.splashEl.classList.add('fading');
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      this.splashEl.style.display = 'none';
    }, FADE_MS);
    this.onSplash?.(false);
    if (!this.welcomed) {
      this.welcomed = true;
      this.showLocationCard(WELCOME_TITLE, WELCOME_SUB);
    }
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const el = this.doc.createElement(tag);
    el.className = className;
    return el;
  }
}
