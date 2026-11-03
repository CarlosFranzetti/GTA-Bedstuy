/**
 * DJ panel: two decks (record picker, play, cue, nudge, pitch +-8 %), crossfader, beat lights, sync meter,
 * crowd meter (club) and a live score. Big touch targets; keyboard shortcuts for desktop.
 * Drives DjGame.tick from its own requestAnimationFrame while open.
 */
import { DjGame, MAX_PITCH, type DeckId } from '@/game/DjGame';
import { LOOP_BARS, type RecordSource } from '@/game/records';
import type { Inventory } from '@/game/Inventory';
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
    play: HTMLButtonElement; dots: HTMLElement[]; select: HTMLSelectElement;
  }> = [];
  private readonly raf: (fn: (t: number) => void) => number;
  private readonly caf: (id: number) => void;
  private readonly now: () => number;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);
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
    const panel = this.el('div', 'dj-panel');

    const head = this.el('div', 'dj-head');
    const title = this.el('h2', 'dj-title'); title.textContent = 'DECKS';
    this.scoreEl = this.el('div', 'dj-score'); this.scoreEl.textContent = 'Score 0';
    const finish = this.btn('Finish set', 'dj-btn dj-finish', () => this.finish());
    head.append(title, this.scoreEl, finish);

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
    help.textContent = 'Match the tempo with the pitch sliders, line the beats up with the nudge buttons, then slide the crossfader across on a bar line. Keys: Z/N play, X/M cue, Left/Right fader, Esc leave.';
    panel.append(head, row, mid, this.status, help);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.off = d.inventory.onChange(() => { if (this.opened) this.refreshSelects(); });
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.leave(); });
  }

  get isOpen(): boolean { return this.opened; }

  /** Opens the decks and starts a scored set at `venue` ('home', 'aftersloth', ...). */
  open(venue: string): void {
    if (this.opened) return;
    this.opened = true; this.venue = venue;
    this.d.game.startSet(venue);
    this.root.hidden = false;
    this.crowdWrap.hidden = venue === 'home';
    this.refreshSelects();
    this.doc.addEventListener('keydown', this.keyHandler, true);
    this.last = this.now();
    this.rafId = this.raf(this.frame);
    this.d.onToggle?.(true);
    this.root.querySelector<HTMLElement>('select')?.focus();
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
    this.scoreEl.textContent = `Score ${g.result().score}`;
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
    const ctl = this.el('div', 'dj-ctl'); ctl.append(play, cue);
    const jog = this.el('div', 'dj-ctl'); jog.append(nm, np);
    const pr = this.el('div', 'dj-pitchrow'); pr.append(pitch, pitchLabel, reset);
    col.append(label, select, title, bpm, pos, dotRow, ctl, jog, pr);
    this.decks[id] = { title, bpm, pos, pitch, pitchLabel, play, dots, select };
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

  private onKey(e: KeyboardEvent): void {
    if (!this.opened) return;
    const g = this.d.game; let used = true;
    switch (e.code) {
      case 'Escape': this.leave(); break;
      case 'KeyZ': g.play(0); break;
      case 'KeyX': g.cue(0); break;
      case 'KeyN': g.play(1); break;
      case 'KeyM': g.cue(1); break;
      case 'ArrowLeft': g.setCrossfader(g.crossfader - 0.05); break;
      case 'ArrowRight': g.setCrossfader(g.crossfader + 0.05); break;
      case 'KeyQ': g.nudge(0, -0.05); break;
      case 'KeyE': g.nudge(0, 0.05); break;
      case 'KeyU': g.nudge(1, -0.05); break;
      case 'KeyO': g.nudge(1, 0.05); break;
      default: used = false;
    }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  private say(t: string): void { this.status.textContent = t; }
  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] { const e = this.doc.createElement(tag); e.className = cls; return e; }
  private btn(text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = this.el('button', cls); b.type = 'button'; b.textContent = text; b.addEventListener('click', fn); return b;
  }
}

