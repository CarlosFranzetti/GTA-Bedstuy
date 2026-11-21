/**
 * The pause menu's Controls tab: the keyboard bindings by action (click a key, press the new one; conflicts are reported;
 * Reset to defaults) and the pad's feel (dead zones, look curve, rumble) with the layout of the pad that is connected.
 * Bindings live in `Bindings` (saved on this device), pad tuning in Gamepad.ts. Nothing here is the game save.
 */
import { ACTIONS, ACTION_BY_ID, GAME_BINDINGS, LOCK_ONLY_KEYS, MAX_SLOTS, WHEEL_DOWN, WHEEL_UP, keyLabel, type ActionId, type Bindings } from '@/core/Bindings';
import { gamepadRows } from '@/core/ControlsHelp';
import { DEFAULT_TUNING, PAD_TUNING, savePadTuning, type PadTuning } from '@/core/Gamepad';

interface Slider { key: 'moveDeadZone' | 'lookDeadZone' | 'lookSpeed' | 'lookCurve' | 'triggerDead'; label: string; min: number; max: number; step: number; fmt: (v: number) => string }
const SLIDERS: readonly Slider[] = [
  { key: 'moveDeadZone', label: 'Move stick dead zone', min: 0, max: 40, step: 1, fmt: (v) => `${v}%` },
  { key: 'lookDeadZone', label: 'Look stick dead zone', min: 0, max: 40, step: 1, fmt: (v) => `${v}%` },
  { key: 'lookSpeed', label: 'Look speed', min: 40, max: 250, step: 5, fmt: (v) => `${v}%` },
  { key: 'lookCurve', label: 'Look response', min: 100, max: 300, step: 10, fmt: (v) => (v < 125 ? 'Linear' : v < 190 ? 'Default' : 'Slow start') },
  { key: 'triggerDead', label: 'Trigger dead zone', min: 0, max: 30, step: 1, fmt: (v) => `${v}%` },
];

export class ControlsPane {
  readonly root: HTMLElement;
  readonly side: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly padNameEl: HTMLElement;
  private readonly padRows: HTMLElement;
  private slotBtns = new Map<string, HTMLButtonElement>();
  private rowEls = new Map<ActionId, HTMLElement>();
  /** The slot waiting for a key, if any. */
  capturing: { id: ActionId; slot: number } | null = null;
  private stopCapture: (() => void) | null = null;
  private readonly off: () => void;

  constructor(private readonly doc: Document, private readonly bindings: Bindings = GAME_BINDINGS, private readonly tuning: PadTuning = PAD_TUNING) {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
      const n = doc.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n;
    };
    this.root = el('div', 'ctl-scroll');
    this.root.setAttribute('role', 'list');
    this.root.append(el('h3', 'gp-sub', 'Keyboard and mouse'));
    let group = '';
    for (const a of ACTIONS) {
      if (a.fixed) continue;
      if (a.group !== group) { group = a.group; this.root.append(el('h3', 'gp-sub ctl-group', group)); }
      const row = el('div', 'ctl-row'); row.setAttribute('role', 'listitem');
      row.append(el('span', 'ctl-lab', a.label));
      if (a.reserved) row.append(el('span', 'ctl-note', 'not used yet'));
      const slots = el('span', 'ctl-slots');
      for (let s = 0; s < MAX_SLOTS; s++) {
        const b = el('button', 'ctl-key'); b.type = 'button'; b.dataset.action = a.id; b.dataset.slot = String(s); b.tabIndex = -1;
        b.addEventListener('click', () => this.begin(a.id, s));
        this.slotBtns.set(`${a.id}:${s}`, b);
        slots.append(b);
      }
      row.append(slots);
      this.rowEls.set(a.id, row);
      this.root.append(row);
    }
    const reset = el('button', 'ctl-reset', 'Reset to defaults'); reset.type = 'button'; reset.tabIndex = -1;
    reset.addEventListener('click', () => { this.cancel(); this.bindings.resetAll(); this.say('Keyboard controls are back to the defaults.'); this.refresh(); });
    this.root.append(reset);

