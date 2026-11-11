/**
 * Row list used by every column of the pause menu (categories, options, missions, stats, radio).
 * A row is a RowSpec; the list renders the rows once and `refresh()` only rewrites values, so a slider can be dragged
 * while it updates. One row is "highlighted" (the full-width light bar); the list is `active` when its column has the focus.
 *
 * Value kinds: seg (left / right steps through options), slider (thin segmented bar), toggle (ON / OFF text),
 * action (Enter runs it), info (read only, may still be highlighted for its description).
 */
export type RowKind = 'seg' | 'slider' | 'toggle' | 'action' | 'info' | 'header';

export interface SegOption { value: string | number; label: string; hidden?: boolean }

export interface RowSpec {
  id: string;
  label: string;
  /** Text of the description panel while this row is highlighted. */
  desc?: string;
  kind: RowKind;
  /** Graphics setting behind the row: the description panel adds the GPU load bars. */
  gfx?: string;
  /** false hides the row (a tier that cannot honour it). */
  visible?: () => boolean;
  options?: () => readonly SegOption[];
  /** slider range in display units */
  min?: number; max?: number; step?: number;
  get?: () => string | number | boolean;
  set?: (v: never) => void;
  fmt?: (v: number) => string;
  /** action rows */
  press?: () => void;
  /** value differs from the preset (a mark on the left edge) */
  custom?: () => boolean;
  /** info rows: text on the right */
  text?: () => string;
  swatch?: { color: string; shape: string };
  /** value the DEFAULTS button restores (settings rows) */
  def?: () => string | number | boolean;
  /** muted row (locked mission, unavailable) */
  dim?: () => boolean;
  /** info row with a check / state glyph */
  state?: () => string;
}

const SEGMENTS = 14;

interface Built {
  spec: RowSpec;
  el: HTMLElement;
  val: HTMLElement;
  bar?: HTMLElement;
  segs?: HTMLElement[];
  left?: HTMLButtonElement;
  right?: HTMLButtonElement;
}

export interface RowListOptions {
  /** The highlighted row changed (or the list was rebuilt). */
  onHighlight?: (row: RowSpec | null) => void;
  /** A value was changed by the player on this list. */
  onChange?: (row: RowSpec) => void;
  /** A row was pressed with the pointer (not the keyboard): the owner may move the focus to this list. */
  onPointer?: () => void;
  /** false while the pointer should not move the highlight (another column has the focus). */
  canHover?: () => boolean;
  /** Label for the list (screen readers). */
  label?: string;
}

export class RowList {
  readonly el: HTMLElement;
  private readonly doc: Document;
  private rows: Built[] = [];
  private idx = 0;
  private activeFlag = false;

  constructor(doc: Document, private readonly opts: RowListOptions = {}, className = '') {
    this.doc = doc;
    this.el = doc.createElement('div');
    this.el.className = `gp-list ${className}`.trim();
    this.el.setAttribute('role', 'listbox');
    if (opts.label) this.el.setAttribute('aria-label', opts.label);
  }

  get length(): number { return this.rows.length; }
  get index(): number { return this.idx; }
  get current(): RowSpec | null { return this.rows[this.idx]?.spec ?? null; }
  get active(): boolean { return this.activeFlag; }

  setActive(on: boolean): void {
    this.activeFlag = on;
    this.el.classList.toggle('active', on);
    this.rows.forEach((r, i) => { r.el.tabIndex = on && i === this.idx ? 0 : -1; });
  }

  setRows(specs: readonly RowSpec[], keepIndex = false): void {
    this.el.textContent = '';
    this.rows = specs.map((s) => this.build(s));
    for (const r of this.rows) this.el.appendChild(r.el);
    if (!keepIndex) this.idx = 0;
    this.idx = Math.min(this.idx, Math.max(0, this.rows.length - 1));
    this.refresh();
    this.snapToVisible(1);
    this.paintHighlight(false);
    this.opts.onHighlight?.(this.current);
  }

  /** Re-reads every value and visibility. */
  refresh(): void {
    for (const r of this.rows) this.sync(r);
    if (!this.ok(this.idx)) this.snapToVisible(1);
    this.paintHighlight(false);
  }

  highlight(i: number, focus = false): void {
    if (i < 0 || i >= this.rows.length || !this.ok(i)) return;
    const changed = i !== this.idx;
    this.idx = i;
    this.paintHighlight(focus || (this.activeFlag && changed));
    if (changed) this.opts.onHighlight?.(this.current);
  }

