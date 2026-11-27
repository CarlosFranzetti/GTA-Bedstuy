import './story.css';
import { setStoryPanelClass } from './panelClass';
import type { PanelManager } from '../PanelManager';
import { BAG_MAX, MARKETS, priceOf, type Garment, type ThriftBag, type ThriftRack } from '@/game/story/thrift';

/**
 * The thrift rack (SCENEUI): buy pieces off a rack into the bag (four at most) and see what each piece is worth by place (the resale guess:
 * vintage stall, consignment shop, a friend, the pawn counter, someone in the club line). Works over `Nightlife.racks` and `Nightlife.bag`; the host
 * only moves cash (`pay`, `canPay`). An optional budget (Lana: "four pieces, under fifty") caps what one visit may spend. DOM only.
 * It is a PanelManager panel (`rack`): Esc, Back, the Close button and a right click go back; no Esc handler of its own.
 * Keys: W/S or arrows pick a piece, Enter, Space or F buy it, X, B or Backspace close. Touch: a large Buy button on every piece.
 */
export interface RackHost {
  canPay(n: number): boolean;
  /** Positive pays the wallet, negative spends (the same sign as BridgeHost.pay). */
  pay(n: number): void;
  cash?(): number;
}
export interface RackStore { racks: ReadonlyMap<string, ThriftRack>; bag: ThriftBag }
export interface RackPanelOptions { panels?: Pick<PanelManager, 'register' | 'sync'>; onChange?: () => void; onToggle?: (open: boolean) => void }

export type BuyResult = 'ok' | 'full' | 'poor' | 'gone' | 'budget' | 'norack';
const TIER_COLOUR = { basic: '#8a8f98', vintage: '#d9a441', label: '#9b7ad6' } as const;

/** What a piece fetches at each place, best first (zero where the buyer will not take it). */
export function resaleGuess(g: Garment): Array<{ id: string; label: string; price: number }> {
  return Object.values(MARKETS).map((m) => ({ id: m.id, label: m.label, price: priceOf(g, m) })).sort((a, b) => b.price - a.price);
}

export class RackPanel {
  readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly title: HTMLElement;
  private readonly cashEl: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly body: HTMLElement;
  private readonly status: HTMLElement;
  private rackId: string | null = null;
  private budget: number | null = null;
  private spent = 0;
  private sel = 0;
  private open = false;
  private rows: Array<{ el: HTMLElement; buy?: () => void }> = [];
  private readonly offs: Array<() => void> = [];

  constructor(parent: HTMLElement, private readonly store: RackStore, private readonly host: RackHost, private readonly o: RackPanelOptions = {}) {
    this.doc = parent.ownerDocument;
    const d = this.doc;
    const el = (tag: string, cls: string): HTMLElement => { const e = d.createElement(tag); e.className = cls; return e; };
    this.root = el('div', 'rack-root'); this.root.hidden = true; this.root.tabIndex = -1; this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-label', 'Thrift rack');
    const panel = el('div', 'rack-panel');
    const head = el('div', 'rack-head'); this.title = el('h2', 'rack-title'); this.cashEl = el('span', 'rack-cash'); head.append(this.title, this.cashEl);
    this.sub = el('p', 'rack-sub'); this.body = el('div', 'rack-body');
    const foot = el('div', 'rack-foot'); this.status = el('p', 'rack-status');
    const close = el('button', 'rack-close') as HTMLButtonElement; close.type = 'button'; close.textContent = 'Close'; close.addEventListener('click', () => this.close());
    foot.append(this.status, close);
    panel.append(head, this.sub, this.body, foot); this.root.appendChild(panel);
    parent.appendChild(this.root);
    const w = d.defaultView;
    if (w) {
      const onKey = (e: KeyboardEvent): void => this.onKey(e);
      w.addEventListener('keydown', onKey, true);
      this.offs.push(() => w.removeEventListener('keydown', onKey, true));
    }
    o.panels?.register({ id: 'rack', isOpen: () => this.open, close: () => this.close() });
  }

  get isOpen(): boolean { return this.open; }
  get spentThisVisit(): number { return this.spent; }

  openRack(rackId: string, budget?: number): boolean {
    if (!this.store.racks.has(rackId)) return false;
    this.rackId = rackId; this.budget = budget ?? null; this.spent = 0; this.sel = 0;
    this.status.textContent = '';
    this.open = true; this.root.hidden = false;
    setStoryPanelClass(this.doc, 'rack-open', true);
    this.render();
    this.o.panels?.sync(); this.o.onToggle?.(true);
    return true;
  }

  close(): void {
    if (!this.open) return;
    this.open = false; this.root.hidden = true;
    setStoryPanelClass(this.doc, 'rack-open', false);
    this.o.panels?.sync(); this.o.onToggle?.(false);
  }

