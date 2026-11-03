/**
 * DJ panel: two decks (record picker, play, cue, nudge, pitch +-8 %), crossfader, beat lights, sync meter,
 * crowd meter (club) and a live score. Big touch targets; keyboard and gamepad operable.
 * Drives DjGame.tick from its own requestAnimationFrame while open.
 *
 * Layout: title + score on top, the decks scroll in the middle, and a sticky footer (status, Finish set, Close) is
 * always visible, so it fits 640x360 and phones.
 * Keys: W/S or Up/Down select a control, A/D or Left/Right adjust a slider (else the crossfader), Enter / Space / F
 * press the selected control, Z/N play, C/M cue, Q/E and U/O nudge, Esc / X / B / Backspace leave the booth.
 * Gamepad: `navigate(dir)` (d-pad, A confirm, B back).
 */
import { DjGame, MAX_PITCH, type DeckId } from '@/game/DjGame';
import { LOOP_BARS, type RecordSource } from '@/game/records';
import type { Inventory } from '@/game/Inventory';
import { isCloseKey, isConfirmKey, navDirOf, setPanelClass, type NavDir } from './panelKeys';
import './dj.css';

export interface DjUiDeps {
  game: DjGame;
  inventory: Inventory;
  source: RecordSource | null;
  onToggle?: (open: boolean) => void;
  /** Clock and frame scheduler, overridable in tests. */
  raf?: (fn: (t: number) => void) => number;
  caf?: (id: number) => void;
  now?: () => number;
}

export class DjUi {
  readonly root: HTMLElement;
  private readonly doc: Document;
  private opened = false;
  private venue = 'home';
  /** Requested set length (mission djRequest.minutes), 0 = free play. */
  private targetSeconds = 0;
  private rafId = 0;
  private last = 0;
  private readonly fader: HTMLInputElement;
  private readonly crowdBar: HTMLElement;
  private readonly crowdWrap: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly syncEl: HTMLElement;
  private readonly status: HTMLElement;
  private readonly decks: Array<{
    title: HTMLElement; bpm: HTMLElement; pos: HTMLElement; pitch: HTMLInputElement; pitchLabel: HTMLElement;
    play: HTMLButtonElement; cue: HTMLButtonElement; nudgeDown: HTMLButtonElement; nudgeUp: HTMLButtonElement;
    dots: HTMLElement[]; select: HTMLSelectElement;
  }> = [];
  private readonly raf: (fn: (t: number) => void) => number;
  private readonly caf: (id: number) => void;
  private readonly now: () => number;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private readonly keyUpHandler = (e: KeyboardEvent) => { if (this.opened && (isConfirmKey(e) || isCloseKey(e))) e.preventDefault(); };
  /** Keyboard / gamepad order: per deck select, play, cue, nudge -, nudge +, pitch; then the crossfader, Finish set, Close. */
  private controls: HTMLElement[] = [];
  private sel = 0;
  private readonly off: () => void;

