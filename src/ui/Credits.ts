import './credits.css';
import { AI_NOTE, DIRECTORS, DISCLAIMER, OWNER, STUDIO_LEAD, TEAMS, THANKS, type CreditPerson } from './creditsData';
import { BACKDROPS, backdropUrl } from './backdrops';
import type { NavDir } from '@/core/Gamepad';

export interface CreditsOptions {
  /** The roll opened (the host can ask for music). */
  onOpen?: () => void;
  /** The roll closed (any way). */
  onClose?: () => void;
  doc?: Document;
}

/** Roll speed in CSS px per second. */
const SPEED = 46;

/**
 * GTA-style credits roll over a dark backdrop. Opens from the title screen and the pause menu (`open()`), closes with
 * Esc, Backspace, gamepad B (`navigate('back')`) or the close button. Scrolls by itself unless the player asks for reduced
 * motion or touches / wheels / keys the list, then it is a plain scrollable list. Lives inside the overlay, above the menu.
 */
export class Credits {
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
  readonly root: HTMLElement;
  private readonly doc: Document;
  private scroller: HTMLElement | null = null;
  private opened = false;
  private auto = false;
  private raf = 0;
  private pos = 0;
  private last = 0;
  private returnFocus: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.opened) return;
    if ((e.code === 'Escape' || e.code === 'Backspace') && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation(); this.close();
    }
  };

  constructor(parent: HTMLElement, opts: CreditsOptions = {}) {
    this.doc = opts.doc ?? parent.ownerDocument;
    this.onOpen = opts.onOpen ?? null;
    this.onClose = opts.onClose ?? null;
    const root = this.doc.createElement('div');
    root.className = 'cr-root';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Credits');
    root.setAttribute('data-ui-modal', '');
    // a press here must never count as "start the game" for the overlay behind
    for (const t of ['pointerdown', 'mousedown', 'touchstart']) root.addEventListener(t, (e) => e.stopPropagation());
    this.root = root;
    parent.appendChild(root);
    this.doc.defaultView?.addEventListener('keydown', this.onKey, true);
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    if (this.opened) return;
    if (!this.scroller) this.build();
    this.opened = true;
    this.returnFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    this.root.hidden = false;
    const win = this.doc.defaultView;
    const reduce = !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.root.classList.toggle('cr-still', reduce);
    const sc = this.scroller!;
    sc.scrollTop = 0;
    this.pos = 0;
    this.auto = !reduce && !!win?.requestAnimationFrame;
    this.root.classList.toggle('cr-auto', this.auto);
    sc.focus({ preventScroll: true });
    if (this.auto) { this.last = 0; this.raf = win!.requestAnimationFrame((t) => this.tick(t)); }
    this.onOpen?.();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.stopAuto();
    this.root.hidden = true;
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    this.onClose?.();
  }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  /** Gamepad / programmatic navigation. Returns true while the roll is open (it eats the input). */
  navigate(dir: NavDir): boolean {
    if (!this.opened) return false;
    if (dir === 'back') this.close();
    else if (dir === 'up' || dir === 'down') { this.stopAuto(); if (this.scroller) this.scroller.scrollTop += dir === 'up' ? -140 : 140; }
    return true;
  }

  dispose(): void {
    this.close();
    this.doc.defaultView?.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  private stopAuto(): void {
    if (this.raf) this.doc.defaultView?.cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.auto) { this.auto = false; this.root.classList.remove('cr-auto'); }
  }

  private tick(t: number): void {
    if (!this.opened || !this.auto || !this.scroller) return;
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    this.pos += SPEED * dt;
    const sc = this.scroller;
    sc.scrollTop = this.pos;
    if (this.pos >= sc.scrollHeight - sc.clientHeight - 1) { this.stopAuto(); return; }
    this.raf = this.doc.defaultView!.requestAnimationFrame((n) => this.tick(n));
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
    const e = this.doc.createElement(tag);
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    parent?.appendChild(e);
    return e;
  }

  private build(): void {
    const root = this.root;
    const art = this.el('div', 'cr-art', undefined, root);
    art.setAttribute('aria-hidden', 'true');
    const img = this.doc.createElement('img'); // the last backdrop shot, very dark; absent in the single-file build
    img.alt = '';
    img.addEventListener('load', () => img.classList.add('on'));
    img.addEventListener('error', () => img.remove());
    const shot = BACKDROPS[BACKDROPS.length - 1];
    const url = shot ? backdropUrl(this.doc, shot.file) : null;
    if (shot && url) { img.style.objectPosition = shot.pos; img.src = url; art.appendChild(img); }
    this.el('div', 'cr-shade', undefined, root);
    const x = this.el('button', 'cr-x', '✕', root);
    x.type = 'button';
    x.setAttribute('aria-label', 'Close credits');
    x.addEventListener('click', () => this.close());
    this.el('p', 'cr-hint', 'Esc · Backspace · B to close', root);

    const sc = this.el('div', 'cr-scroll', undefined, root);
    sc.tabIndex = 0;
    sc.setAttribute('aria-label', 'Credits list');
    for (const t of ['wheel', 'touchstart', 'pointerdown']) sc.addEventListener(t, () => this.stopAuto(), { passive: true });
    sc.addEventListener('keydown', (e) => { if (e.code.startsWith('Arrow') || e.code.startsWith('Page') || e.code === 'Space' || e.code === 'Home' || e.code === 'End') this.stopAuto(); });
    this.scroller = sc;

    const col = this.el('div', 'cr-col', undefined, sc);
    this.el('h2', 'cr-title', 'Credits', col);
    const big = (p: CreditPerson, extra = ''): void => {
      const b = this.el('div', `cr-block ${extra}`, undefined, col);
      this.el('div', 'cr-label', p.role, b);
      this.el('div', 'cr-name cr-huge', p.name, b);
    };
    big(OWNER);
    big(STUDIO_LEAD);
    const dir = this.el('div', 'cr-block', undefined, col);
    this.el('div', 'cr-label', 'Directors', dir);
    for (const d of DIRECTORS) this.pair(dir, d);
    for (const team of TEAMS) {
      const b = this.el('div', 'cr-block', undefined, col);
      this.el('div', 'cr-label', team.title, b);
      this.el('div', 'cr-note', team.note, b);
      for (const p of team.people) this.pair(b, p);
    }
    const ai = this.el('div', 'cr-block cr-ai', undefined, col);
    this.el('p', 'cr-honest', AI_NOTE, ai);
    const th = this.el('div', 'cr-block', undefined, col);
    this.el('div', 'cr-label', 'With thanks to', th);
    for (const t of THANKS) {
      const row = this.el('p', 'cr-thanks', undefined, th);
      this.el('b', 'cr-thanks-k', t.title, row);
      row.appendChild(this.doc.createTextNode(` ${t.text}`));
    }
    const end = this.el('div', 'cr-block cr-end', undefined, col);
    this.el('div', 'cr-name', 'GTA BED-STUY', end);
    this.el('p', 'cr-fine', DISCLAIMER, end);
    this.el('p', 'cr-fine', 'Press Esc to return', end);
  }

  private pair(parent: HTMLElement, p: CreditPerson): void {
    const row = this.el('div', 'cr-pair', undefined, parent);
    this.el('span', 'cr-role', p.role, row);
    this.el('span', 'cr-name', p.name, row);
  }
}