  move(dir: 1 | -1): void {
    const n = this.rows.length;
    if (n === 0) return;
    let i = this.idx;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (this.ok(i)) { this.highlight(i, true); return; }
    }
  }

  /** Left / right on the highlighted row. Returns true when it changed something. */
  adjust(delta: -1 | 1): boolean {
    const r = this.rows[this.idx];
    if (!r) return false;
    const s = r.spec;
    let changed = false;
    if (s.kind === 'seg' && s.set) {
      const opts = (s.options?.() ?? []).filter((o) => !o.hidden);
      const at = opts.findIndex((o) => o.value === s.get?.());
      const next = opts[Math.min(opts.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta))];
      if (next && next.value !== s.get?.()) { s.set(next.value as never); changed = true; }
    } else if (s.kind === 'slider' && s.set) {
      const lo = s.min ?? 0, hi = s.max ?? 100, step = s.step ?? 5;
      const cur = Number(s.get?.() ?? lo);
      const v = Math.min(hi, Math.max(lo, Math.round((cur + delta * step) / step) * step));
      if (v !== cur) { s.set(v as never); changed = true; }
    } else if (s.kind === 'toggle' && s.set) {
      const want = delta > 0;
      if (Boolean(s.get?.()) !== want) { s.set(want as never); changed = true; }
    }
    if (changed) { this.sync(r); this.opts.onChange?.(s); }
    return changed;
  }

  /** Enter / click on the highlighted row: toggles, cycles a seg (wrapping), runs an action. */
  activate(): void {
    const r = this.rows[this.idx];
    if (!r) return;
    const s = r.spec;
    if (s.kind === 'toggle' && s.set) { s.set(!s.get?.() as never); this.sync(r); this.opts.onChange?.(s); }
    else if (s.kind === 'seg' && s.set) {
      const opts = (s.options?.() ?? []).filter((o) => !o.hidden);
      const at = opts.findIndex((o) => o.value === s.get?.());
      const next = opts[(at + 1) % Math.max(1, opts.length)];
      if (next) { s.set(next.value as never); this.sync(r); this.opts.onChange?.(s); }
    } else if (s.kind === 'action') s.press?.();
  }

  /** Rows as built (tests and the menu read them). */
  rowEl(id: string): HTMLElement | null { return this.rows.find((r) => r.spec.id === id)?.el ?? null; }
  indexOf(id: string): number { return this.rows.findIndex((r) => r.spec.id === id); }

  /* ---------- internals ---------- */

  private ok(i: number): boolean { const r = this.rows[i]; return !!r && !r.el.hidden && r.spec.kind !== 'header'; }

  /** true when no selectable row follows the highlighted one. */
  atEnd(): boolean { for (let i = this.idx + 1; i < this.rows.length; i++) if (this.ok(i)) return false; return true; }
  highlightLast(focus = false): void { for (let i = this.rows.length - 1; i >= 0; i--) if (this.ok(i)) { this.highlight(i, focus); return; } }

  private snapToVisible(dir: 1 | -1): void {
    const n = this.rows.length;
    if (n === 0 || this.ok(this.idx)) return;
    for (let k = 1; k <= n; k++) {
      const i = (this.idx + dir * k + n * k) % n;
      if (this.ok(i)) { this.idx = i; return; }
    }
  }

  private paintHighlight(focus: boolean): void {
    this.rows.forEach((r, i) => {
      if (r.spec.kind === 'header') return;
      const on = i === this.idx;
      r.el.classList.toggle('hi', on);
      r.el.setAttribute('aria-selected', String(on));
      r.el.tabIndex = this.activeFlag && on ? 0 : -1;
    });
    const cur = this.rows[this.idx]?.el;
    if (cur && focus) {
      try { cur.focus({ preventScroll: true }); } catch { cur.focus(); }
    }
    if (cur && typeof cur.scrollIntoView === 'function') { try { cur.scrollIntoView({ block: 'nearest' }); } catch { /* old engines */ } }
  }

  private build(spec: RowSpec): Built {
    const d = this.doc;
    const el = d.createElement('div');
    el.className = `gp-row k-${spec.kind}`;
    if (spec.kind === 'header') { el.className = 'gp-sub'; el.textContent = spec.label; el.setAttribute('role', 'presentation'); return { spec, el, val: el }; }
    el.dataset.id = spec.id;
    el.setAttribute('role', 'option');
    el.tabIndex = -1;
    const lab = d.createElement('span');
    lab.className = 'gp-lab';
    if (spec.swatch) {
      const sw = d.createElement('i');
      sw.className = `gp-sw ${spec.swatch.shape}`;
      sw.style.setProperty('--sw', spec.swatch.color);
      sw.setAttribute('aria-hidden', 'true');
      lab.appendChild(sw);
    }
    lab.appendChild(d.createTextNode(spec.label));
    const val = d.createElement('span');
    val.className = 'gp-val';
    const built: Built = { spec, el, val };
    const arrow = (cls: string, glyph: string, delta: -1 | 1): HTMLButtonElement => {
      const b = d.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = `gp-arrow ${cls}`; b.textContent = glyph === '\u2039' ? '\u25C4' : '\u25BA';
      b.setAttribute('aria-label', delta < 0 ? `Decrease ${spec.label}` : `Increase ${spec.label}`);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pointerTo(built); this.adjust(delta); });
      return b;
    };
    if (spec.kind === 'seg' || spec.kind === 'slider' || spec.kind === 'toggle') {
      built.left = arrow('l', '‹', -1);
      built.right = arrow('r', '›', 1);
    }
    if (spec.kind === 'slider') {
      const bar = d.createElement('span');
      bar.className = 'gp-bar';
      bar.setAttribute('aria-hidden', 'true');
      built.segs = [];
      for (let i = 0; i < SEGMENTS; i++) { const s = d.createElement('i'); bar.appendChild(s); built.segs.push(s); }
      built.bar = bar;
      this.dragBar(built);
    }
    const text = d.createElement('span');
    text.className = 'gp-text';
    if (built.left && built.right && built.bar) val.append(built.left, built.bar, text, built.right);
    else if (built.left && built.right) val.append(built.left, text, built.right);
    else val.append(text);
    el.append(lab, val);
    el.addEventListener('mouseenter', () => { if (this.ok(this.rows.indexOf(built)) && (this.opts.canHover?.() ?? true)) this.highlight(this.rows.indexOf(built)); });
    el.addEventListener('click', () => {
      this.pointerTo(built);
      if (spec.kind === 'slider') return; // the bar and arrows handle themselves
      this.activate();
    });
    return built;
  }

  private pointerTo(b: Built): void {
    const i = this.rows.indexOf(b);
    if (i >= 0) { this.idx = i; this.paintHighlight(false); this.opts.onHighlight?.(this.current); }
    this.opts.onPointer?.();
  }

  private dragBar(b: Built): void {
    const bar = b.bar!;
    const s = b.spec;
    let dragging = false;
    const at = (e: PointerEvent): void => {
      const r = bar.getBoundingClientRect();
      if (r.width <= 0) return;
      const lo = s.min ?? 0, hi = s.max ?? 100, step = s.step ?? 5;
      const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const v = Math.min(hi, Math.max(lo, Math.round((lo + t * (hi - lo)) / step) * step));
      if (v !== Number(s.get?.())) { s.set?.(v as never); this.sync(b); this.opts.onChange?.(s); }
    };
    bar.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); dragging = true; this.pointerTo(b);
      try { bar.setPointerCapture(e.pointerId); } catch { /* jsdom / old engines */ }
      at(e);
    });
    bar.addEventListener('pointermove', (e) => { if (dragging) at(e); });
    const end = (): void => { dragging = false; };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    bar.addEventListener('click', (e) => e.stopPropagation());
  }

  private sync(b: Built): void {
    const s = b.spec;
    b.el.hidden = s.visible ? !s.visible() : false;
    b.el.classList.toggle('is-custom', !!s.custom?.());
    b.el.classList.toggle('dim', !!s.dim?.());
    if (s.kind === 'header') return;
    const text = b.val.querySelector<HTMLElement>('.gp-text')!;
    let shown = '';
    if (s.kind === 'toggle') { const on = Boolean(s.get?.()); shown = on ? 'ON' : 'OFF'; b.el.classList.toggle('on', on); b.el.setAttribute('aria-checked', String(on)); if (b.left) b.left.disabled = !on; if (b.right) b.right.disabled = on; }
    else if (s.kind === 'seg') {
      const opts = s.options?.() ?? [];
      const v = s.get?.();
      shown = opts.find((o) => o.value === v)?.label ?? String(v ?? '');
      const vis = opts.filter((o) => !o.hidden);
      const at = vis.findIndex((o) => o.value === v);
      if (b.left) b.left.disabled = at <= 0;
      if (b.right) b.right.disabled = at >= vis.length - 1;
    } else if (s.kind === 'slider') {
      const lo = s.min ?? 0, hi = s.max ?? 100;
      const v = Number(s.get?.() ?? lo);
      shown = s.fmt ? s.fmt(v) : String(v);
      const frac = hi > lo ? (v - lo) / (hi - lo) : 0;
      const n = Math.round(frac * SEGMENTS);
      b.segs?.forEach((seg, i) => seg.classList.toggle('on', i < n));
      b.bar?.setAttribute('data-value', String(v));
      if (b.left) b.left.disabled = v <= lo;
      if (b.right) b.right.disabled = v >= hi;
    } else if (s.kind === 'action') shown = s.text ? s.text() : '›';
    else shown = s.text ? s.text() : '';
    if (text.textContent !== shown) text.textContent = shown;
    const st = s.state?.() ?? '';
    if (b.el.dataset.state !== st) { if (st) b.el.dataset.state = st; else delete b.el.dataset.state; }
  }
}
