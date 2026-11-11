import './phone.css';
import { angleDiff, headingFromVec, type Vec2 } from '@/core/Math2';
import type { Phone, PhoneMessage } from '@/game/Phone';
import type { SaveManager } from './GameSave';
import { SavePanel } from './SavePanel';
import { isConfirmKey, releasePointerLock, setPanelClass, type NavDir } from './panelKeys';

const TOAST_MS = 4600;
type Tab = 'messages' | 'contacts' | 'next' | 'save';
/** Apps the phone hands to the game (opening them closes the phone). Supplying `apps` makes the phone open on the app grid. */
export interface PhoneApps {
  map?: () => void;
  radio?: () => void;
  settings?: () => void;
}
const ICON = (body: string): string => `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const APP_ICONS = {
  messages: ICON('<path d="M4 5h16v11H9l-4 4v-4H4z"/>'),
  contacts: ICON('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>'),
  goals: ICON('<path d="M12 3v18M12 3l7 4-7 4"/>'),
  map: ICON('<path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z M9 3.5v14.5 M15 6v14.5"/>'),
  save: ICON('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
  radio: ICON('<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l9-5M8 14h5M17 13v2"/>'),
  settings: ICON('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
} as const;
const BASE_TABS: readonly Tab[] = ['messages', 'contacts', 'next'];
const HINT = 'Q / E tabs   Up / Down list   Enter open   P close';

function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * The phone on screen: a PHONE button with an unread badge (the touch button; keyboard is P), an incoming-text toast,
 * the panel (Messages, Contacts, Next mission) and the "F  Talk to ..." interaction prompt that missions feed in.
 * Works on a detached root. `update()` writes the DOM only when something changed.
 */
export interface PhoneHudOptions {
  /** Adds a Save tab (slots, export / import) to the phone. */
  saves?: SaveManager;
  /** false while a save would store a nonsense pose (inside a room). */
  canSave?: () => boolean;
  /** Game hooks for the Map / Radio / Settings apps. When given, the phone opens on the app grid. */
  apps?: PhoneApps;
}

export class PhoneHud {
  private readonly tabOrder: readonly Tab[];
  private savePanel: SavePanel | null = null;
  private readonly doc: Document;
  private readonly button: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private readonly promptEl: HTMLElement;
  private tab: Tab = 'messages';
  private home = false;
  private readonly apps: PhoneApps | null;
  private readonly hintEl: HTMLElement;
  private readonly homeBar: HTMLButtonElement;
  private rows: HTMLElement[] = [];
  private sel = 0;
  private keysOn = false;
  private readonly keyHandler = (e: KeyboardEvent): void => this.onKey(e);
  private contact: string | null = null;
  private seenVersion = -1;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private heading = 0;
  private playerPos: Vec2 = { x: 0, z: 0 };

  constructor(root: HTMLElement, private readonly phone: Phone, opts: PhoneHudOptions = {}) {
    this.doc = root.ownerDocument;
    this.apps = opts.apps ?? null;
    this.tabOrder = opts.saves ? [...BASE_TABS, 'save'] : BASE_TABS;
    if (opts.saves) this.savePanel = new SavePanel(null, opts.saves, { canSave: opts.canSave });
    this.button = this.doc.createElement('button');
    this.button.type = 'button';
    this.button.className = 'ph-button';
    this.button.setAttribute('aria-label', 'Phone');
    this.button.insertAdjacentHTML('afterbegin', '<span class="hb-lbl">PHONE</span><svg class="hb-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="18" r="1.1" fill="currentColor"/></svg>');
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
    const status = this.make('div', 'ph-status');
    status.setAttribute('aria-hidden', 'true');
    status.append(this.make('span', 'ph-carrier'), this.make('span', 'ph-notch'), this.make('span', 'ph-battery'));
    status.firstElementChild!.textContent = 'BK 5G';
    const bar = this.make('div', 'ph-tabs');
    for (const [id, label] of ([['messages', 'Texts'], ['contacts', 'Contacts'], ['next', 'Next'], ['save', 'Save']] as const).filter(([id]) => this.tabOrder.includes(id))) {
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
    this.homeBar = this.doc.createElement('button');
    this.homeBar.type = 'button';
    this.homeBar.className = 'ph-homebar';
    this.homeBar.setAttribute('aria-label', 'Home: app grid');
    this.homeBar.addEventListener('click', () => this.goHome());
    this.panel.append(status, bar, this.body, this.hintEl, this.homeBar);

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
    if (this.phone.isOpen) { this.phone.markAllRead(); if (this.apps) this.home = true; }
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
    if (this.home) {
      switch (dir) {
        case 'left': case 'up': this.moveSel(dir === 'up' ? -4 : -1); break;
        case 'right': case 'down': this.moveSel(dir === 'down' ? 4 : 1); break;
        case 'confirm': this.rows[this.sel]?.click(); break;
        case 'back': this.closePhone(); break;
      }
      return;
    }
    switch (dir) {
      case 'left': this.setTab(this.tabOrder[(this.tabOrder.indexOf(this.tab) + this.tabOrder.length - 1) % this.tabOrder.length]); break;
      case 'right': this.setTab(this.tabOrder[(this.tabOrder.indexOf(this.tab) + 1) % this.tabOrder.length]); break;
      case 'up': this.moveSel(-1); break;
      case 'down': this.moveSel(1); break;
      case 'confirm': this.activate(); break;
      case 'back': if (this.contact) { this.contact = null; this.sel = 0; this.render(); } else if (this.apps) this.goHome(); else this.closePhone(); break;
    }
  }

  private closePhone(): void { this.phone.close(); this.render(); }

  /** Back to the app grid (only reachable with `apps`, or from the home bar). */
  private goHome(): void { this.home = true; this.contact = null; this.sel = 0; this.render(); }

  private setTab(t: Tab): void { this.home = false; this.tab = t; this.contact = null; this.sel = 0; this.render(); }

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
    if (this.tab === 'save') { this.rows[this.sel]?.click(); return; }
    if (this.contact) { this.contact = null; this.sel = 0; this.render(); return; }
    const row = this.rows[this.sel];
    const who = row?.dataset.from;
    if (who) { this.tab = 'messages'; this.contact = who; this.sel = 0; this.render(); }
  }

  /** Document-level, capture phase, only while open: the arrow keys must not reach the camera. */
  private onKey(e: KeyboardEvent): void {
    if (!this.phone.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT') && e.code !== 'Escape') return; // typing / picking in the save tab
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
    this.savePanel?.dispose(); this.button.remove(); this.toastEl.remove(); this.panel.remove(); this.promptEl.remove();
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
    this.panel.classList.toggle('home', this.home);
    this.homeBar.hidden = this.home;
    for (const [id, b] of this.tabs) b.classList.toggle('active', id === this.tab);
    if (!this.phone.isOpen) return;
    if (this.phone.unread > 0) { this.phone.markAllRead(); return; }
    this.body.textContent = '';
    this.rows = [];
    if (this.home) this.renderHome();
    else if (this.tab === 'messages') this.renderMessages(this.contact ? this.phone.thread(this.contact) : this.phone.messages.slice().reverse());
    else if (this.tab === 'contacts') this.renderContacts();
    else if (this.tab === 'save' && this.savePanel) {
      this.savePanel.refresh();
      this.body.appendChild(this.savePanel.root);
      this.rows = Array.from(this.savePanel.root.querySelectorAll<HTMLElement>('button:not(:disabled)'));
    } else this.renderNext();
    this.sel = Math.max(0, Math.min(this.sel, this.rows.length - 1));
    this.applySel();
  }

  /** App grid: Messages, Contacts, Goals, Map, Save, Radio, Settings (the last three need game hooks). */
  private renderHome(): void {
    const grid = this.make('div', 'ph-apps');
    const add = (id: keyof typeof APP_ICONS, label: string, run: () => void, badge = 0): void => {
      const b = this.doc.createElement('button');
      b.type = 'button'; b.className = `ph-app ph-app-${id}`; b.dataset.app = id;
      b.insertAdjacentHTML('afterbegin', `<span class="ph-app-ico">${APP_ICONS[id]}</span>`);
      const l = this.make('span', 'ph-app-lbl'); l.textContent = label; b.appendChild(l);
      if (badge > 0) { const bd = this.make('span', 'ph-app-badge'); bd.textContent = String(badge); b.appendChild(bd); }
      b.addEventListener('click', run);
      grid.appendChild(b); this.rows.push(b);
    };
    const tab = (t: Tab) => (): void => this.setTab(t);
    const game = (fn?: () => void) => (): void => { this.closePhone(); fn?.(); };
    add('messages', 'Messages', tab('messages'));
    add('contacts', 'Contacts', tab('contacts'));
    add('goals', 'Goals', tab('next'));
    if (this.apps?.map) add('map', 'Map', game(this.apps.map));
    if (this.tabOrder.includes('save')) add('save', 'Save', tab('save'));
    if (this.apps?.radio) add('radio', 'Radio', game(this.apps.radio));
    if (this.apps?.settings) add('settings', 'Settings', game(this.apps.settings));
    this.body.appendChild(grid);
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
