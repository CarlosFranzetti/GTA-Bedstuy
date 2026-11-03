/**
 * WAX DELI shop panel: browse the bins, preview a record (20 s), buy with cash, sell back at half price, and
 * press free records from the player's own Radio library. Touch-first: every control is a large button.
 *
 * Layout: header and tabs on top, a scrolling list, and a sticky footer (status, key hint, Close) that is always
 * on screen, even at 640x360. Keyboard: W/S or arrows select, A/D or arrows switch tabs, Enter / Space / F do the
 * main action (buy, sell, press), E previews, Esc / X / B / Backspace close. Gamepad: `navigate(dir)` (d-pad, A, B).
 */
import { Inventory } from '@/game/Inventory';
import { PREVIEW_SECONDS } from '@/game/DjAudio';
import { pressLibraryTrack, guessGenre, type RecordDef, type RecordSource } from '@/game/records';
import { isCloseKey, isConfirmKey, navDirOf, setPanelClass, type NavDir } from './panelKeys';
import './shop.css';

export interface ShopEmitter { emit(type: string, payload: unknown): void }
export interface ShopPreview { play(buffer: AudioBuffer, onDone?: () => void): void; stop(): void }
export interface PressableTrack { id: string; name: string; path?: string }

export interface ShopDeps {
  inventory: Inventory;
  /** What the shop sells. */
  stock: readonly RecordDef[];
  source: RecordSource | null;
  preview: ShopPreview | null;
  events?: ShopEmitter;
  /** Tracks in the player's Radio library that can be pressed to vinyl for free. */
  libraryTracks?: () => PressableTrack[];
  /** Free records from the drop folder. */
  dropRecords?: readonly RecordDef[];
  onToggle?: (open: boolean) => void;
}

export type BuyOutcome = 'ok' | 'owned' | 'poor';
type Tab = 'bins' | 'crate' | 'press';
const TABS: readonly Tab[] = ['bins', 'crate', 'press'];
interface Row { el: HTMLElement; primary?: () => void; secondary?: () => void }

export class ShopUi {
  readonly root: HTMLElement;
  private readonly cashEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly status: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'bins';
  private opened = false;
  private previewing: string | null = null;
  /** Keyboard / gamepad selection: 0..rows.length-1 are cards, rows.length is the Close button. */
  private sel = 0;
  private rows: Row[] = [];
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private readonly keyUpHandler = (e: KeyboardEvent) => { if (this.opened && (isConfirmKey(e) || isCloseKey(e))) e.preventDefault(); };
  private readonly off: () => void;
  private readonly doc: Document;