  constructor(parent: HTMLElement, private readonly d: DjUiDeps) {
    this.doc = parent.ownerDocument;
    this.raf = d.raf ?? ((fn) => requestAnimationFrame(fn));
    this.caf = d.caf ?? ((id) => cancelAnimationFrame(id));
    this.now = d.now ?? (() => performance.now());
    this.root = this.el('div', 'dj-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'DJ decks');
    this.root.setAttribute('data-ui-modal', ''); // the playtest state export reads this as "a menu is open"
    this.root.tabIndex = -1;
    const panel = this.el('div', 'dj-panel');

    const head = this.el('div', 'dj-head');
    const title = this.el('h2', 'dj-title'); title.textContent = 'DECKS';
    this.scoreEl = this.el('div', 'dj-score'); this.scoreEl.textContent = 'Score 0';
    head.append(title, this.scoreEl);

    const row = this.el('div', 'dj-decks');
    for (const id of [0, 1] as const) row.appendChild(this.buildDeck(id));

    const mid = this.el('div', 'dj-mid');
    this.syncEl = this.el('div', 'dj-sync'); this.syncEl.textContent = 'Load a record on each deck';
    this.fader = this.doc.createElement('input'); this.fader.type = 'range'; this.fader.min = '0'; this.fader.max = '1'; this.fader.step = '0.01'; this.fader.value = '0';
    this.fader.className = 'dj-fader'; this.fader.setAttribute('aria-label', 'Crossfader');
    this.fader.addEventListener('input', () => this.d.game.setCrossfader(parseFloat(this.fader.value)));
    const fl = this.el('div', 'dj-faderlabels'); fl.innerHTML = '<span>A</span><span>CROSSFADER</span><span>B</span>';
    this.crowdWrap = this.el('div', 'dj-crowd');
    const cl = this.el('span', 'dj-crowdlabel'); cl.textContent = 'CROWD';
    const track = this.el('div', 'dj-crowdtrack'); this.crowdBar = this.el('div', 'dj-crowdbar'); track.appendChild(this.crowdBar);
    this.crowdWrap.append(cl, track);
    mid.append(this.syncEl, this.fader, fl, this.crowdWrap);

    this.status = this.el('p', 'dj-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    const help = this.el('p', 'dj-help');
    help.textContent = 'Match the tempo with the pitch sliders, line the beats up with the nudge buttons, then slide the crossfader across on a bar line. Keys: W/S select, A/D adjust, Enter or F press, Z/N play, C/M cue, Esc or X leave.';
    const scroll = this.el('div', 'dj-scroll');
    scroll.append(row, mid, help);
    const foot = this.el('div', 'dj-foot');
    const finish = this.btn('Finish set', 'dj-btn dj-finish', () => this.finish());
    const closeBtn = this.btn('Close', 'dj-btn dj-close', () => this.leave());
    foot.append(this.status, finish, closeBtn);
    panel.append(head, scroll, foot);
    this.controls = [
      ...this.decks.flatMap((d) => [d.select, d.play, d.cue, d.nudgeDown, d.nudgeUp, d.pitch]),
      this.fader, finish, closeBtn,
    ];
    this.root.addEventListener('focusin', (e) => { const i = this.controls.indexOf(e.target as HTMLElement); if (i >= 0) this.sel = i; });
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.off = d.inventory.onChange(() => { if (this.opened) this.refreshSelects(); });
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.leave(); });
  }

  get isOpen(): boolean { return this.opened; }

  /** Opens the decks and starts a scored set at `venue` ('home', 'aftersloth', ...). */
  open(venue: string, opts: { minutes?: number } = {}): void {
    if (this.opened) return;
    this.opened = true; this.venue = venue;
    this.d.game.startSet(venue);
    this.root.hidden = false;
    this.crowdWrap.hidden = venue === 'home';
    this.refreshSelects();
    this.doc.addEventListener('keydown', this.keyHandler, true);
    this.doc.addEventListener('keyup', this.keyUpHandler, true);
    setPanelClass(this.doc, 'dj-open', true);
    this.last = this.now();
    this.rafId = this.raf(this.frame);
    this.d.onToggle?.(true);
    this.sel = 0;
    this.select(0);
  }

  /** Ends the set (emits dj:setFinished) and closes the panel. */
  finish(): void {
    if (!this.opened) return;
    const r = this.d.game.finishSet();
    this.say(`Set over: score ${r.score}`);
    this.close();
  }

  /** Esc / backdrop: leaves the booth; the set still counts. */
  leave(): void { this.finish(); }

  private close(): void {
    this.opened = false; this.root.hidden = true;
    this.doc.removeEventListener('keydown', this.keyHandler, true);
    this.doc.removeEventListener('keyup', this.keyUpHandler, true);
    setPanelClass(this.doc, 'dj-open', false);
    if (this.rafId) this.caf(this.rafId);
    this.rafId = 0;
    this.d.onToggle?.(false);
  }

  dispose(): void { if (this.opened) this.close(); this.off(); this.root.remove(); }

  /** Loads an owned record onto a deck (async: decoding). */
  async loadDeck(deck: DeckId, recordId: string): Promise<boolean> {
    const def = this.d.inventory.getRecord(recordId);
    if (!def) return false;
    const buf = this.d.source ? await this.d.source.load(def) : null;
    if (this.d.source && !buf) { this.say('That file is not loaded this session. Re-add it in the Radio library.'); return false; }
    const length = buf ? buf.duration : (60 / def.bpm) * 4 * LOOP_BARS;
    if (def.kind !== 'procedural' && buf) def.bpm = await this.d.source!.measure(def);
    this.d.game.load(deck, def, length, buf);
    this.say(`Deck ${deck === 0 ? 'A' : 'B'}: ${def.title}`);
    return true;
  }

  // ------------------------------------------------------------ frame

  private readonly frame = () => {
    if (!this.opened) return;
    const t = this.now();
    const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.d.game.tick(dt);
    this.paint();
    this.rafId = this.raf(this.frame);
  };

