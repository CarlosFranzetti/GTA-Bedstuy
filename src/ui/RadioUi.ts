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

export interface RadioUiSource {
  library: Library;
  libraryController: LibraryController;
}

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
  private readonly status: HTMLElement;
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
    note.textContent = 'Plays music from your own device. Files are never uploaded or bundled; only their names and your station choices are remembered here. Empty slots play the station’s built-in synth.';

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
    panel.append(head, note, actions, this.fileInput, this.status, this.body);
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
    this.render();
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
    this.root.remove();
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
