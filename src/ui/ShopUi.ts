/**
 * WAX DELI shop panel: browse the bins, preview a record (20 s), buy with cash, sell back at half price, and
 * press free records from the player's own Radio library. Touch-first: every control is a large button.
 *
 * Layout: header and tabs on top, a scrolling list, and a sticky footer (status, key hint, Close) that is always
 * on screen, even at 640x360. Keyboard: W/S or arrows select, A/D or arrows switch tabs, Enter / Space / F do the
 * main action (buy, sell, press), V previews, Q / E switch tabs, Esc / X / B / Backspace close (Esc first cancels a pending sell/buy confirm). Gamepad: `navigate(dir)` (d-pad, A, B).
 */
import { Inventory } from '@/game/Inventory';
import { PREVIEW_SECONDS } from '@/game/DjAudio';
import { pressLibraryTrack, guessGenre, type RecordDef, type RecordSource } from '@/game/records';
import { CRATES, RARITY_LABEL, archiveStock, type Crate, type Rarity } from '@/game/archiveRecords';
import { linerNote } from './LinerNote';
import { sleeveElement } from './sleeve';
import { LISTENING_POST, postEmbedSrc, type PostTrack } from '@/game/listeningPost';
import { isCloseKey, isConfirmKey, navDirOf, releasePointerLock, setPanelClass, type NavDir } from './panelKeys';
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
  /** The archive crate: real free recordings under parody sleeves. Default: the hosted build's crate (none in the single-file build). */
  archive?: readonly RecordDef[];
  /** The listening post (streams through SoundCloud's own player). `tracks` defaults to LISTENING_POST. `onListen(true)` is called when a stream
   * starts (pause the radio so two SoundCloud players never play at once) and `onListen(false)` when it stops or the shop closes (resume it). */
  post?: { tracks?: readonly PostTrack[]; onListen?: (on: boolean) => void };
  onToggle?: (open: boolean) => void;
  /** Release the mouse capture (pointer lock) on open so the buttons can be clicked. Needs Menu to ignore the unlock. */
  releasePointerLock?: boolean;
}

/** A sell (or a buy that would leave under $10) needs a second Enter within this many ms. */
export const CONFIRM_MS = 3000;
/** Buying stays one-press unless it would leave the player with less than this much cash. */
export const BUY_CONFIRM_MARGIN = 10;

export type BuyOutcome = 'ok' | 'owned' | 'poor';
type Tab = 'bins' | 'crate' | 'press';
const TABS: readonly Tab[] = ['bins', 'crate', 'press'];
type CrateFilter = 'all' | 'synth' | 'post' | Crate;
interface Row { el: HTMLElement; primary?: () => void; secondary?: () => void; def?: RecordDef }

