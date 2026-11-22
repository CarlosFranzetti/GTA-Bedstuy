import './bustcard.css';
import type { BustResult } from '@/game/police/bust';

/**
 * POLICE2: the quiet BUSTED card. The street dims, "BUSTED" in the game's display type, then the screen goes black; while it is
 * black the host applies the bust (fine, weapons, clock, teleport to the precinct door) and the card comes back up with one line of
 * what happened, then fades away. DOM only; timers are injectable so a test can drive it.
 */
export const CARD_MS = 1700;
export const FADE_OUT_MS = 800;
export const BLACK_HOLD_MS = 500;
export const RELEASE_LINE_MS = 3200;

export interface BustCardTimers { set(fn: () => void, ms: number): unknown; }

export function releaseLine(res: BustResult, clockText: string): string {
  const fine = res.fine > 0 ? `Fined $${res.fine}. ` : 'No fine. ';
  return `${fine}Released at ${res.precinct}, ${clockText}.`;
}

export class BustCard {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private playing = false;

  constructor(parent: HTMLElement, private readonly timers: BustCardTimers = { set: (fn, ms) => setTimeout(fn, ms) }) {
    const doc = parent.ownerDocument;
    this.el = doc.createElement('div');
    this.el.className = 'bust-card';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.title = doc.createElement('div'); this.title.className = 'bust-title'; this.title.textContent = 'BUSTED';
    this.sub = doc.createElement('div'); this.sub.className = 'bust-sub';
    this.el.append(this.title, this.sub);
    parent.appendChild(this.el);
  }

  get isPlaying(): boolean { return this.playing; }

  /**
   * Play the card. `apply` runs while the screen is black and returns what to say; `clockText` is read after it (the clock has moved).
   * Resolves with the result when the card is gone.
   */
  play(apply: () => BustResult, clockText: () => string): Promise<BustResult> {
    this.playing = true;
    return new Promise((resolve) => {
      const t = this.timers;
      this.sub.textContent = '';
      this.title.textContent = 'BUSTED';
      this.el.hidden = false;
      this.el.className = 'bust-card';
      void this.el.offsetWidth;
      this.el.className = 'bust-card dim';
      t.set(() => {
        this.el.className = 'bust-card black';
        t.set(() => {
          const res = apply();
          this.title.textContent = 'RELEASED';
          this.sub.textContent = releaseLine(res, clockText());
          t.set(() => {
            this.el.className = 'bust-card clear';
            t.set(() => {
              this.el.hidden = true;
              this.title.textContent = 'BUSTED';
              this.playing = false;
              resolve(res);
            }, RELEASE_LINE_MS);
          }, BLACK_HOLD_MS);
        }, FADE_OUT_MS);
      }, CARD_MS);
    });
  }
}