  /** Pull the view state into the DOM. */
  paint(): void {
    const g = this.d.game;
    for (const id of [0, 1] as const) {
      const v = g.deck(id); const ui = this.decks[id];
      ui.title.textContent = v.record ? `${v.record.title} · ${v.record.artist}` : 'Empty deck';
      ui.bpm.textContent = v.record ? `${v.bpm.toFixed(1)} BPM` : '--';
      ui.pos.textContent = v.record ? `${Math.floor(v.pos / 60)}:${String(Math.floor(v.pos % 60)).padStart(2, '0')}` : '';
      ui.pitchLabel.textContent = `${v.pitch >= 0 ? '+' : ''}${(v.pitch * 100).toFixed(1)}%`;
      ui.play.textContent = v.playing ? 'PAUSE' : 'PLAY';
      ui.play.classList.toggle('on', v.playing);
      const beat = Math.floor(v.barBeat);
      ui.dots.forEach((dot, i) => dot.classList.toggle('on', v.playing && i === beat));
      ui.dots.forEach((dot) => dot.classList.toggle('down', v.playing && Math.floor(v.barBeat) === 0 && v.beatPhase < 0.4));
    }
    const a = g.deck(0), b = g.deck(1);
    if (a.playing && b.playing) {
      const off = g.phaseOffset(); const dBpm = b.bpm - a.bpm;
      const q = g.matchQuality();
      this.syncEl.textContent = `${q > 0.8 ? 'LOCKED' : q > 0.4 ? 'close' : 'off'} · tempo ${dBpm >= 0 ? '+' : ''}${dBpm.toFixed(1)} · beat ${off >= 0 ? '+' : ''}${(off * 100).toFixed(0)}%`;
      this.syncEl.dataset.q = q > 0.8 ? 'good' : q > 0.4 ? 'mid' : 'bad';
    } else { this.syncEl.textContent = 'Start both decks to match them'; this.syncEl.dataset.q = ''; }
    this.fader.value = String(g.crossfader);
    this.crowdBar.style.width = `${Math.round(g.crowd * 100)}%`;
    const el = g.elapsed; const clock = `${Math.floor(el / 60)}:${String(Math.floor(el % 60)).padStart(2, '0')}`;
    this.scoreEl.textContent = `Score ${g.result().score} · ${this.targetSeconds ? `${clock} / ${Math.floor(this.targetSeconds / 60)}:${String(Math.round(this.targetSeconds % 60)).padStart(2, '0')}` : clock}`;
    if (this.targetSeconds && el >= this.targetSeconds) this.finish();
  }

  // ------------------------------------------------------------ build

  private buildDeck(id: DeckId): HTMLElement {
    const g = this.d.game;
    const col = this.el('div', `dj-deck dj-deck-${id}`);
    const label = this.el('div', 'dj-decklabel'); label.textContent = id === 0 ? 'DECK A' : 'DECK B';
    const select = this.doc.createElement('select'); select.className = 'dj-select'; select.setAttribute('aria-label', `Record for deck ${id === 0 ? 'A' : 'B'}`);
    select.addEventListener('change', () => { if (select.value) void this.loadDeck(id, select.value); });
    const title = this.el('div', 'dj-rec');
    const bpm = this.el('div', 'dj-bpm'); const pos = this.el('div', 'dj-pos');
    const dots = [0, 1, 2, 3].map(() => this.el('span', 'dj-dot'));
    const dotRow = this.el('div', 'dj-dots'); dotRow.append(...dots);
    const pitch = this.doc.createElement('input'); pitch.type = 'range'; pitch.className = 'dj-pitch';
    pitch.min = String(-MAX_PITCH * 100); pitch.max = String(MAX_PITCH * 100); pitch.step = '0.1'; pitch.value = '0';
    pitch.setAttribute('aria-label', `Pitch deck ${id === 0 ? 'A' : 'B'}`);
    pitch.addEventListener('input', () => g.setPitch(id, parseFloat(pitch.value) / 100));
    const pitchLabel = this.el('div', 'dj-pitchlabel');
    const play = this.btn('PLAY', 'dj-btn dj-play', () => g.play(id));
    const cue = this.btn('CUE', 'dj-btn', () => g.cue(id));
    const nm = this.btn('◀ nudge', 'dj-btn', () => g.nudge(id, -0.05));
    const np = this.btn('nudge ▶', 'dj-btn', () => g.nudge(id, 0.05));
    const reset = this.btn('0%', 'dj-btn dj-small', () => { pitch.value = '0'; g.setPitch(id, 0); });
    const ctl = this.el('div', 'dj-ctl'); ctl.append(play, cue, nm, np);
    const pr = this.el('div', 'dj-pitchrow'); pr.append(pitch, pitchLabel, reset);
    col.append(label, select, title, bpm, pos, dotRow, ctl, pr);
    this.decks[id] = { title, bpm, pos, pitch, pitchLabel, play, cue, nudgeDown: nm, nudgeUp: np, dots, select };
    return col;
  }

