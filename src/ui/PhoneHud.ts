import './phone.css';
import { angleDiff, headingFromVec, type Vec2 } from '@/core/Math2';
import type { Phone, PhoneMessage } from '@/game/Phone';

const TOAST_MS = 4600;
type Tab = 'messages' | 'contacts' | 'next';

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
      b.addEventListener('click', () => { this.tab = id; this.contact = null; this.render(); });
      this.tabs.set(id, b);
      bar.appendChild(b);
    }
    const close = this.doc.createElement('button');
    close.type = 'button'; close.className = 'ph-close'; close.textContent = 'x'; close.setAttribute('aria-label', 'Close phone');
    close.addEventListener('click', () => this.phone.close());
    bar.appendChild(close);
    this.body = this.make('div', 'ph-body');
    this.panel.append(bar, this.body);

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

  dispose(): void {
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
    this.button.classList.toggle('on', this.phone.isOpen);
    for (const [id, b] of this.tabs) b.classList.toggle('active', id === this.tab);
    if (!this.phone.isOpen) return;
    if (this.phone.unread > 0) { this.phone.markAllRead(); return; }
    this.body.textContent = '';
    if (this.tab === 'messages') this.renderMessages(this.contact ? this.phone.thread(this.contact) : this.phone.messages.slice().reverse());
    else if (this.tab === 'contacts') this.renderContacts();
    else this.renderNext();
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
      row.append(this.line('ph-from', m.from), this.line('ph-text', m.text));
      this.body.appendChild(row);
    }
  }

  private renderContacts(): void {
    const cs = this.phone.contacts;
    if (cs.length === 0) { this.body.appendChild(this.line('ph-empty', 'No contacts yet.')); return; }
    for (const c of cs) {
      const b = this.doc.createElement('button');
      b.type = 'button'; b.className = 'ph-contact'; b.textContent = c.name;
      b.addEventListener('click', () => { this.tab = 'messages'; this.contact = c.name; this.render(); });
      this.body.appendChild(b);
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
