import './phone.css';
import { angleDiff, headingFromVec, type Vec2 } from '@/core/Math2';
import type { Phone, PhoneMessage } from '@/game/Phone';
import { isConfirmKey, releasePointerLock, setPanelClass, type NavDir } from './panelKeys';

const TOAST_MS = 4600;
type Tab = 'messages' | 'contacts' | 'next';
const TAB_ORDER: readonly Tab[] = ['messages', 'contacts', 'next'];
const HINT = 'Q / E tabs   Up / Down list   Enter open   P close';

function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * The phone on screen: a PHONE button with an unread badge (the touch button; keyboard is P), an incoming-text toast,
 * the panel (Messages, Contacts, Next mission) and the "F  Talk to ..." interaction prompt that missions feed in.
 * Works on a detached root. `update()` writes the DOM only when something changed.
 */
export class PhoneHud {
  private readonly doc: Document;
  private readonly button: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private readonly promptEl: HTMLElement;
  private tab: Tab = 'messages';
  private readonly hintEl: HTMLElement;
  private rows: HTMLElement[] = [];
  private sel = 0;
  private keysOn = false;
  private readonly keyHandler = (e: KeyboardEvent): void => this.onKey(e);
  private contact: string | null = null;
  private seenVersion = -1;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private heading = 0;
  private playerPos: Vec2 = { x: 0, z: 0 };

  constructor(root: HTMLElement, private readonly phone: Phone) {
    this.doc = root.ownerDocument;
    this.button = this.doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'ph-button';
    this.button.setAttribute('aria-label', 'Phone');
    this.button.textContent = 'PHONE';
    this.badge = this.make('span', 'ph-badge');
    this.badge.hidden = true;
    this.button.appendChild(this.badge);
    const press = (e: Event): void => { e.preventDefault(); e.stopPropagation(); this.toggle(); };
    this.button.addEventListener('click', press);
    this.button.addEventListener('touchstart', press, { passive: false });

    this.toastEl = this.make('div', 'ph-toast');
    this.toastEl.hidden = true;
    this.toastEl.setAttribute('role', 'status');

    this.panel = this.make('div', 'ph-panel');
    this.panel.hidden = true;
    const bar = this.make('div', 'ph-tabs');
    for (const [id, label] of [['messages', 'Texts'], ['contacts', 'Contacts'], ['next', 'Next']] as const) {
      const b = this.doc.createElement('button');
      b.type = 'button'; b.className = 'ph-tab'; b.textContent = label;
      b.addEventListener('click', () => this.setTab(id));
      this.tabs.set(id, b);
      bar.appendChild(b);
    }
    const close = this.doc.createElement('button');
    close.type = 'button'; close.className = 'ph-close'; close.textContent = 'x'; close.setAttribute('aria-label', 'Close phone');
    close.addEventListener('click', () => this.phone.close());
    bar.appendChild(close);
    this.body = this.make('div', 'ph-body');
    this.hintEl = this.make('div', 'ph-hint');
    this.hintEl.textContent = HINT;
    this.panel.append(bar, this.body, this.hintEl);

    this.promptEl = this.make('div', 'ph-prompt');
    this.promptEl.hidden = true;

    root.append(this.button, this.toastEl, this.panel, this.promptEl);

    const prev = phone.onText;
    phone.onText = (m) => { prev?.(m); this.showToast(m); };
    this.render();
  }

  private make(tag: string, cls: string): HTMLElement {
    const el = this.doc.createElement(tag);
    el.className = cls;
    return el;
  }

  /** Key P / touch button. */
  toggle(): void {
    this.phone.toggle();
    if (this.phone.isOpen) this.phone.markAllRead();
    this.render();
  }

  /**
   * @param prompt MissionSystem.hud.prompt ("F  Talk to Ms. Odette"), or ''.
   * @param pos player position and `headingRad` (camera or player heading), for the Next tab's arrow.
   */
  update(prompt = '', pos?: Vec2, headingRad = 0): void {
    if (pos) this.playerPos = pos;
    this.heading = headingRad;
    this.promptEl.hidden = prompt === '';
    setText(this.promptEl, prompt);
    if (this.phone.version !== this.seenVersion) this.render();
    else if (this.phone.isOpen && this.tab === 'next') this.renderNext();
  }