  private refreshSelects(): void {
    const recs = this.d.inventory.records;
    for (const id of [0, 1] as const) {
      const sel = this.decks[id].select; const cur = sel.value;
      sel.textContent = '';
      const ph = this.doc.createElement('option'); ph.value = ''; ph.textContent = recs.length ? 'Choose a record...' : 'No records: visit WAX DELI'; sel.appendChild(ph);
      for (const r of recs) { const o = this.doc.createElement('option'); o.value = r.id; o.textContent = `${r.title} (${Math.round(r.bpm)})`; sel.appendChild(o); }
      sel.value = recs.some((r) => r.id === cur) ? cur : '';
    }
  }

  // ------------------------------------------------------------ keyboard / gamepad

  /** d-pad / stick directions and A / B. Up/down move the selection; left/right adjust; confirm presses; back leaves. */
  navigate(dir: NavDir): void {
    if (!this.opened) return;
    const g = this.d.game;
    switch (dir) {
      case 'up': this.select(this.sel - 1); break;
      case 'down': this.select(this.sel + 1); break;
      case 'left':
      case 'right': {
        const sign = dir === 'left' ? -1 : 1;
        const el = this.controls[this.sel];
        const di = this.decks.findIndex((d) => d.pitch === el);
        if (di >= 0) {
          const p = this.decks[di].pitch; const next = Math.max(parseFloat(p.min), Math.min(parseFloat(p.max), parseFloat(p.value) + sign * 0.5));
          p.value = String(next); g.setPitch(di as DeckId, next / 100);
        } else g.setCrossfader(g.crossfader + sign * 0.05);
        break;
      }
      case 'confirm': this.press(); break;
      case 'back': this.leave(); break;
    }
  }

  /** Moves the selection (clamped) and focuses the control so the ring shows and the scroller follows. */
  private select(i: number): void {
    this.sel = Math.max(0, Math.min(this.controls.length - 1, i));
    this.controls.forEach((c, k) => c.classList.toggle('dj-sel', k === this.sel));
    const el = this.controls[this.sel];
    try { el.focus({ preventScroll: true }); } catch { /* detached */ }
    (el as { scrollIntoView?: (o: object) => void }).scrollIntoView?.({ block: 'nearest' });
  }

  /** Enter / Space / F / gamepad A on the selected control. A record picker cycles to the next record. */
  private press(): void {
    const el = this.controls[this.sel];
    if (!el) return;
    if (el instanceof HTMLSelectElement) {
      if (el.options.length < 2) return;
      el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
      if (el.selectedIndex === 0) el.selectedIndex = 1; // skip the "Choose a record" placeholder
      el.dispatchEvent(new Event('change'));
    } else if (el instanceof HTMLButtonElement) el.click();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.opened || e.ctrlKey || e.metaKey || e.altKey) return;
    const g = this.d.game; let used = true;
    if (isCloseKey(e)) { if (!e.repeat) this.leave(); }
    else if (isConfirmKey(e)) { if (!e.repeat) this.navigate('confirm'); }
    else {
      const dir = navDirOf(e);
      if (dir) this.navigate(dir);
      else switch (e.code) {
        case 'KeyZ': g.play(0); break;
        case 'KeyC': g.cue(0); break;
        case 'KeyN': g.play(1); break;
        case 'KeyM': g.cue(1); break;
        case 'KeyQ': g.nudge(0, -0.05); break;
        case 'KeyE': g.nudge(0, 0.05); break;
        case 'KeyU': g.nudge(1, -0.05); break;
        case 'KeyO': g.nudge(1, 0.05); break;
        default: used = e.code !== 'Tab'; // Tab keeps its browser meaning; other game keys are swallowed
      }
    }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  private say(t: string): void { this.status.textContent = t; }
  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] { const e = this.doc.createElement(tag); e.className = cls; return e; }
  private btn(text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = this.el('button', cls); b.type = 'button'; b.textContent = text; b.addEventListener('click', fn); return b;
  }
}