    this.root.append(el('h3', 'gp-sub', 'Controller'));
    this.padNameEl = el('p', 'ctl-pad', '');
    this.padRows = el('div', 'ctl-padrows');
    this.root.append(this.padNameEl, this.padRows);
    for (const sl of SLIDERS) {
      const row = el('label', 'ctl-slider');
      const val = el('span', 'ctl-val');
      const input = el('input', 'ctl-range'); input.type = 'range'; input.min = String(sl.min); input.max = String(sl.max); input.step = String(sl.step); input.tabIndex = -1;
      input.value = String(Math.round(this.tuning[sl.key] * (sl.key === 'lookSpeed' || sl.key === 'lookCurve' ? 100 : 100)));
      val.textContent = sl.fmt(Number(input.value));
      input.addEventListener('input', () => { const v = Number(input.value); this.tuning[sl.key] = v / 100; val.textContent = sl.fmt(v); savePadTuning(this.tuning); });
      row.append(el('span', 'ctl-lab', sl.label), input, val);
      this.root.append(row);
    }
    const vib = el('label', 'ctl-slider');
    const cb = el('input', 'ctl-check'); cb.type = 'checkbox'; cb.checked = this.tuning.vibration; cb.tabIndex = -1;
    cb.addEventListener('change', () => { this.tuning.vibration = cb.checked; savePadTuning(this.tuning); });
    vib.append(el('span', 'ctl-lab', 'Vibration'), cb);
    this.root.append(vib);
    const padReset = el('button', 'ctl-reset', 'Reset controller feel'); padReset.type = 'button'; padReset.tabIndex = -1;
    padReset.addEventListener('click', () => { Object.assign(this.tuning, DEFAULT_TUNING); savePadTuning(this.tuning); this.syncSliders(); });
    this.root.append(padReset);