  get isOpen(): boolean { return this.phone.isOpen; }

  /**
   * Keyboard / gamepad while the phone is open. left/right switch tabs, up/down move the list, confirm opens the
   * selected row (a contact's thread), back leaves a thread and then closes the phone.
   */
  navigate(dir: NavDir): void {
    if (!this.phone.isOpen) return;
    switch (dir) {
      case 'left': this.setTab(TAB_ORDER[(TAB_ORDER.indexOf(this.tab) + TAB_ORDER.length - 1) % TAB_ORDER.length]); break;
      case 'right': this.setTab(TAB_ORDER[(TAB_ORDER.indexOf(this.tab) + 1) % TAB_ORDER.length]); break;
      case 'up': this.moveSel(-1); break;
      case 'down': this.moveSel(1); break;
      case 'confirm': this.activate(); break;
      case 'back': if (this.contact) { this.contact = null; this.sel = 0; this.render(); } else this.closePhone(); break;
    }
  }

  private closePhone(): void { this.phone.close(); this.render(); }

  private setTab(t: Tab): void { this.tab = t; this.contact = null; this.sel = 0; this.render(); }

  private moveSel(d: number): void {
    if (this.rows.length === 0) return;
    this.sel = Math.max(0, Math.min(this.rows.length - 1, this.sel + d));
    this.applySel();
  }

  private applySel(): void {
    this.rows.forEach((r, i) => r.classList.toggle('sel', i === this.sel));
    (this.rows[this.sel] as { scrollIntoView?: (o: object) => void } | undefined)?.scrollIntoView?.({ block: 'nearest' });
  }

  private activate(): void {
    if (this.contact) { this.contact = null; this.sel = 0; this.render(); return; }
    const row = this.rows[this.sel];
    const who = row?.dataset.from;
    if (who) { this.tab = 'messages'; this.contact = who; this.sel = 0; this.render(); }
  }

