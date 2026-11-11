import './save.css';
import { exportSavesToFile, isNativeApp } from '@/native/NativeBridge';
import { MANUAL_SLOTS, SLOT_LABEL, exportFileName, formatClock, formatDay, formatStamp, type SaveManager, type SlotId, type SlotInfo } from './GameSave';

export interface SavePanelOptions {
  /** false while saving would store a nonsense pose (inside a room, mid-fade). Default: always. */
  canSave?: () => boolean;
  /** After a successful load / new game (the menu closes itself here). */
  onDone?: (kind: 'load' | 'new') => void;
  /** Show the "New game" button (the pause menu does; the phone does not need it). */
  newGame?: boolean;
}

type Pending = { kind: 'save'; slot: SlotId } | { kind: 'new' } | { kind: 'import'; slot: SlotId; text: string };

/**
 * Save / load screen body: Autosave + 3 manual slots (day, time, cash, street, timestamp), confirm before overwrite,
 * Export / Import as a JSON file (with a paste box for when downloads and storage are blocked) and New game.
 * Used by the pause Menu and the phone. Builds on a detached root; `refresh()` re-reads the slots.
 */
export class SavePanel {
  readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly warn: HTMLElement;
  private readonly confirmEl: HTMLElement;
  private readonly list: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly paste: HTMLTextAreaElement;
  private readonly pasteBox: HTMLDetailsElement;
  private readonly importSlot: HTMLSelectElement;
  private readonly file: HTMLInputElement;
  private pending: Pending | null = null;
  private readonly off: () => void;

  constructor(parent: HTMLElement | null, private readonly mgr: SaveManager, private readonly opts: SavePanelOptions = {}) {
    this.doc = (parent ?? document.body).ownerDocument;
    this.root = this.mk('div', 'sv-root');
    this.warn = this.mk('p', 'sv-warn');
    this.warn.textContent = 'Browser storage is blocked here, so saves only last until you close this tab. Use Export to keep a copy.';
    this.confirmEl = this.mk('div', 'sv-confirm');
    this.confirmEl.setAttribute('role', 'alertdialog');
    this.list = this.mk('div', 'sv-list');
    this.msg = this.mk('p', 'sv-msg');
    this.msg.setAttribute('role', 'status');

    const tools = this.mk('div', 'sv-tools');
    this.importSlot = this.mk('select', 'sv-select') as HTMLSelectElement;
    this.importSlot.setAttribute('aria-label', 'Import into slot');
    for (const id of MANUAL_SLOTS) { const o = this.doc.createElement('option'); o.value = id; o.textContent = SLOT_LABEL[id]; this.importSlot.appendChild(o); }
    this.file = this.mk('input', 'sv-file') as HTMLInputElement;
    this.file.type = 'file'; this.file.accept = '.json,application/json'; this.file.hidden = true;
    this.file.addEventListener('change', () => { void this.readFile(); });
    const imp = this.btn('Import file...', 'sv-btn', () => this.file.click());
    tools.append(this.label('Import into'), this.importSlot, imp, this.file);
    if (opts.newGame) tools.appendChild(this.btn('New game', 'sv-btn sv-danger sv-new', () => this.ask({ kind: 'new' })));

    this.pasteBox = this.mk('details', 'sv-paste') as HTMLDetailsElement;
    const sum = this.mk('summary', 'sv-sum'); sum.textContent = 'Paste or copy save text';
    this.paste = this.mk('textarea', 'sv-text') as HTMLTextAreaElement;
    this.paste.rows = 3; this.paste.spellcheck = false; this.paste.setAttribute('aria-label', 'Save text');
    const importPaste = this.btn('Import pasted text', 'sv-btn', () => this.importText(this.paste.value));
    this.pasteBox.append(sum, this.paste, importPaste);

    this.root.append(this.warn, this.confirmEl, this.list, tools, this.pasteBox, this.msg);
    parent?.appendChild(this.root);
    this.off = mgr.onChange(() => this.refresh());
    this.refresh();
  }

  dispose(): void { this.off(); this.root.remove(); }

  /** Re-reads all slots and redraws. */
  refresh(): void {
    this.warn.hidden = this.mgr.storageOk;
    this.list.textContent = '';
    for (const info of this.mgr.slots()) this.list.appendChild(this.row(info));
    this.drawConfirm();
  }

  /** Short on-screen toast ("Saved to Slot 1"), visible after the menu closes. */
  private toast(text: string): void {
    try {
      const old = this.doc.querySelector('.sv-toast'); old?.remove();
      const t = this.doc.createElement('div');
      t.className = 'sv-toast'; t.textContent = text; t.setAttribute('role', 'status');
      this.doc.body.appendChild(t);
      setTimeout(() => t.remove(), 2200);
    } catch { /* no DOM */ }
  }

  say(text: string, bad = false): void {
    if (!bad && /^(Saved|Loaded|New game)/.test(text)) this.toast(text.replace(/ \(this tab only\)$/, ''));
    this.msg.textContent = text;
    this.msg.classList.toggle('bad', bad);
  }

