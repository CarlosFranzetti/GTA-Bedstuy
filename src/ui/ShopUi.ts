/**
 * WAX DELI shop panel: browse the bins, preview a record (20 s), buy with cash, sell back at half price, and
 * press free records from the player's own Radio library. Touch-first: every control is a large button.
 */
import { Inventory } from '@/game/Inventory';
import { PREVIEW_SECONDS } from '@/game/DjAudio';
import { pressLibraryTrack, guessGenre, type RecordDef, type RecordSource } from '@/game/records';
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

export class ShopUi {
  readonly root: HTMLElement;
  private readonly cashEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'bins';
  private opened = false;
  private previewing: string | null = null;
  private readonly off: () => void;
  private readonly doc: Document;

  constructor(parent: HTMLElement, private readonly d: ShopDeps) {
    this.doc = parent.ownerDocument;
    this.root = this.el('div', 'shop-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Wax Deli record bins');
    const panel = this.el('div', 'shop-panel');
    const head = this.el('div', 'shop-head');
    const title = this.el('h2', 'shop-title'); title.textContent = 'WAX DELI · Records & Sandwiches';
    this.cashEl = this.el('div', 'shop-cash');
    const close = this.btn('Close', 'shop-btn shop-close', () => this.close());
    head.append(title, this.cashEl, close);
    const nav = this.el('div', 'shop-tabs');
    for (const [id, label] of [['bins', 'Bins'], ['crate', 'Your crate'], ['press', 'Press my music']] as const) {
      const b = this.btn(label, 'shop-tab', () => { this.tab = id; this.render(); });
      this.tabs.set(id, b); nav.appendChild(b);
    }
    this.body = this.el('div', 'shop-body');
    this.status = this.el('p', 'shop-status');
    this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    panel.append(head, nav, this.body, this.status);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } });
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.off = d.inventory.onChange(() => { if (this.opened) this.render(); });
    this.render();
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    if (this.opened) return;
    this.opened = true; this.root.hidden = false; this.say('Sleeves are $12 to $25. Preview plays 20 seconds.');
    this.render();
    this.root.querySelector<HTMLElement>('button')?.focus();
    this.d.onToggle?.(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false; this.root.hidden = true; this.stopPreview();
    this.d.onToggle?.(false);
  }

  dispose(): void { this.off(); this.stopPreview(); this.root.remove(); }

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

  // ------------------------------------------------------------ rendering

  private render(): void {
    this.cashEl.textContent = `$${this.d.inventory.cash}`;
    for (const [id, b] of this.tabs) { b.classList.toggle('on', id === this.tab); b.setAttribute('aria-pressed', String(id === this.tab)); }
    this.body.textContent = '';
    if (this.tab === 'bins') {
      for (const def of [...this.d.stock, ...(this.d.dropRecords ?? [])]) {
        const owned = this.d.inventory.hasRecord(def.id);
        this.body.appendChild(this.card(def, [
          this.btn(this.previewing === def.id ? 'Stop' : 'Preview', 'shop-btn', () => { if (this.previewing === def.id) { this.stopPreview(); this.render(); } else void this.preview(def.id); }),
          owned ? this.label('Owned') : def.price === 0
            ? this.btn('Take (free)', 'shop-btn shop-primary', () => { this.d.inventory.addRecord(def); this.say(`Took "${def.title}".`); })
            : this.btn(`Buy $${def.price}`, 'shop-btn shop-primary', () => { this.buy(def.id); }),
        ], def.price === 0 ? 'Free' : `$${def.price}`));
      }
    } else if (this.tab === 'crate') {
      const recs = this.d.inventory.records;
      if (recs.length === 0) this.note('Your crate is empty. Buy something.');
      for (const def of recs) {
        this.body.appendChild(this.card(def, [
          this.btn(this.previewing === def.id ? 'Stop' : 'Preview', 'shop-btn', () => { if (this.previewing === def.id) { this.stopPreview(); this.render(); } else void this.preview(def.id); }),
          this.btn(`Sell $${this.d.inventory.sellPrice(def)}`, 'shop-btn', () => { this.sell(def.id); }),
        ], `${Math.round(def.bpm)} BPM`));
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
        ], 'Your file'));
      }
    }
  }

  private card(def: RecordDef, actions: HTMLElement[], tag: string): HTMLElement {
    const c = this.el('div', 'shop-card');
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