  /** Buy piece `id` off the open rack. */
  buy(id: string): BuyResult {
    const rack = this.rackId ? this.store.racks.get(this.rackId) : undefined;
    if (!rack) return 'norack';
    const g = rack.available.find((x) => x.id === id);
    if (g && this.budget !== null && this.spent + g.buy > this.budget) { this.say(`Over the $${this.budget} you set aside.`); return 'budget'; }
    const r = this.store.bag.buy(rack, id, (c) => { if (!this.host.canPay(c)) return false; this.host.pay(-c); return true; });
    if (r === 'ok' && g) { this.spent += g.buy; this.say(`Bought ${g.label} for $${g.buy}.`); this.o.onChange?.(); }
    else if (r === 'full') this.say(`The bag holds ${BAG_MAX}. Sell something first.`);
    else if (r === 'poor') this.say('Not enough cash.');
    else if (r === 'gone') this.say('Somebody got there first.');
    this.render();
    return r;
  }

  dispose(): void { for (const f of this.offs.splice(0)) f(); if (this.open) this.close(); this.root.remove(); }

  private say(t: string): void { this.status.textContent = t; }

  private render(): void {
    const d = this.doc, rack = this.rackId ? this.store.racks.get(this.rackId) : undefined;
    if (!rack) return;
    this.title.textContent = 'Thrift rack';
    const cash = this.host.cash?.();
    this.cashEl.textContent = cash === undefined ? '' : `$${cash}`;
    const left = this.budget === null ? '' : `  Set aside $${this.budget}, $${Math.max(0, this.budget - this.spent)} left.`;
    this.sub.textContent = `Bag ${this.store.bag.items.length} of ${BAG_MAX}.${left} Look at the zips, not the labels.`;
    this.rows = [];
    const kids: HTMLElement[] = [];
    const h = (t: string): HTMLElement => { const e = d.createElement('h3'); e.className = 'rack-h'; e.textContent = t; return e; };
    const plain = (t: string): HTMLElement => { const p = d.createElement('p'); p.className = 'rack-note'; p.textContent = t; return p; };
    kids.push(h('On the rack'));
    const items = rack.available;
    if (!items.length) kids.push(plain('Nothing left today. It restocks tomorrow.'));
    for (const g of items) {
      const best = resaleGuess(g)[0];
      const row = this.row(g, `Condition ${Math.round(g.condition * 100)}%. Worth up to $${best.price} at ${best.label.toLowerCase()}.`, `$${g.buy}`, 'Buy', () => this.buy(g.id), this.store.bag.items.length >= BAG_MAX);
      this.rows.push({ el: row, buy: () => this.buy(g.id) });
      kids.push(row);
    }
    kids.push(h('In your bag: what it fetches'));
    if (!this.store.bag.items.length) kids.push(plain('Empty.'));
    for (const g of this.store.bag.items) {
      const guess = resaleGuess(g).filter((x) => x.price > 0).slice(0, 3).map((x) => `${x.label} $${x.price}`).join('  |  ') || 'Nobody wants it.';
      kids.push(this.row(g, guess, `paid $${g.buy}`));
    }
    this.body.replaceChildren(...kids);
    this.sel = Math.min(this.sel, Math.max(0, this.rows.length - 1));
    this.mark();
  }

  private row(g: Garment, note: string, price: string, action?: string, run?: () => void, disabled = false): HTMLElement {
    const d = this.doc;
    const r = d.createElement('div'); r.className = 'rack-item'; r.dataset.id = g.id;
    const sw = d.createElement('span'); sw.className = 'rack-swatch'; sw.style.background = TIER_COLOUR[g.tier]; sw.title = g.tier;
    const meta = d.createElement('div'); meta.className = 'rack-meta';
    const name = d.createElement('div'); name.className = 'rack-name'; name.textContent = g.label;
    const nt = d.createElement('div'); nt.className = 'rack-note'; nt.textContent = note;
    meta.append(name, nt);
    const pr = d.createElement('span'); pr.className = 'rack-price'; pr.textContent = price;
    r.append(sw, meta, pr);
    if (action && run) {
      const b = d.createElement('button'); b.type = 'button'; b.className = 'rack-btn'; b.textContent = action; b.disabled = disabled;
      b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
      r.appendChild(b);
    }
    return r;
  }

  private mark(): void {
    this.rows.forEach((r, i) => r.el.classList.toggle('sel', i === this.sel));
    this.rows[this.sel]?.el.scrollIntoView?.({ block: 'nearest' });
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open || e.repeat) return;
    const c = e.code, n = this.rows.length;
    const eat = (): void => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (c === 'ArrowDown' || c === 'KeyS') { eat(); if (n) this.sel = (this.sel + 1) % n; this.mark(); }
    else if (c === 'ArrowUp' || c === 'KeyW') { eat(); if (n) this.sel = (this.sel + n - 1) % n; this.mark(); }
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space' || c === 'KeyF') { eat(); this.rows[this.sel]?.buy?.(); }
    else if (c === 'KeyX' || c === 'KeyB' || c === 'Backspace') { eat(); this.close(); }
  }
}
