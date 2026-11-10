/**
 * "Radio library" panel, opened from the pause menu. Lets the player load their own music (folder picker where
 * the browser has one, otherwise a multi-file input), see how many slots each station has filled (7/15),
 * move tracks between stations by dropdown or drag, clear single slots and reset everything.
 * Nothing is uploaded; only names and station choices are remembered on this device.
 */
import './radio.css';
import { LIBRARY_STATIONS, type LibraryStationId } from '@/audio/library/genres';
import type { Library, Track } from '@/audio/library/Library';
import type { LibraryController } from '@/audio/library/LibraryController';
import type { ScStation } from '@/audio/sc/ScStation';
import { scStationDef } from '@/audio/radio';
import { SC_NO_STREAM, SC_TAP_PROMPT } from '@/audio/sc/ScStation';

export interface RadioUiSource {
  library: Library;
  libraryController: LibraryController;
  /** Radio SC station; the section is left out when absent (and no `scStations`). */
  sc?: ScStation;
  /** All SoundCloud stations in dial order: one pool-counts and pasted-links section each. */
  scStations?: readonly ScStation[];
}

interface ScSection { sc: ScStation; list: HTMLElement; msg: HTMLElement; ra: HTMLElement; pool: HTMLElement; count: HTMLElement; input: HTMLInputElement }

export interface RadioUiOptions {
  /** Called when the panel opens or closes (the pause menu uses it to keep focus sane). */
  onToggle?: (open: boolean) => void;
}

const NONE = '';

export class RadioUi {
  readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly lib: Library;
  private readonly ctl: LibraryController;
  private readonly body: HTMLElement;
  private readonly scs: readonly ScStation[];
  private readonly sections = new Map<ScStation, ScSection>();
  private readonly status: HTMLElement;
  /** Floating bar: "Tap to start radio" when the browser blocked sound, or the no-stream notice with Retry. */
  readonly tapBar: HTMLElement;
  private readonly tapBtn: HTMLButtonElement;
  private readonly tapMsg: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly pickBtn: HTMLButtonElement;
  private readonly reconnectBtn: HTMLButtonElement;
  private readonly fillBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly openStations = new Set<string>();
  private readonly cleanup: Array<() => void> = [];
  private opened = false;
  private restoreFocus: HTMLElement | null = null;
  private confirmReset = false;