  /** Document-level, capture phase, only while open: the arrow keys must not reach the camera. */
  private onKey(e: KeyboardEvent): void {
    if (!this.phone.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    let dir: NavDir | null = null;
    let used = true;
    if (e.code === 'KeyP' || e.code === 'Escape' || e.key === 'Escape') { if (!e.repeat) this.closePhone(); }
    else if (e.code === 'KeyQ' || e.code === 'ArrowLeft' || e.key === 'ArrowLeft') dir = 'left';
    else if (e.code === 'KeyE' || e.code === 'ArrowRight' || e.key === 'ArrowRight') dir = 'right';
    else if (e.code === 'ArrowUp' || e.key === 'ArrowUp') dir = 'up';
    else if (e.code === 'ArrowDown' || e.key === 'ArrowDown') dir = 'down';
    else if (e.code === 'Backspace') { if (!e.repeat) this.navigate('back'); }
    else if (isConfirmKey(e) && e.code !== 'KeyF' && e.code !== 'Space') { if (!e.repeat) this.navigate('confirm'); }
    else used = false; // WASD, F, Shift ... keep reaching the game; only the keys the phone uses are swallowed
    if (dir) this.navigate(dir);
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  private syncOpen(open: boolean): void {
    if (open === this.keysOn) return;
    this.keysOn = open;
    setPanelClass(this.doc, 'phone-open', open);
    if (open) { this.doc.addEventListener('keydown', this.keyHandler, true); releasePointerLock(this.doc); }
    else this.doc.removeEventListener('keydown', this.keyHandler, true);
  }

  dispose(): void {
    this.syncOpen(false);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.button.remove(); this.toastEl.remove(); this.panel.remove(); this.promptEl.remove();
  }

  private showToast(m: PhoneMessage): void {
    if (this.phone.isOpen) return;
    this.toastEl.hidden = false;
    this.toastEl.textContent = '';
    const from = this.make('b', 'ph-toast-from');
    from.textContent = `Text from ${m.from}`;
    const txt = this.make('span', 'ph-toast-text');
    txt.textContent = m.text.length > 90 ? `${m.text.slice(0, 87)}...` : m.text;
    this.toastEl.append(from, txt);
    this.toastEl.classList.remove('show'); void this.toastEl.offsetWidth; this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, TOAST_MS);
  }

  private render(): void {
    this.seenVersion = this.phone.version;
    const n = this.phone.unread;
    this.badge.hidden = n === 0;
    setText(this.badge, String(n));
    this.panel.hidden = !this.phone.isOpen;
    this.syncOpen(this.phone.isOpen);
    this.button.classList.toggle('on', this.phone.isOpen);
    for (const [id, b] of this.tabs) b.classList.toggle('active', id === this.tab);
    if (!this.phone.isOpen) return;
    if (this.phone.unread > 0) { this.phone.markAllRead(); return; }
    this.body.textContent = '';
    this.rows = [];
    if (this.tab === 'messages') this.renderMessages(this.contact ? this.phone.thread(this.contact) : this.phone.messages.slice().reverse());
    else if (this.tab === 'contacts') this.renderContacts();
    else this.renderNext();
    this.sel = Math.max(0, Math.min(this.sel, this.rows.length - 1));
    this.applySel();
  }

  private line(cls: string, text: string): HTMLElement {
    const el = this.make('div', cls);
    el.textContent = text;
    return el;
  }

  private renderMessages(list: readonly PhoneMessage[]): void {
    if (list.length === 0) { this.body.appendChild(this.line('ph-empty', 'No texts yet. Walk up to a gold marker.')); return; }
    for (const m of list) {
      const row = this.make('div', 'ph-msg');
      row.dataset.from = m.from;
      row.append(this.line('ph-from', m.from), this.line('ph-text', m.text));
      this.body.appendChild(row);
      this.rows.push(row);
    }
  }

  private renderContacts(): void {
    const cs = this.phone.contacts;
    if (cs.length === 0) { this.body.appendChild(this.line('ph-empty', 'No contacts yet.')); return; }
    for (const c of cs) {
      const b = this.doc.createElement('button');
      b.type = 'button'; b.className = 'ph-contact'; b.textContent = c.name;
      b.dataset.from = c.name;
      b.addEventListener('click', () => { this.tab = 'messages'; this.contact = c.name; this.sel = 0; this.render(); });
      this.body.appendChild(b);
      this.rows.push(b);
    }
  }

  private renderNext(): void {
    const p = this.phone.pointer;
    if (this.tab !== 'next') return;
    let wrap = this.body.querySelector<HTMLElement>('.ph-next');
    if (!p.title) {
      this.body.textContent = '';
      this.body.appendChild(this.line('ph-empty', 'Nothing on your list. Wander.'));
      return;
    }
    if (!wrap) {
      this.body.textContent = '';
      wrap = this.make('div', 'ph-next');
      wrap.append(this.make('span', 'ph-arrow'), this.make('b', 'ph-next-title'), this.make('span', 'ph-next-dist'), this.make('span', 'ph-next-blurb'), this.make('span', 'ph-next-hint'));
      this.body.appendChild(wrap);
    }
    const [arrow, title, dist, blurb, hint] = Array.from(wrap.children) as HTMLElement[];
    const rel = angleDiff(this.heading, headingFromVec({ x: p.x - this.playerPos.x, z: p.z - this.playerPos.z }));
    const deg = Math.round(((rel * 180) / Math.PI) / 3) * 3;
    arrow.textContent = '↑';
    arrow.style.transform = `rotate(${deg}deg)`;
    setText(title, p.title);
    setText(dist, `${Math.round(p.distance / 5) * 5} m`);
    setText(blurb, p.blurb);
    setText(hint, p.hint);
  }
}
