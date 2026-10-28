import './hud.css';
import type { HudState } from '@/world/types';
import type { InputMode } from '@/core/Input';

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
  private readonly fpsEl: HTMLElement;
  private readonly starsEl: HTMLElement;
  private readonly starEls: HTMLElement[] = [];
  private readonly promptEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly speedValueEl: HTMLElement;
  private readonly streetEl: HTMLElement;
  private readonly radioEl: HTMLElement;
  private readonly splashEl: HTMLElement;
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

    const location = this.make('div', 'hud-location');
    this.streetEl = this.make('span', 'hud-street');
    this.radioEl = this.make('span', 'hud-radio');
    location.append(this.streetEl, this.radioEl);

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
    const title = this.make('h1', 'hud-title');
    title.textContent = 'GTA BED-STUY';
    const subtitle = this.make('p', 'hud-subtitle');
    subtitle.textContent = 'a fan tribute · not affiliated with Rockstar Games or Take-Two';
    const controls = this.make('ul', 'hud-controls');
    for (const label of CONTROLS) {
      const li = this.doc.createElement('li');
      li.textContent = label;
      controls.appendChild(li);
    }
    const start = this.make('p', 'hud-start');
    start.textContent = 'click or tap to start';
    this.splashEl.append(title, subtitle, controls, start);

    root.append(
      this.fpsEl,
      this.starsEl,
      this.promptEl,
      this.speedEl,
      location,
      this.cardEl,
      this.toastEl,
      this.splashEl,
    );
  }

  update(state: HudState): void {
    const stars = Math.round(Math.min(MAX_STARS, Math.max(0, finite(state.stars))));
    this.starEls.forEach((el, i) => {
      const on = i < stars;
      setText(el, on ? '★' : '☆');
      el.classList.toggle('on', on);
    });
    if (this.lastStars !== -1 && stars !== this.lastStars) this.pulseStars();
    this.lastStars = stars;
    const ariaLabel = `Wanted level ${stars} of ${MAX_STARS}`;
    if (this.starsEl.getAttribute('aria-label') !== ariaLabel) {
      this.starsEl.setAttribute('aria-label', ariaLabel);
    }

    this.setSpeed(String(Math.round(Math.abs(finite(state.speedKmh)))));
    this.speedEl.hidden = !state.inVehicle;

    const prompt = state.prompt ?? '';
    this.setPrompt(prompt);
    this.promptEl.hidden = prompt.trim() === '';

    setText(this.streetEl, state.streetName ?? '');
    const radio = state.radioStation ?? '';
    setText(this.radioEl, radio);
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
  }

  hideSplash(): void {
    this.clearFadeTimer();
    this.splashEl.classList.add('fading');
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      this.splashEl.style.display = 'none';
    }, FADE_MS);
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