    // the side panel: how to use it, and the last result
    this.side = el('aside', 'ctl-side');
    this.side.append(
      el('h3', 'ctl-side-h', 'Change a key'),
      el('p', 'ctl-help', 'Select a key, press Enter or click it, then press the new key, a mouse button or the wheel. Backspace clears the slot. Esc cancels.'),
      el('p', 'ctl-help', 'A key used by another action in the same place (on foot or in a vehicle) is taken from it, and the list says so.'),
      el('p', 'ctl-help', 'Ctrl works as a game key only in full screen (Alt+Enter) where the browser lets the game hold it; otherwise Ctrl+W would close the tab.'),
    );
    this.statusEl = el('p', 'ctl-status', ''); this.statusEl.setAttribute('role', 'status');
    this.side.append(this.statusEl);
    this.off = this.bindings.onChange(() => this.refresh());
    this.refresh();
  }

  private slider(key: Slider['key']): number { return Math.round(this.tuning[key] * 100); }
  private syncSliders(): void {
    const inputs = this.root.querySelectorAll<HTMLInputElement>('.ctl-range');
    SLIDERS.forEach((sl, i) => { const inp = inputs[i]; if (!inp) return; inp.value = String(this.slider(sl.key)); const v = inp.parentElement?.querySelector('.ctl-val'); if (v) v.textContent = sl.fmt(Number(inp.value)); });
    const cb = this.root.querySelector<HTMLInputElement>('.ctl-check'); if (cb) cb.checked = this.tuning.vibration;
  }

  /** Redraw every key and the pad reference (the pad kind may have changed). */
  refresh(): void {
    const taken = new Map<string, ActionId[]>();
    for (const a of ACTIONS) for (const k of this.bindings.get(a.id)) { const l = taken.get(k); if (l) l.push(a.id); else taken.set(k, [a.id]); }
    for (const a of ACTIONS) {
      const keys = this.bindings.get(a.id);
      for (let s = 0; s < MAX_SLOTS; s++) {
        const b = this.slotBtns.get(`${a.id}:${s}`); if (!b) continue;
        const k = keys[s];
        const waiting = this.capturing?.id === a.id && this.capturing.slot === s;
        const lock = k !== undefined && LOCK_ONLY_KEYS.has(k) && !this.bindings.ctrlSafe;
        b.textContent = waiting ? 'Press a key...' : k ? `${keyLabel(k)}${lock ? ' (full screen)' : ''}` : '—';
        b.classList.toggle('empty', !k && !waiting);
        b.classList.toggle('wait', waiting);
        b.setAttribute('aria-label', `${a.label}, ${s === 0 ? 'first' : 'second'} key: ${k ? keyLabel(k) : 'none'}. Press to change.`);
      }
      this.rowEls.get(a.id)?.classList.toggle('unbound', !a.reserved && keys.length === 0 && a.kb.length > 0);
    }
    this.padNameEl.textContent = `Layout shown for: ${this.bindings.padKind === 'playstation' ? 'a PlayStation pad' : this.bindings.padKind === 'xbox' ? 'an Xbox pad' : 'a generic pad'} (it follows the pad you connect).`;
    this.padRows.textContent = '';
    for (const [k, v] of gamepadRows(this.bindings.padKind)) {
      const r = this.doc.createElement('div'); r.className = 'ctl-padrow';
      const kk = this.doc.createElement('span'); kk.className = 'ctl-padkey'; kk.textContent = k;
      const vv = this.doc.createElement('span'); vv.className = 'ctl-padval'; vv.textContent = v;
      r.append(kk, vv); this.padRows.append(r);
    }
  }

  say(msg: string): void { this.statusEl.textContent = msg; }

  /** Start waiting for the key of one slot. */
  begin(id: ActionId, slot: number): void {
    this.cancel();
    this.capturing = { id, slot };
    const win = this.doc.defaultView!;
    const take = (e: Event): void => { e.preventDefault(); e.stopImmediatePropagation(); };
    const onKey = (e: KeyboardEvent): void => {
      take(e);
      if (e.repeat) return; // the Enter that opened the capture may still be auto-repeating
      if (e.code === 'Escape') { this.say('Cancelled.'); this.cancel(); return; }
      if (e.code === 'Backspace' || e.code === 'Delete') { this.bindings.clearSlot(id, slot); this.say(`${ACTION_BY_ID.get(id)!.label}: slot cleared.`); this.cancel(); return; }
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') { /* a lone Ctrl keydown: handled by rebind (lock-only) */ }
      this.finish(id, slot, e.code);
    };
    const onMouse = (e: MouseEvent): void => {
      take(e);
      const code = e.button === 1 ? 'MouseMiddle' : e.button === 2 ? 'MouseRight' : e.button === 3 ? 'Mouse4' : e.button === 4 ? 'Mouse5' : 'MouseLeft';
      this.finish(id, slot, code);
    };
    const onWheel = (e: WheelEvent): void => { take(e); if (e.deltaY !== 0) this.finish(id, slot, e.deltaY < 0 ? WHEEL_UP : WHEEL_DOWN); };
    const onCtx = (e: Event): void => take(e);
    // the click that began the capture must not end it: listen from the next task
    const arm = win.setTimeout(() => {
      win.addEventListener('mousedown', onMouse, true);
      win.addEventListener('wheel', onWheel, { capture: true, passive: false });
      win.addEventListener('contextmenu', onCtx, true);
    }, 0);
    win.addEventListener('keydown', onKey, true);
    this.stopCapture = () => {
      win.clearTimeout(arm);
      win.removeEventListener('keydown', onKey, true);
      win.removeEventListener('mousedown', onMouse, true);
      win.removeEventListener('wheel', onWheel, true);
      win.removeEventListener('contextmenu', onCtx, true);
    };
    this.say('Press the new key. Backspace clears, Esc cancels.');
    this.refresh();
  }

  private finish(id: ActionId, slot: number, code: string): void {
    const r = this.bindings.rebind(id, slot, code);
    const def = ACTION_BY_ID.get(id)!;
    if (!r.ok) this.say(r.reason ?? 'That key cannot be used.');
    else if (r.stolenFrom.length) this.say(`${keyLabel(code)} now does "${def.label}". It was taken from ${r.stolenFrom.map((s) => `"${ACTION_BY_ID.get(s)!.label}"`).join(' and ')}, which now has no key in that slot.`);
    else this.say(`${keyLabel(code)} now does "${def.label}".`);
    this.cancel();
  }

  /** Stop waiting (no change). */
  cancel(): void {
    this.stopCapture?.(); this.stopCapture = null;
    const had = this.capturing; this.capturing = null;
    if (had) this.refresh();
  }

  /** The focusable controls in reading order. */
  private controls(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('.ctl-key, .ctl-reset, .ctl-range, .ctl-check'));
  }
  private focusIndex(): number { return this.controls().indexOf(this.doc.activeElement as HTMLElement); }

  /** Arrow / WASD style movement; returns true when it handled the key. */
  move(dir: 'up' | 'down' | 'left' | 'right'): void {
    const list = this.controls();
    if (!list.length) return;
    let i = this.focusIndex();
    const cur = list[i] ?? null;
    if (cur?.classList.contains('ctl-range') && (dir === 'left' || dir === 'right')) {
      const r = cur as HTMLInputElement; if (dir === 'left') r.stepDown(); else r.stepUp(); r.dispatchEvent(new Event('input')); return;
    }
    if (cur?.classList.contains('ctl-key') && (dir === 'left' || dir === 'right')) {
      const s = Number(cur.dataset.slot), id = cur.dataset.action!;
      const n = Math.max(0, Math.min(MAX_SLOTS - 1, s + (dir === 'left' ? -1 : 1)));
      this.slotBtns.get(`${id}:${n}`)?.focus(); return;
    }
    if (i < 0) i = dir === 'up' ? list.length : -1;
    // vertical: jump to the same slot of the next row
    const step = dir === 'up' ? -1 : 1;
    let j = i;
    do { j = Math.max(0, Math.min(list.length - 1, j + step)); } while (j > 0 && j < list.length - 1 && cur?.classList.contains('ctl-key') && list[j].classList.contains('ctl-key') && list[j].dataset.slot !== cur.dataset.slot);
    list[j]?.focus();
    list[j]?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Press the focused control (keyboard Enter / Space, pad A). */
  confirm(): void {
    const c = this.controls()[this.focusIndex()];
    if (!c) { this.controls()[0]?.focus(); return; }
    if (c instanceof HTMLInputElement && c.type === 'checkbox') { c.checked = !c.checked; c.dispatchEvent(new Event('change')); return; }
    if (c instanceof HTMLButtonElement) c.click();
  }

  focusFirst(): void { this.controls()[0]?.focus(); }

  dispose(): void { this.cancel(); this.off(); }
}