export class ShopUi {
  readonly root: HTMLElement;
  private readonly cashEl: HTMLElement;
  private readonly body: HTMLElement;
  /** Crate chips: outside the scrolling list so they stay on screen. */
  private readonly crateEl: HTMLElement;
  private readonly status: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'bins';
  private listening: string | null = null;
  private crate: CrateFilter = 'all';
  /** The record whose liner note is open, if any. */
  private liner: RecordDef | null = null;
  private opened = false;
  private previewing: string | null = null;
  /** Keyboard / gamepad selection: 0..rows.length-1 are cards, rows.length is the Close button. */
  private sel = 0;
  private rows: Row[] = [];
  private readonly countEl: HTMLElement;
  /** Row waiting for its second Enter: `key` is `sell:<id>` or `buy:<id>`. */
  private armed: { key: string; until: number } | null = null;
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
    this.countEl = this.el('div', 'shop-count');
    this.countEl.setAttribute('aria-hidden', 'true');
    head.append(title, this.countEl, this.cashEl);
    const nav = this.el('div', 'shop-tabs');
    for (const [id, label] of [['bins', 'Bins'], ['crate', 'Your crate'], ['press', 'Press my music']] as const) {
      const b = this.btn(label, 'shop-tab', () => this.setTab(id));
      this.tabs.set(id, b); nav.appendChild(b);
    }
    this.crateEl = this.el('div', 'shop-crates');
    this.crateEl.setAttribute('role', 'group'); this.crateEl.setAttribute('aria-label', 'Crates');
    this.body = this.el('div', 'shop-body');
    this.status = this.el('p', 'shop-status');
    this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    const foot = this.el('div', 'shop-foot');
    const hint = this.el('span', 'shop-hint');
    hint.textContent = 'W/S select · Q / E tabs · C crate · L liner note · Enter or F buy · V preview · Esc or X close';
    this.closeBtn = this.btn('Close', 'shop-btn shop-close', () => this.close());
    foot.append(this.status, hint, this.closeBtn);
    panel.append(head, nav, this.crateEl, this.body, foot);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.off = d.inventory.onChange(() => { if (this.opened) this.render(); });
    this.render();
  }

  get isOpen(): boolean { return this.opened; }

  private priceRange(): string {
    const ps = this.sold().map((r) => r.price).filter((n) => n > 0);
    return ps.length ? `$${Math.min(...ps)} to $${Math.max(...ps)}` : '$12 to $25';
  }
  private postTracks(): readonly PostTrack[] { return this.d.post?.tracks ?? LISTENING_POST; }
  /** Stops a listening-post stream (removes SoundCloud's player) and tells the host so the radio can resume. */
  private stopPost(): void {
    if (this.listening === null) return;
    this.listening = null; this.d.post?.onListen?.(false);
  }
  get listeningTo(): string | null { return this.listening; }
  /** Starts or stops the stream of a listening-post track. */
  togglePost(id: string): void {
    const t = this.postTracks().find((x) => x.id === id); if (!t || !postEmbedSrc(t.url)) return;
    if (this.listening === id) { this.stopPost(); this.say('Listening post stopped.'); this.render(); return; }
    this.stopPreview();
    const was = this.listening !== null; this.listening = id;
    if (!was) this.d.post?.onListen?.(true);
    this.say('Streaming from SoundCloud. The player shows the real artist and title. Not for the decks.'); this.render();
  }

  open(): void {
    if (this.opened) return;
    this.opened = true; this.root.hidden = false; this.say(this.archiveList().length ? `Sleeves ${this.priceRange()}. Preview plays 20 seconds. L opens the liner note.` : 'Sleeves are $12 to $25. Preview plays 20 seconds.');
    this.armed = null;
    this.sel = this.firstBuyableRow();
    this.render();
    this.doc.addEventListener('keydown', this.keyHandler, true);
    this.doc.addEventListener('keyup', this.keyUpHandler, true);
    setPanelClass(this.doc, 'shop-open', true);
    if (this.d.releasePointerLock) releasePointerLock(this.doc);
    try { this.root.focus({ preventScroll: true }); } catch { /* detached */ }
    this.d.onToggle?.(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false; this.liner = null; this.root.hidden = true; this.stopPreview(); this.stopPost();
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
      case 'up': this.armed = null; this.sel = Math.max(0, this.sel - 1); this.applySel(); break;
      case 'down': this.armed = null; this.sel = Math.min(n, this.sel + 1); this.applySel(); break;
      case 'left': this.setTab(TABS[(TABS.indexOf(this.tab) + TABS.length - 1) % TABS.length]); break;
      case 'right': this.setTab(TABS[(TABS.indexOf(this.tab) + 1) % TABS.length]); break;
      case 'confirm': if (this.sel >= n) this.close(); else this.rows[this.sel]?.primary?.(); break;
      case 'back': if (this.liner) this.closeLiner(); else if (this.pendingConfirm) { this.armed = null; this.say('Cancelled.'); } else this.close(); break;
    }
  }

  /** True while a sell/buy waits for its second Enter. */
  get pendingConfirm(): boolean { return !!this.armed && this.armed.until > this.now(); }

  /** Second-Enter gate: the first call arms `key` and shows `prompt`; a second call within CONFIRM_MS runs `fn`. */
  private confirm(key: string, prompt: string, fn: () => void): void {
    const t = this.now();
    if (this.armed && this.armed.key === key && this.armed.until > t) { this.armed = null; fn(); return; }
    this.armed = { key, until: t + CONFIRM_MS };
    this.say(prompt);
  }

  private now(): number { return Date.now(); }

  /** Everything on sale: synthesised originals, then the archive crate. */
  private sold(): RecordDef[] { return [...this.d.stock, ...this.archiveList()]; }
  private archiveList(): readonly RecordDef[] { return this.d.archive ?? archiveStock(); }

  /** What the Bins tab lists under the current crate filter. */
  private binList(): RecordDef[] {
    const arc = this.archiveList();
    if (this.crate === 'post') return [];
    if (this.crate === 'synth') return [...this.d.stock, ...(this.d.dropRecords ?? [])];
    if (this.crate === 'all') return [...this.d.stock, ...arc, ...(this.d.dropRecords ?? [])];
    return arc.filter((r) => r.genre === this.crate);
  }

  /** Opens or closes the liner note of the selected record (key L). */
  linerSelected(): void { if (this.liner) { this.closeLiner(); return; } const d = this.rows[this.sel]?.def; if (d) this.openLiner(d); }
  openLiner(def: RecordDef): void { this.liner = def; this.armed = null; this.render(); this.say('Liner note: the real credits behind the sleeve. Esc to go back.'); }
  closeLiner(): void { this.liner = null; this.render(); }
  get linerOpen(): boolean { return this.liner !== null; }

  /** C key: next crate (All, Synth originals, then the archive crates that exist). */
  cycleCrate(): void {
    const ids: CrateFilter[] = ['all', 'synth', ...CRATES.filter((c) => this.archiveList().some((r) => r.genre === c.id)).map((c) => c.id), 'post'];
    this.crate = ids[(ids.indexOf(this.crate) + 1) % ids.length]; this.liner = null; this.sel = 0; this.armed = null; this.render();
  }
  get crateFilter(): string { return this.crate; }

  /** Index of the first bin row the player can still buy or take; 0 when none. */
  private firstBuyableRow(): number {
    const list = this.binList();
    const i = list.findIndex((def) => !this.d.inventory.hasRecord(def.id));
    return i < 0 ? 0 : i;
  }

  /** E key / gamepad Y: preview (or stop) the selected record. */
  previewSelected(): void { this.rows[this.sel]?.secondary?.(); }

  private onKey(e: KeyboardEvent): void {
    if (!this.opened || e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    if (isCloseKey(e)) { if (!e.repeat) this.navigate('back'); }
    else if (isConfirmKey(e)) { if (!e.repeat) this.navigate('confirm'); }
    else if (e.code === 'KeyV') { if (!e.repeat) this.previewSelected(); }
    else if (e.code === 'KeyL') { if (!e.repeat) this.linerSelected(); }
    else if (e.code === 'KeyC') { if (!e.repeat && this.tab === 'bins') this.cycleCrate(); }
    else if (e.code === 'KeyQ') { if (!e.repeat) this.navigate('left'); }
    else if (e.code === 'KeyE') { if (!e.repeat) this.navigate('right'); }
    else {
      const dir = navDirOf(e);
      if (dir) this.navigate(dir); else used = e.code !== 'Tab'; // Tab keeps its browser meaning; other game keys are swallowed
    }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  private setTab(t: Tab): void { this.tab = t; this.liner = null; this.armed = null; this.sel = t === 'bins' ? this.firstBuyableRow() : 0; this.render(); }

  private applySel(): void {
    this.sel = Math.max(0, Math.min(this.rows.length, this.sel));
    this.rows.forEach((r, i) => r.el.classList.toggle('sel', i === this.sel));
    this.closeBtn.classList.toggle('sel', this.sel >= this.rows.length);
    const el = this.sel >= this.rows.length ? this.closeBtn : this.rows[this.sel]?.el;
    (el as { scrollIntoView?: (o: object) => void } | undefined)?.scrollIntoView?.({ block: 'nearest' });
    this.updateCount();
  }

  /** "n of N" for the highlighted row plus up/down arrows when more rows hide above or below. */
  private updateCount(): void {
    const n = this.rows.length;
    if (n === 0) { this.countEl.textContent = ''; return; }
    const at = Math.min(this.sel, n - 1) + 1;
    this.countEl.textContent = (at > 1 ? '\u25B2 ' : '') + at + ' of ' + n + (at < n ? ' \u25BC' : '');
  }

  // ------------------------------------------------------------ actions (also used by tests)

  buy(id: string): BuyOutcome {
    const def = this.sold().find((r) => r.id === id);
    if (!def) return 'owned';
    const r = this.d.inventory.buy(def);
    if (r === 'ok') { this.say(`Bought "${def.title}" for $${def.price}.`); this.d.events?.emit('shop:bought', { recordId: def.id, price: def.price, shop: 'wax-deli' }); }
    else if (r === 'poor') this.say(`Not enough cash: "${def.title}" is $${def.price}.`);
    else this.say('You already own that one.');
    return r;
  }

  /** Keyboard / gamepad buy: quick, unless it would leave under $10. */
  private keyBuy(def: RecordDef): void {
    if (def.price > this.d.inventory.cash - BUY_CONFIRM_MARGIN && def.price <= this.d.inventory.cash) {
      this.confirm(`buy:${def.id}`, `Buy "${def.title}" for $${def.price}? Enter again / Esc`, () => { this.buy(def.id); });
    } else this.buy(def.id);
  }

  /** Keyboard / gamepad sell: always asks for a second Enter. */
  private keySell(def: RecordDef): void {
    this.confirm(`sell:${def.id}`, `Sell "${def.title}" for $${this.d.inventory.sellPrice(def)}? Enter again / Esc`, () => { this.sell(def.id); });
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
    const def = this.sold().find((r) => r.id === id) ?? this.d.inventory.getRecord(id);
    if (!def || !this.d.source || !this.d.preview) { this.say('The listening station is out of order (no audio yet: click the game once).'); return false; }
    this.stopPreview();
    const buf = await this.d.source.load(def);
    if (!buf) { this.say(def.kind === 'archive' ? 'Could not fetch that clip (offline?). Try again.' : 'That file is not loaded this session. Re-add it in the Radio library.'); return false; }
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
    this.crateEl.textContent = ''; this.crateEl.hidden = true;
    this.rows = [];
    if (this.liner) {
      this.body.appendChild(linerNote(this.doc, this.liner, () => this.closeLiner()));
      this.updateCount();
      return;
    }
    if (this.tab === 'bins') {
      this.crateBar();
      if (this.crate === 'post') this.postRows(); else this.note('Your own music: press files from your Radio library (third tab) or drop them in src/assets/records/ (only files you may redistribute: a deployed build bundles them). Free, and they play on the decks.');
      for (const def of this.binList()) {
        const owned = this.d.inventory.hasRecord(def.id);
        const take = (): void => { this.d.inventory.addRecord(def); this.say(`Took "${def.title}".`); };
        this.body.appendChild(this.card(def, [
          this.btn(this.previewing === def.id ? 'Stop' : 'Preview', 'shop-btn', () => this.togglePreview(def.id)),
          owned ? this.label('Owned') : def.price === 0
            ? this.btn('Take (free)', 'shop-btn shop-primary', take)
            : this.btn(`Buy $${def.price}`, 'shop-btn shop-primary', () => { this.buy(def.id); }),
        ], def.price === 0 ? 'Free' : (def.rarity ? `${RARITY_LABEL[def.rarity as Rarity] ?? def.rarity} \u00b7 ` : '') + `$${def.price}`, {
          primary: owned ? () => this.say('You already own that one.') : def.price === 0 ? take : () => this.keyBuy(def),
          secondary: () => this.togglePreview(def.id), def,
        }));
      }
    } else if (this.tab === 'crate') {
      const recs = this.d.inventory.records;
      if (recs.length === 0) this.note('Your crate is empty. Buy something.');
      for (const def of recs) {
        this.body.appendChild(this.card(def, [
          this.btn(this.previewing === def.id ? 'Stop' : 'Preview', 'shop-btn', () => this.togglePreview(def.id)),
          this.btn(`Sell $${this.d.inventory.sellPrice(def)}`, 'shop-btn', () => { this.sell(def.id); }),
        ], def.beatMatched === false ? 'free tempo' : `${Math.round(def.bpm)} BPM`, { primary: () => this.keySell(def), secondary: () => this.togglePreview(def.id), def }));
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
        ], 'Your file', { primary: () => { this.press(t); }, def }));
      }
    }
    this.applySel();
  }

  private crateBar(): void {
    const arc = this.archiveList();
    const bar = this.crateEl; bar.hidden = false;
    const chips: Array<[CrateFilter, string]> = [['all', 'All'], ['synth', 'Synth originals'], ...CRATES.filter((c) => arc.some((r) => r.genre === c.id)).map((c): [CrateFilter, string] => [c.id, c.label]), ['post', 'Listening post']];
    for (const [id, text] of chips) {
      const b = this.btn(text, 'shop-chip' + (id === this.crate ? ' on' : ''), () => { this.crate = id; this.sel = 0; this.armed = null; this.render(); });
      b.setAttribute('aria-pressed', String(id === this.crate)); bar.appendChild(b);
    }
  }

  /** The listening post: parody sleeves around SoundCloud's official player. Stream only, never on the decks. */
  private postRows(): void {
    this.note("Listening post: real records, streamed from their own official SoundCloud pages through SoundCloud's player. Nothing is downloaded or kept, and these cannot go on the decks.");
    const tracks = this.postTracks();
    if (tracks.length === 0) { this.note("The listening post is empty. Real tracks are added here only when they are on the artist's or label's own verified SoundCloud account and embedding is allowed."); return; }
    for (const t of tracks) {
      const src = postEmbedSrc(t.url); if (!src) continue;
      const def: RecordDef = { id: t.id, title: t.title, artist: t.artist, genre: t.genre, price: 0, bpm: 0, colors: t.colors, kind: 'library', sleeve: t.sleeve, label: t.label, cat: t.cat, year: t.real.year };
      const on = this.listening === t.id;
      const c = this.el('div', 'shop-card shop-post');
      const idx = this.rows.length;
      this.rows.push({ el: c, primary: () => this.togglePost(t.id), secondary: () => this.togglePost(t.id) });
      c.addEventListener('pointerdown', () => { this.sel = idx; this.applySel(); });
      const cover = this.el('div', 'shop-cover'); cover.appendChild(sleeveElement(this.doc, def));
      const meta = this.el('div', 'shop-meta');
      const ti = this.el('div', 'shop-rt'); ti.textContent = t.title;
      const ar = this.el('div', 'shop-ra'); ar.textContent = `${t.artist} · ${t.genre} · stream only`;
      const tr = this.el('div', 'shop-price'); tr.textContent = `Really: ${t.real.title} by ${t.real.artist}, ${t.real.label}, ${t.real.year}`;
      const lk = this.el('div', 'shop-ra');
      const a = this.doc.createElement('a'); a.href = t.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = t.url.replace(/^https:\/\//, '');
      lk.append('Official page: ', a);
      meta.append(ti, ar, tr, lk);
      const act = this.el('div', 'shop-actions');
      act.append(this.btn(on ? 'Stop' : 'Listen', 'shop-btn shop-primary', () => this.togglePost(t.id)));
      c.append(cover, meta, act);
      if (on) {
        const f = this.doc.createElement('iframe'); f.className = 'shop-post-player'; f.src = src; f.title = `SoundCloud player: ${t.real.title} by ${t.real.artist}`;
        f.setAttribute('allow', 'autoplay; encrypted-media'); f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', 'no'); f.height = '120';
        c.appendChild(f);
      }
      this.body.appendChild(c);
    }
  }

  private card(def: RecordDef, actions: HTMLElement[], tag: string, keys: Omit<Row, 'el'> = {}): HTMLElement {
    if (def.kind === 'archive' || def.kind === 'procedural') actions.unshift(this.btn('Liner', 'shop-btn', () => this.openLiner(def)));
    const c = this.el('div', 'shop-card');
    const idx = this.rows.length;
    this.rows.push({ el: c, ...keys });
    c.addEventListener('pointerdown', () => { this.sel = idx; this.applySel(); });
    const cover = this.el('div', 'shop-cover');
    cover.appendChild(sleeveElement(this.doc, def));
    const meta = this.el('div', 'shop-meta');
    const t = this.el('div', 'shop-rt'); t.textContent = def.title;
    const a = this.el('div', 'shop-ra'); a.textContent = `${def.artist} · ${def.genre} · ` + (def.beatMatched === false ? 'free tempo' : `${Math.round(def.bpm)} BPM`);
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