  private row(info: SlotInfo): HTMLElement {
    const row = this.mk('div', `sv-slot${info.empty ? ' empty' : ''}${info.corrupt ? ' corrupt' : ''}`);
    row.dataset.slot = info.id;
    const head = this.mk('div', 'sv-head');
    const name = this.mk('b', 'sv-name'); name.textContent = info.label;
    const stamp = this.mk('span', 'sv-stamp'); stamp.textContent = info.empty ? '' : formatStamp(info.savedAt);
    head.append(name, stamp);
    const meta = this.mk('div', 'sv-meta');
    meta.textContent = info.empty ? 'Empty' : info.corrupt ? 'Damaged save (cannot be loaded)'
      : `${formatDay(info.day)}  ${formatClock(info.hour)}  $${info.cash.toLocaleString('en-US')}`;
    const where = this.mk('div', 'sv-where');
    where.textContent = info.empty || info.corrupt ? '' : info.street || 'Bed-Stuy';
    const acts = this.mk('div', 'sv-acts');
    if (info.id !== 'auto') acts.appendChild(this.btn('Save', 'sv-btn sv-save', () => this.onSave(info)));
    const load = this.btn('Load', 'sv-btn sv-load', () => this.onLoad(info));
    load.disabled = info.empty || info.corrupt;
    const exp = this.btn('Export', 'sv-btn sv-export', () => this.exportSlot(info));
    exp.disabled = info.empty || info.corrupt;
    acts.append(load, exp);
    if (info.corrupt && info.id !== 'auto') acts.appendChild(this.btn('Delete', 'sv-btn sv-danger', () => { this.mgr.delete(info.id); this.say(`${info.label} cleared`); }));
    row.append(head, meta, where, acts);
    return row;
  }

  private onSave(info: SlotInfo): void {
    if (this.opts.canSave && !this.opts.canSave()) { this.say('Cannot save in here. Step outside first.', true); return; }
    if (!info.empty) this.ask({ kind: 'save', slot: info.id });
    else this.doSave(info.id);
  }

  private doSave(id: SlotId): void {
    if (this.mgr.save(id)) this.say(`Saved to ${SLOT_LABEL[id]}${this.mgr.storageOk ? '' : ' (this tab only)'}`);
    else this.say('Save failed', true);
  }

  private onLoad(info: SlotInfo): void {
    if (this.mgr.load(info.id)) { this.say(`Loaded ${info.label}`); this.opts.onDone?.('load'); }
    else this.say('Could not load that save', true);
  }

  private ask(p: Pending): void { this.pending = p; this.drawConfirm(); this.confirmEl.scrollIntoView?.({ block: 'nearest' }); }

  private drawConfirm(): void {
    const p = this.pending;
    this.confirmEl.hidden = !p;
    this.confirmEl.textContent = '';
    if (!p) return;
    const q = this.mk('span', 'sv-q');
    q.textContent = p.kind === 'save' ? `Overwrite ${SLOT_LABEL[p.slot]}? The old save is lost.`
      : p.kind === 'import' ? `Replace ${SLOT_LABEL[p.slot]} with the imported save?`
      : 'Start a new game? Unsaved progress is lost.';
    const yes = this.btn(p.kind === 'new' ? 'Start new game' : 'Overwrite', 'sv-btn sv-danger sv-yes', () => this.confirm());
    const no = this.btn('Cancel', 'sv-btn sv-no', () => { this.pending = null; this.drawConfirm(); });
    this.confirmEl.append(q, yes, no);
  }

  private confirm(): void {
    const p = this.pending;
    this.pending = null;
    this.drawConfirm();
    if (!p) return;
    if (p.kind === 'save') this.doSave(p.slot);
    else if (p.kind === 'import') this.storeImport(p.slot, p.text);
    else { this.mgr.newGame(); this.say('New game started'); this.opts.onDone?.('new'); }
  }

  private exportSlot(info: SlotInfo): void {
    const text = this.mgr.exportSlot(info.id);
    if (!text) { this.say('Nothing to export', true); return; }
    this.paste.value = text;
    if (isNativeApp()) { // the desktop shell has a real save dialog
      void exportSavesToFile(text, exportFileName(info)).then((ok) => { if (ok) this.say(`Exported ${info.label}.`); else this.fallbackDownload(text, info); });
      return;
    }
    this.fallbackDownload(text, info);
  }

  private fallbackDownload(text: string, info: SlotInfo): void {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = this.doc.createElement('a');
      a.href = url; a.download = exportFileName(info);
      this.doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 4000);
      this.say(`Exported ${info.label}. If no file appeared, copy the text below.`);
    } catch {
      this.pasteBox.open = true;
      this.say('Downloads are blocked. Copy the save text below.', true);
    }
  }

  private async readFile(): Promise<void> {
    const f = this.file.files?.[0];
    this.file.value = '';
    if (!f) return;
    try { this.importText(await f.text()); } catch { this.say('Could not read that file', true); }
  }

  /** Validates imported text, then asks before replacing an occupied slot. */
  importText(text: string): void {
    const parsed = this.mgr.parseImport(text);
    if (!parsed) { this.say('That is not a valid save', true); return; }
    const slot = this.importSlot.value as SlotId;
    if (this.mgr.slot(slot).empty) this.storeImport(slot, text);
    else this.ask({ kind: 'import', slot, text });
  }

  private storeImport(slot: SlotId, text: string): void {
    if (this.mgr.importInto(slot, text)) this.say(`Imported into ${SLOT_LABEL[slot]}. Press Load to play it.`);
    else this.say('Import failed', true);
  }

  private mk(tag: string, cls: string): HTMLElement { const e = this.doc.createElement(tag); e.className = cls; return e; }
  private label(t: string): HTMLElement { const e = this.mk('span', 'sv-label'); e.textContent = t; return e; }
  private btn(text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = this.mk('button', cls) as HTMLButtonElement;
    b.type = 'button'; b.textContent = text; b.addEventListener('click', fn);
    return b;
  }
}