  constructor(parent: HTMLElement, private readonly d: ShopDeps) {
    this.doc = parent.ownerDocument;
    this.root = this.el('div', 'shop-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Wax Deli record bins');
    this.root.setAttribute('data-ui-modal', ''); // the playtest state export reads this as "a menu is open"
    this.root.tabIndex = -1;
    const panel = this.el('div', 'shop-panel');
    const head = this.el('div', 'shop-head');
    const title = this.el('h2', 'shop-title'); title.textContent = 'WAX DELI · Records & Sandwiches';
    this.cashEl = this.el('div', 'shop-cash');
    head.append(title, this.cashEl);
    const nav = this.el('div', 'shop-tabs');
    for (const [id, label] of [['bins', 'Bins'], ['crate', 'Your crate'], ['press', 'Press my music']] as const) {
      const b = this.btn(label, 'shop-tab', () => this.setTab(id));
      this.tabs.set(id, b); nav.appendChild(b);
    }
    this.body = this.el('div', 'shop-body');
    this.status = this.el('p', 'shop-status');
    this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    const foot = this.el('div', 'shop-foot');
    const hint = this.el('span', 'shop-hint');
    hint.textContent = 'W/S select · A/D tabs · Enter or F buy · E preview · Esc or X close';
    this.closeBtn = this.btn('Close', 'shop-btn shop-close', () => this.close());
    foot.append(this.status, hint, this.closeBtn);
    panel.append(head, nav, this.body, foot);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.off = d.inventory.onChange(() => { if (this.opened) this.render(); });
    this.render();
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    if (this.opened) return;
    this.opened = true; this.root.hidden = false; this.say('Sleeves are $12 to $25. Preview plays 20 seconds.');
    this.sel = 0;
    this.render();
    this.doc.addEventListener('keydown', this.keyHandler, true);
    this.doc.addEventListener('keyup', this.keyUpHandler, true);
    setPanelClass(this.doc, 'shop-open', true);
    try { this.root.focus({ preventScroll: true }); } catch { /* detached */ }
    this.d.onToggle?.(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false; this.root.hidden = true; this.stopPreview();
    this.doc.removeEventListener('keydown', this.keyHandler, true);
    this.doc.removeEventListener('keyup', this.keyUpHandler, true);
    setPanelClass(this.doc, 'shop-open', false);
    this.d.onToggle?.(false);
  }

  dispose(): void { if (this.opened) this.close(); this.off(); this.stopPreview(); this.root.remove(); }

  // ------------------------------------------------------------ keyboard / gamepad

  /** Up/down move the selection, left/right switch tabs, confirm does the main action, back leaves. */
  navigate(dir: NavDir): void {
    if (!this.opened) return;
    const n = this.rows.length;
    switch (dir) {
      case 'up': this.sel = Math.max(0, this.sel - 1); this.applySel(); break;
      case 'down': this.sel = Math.min(n, this.sel + 1); this.applySel(); break;
      case 'left': this.setTab(TABS[(TABS.indexOf(this.tab) + TABS.length - 1) % TABS.length]); break;
      case 'right': this.setTab(TABS[(TABS.indexOf(this.tab) + 1) % TABS.length]); break;
      case 'confirm': if (this.sel >= n) this.close(); else this.rows[this.sel]?.primary?.(); break;
      case 'back': this.close(); break;
    }
  }

  /** E key / gamepad Y: preview (or stop) the selected record. */
  previewSelected(): void { this.rows[this.sel]?.secondary?.(); }

  private onKey(e: KeyboardEvent): void {
    if (!this.opened || e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    if (isCloseKey(e)) { if (!e.repeat) this.close(); }
    else if (isConfirmKey(e)) { if (!e.repeat) this.navigate('confirm'); }
    else if (e.code === 'KeyE') { if (!e.repeat) this.previewSelected(); }
    else {
      const dir = navDirOf(e);
      if (dir) this.navigate(dir); else used = e.code !== 'Tab'; // Tab keeps its browser meaning; other game keys are swallowed
    }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  private setTab(t: Tab): void { this.tab = t; this.sel = 0; this.render(); }

  private applySel(): void {
    this.sel = Math.max(0, Math.min(this.rows.length, this.sel));
    this.rows.forEach((r, i) => r.el.classList.toggle('sel', i === this.sel));
    this.closeBtn.classList.toggle('sel', this.sel >= this.rows.length);
    const el = this.sel >= this.rows.length ? this.closeBtn : this.rows[this.sel]?.el;
    (el as { scrollIntoView?: (o: object) => void } | undefined)?.scrollIntoView?.({ block: 'nearest' });
  }

  // ------------------------------------------------------------ actions (also used by tests)

  buy(id: string): BuyOutcome {
    const def = this.d.stock.find((r) => r.id === id);
    if (!def) return 'owned';
    const r = this.d.inventory.buy(def);
    if (r === 'ok') { this.say(`Bought "${def.title}" for $${def.price}.`); this.d.events?.emit('shop:bought', { recordId: def.id, price: def.price, shop: 'wax-deli' }); }
    else if (r === 'poor') this.say(`Not enough cash: "${def.title}" is $${def.price}.`);
    else this.say('You already own that one.');
    return r;
  }

  /** Sells back at half price. Returns the cash received or -1. */
  sell(id: string): number {
    const def = this.d.inventory.getRecord(id);
    const got = this.d.inventory.sell(id);
    if (got >= 0 && def) { this.say(`Sold "${def.title}" for $${got}.`); this.d.events?.emit('shop:sold', { recordId: id, price: got, shop: 'wax-deli' }); }
    return got;
  }

  /** Presses a Radio library track onto vinyl for free. */
  press(track: PressableTrack): boolean {
    const def = pressLibraryTrack(track, guessGenre(track.path ?? track.name));
    const ok = this.d.inventory.addRecord(def);
    this.say(ok ? `Pressed "${def.title}" to vinyl. Free, it's yours.` : 'Already pressed.');
    if (ok) this.d.events?.emit('record:pressed', { recordId: def.id });
    return ok;
  }

  async preview(id: string): Promise<boolean> {
    const def = this.d.stock.find((r) => r.id === id) ?? this.d.inventory.getRecord(id);
    if (!def || !this.d.source || !this.d.preview) { this.say('The listening station is out of order (no audio yet: click the game once).'); return false; }
    this.stopPreview();
    const buf = await this.d.source.load(def);
    if (!buf) { this.say('That file is not loaded this session. Re-add it in the Radio library.'); return false; }
    this.previewing = id;
    this.d.preview.play(buf, () => { this.previewing = null; this.render(); });
    this.say(`Previewing "${def.title}" (${PREVIEW_SECONDS} s)...`);
    this.render();
    return true;
  }

  stopPreview(): void { if (this.previewing) { this.d.preview?.stop(); this.previewing = null; } }

  private togglePreview(id: string): void {
    if (this.previewing === id) { this.stopPreview(); this.render(); } else void this.preview(id);
  }

  // ------------------------------------------------------------ rendering

  private render(): void {
    this.cashEl.textContent = `$${this.d.inventory.cash}`;
    for (const [id, b] of this.tabs) { b.classList.toggle('on', id === this.tab); b.setAttribute('aria-pressed', String(id === this.tab)); }
    this.body.textContent = '';
    this.rows = [];
    if (this.tab === 'bins') {
      for (const def of [...this.d.stock, ...(this.d.dropRecords ?? [])]) {
        const owned = this.d.inventory.hasRecord(def.id);
        const take = (): void => { this.d.inventory.addRecord(def); this.say(`Took "${def.title}".`); };
        this.body.appendChild(this.card(def, [
          this.btn(this.previewing === def.id ? 'Stop' : 'Preview', 'shop-btn', () => this.togglePreview(def.id)),
          owned ? this.label('Owned') : def.price === 0
            ? this.btn('Take (free)', 'shop-btn shop-primary', take)
            : this.btn(`Buy $${def.price}`, 'shop-btn shop-primary', () => { this.buy(def.id); }),
        ], def.price === 0 ? 'Free' : `$${def.price}`, {
          primary: owned ? () => this.say('You already own that one.') : def.price === 0 ? take : () => { this.buy(def.id); },
          secondary: () => this.togglePreview(def.id),
        }));
      }
    } else if (this.tab === 'crate') {
      const recs = this.d.inventory.records;
      if (recs.length === 0) this.note('Your crate is empty. Buy something.');
      for (const def of recs) {
        this.body.appendChild(this.card(def, [
          this.btn(this.previewing === def.id ? 'Stop' : 'Preview', 'shop-btn', () => this.togglePreview(def.id)),
          this.btn(`Sell $${this.d.inventory.sellPrice(def)}`, 'shop-btn', () => { this.sell(def.id); }),
        ], `${Math.round(def.bpm)} BPM`, { primary: () => { this.sell(def.id); }, secondary: () => this.togglePreview(def.id) }));
      }
    } else {
      const tracks = this.d.libraryTracks?.() ?? [];
      this.note('Your own files from the Radio library can be pressed to vinyl for free. Nothing is uploaded; the audio stays on your device.');
      if (tracks.length === 0) this.note('No files in your Radio library yet. Open the Radio library from the pause menu and add some.');
      for (const t of tracks) {
        const id = `lib:${t.id}`;
        const def = pressLibraryTrack(t, guessGenre(t.path ?? t.name));
        this.body.appendChild(this.card(def, [
          this.d.inventory.hasRecord(id) ? this.label('Pressed') : this.btn('Press (free)', 'shop-btn shop-primary', () => { this.press(t); }),
        ], 'Your file', { primary: () => { this.press(t); } }));
      }
    }
    this.applySel();
  }

  private card(def: RecordDef, actions: HTMLElement[], tag: string, keys: Omit<Row, 'el'> = {}): HTMLElement {
    const c = this.el('div', 'shop-card');
    const idx = this.rows.length;
    this.rows.push({ el: c, ...keys });
    c.addEventListener('pointerdown', () => { this.sel = idx; this.applySel(); });
    const cover = this.el('div', 'shop-cover');
    cover.style.background = `linear-gradient(135deg, ${def.colors[0]}, ${def.colors[1]})`;
    const disc = this.el('div', 'shop-disc'); disc.style.background = `radial-gradient(circle at center, ${def.colors[0]} 0 14%, #0a0a0a 15% 100%)`;
    cover.appendChild(disc);
    const meta = this.el('div', 'shop-meta');
    const t = this.el('div', 'shop-rt'); t.textContent = def.title;
    const a = this.el('div', 'shop-ra'); a.textContent = `${def.artist} · ${def.genre} · ${Math.round(def.bpm)} BPM`;
    const p = this.el('div', 'shop-price'); p.textContent = tag;
    meta.append(t, a, p);
    const act = this.el('div', 'shop-actions'); act.append(...actions);
    c.append(cover, meta, act);
    return c;
  }

  private note(text: string): void { const p = this.el('p', 'shop-note'); p.textContent = text; this.body.appendChild(p); }
  private label(text: string): HTMLElement { const s = this.el('span', 'shop-owned'); s.textContent = text; return s; }
  private say(text: string): void { this.status.textContent = text; }
  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] { const e = this.doc.createElement(tag); e.className = cls; return e; }
  private btn(text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = this.el('button', cls); b.type = 'button'; b.textContent = text; b.addEventListener('click', fn); return b;
  }
}
