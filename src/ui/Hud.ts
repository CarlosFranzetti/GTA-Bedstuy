import './hud.css';
import type { HudState } from '@/world/types';

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
];

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
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

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
    const ariaLabel = `Wanted level ${stars} of ${MAX_STARS}`;
    if (this.starsEl.getAttribute('aria-label') !== ariaLabel) {
      this.starsEl.setAttribute('aria-label', ariaLabel);
    }

    setText(this.speedValueEl, String(Math.round(Math.abs(finite(state.speedKmh)))));
    this.speedEl.hidden = !state.inVehicle;

    const prompt = state.prompt ?? '';
    setText(this.promptEl, prompt);
    this.promptEl.hidden = prompt.trim() === '';

    setText(this.streetEl, state.streetName ?? '');
    const radio = state.radioStation ?? '';
    setText(this.radioEl, radio);
    this.radioEl.hidden = !(state.inVehicle && radio !== '');

    setText(this.fpsEl, `${Math.round(finite(state.fps))} FPS`);
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