  constructor(parent: HTMLElement, src: RadioUiSource, private readonly opts: RadioUiOptions = {}) {
    this.doc = parent.ownerDocument;
    this.lib = src.library;
    this.ctl = src.libraryController;
    this.scs = src.scStations && src.scStations.length > 0 ? src.scStations : src.sc ? [src.sc] : [];

    this.root = this.el('div', 'rl-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'rl-title');
    this.root.setAttribute('data-ui-modal', '');
    const panel = this.el('div', 'rl-panel');

    const head = this.el('div', 'rl-head');
    const title = this.el('h2', 'rl-title');
    title.id = 'rl-title';
    title.textContent = 'Radio library';
    this.closeBtn = this.button('Close', 'rl-btn rl-close');
    this.closeBtn.setAttribute('aria-label', 'Close radio library');
    head.append(title, this.closeBtn);

    const note = this.el('p', 'rl-note');
    note.textContent = 'The radio dial plays SoundCloud mixes (below). Music from your own device plays on the optional My Library station at the end of the dial, once you add files. Files are never uploaded or bundled; only their names and your slot choices are remembered here.';

    const actions = this.el('div', 'rl-actions');
    this.pickBtn = this.button('Pick folder', 'rl-btn rl-primary');
    const filesBtn = this.button('Add files', 'rl-btn');
    this.reconnectBtn = this.button('Reconnect folder', 'rl-btn');
    this.fillBtn = this.button('Fill from folder', 'rl-btn');
    this.resetBtn = this.button('Reset library', 'rl-btn rl-danger');
    actions.append(this.pickBtn, filesBtn, this.reconnectBtn, this.fillBtn, this.resetBtn);

    this.fileInput = this.el('input', 'rl-file');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.accept = 'audio/*';
    this.fileInput.hidden = true;

    this.status = this.el('p', 'rl-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');

    this.body = this.el('div', 'rl-body');
    panel.append(head, note, actions, this.fileInput, this.status);
    if (this.scs.length > 0) panel.appendChild(this.buildScGroup());
    panel.appendChild(this.body);
    this.root.appendChild(panel);
    parent.appendChild(this.root);

    // ---- wiring
    this.closeBtn.addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    this.pickBtn.addEventListener('click', () => { void this.ctl.chooseFolder(); });
    filesBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => {
      const files = this.fileInput.files;
      if (files && files.length > 0) void this.ctl.addFiles(Array.from(files));
      this.fileInput.value = '';
    });
    this.reconnectBtn.addEventListener('click', () => { void this.ctl.reconnect(); });
    this.fillBtn.addEventListener('click', () => { void this.ctl.fillFromFolder(); });
    this.resetBtn.addEventListener('click', () => this.onReset());
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    });
    // Dropping audio files anywhere on the panel imports them.
    this.root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    this.root.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) { e.preventDefault(); void this.ctl.addFiles(Array.from(files)); }
    });
    this.cleanup.push(this.lib.onChange(() => this.render()), this.ctl.onChange(() => this.render()));
    for (const sc of this.scs) this.cleanup.push(sc.onChange(() => { this.renderSc(sc); this.renderTap(); }));

    this.tapBar = this.el('div', 'rl-tapbar');
    this.tapBar.hidden = true;
    this.tapBar.setAttribute('role', 'status');
    this.tapBar.setAttribute('aria-live', 'polite');
    this.tapMsg = this.el('span', 'rl-tapmsg');
    this.tapBtn = this.button(SC_TAP_PROMPT, 'rl-btn rl-primary rl-tap');
    this.tapBar.append(this.tapMsg, this.tapBtn);
    parent.appendChild(this.tapBar);
    // Calls play() inside the click/tap itself: the one thing browsers (iOS above all) accept as permission for sound.
    this.tapBtn.addEventListener('click', () => { for (const sc of this.scs) if (sc.isActive) sc.userStart(); });
    this.render();
    this.renderTap();
  }

  /** Shows the tap button while an active SoundCloud station is blocked, or the no-stream notice (with Retry). */
  private renderTap(): void {
    const sc = this.scs.find((x) => x.isActive && x.notice !== '' && (x.needsTap || x.notice === SC_NO_STREAM));
    if (!sc) { this.tapBar.hidden = true; return; }
    const blocked = sc.needsTap;
    this.tapMsg.textContent = blocked ? 'Your browser blocked the radio sound.' : SC_NO_STREAM;
    this.tapBtn.textContent = blocked ? SC_TAP_PROMPT : 'Retry';
    this.tapBar.hidden = false;
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.restoreFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    this.root.hidden = false;
    this.render();
    this.closeBtn.focus();
    this.opts.onToggle?.(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.confirmReset = false;
    this.root.hidden = true;
    this.restoreFocus?.focus?.();
    this.opts.onToggle?.(false);
  }

  toggle(): void { if (this.opened) this.close(); else this.open(); }

  dispose(): void {
    this.cleanup.splice(0).forEach((fn) => fn());
    this.tapBar.remove();
    this.root.remove();
  }

  /* ---------- SoundCloud stations ---------- */

  private buildScGroup(): HTMLElement {
    const group = this.el('section', 'rl-sc-group');
    if (this.scs.length > 1) {
      const h = this.el('h3', 'rl-sc-group-title');
      h.textContent = 'SoundCloud stations';
      const note = this.el('p', 'rl-note');
      note.textContent = 'Every station plays 45-minute-plus DJ sets from the shared RA NYC pool whose title or DJ name matches its keywords. If none match it plays the links you paste for that station, then any set it has not played yet. Sets stream through SoundCloud’s own embedded player (nothing is downloaded) and follow SoundCloud’s terms and each artist’s settings.';
      group.append(h, note);
    }
    for (const sc of this.scs) group.appendChild(this.buildSc(sc, this.scs.length === 1));
    return group;
  }

  private buildSc(sc: ScStation, solo: boolean): HTMLElement {
    const det = this.el('details', 'rl-station rl-sc');
    const cfg = sc.config;
    const def = scStationDef(cfg.id);
    det.dataset.station = cfg.id;
    det.open = solo;
    const sum = this.el('summary', 'rl-station-head');
    const nm = this.el('span', 'rl-station-name');
    nm.textContent = solo && cfg.id === 'sc' ? 'Radio SC (SoundCloud mixes)' : cfg.name;
    const count = this.el('span', 'rl-count rl-sc-count');
    sum.append(nm, count);
    const kwLine = this.el('p', 'rl-note rl-sc-keywords');
    kwLine.textContent = def ? (def.keywords.length > 0 ? `${def.genre}. Matches set titles and DJ names containing: ${def.keywords.join(', ')}.` : `${def.genre}. Plays any set.`) : '';
    const note = this.el('p', 'rl-note');
    note.textContent = solo
      ? 'Paste a SoundCloud track or playlist link. Mixes stream through SoundCloud’s own embedded player (nothing is downloaded) and follow SoundCloud’s terms and the artist’s settings. Needs the hosted build or an internet connection. Flag a mix as after-hours to start the session with it between 23:00 and 06:00.'
      : 'Your links for this station: played when no matching set is left in the pool. Flag one as after-hours to start the session with it between 23:00 and 06:00.';
    const row = this.el('div', 'rl-actions');
    const input = this.el('input', 'rl-select rl-sc-input');
    input.type = 'url';
    input.placeholder = 'https://soundcloud.com/artist/mix';
    input.setAttribute('aria-label', `SoundCloud link for ${cfg.name}`);
    const add = this.button('Add mix', 'rl-btn rl-primary rl-sc-add');
    const testBtn = this.button('Test link', 'rl-btn rl-sc-test');
    const nextBtn = this.button('Next mix', 'rl-btn rl-sc-next');
    row.append(input, add, testBtn, nextBtn);
    const raRow = this.el('label', 'rl-sc-ra');
    const raBox = this.el('input', 'rl-sc-ra-toggle');
    raBox.type = 'checkbox';
    raBox.checked = sc.randomSets;
    raBox.addEventListener('change', () => { sc.setRandomSets(raBox.checked); this.renderSc(sc); });
    const raTxt = this.el('span', 'rl-sc-ra-label');
    raTxt.textContent = ' Random RA sets';
    raRow.append(raBox, raTxt);
    const ra = this.el('p', 'rl-status rl-sc-ra-status');
    ra.setAttribute('role', 'status');
    const pool = this.el('p', 'rl-status rl-sc-pool');
    const msg = this.el('p', 'rl-status rl-sc-msg');
    msg.setAttribute('role', 'status');
    const list = this.el('ol', 'rl-slots rl-sc-list');
    det.append(sum, kwLine, note, raRow, ra, pool, row, msg, list);
    const sec: ScSection = { sc, list, msg, ra, pool, count, input };
    this.sections.set(sc, sec);

    const say = (t: string) => { msg.textContent = t; };
    const doAdd = () => {
      const r = sc.addMix(input.value);
      if (r.ok) { input.value = ''; say('Added.'); } else say(r.error);
    };
    add.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); doAdd(); } });
    testBtn.addEventListener('click', () => this.runTest(sec, input.value));
    nextBtn.addEventListener('click', () => sc.next());
    this.renderSc(sc);
    return det;
  }

  private runTest(sec: ScSection, url: string): void {
    sec.msg.textContent = 'Testing…';
    void sec.sc.test(url).then((r) => { sec.msg.textContent = r.ok ? `Works: ${r.title}` : r.error; });
  }

  private renderSc(sc: ScStation): void {
    const sec = this.sections.get(sc);
    if (!sec) return;
    const { list } = sec;
    const c = sc.raCounts;
    sec.ra.textContent = !sc.randomSets ? 'Random RA sets are off. This station plays only your links.'
      : sc.raStatus === 'unavailable' ? 'RA NYC sets unavailable (offline or blocked)'
      : sc.raStatus === 'idle' && c.loaded === 0 ? 'Random RA NYC sets load when you first tune in to a SoundCloud station.'
      : `Random RA NYC sets: ${c.loaded} loaded, ${c.heard} heard`;
    const pc = sc.poolCounts;
    sec.pool.textContent = sc.randomSets && pc.pool > 0
      ? `Pool for ${sc.config.name}: ${pc.matching} of ${pc.pool} sets match, ${pc.unheard} not heard yet.`
      : '';
    sec.count.textContent = `${sc.randomSets ? pc.matching : 0} sets · ${sc.mixes.length} links`;
    sec.count.setAttribute('aria-label', `${sc.randomSets ? pc.matching : 0} matching pool sets and ${sc.mixes.length} pasted links`);
    const frag = this.doc.createDocumentFragment();
    if (sc.mixes.length === 0) {
      const li = this.el('li', 'rl-slot rl-empty');
      li.textContent = 'No links yet. This station plays matching pool sets, then any set, then its synth bed.';
      frag.appendChild(li);
    }
    sc.mixes.forEach((m, i) => {
      const li = this.el('li', 'rl-slot');
      const num = this.el('span', 'rl-num');
      num.textContent = String(i + 1);
      const label = this.el('span', 'rl-name');
      label.textContent = m.url.replace('https://soundcloud.com/', '');
      label.title = m.url;
      const ah = this.el('input', 'rl-sc-ah');
      ah.type = 'checkbox';
      ah.checked = !!m.afterhours;
      ah.title = 'After-hours mix (preferred first between 23:00 and 06:00)';
      ah.setAttribute('aria-label', `After-hours: ${label.textContent}`);
      ah.addEventListener('change', () => sc.setAfterhours(i, ah.checked));
      const up = this.button('↑', 'rl-btn rl-x rl-sc-up');
      up.setAttribute('aria-label', `Move mix ${i + 1} up`);
      up.addEventListener('click', () => sc.moveMix(i, -1));
      const down = this.button('↓', 'rl-btn rl-x rl-sc-down');
      down.setAttribute('aria-label', `Move mix ${i + 1} down`);
      down.addEventListener('click', () => sc.moveMix(i, 1));
      const t = this.button('Test', 'rl-btn rl-x rl-sc-test-row');
      t.addEventListener('click', () => this.runTest(sec, m.url));
      const rm = this.button('×', 'rl-btn rl-x rl-sc-remove');
      rm.setAttribute('aria-label', `Remove mix ${i + 1}`);
      rm.addEventListener('click', () => sc.removeMix(i));
      if (i === sc.currentIndex) li.classList.add('rl-sc-current');
      li.append(num, label, ah, up, down, t, rm);
      frag.appendChild(li);
    });
    list.replaceChildren(frag);
  }

  /* ---------- rendering ---------- */

  private onReset(): void {
    if (!this.confirmReset) {
      this.confirmReset = true;
      this.render();
      return;
    }
    this.confirmReset = false;
    void this.ctl.reset();
  }

  private render(): void {
    const ctl = this.ctl;
    this.pickBtn.hidden = !ctl.folderSupported;
    this.reconnectBtn.hidden = ctl.status !== 'needs-permission';
    this.fillBtn.hidden = !ctl.folderSupported || !ctl.hasFolder;
    this.fillBtn.disabled = ctl.status === 'busy';
    this.resetBtn.textContent = this.confirmReset ? 'Tap again to forget everything' : 'Reset library';
    const parts: string[] = [];
    if (this.lib.folderName) parts.push(`Folder: ${this.lib.folderName}.`);
    if (ctl.message) parts.push(ctl.message);
    else if (!ctl.folderSupported) parts.push('This browser cannot remember a folder: add your files each time you play.');
    else if (this.lib.size === 0) parts.push('Pick the folder where your music lives, or add files.');
    if (this.lib.needsReconnect && ctl.status !== 'needs-permission') {
      parts.push('Some saved songs need their files again (Add files or Pick folder). Those slots play synth until then.');
    }
    this.status.textContent = parts.join(' ');

    const frag = this.doc.createDocumentFragment();
    for (const def of LIBRARY_STATIONS) frag.appendChild(this.stationSection(def.id));
    frag.appendChild(this.poolSection());
    this.body.replaceChildren(frag);
  }

  private stationSection(id: LibraryStationId): HTMLElement {
    const def = LIBRARY_STATIONS.find((s) => s.id === id)!;
    const det = this.el('details', 'rl-station');
    det.dataset.station = id;
    det.open = this.openStations.has(id);
    det.addEventListener('toggle', () => { if (det.open) this.openStations.add(id); else this.openStations.delete(id); });
    const sum = this.el('summary', 'rl-station-head');
    const nm = this.el('span', 'rl-station-name');
    nm.textContent = def.name;
    const cnt = this.el('span', 'rl-count');
    cnt.textContent = this.lib.countLabel(id);
    cnt.setAttribute('aria-label', `${this.lib.count(id)} of ${def.slots} slots filled`);
    sum.append(nm, cnt);
    det.appendChild(sum);

    const list = this.el('ol', 'rl-slots');
    for (let i = 0; i < def.slots; i++) list.appendChild(this.slotRow(id, i));
    det.appendChild(list);

    // Drop a dragged track on the station to put it in the first free slot.
    det.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('text/x-rl-track')) { e.preventDefault(); det.classList.add('rl-drop'); } });
    det.addEventListener('dragleave', () => det.classList.remove('rl-drop'));
    det.addEventListener('drop', (e) => {
      det.classList.remove('rl-drop');
      const tid = e.dataTransfer?.getData('text/x-rl-track');
      if (!tid) return;
      e.preventDefault();
      e.stopPropagation();
      this.lib.assign(tid, id);
    });
    return det;
  }

  private slotRow(id: LibraryStationId, index: number): HTMLElement {
    const li = this.el('li', 'rl-slot');
    const track = this.lib.slotTrack(id, index);
    const num = this.el('span', 'rl-num');
    num.textContent = String(index + 1);
    const label = this.el('span', 'rl-name');
    li.append(num, label);
    if (!track) {
      li.classList.add('rl-empty');
      label.textContent = 'Empty — plays synth';
      // Dropping on a specific empty slot targets that slot.
      li.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('text/x-rl-track')) e.preventDefault(); });
      li.addEventListener('drop', (e) => {
        const tid = e.dataTransfer?.getData('text/x-rl-track');
        if (!tid) return;
        e.preventDefault();
        e.stopPropagation();
        this.lib.assign(tid, id, index);
      });
      return li;
    }
    label.textContent = track.url ? track.name : `${track.name} (add file again)`;
    label.title = track.path;
    if (!track.url) li.classList.add('rl-missing');
    li.append(this.stationSelect(track, id), this.clearButton(id, index, track));
    this.makeDraggable(li, track);
    return li;
  }

  private poolSection(): HTMLElement {
    const det = this.el('details', 'rl-station rl-pool');
    const pool = this.lib.unassigned();
    det.open = this.openStations.has('pool') || (pool.length > 0 && !this.openStations.has('pool-closed'));
    det.addEventListener('toggle', () => {
      if (det.open) { this.openStations.add('pool'); this.openStations.delete('pool-closed'); }
      else { this.openStations.delete('pool'); this.openStations.add('pool-closed'); }
    });
    const sum = this.el('summary', 'rl-station-head');
    const nm = this.el('span', 'rl-station-name');
    nm.textContent = 'Not on a station yet';
    const cnt = this.el('span', 'rl-count');
    cnt.textContent = String(pool.length);
    sum.append(nm, cnt);
    det.appendChild(sum);
    const list = this.el('ol', 'rl-slots');
    if (pool.length === 0) {
      const li = this.el('li', 'rl-slot rl-empty');
      li.textContent = 'Every imported song is on a station.';
      list.appendChild(li);
    }
    for (const t of pool) {
      const li = this.el('li', 'rl-slot');
      const label = this.el('span', 'rl-name');
      label.textContent = t.url ? t.name : `${t.name} (add file again)`;
      label.title = t.path;
      li.append(label, this.stationSelect(t, null));
      this.makeDraggable(li, t);
      list.appendChild(li);
    }
    det.appendChild(list);
    return det;
  }

  private stationSelect(track: Track, current: LibraryStationId | null): HTMLSelectElement {
    const sel = this.el('select', 'rl-select');
    sel.setAttribute('aria-label', `Station for ${track.name}`);
    const first = this.doc.createElement('option');
    first.value = NONE;
    first.textContent = current ? 'Move to…' : 'Put on…';
    sel.appendChild(first);
    for (const d of LIBRARY_STATIONS) {
      if (d.id === current) continue;
      const o = this.doc.createElement('option');
      o.value = d.id;
      const full = this.lib.count(d.id) >= d.slots;
      o.textContent = `${d.name} (${this.lib.countLabel(d.id)})${full ? ' full' : ''}`;
      o.disabled = full;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      const v = sel.value as LibraryStationId | typeof NONE;
      if (v !== NONE) this.lib.assign(track.id, v);
    });
    return sel;
  }

  private clearButton(id: LibraryStationId, index: number, track: Track): HTMLButtonElement {
    const b = this.button('×', 'rl-btn rl-x');
    b.setAttribute('aria-label', `Clear slot ${index + 1}: ${track.name}`);
    b.addEventListener('click', () => this.lib.clearSlot(id, index));
    return b;
  }

  private makeDraggable(li: HTMLElement, track: Track): void {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/x-rl-track', track.id);
      e.dataTransfer?.setData('text/plain', track.name);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const n = this.doc.createElement(tag);
    if (className) n.className = className;
    return n;
  }

  private button(text: string, className: string): HTMLButtonElement {
    const b = this.el('button', className);
    b.type = 'button';
    b.textContent = text;
    return b;
  }
}
