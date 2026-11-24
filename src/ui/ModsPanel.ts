import './mods.css';
import { TEXTURE_SLOTS, manifestForDrop, type ModManifest } from '@/mods/manifest';
import { LIMITS, MAX_FILES_PER_MOD, mb } from '@/mods/limits';
import { kindOf, type ModFile } from '@/mods/files';
import { storageEstimate } from '@/mods/store';
import type { InstallReport, ModRegistry } from '@/mods/registry';

export interface ModsPanelOptions {
  /** The panel opened or closed (main.ts: `panels.sync()`). */
  onToggle?: () => void;
  /** A mod was installed, removed or switched: apply it to the game (`registry.applyTo(...)`) and tell the player to reload for textures. */
  onChange?: (report: InstallReport | null) => void;
  /** Vehicle class names the game has, for the slot menus. */
  vehicleTypes: readonly string[];
  /** The game was opened with ?mods=off: nothing was loaded; the panel offers to clear everything stored on this device. */
  safeMode?: boolean;
  doc?: Document;
}

interface Pending { files: ModFile[]; models: string[]; txds: string[]; images: string[] }

/**
 * The Mods panel. Files are read in this page from disk (file picker, folder picker, drag and drop), parsed here and kept only
 * on this device. It registers with the PanelManager (`isOpen`, `back` = `close`) and has NO Esc handler of its own.
 */
export class ModsPanel {
  readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly list: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly assign: HTMLElement;
  private readonly usage: HTMLElement;
  private readonly drop: HTMLElement;
  private opened = false;
  private pending: Pending | null = null;
  private busy = false;

  constructor(parent: HTMLElement, private readonly registry: ModRegistry, private readonly opts: ModsPanelOptions) {
    const d = this.doc = opts.doc ?? parent.ownerDocument;
    const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => { const e = d.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    this.root = mk('div', 'md-root');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Mods');
    this.root.setAttribute('data-ui-modal', '');
    for (const t of ['pointerdown', 'mousedown', 'touchstart']) this.root.addEventListener(t, (e) => e.stopPropagation());
    const col = mk('div', 'md-col');
    const x = mk('button', 'md-x', 'X'); x.type = 'button'; x.setAttribute('aria-label', 'Close mods');
    x.addEventListener('click', () => this.close());
    col.append(mk('h2', 'md-title', 'Mods'));
    col.append(mk('p', 'md-lead', 'Add your own car models and surface textures. Your files are read here, in this page, and kept only on this device: nothing is uploaded and the game ships with no third-party pack. Supported: glTF (.glb) models, .png / .jpg / .webp images, and RenderWare .dff models with .txd texture dictionaries (PC files). Put a mod.json beside the files to say which slot each is for, or drop plain files and choose.'));
    this.drop = mk('div', 'md-drop', 'Drop files or a folder here');
    const row = mk('div', 'md-row');
    const input = mk('input'); input.type = 'file'; input.multiple = true; input.hidden = true;
    input.accept = '.json,.glb,.gltf,.dff,.txd,.png,.jpg,.jpeg,.webp';
    input.addEventListener('change', () => { void this.addDomFiles(Array.from(input.files ?? [])); input.value = ''; });
    const folder = mk('input'); folder.type = 'file'; folder.hidden = true;
    folder.setAttribute('webkitdirectory', ''); folder.multiple = true;
    folder.addEventListener('change', () => { void this.addDomFiles(Array.from(folder.files ?? [])); folder.value = ''; });
    const b1 = this.btn('Add files...', () => input.click());
    row.append(b1);
    if ('webkitdirectory' in folder) row.append(this.btn('Add folder...', () => folder.click()));
    this.drop.append(row, input, folder);
    for (const ev of ['dragenter', 'dragover']) this.drop.addEventListener(ev, (e) => { e.preventDefault(); this.drop.classList.add('over'); });
    for (const ev of ['dragleave', 'dragend']) this.drop.addEventListener(ev, () => this.drop.classList.remove('over'));
    this.drop.addEventListener('drop', (e) => { e.preventDefault(); this.drop.classList.remove('over'); void this.onDrop(e as DragEvent); });
    col.append(this.drop);
    if (opts.safeMode) {
      const safe = mk('div', 'md-drop', 'Safe mode: no mod was loaded this time.');
      const srow = mk('div', 'md-row');
      srow.append(this.btn('Remove every mod from this device', () => { void registry.store.clear().then(() => this.say([{ text: 'All stored mods were removed. Open the game without ?mods=off to use the panel normally.', kind: 'good' }])); }, 'danger'));
      safe.append(srow);
      col.append(safe);
    }
    this.msg = mk('div', 'md-msg'); this.msg.setAttribute('role', 'status');
    this.assign = mk('div', 'md-assign-box');
    this.list = mk('div', 'md-list');
    this.usage = mk('p', 'md-use');
    col.append(this.msg, this.assign, mk('h3', 'md-h', 'Installed mods'), this.list, this.usage);
    this.root.append(x, col);
    parent.appendChild(this.root);
    registry.subscribe(() => { if (this.opened) this.render(); });
  }

  get isOpen(): boolean { return this.opened; }
  open(): void { if (this.opened) return; this.opened = true; this.root.hidden = false; this.render(); this.opts.onToggle?.(); }
  close(): void { if (!this.opened) return; this.opened = false; this.root.hidden = true; this.pending = null; this.opts.onToggle?.(); }
  back(): void { this.close(); }

  private btn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button'; b.className = `md-btn ${cls}`.trim(); b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  private say(lines: Array<{ text: string; kind: 'good' | 'bad' | 'note' }>): void {
    this.msg.replaceChildren(...lines.map((l) => { const p = this.doc.createElement('div'); p.className = l.kind; p.textContent = l.text; return p; }));
  }

  /* ---------- reading what the player gave us ---------- */

  private maxFileBytes(): number {
    const l = this.registry.limits;
    return Math.max(l.maxModelFileBytes, l.maxTextureFileBytes, 262144);
  }

  private async addDomFiles(files: File[]): Promise<void> {
    const out: Array<{ path: string; file: File }> = files.map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, file: f }));
    await this.readAndInstall(out);
  }

  private async onDrop(e: DragEvent): Promise<void> {
    const items = Array.from(e.dataTransfer?.items ?? []);
    const out: Array<{ path: string; file: File }> = [];
    const entries = items.map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.() ?? null);
    if (entries.some((x) => x)) {
      for (const en of entries) if (en) await this.walk(en, '', out);
    } else {
      for (const f of Array.from(e.dataTransfer?.files ?? [])) out.push({ path: f.name, file: f });
    }
    await this.readAndInstall(out);
  }

  private async walk(en: FileSystemEntry, prefix: string, out: Array<{ path: string; file: File }>): Promise<void> {
    if (out.length > MAX_FILES_PER_MOD) return;
    if (en.isFile) {
      const f = await new Promise<File | null>((res) => (en as FileSystemFileEntry).file((x) => res(x), () => res(null)));
      if (f) out.push({ path: prefix + en.name, file: f });
    } else if (en.isDirectory) {
      const reader = (en as FileSystemDirectoryEntry).createReader();
      for (let round = 0; round < 20; round++) { // readEntries gives a batch at a time
        const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries((b) => res(b), () => res([])));
        if (!batch.length) break;
        for (const c of batch) await this.walk(c, `${prefix}${en.name}/`, out);
      }
    }
  }

  private async readAndInstall(found: Array<{ path: string; file: File }>): Promise<void> {
    if (this.busy) return;
    if (!found.length) { this.say([{ text: 'No files were given.', kind: 'note' }]); return; }
    this.busy = true;
    try {
      const notes: Array<{ text: string; kind: 'good' | 'bad' | 'note' }> = [];
      const files: ModFile[] = [];
      const max = this.maxFileBytes();
      let total = 0;
      for (const { path, file } of found) {
        const k = kindOf(path);
        if (k === 'other' || k === 'archive') { if (k === 'archive') notes.push({ text: `"${path}" is an .img archive: unpack the .dff and .txd files from it and add those.`, kind: 'note' }); continue; }
        if (file.size > max) { notes.push({ text: `"${path}" is ${mb(file.size)}, over the ${mb(max)} a file may be. Skipped.`, kind: 'bad' }); continue; }
        total += file.size;
        if (total > LIMITS.high.maxModBytes) { notes.push({ text: 'That is more data than one mod may hold. The rest were skipped.', kind: 'bad' }); break; }
        files.push({ path, data: new Uint8Array(await file.arrayBuffer()) });
      }
      if (!files.length) { this.say([...notes, { text: 'Nothing readable in that drop (models, .txd, images or mod.json).', kind: 'bad' }]); return; }
      this.say([{ text: 'Reading...', kind: 'note' }]);
      const rep = await this.registry.install(files);
      if (rep.needsSlots) { this.pending = { files, ...rep.needsSlots }; this.say(notes); this.renderAssign(); return; }
      this.pending = null; this.assign.replaceChildren();
      this.report(rep, notes);
    } catch (err) {
      this.say([{ text: `Could not read that: ${err instanceof Error ? err.message : String(err)}`, kind: 'bad' }]);
    } finally { this.busy = false; }
  }

  private report(rep: InstallReport, extra: Array<{ text: string; kind: 'good' | 'bad' | 'note' }> = []): void {
    const lines = [...extra];
    if (rep.ok) lines.push({ text: `"${rep.name}" is installed.${rep.entries.some((e) => e.entry.startsWith('texture')) ? ' Textures may need a page reload to show everywhere.' : ' Cars of that class spawned from now on use it.'}`, kind: 'good' });
    for (const e of rep.errors) lines.push({ text: e, kind: 'bad' });
    for (const e of rep.entries) if (!e.ok) lines.push({ text: `${e.entry}: ${e.message}`, kind: 'bad' });
    for (const w of rep.warnings) lines.push({ text: w, kind: 'note' });
    this.say(lines);
    this.opts.onChange?.(rep);
    this.render();
  }

  /* ---------- no mod.json: ask which slot each file is for ---------- */

  private renderAssign(): void {
    const p = this.pending;
    this.assign.replaceChildren();
    if (!p) return;
    const d = this.doc;
    const box = d.createElement('div');
    box.append(Object.assign(d.createElement('h3'), { className: 'md-h', textContent: 'Which slot is each file for?' }));
    const name = d.createElement('input'); name.className = 'md-name'; name.placeholder = 'Name for this mod'; name.maxLength = 80;
    name.value = (p.models[0] ?? p.images[0] ?? p.txds[0] ?? 'My mod').replace(/^.*\//, '').replace(/\.[^.]+$/, '');
    box.append(name);
    const selects: Array<{ path: string; sel: HTMLSelectElement }> = [];
    const addRow = (path: string, kind: 'model' | 'image' | 'txd'): void => {
      const row = d.createElement('div'); row.className = 'md-assign';
      row.append(Object.assign(d.createElement('span'), { textContent: path }));
      const sel = d.createElement('select'); sel.setAttribute('aria-label', `Slot for ${path}`);
      const opt = (v: string, t: string): void => { const o = d.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
      opt('', kind === 'txd' ? 'Used by a model of the same name' : 'Not used');
      if (kind === 'model') for (const v of this.opts.vehicleTypes) opt(`vehicle:${v}`, `Car: ${v}`);
      if (kind !== 'model') for (const k of TEXTURE_SLOTS) opt(`texture:${k}`, `Surface: ${k}`);
      row.append(sel); box.append(row); selects.push({ path, sel });
    };
    for (const m of p.models) addRow(m, 'model');
    for (const t of p.txds) addRow(t, 'txd');
    for (const i of p.images) addRow(i, 'image');
    const go = this.btn('Install', () => { void this.installAssigned(name.value.trim() || 'My mod', selects); });
    const cancel = this.btn('Cancel', () => { this.pending = null; this.renderAssign(); });
    const row = d.createElement('div'); row.className = 'md-row'; row.append(go, cancel);
    box.append(row);
    this.assign.append(box);
  }

  private async installAssigned(name: string, selects: Array<{ path: string; sel: HTMLSelectElement }>): Promise<void> {
    const p = this.pending;
    if (!p) return;
    const chosen = selects.filter((s) => s.sel.value);
    if (!chosen.length) { this.say([{ text: 'Pick a slot for at least one file.', kind: 'bad' }]); return; }
    const entries: ModManifest['entries'] = [];
    const txds = p.txds;
    for (const c of chosen) entries.push(...manifestForDrop(name, c.sel.value, c.path, c.path.endsWith('.dff') ? txds.filter((t) => t.replace(/\.[^.]+$/, '') === c.path.replace(/\.[^.]+$/, '')) : []).entries);
    const manifest: ModManifest = { ...manifestForDrop(name, chosen[0].sel.value, chosen[0].path), entries };
    this.busy = true;
    try {
      const rep = await this.registry.install(p.files, manifest);
      this.pending = null; this.assign.replaceChildren();
      this.report(rep);
    } finally { this.busy = false; }
  }

  /* ---------- the list ---------- */

  private render(): void {
    const d = this.doc;
    const mods = this.registry.list();
    if (!mods.length) {
      const p = d.createElement('p'); p.className = 'md-meta'; p.textContent = 'No mods installed. The game is running with its own cars and textures.';
      this.list.replaceChildren(p);
    } else {
      this.list.replaceChildren(...mods.map((m) => {
        const card = d.createElement('div'); card.className = 'md-mod';
        const h = d.createElement('h3'); h.textContent = m.name;
        const meta = d.createElement('p'); meta.className = 'md-meta';
        meta.textContent = [m.author && `by ${m.author}`, m.licence && `licence: ${m.licence}`, mb(m.bytes), m.enabled ? 'on' : 'off'].filter(Boolean).join('  |  ');
        card.append(h, meta);
        for (const e of m.entries) { const li = d.createElement('div'); li.className = `md-ent ${e.ok ? 'ok' : 'no'}`; li.textContent = `${e.entry}: ${e.message}`; card.append(li); }
        const row = d.createElement('div'); row.className = 'md-row'; row.style.justifyContent = 'flex-start';
        row.append(this.btn(m.enabled ? 'Turn off' : 'Turn on', () => { void this.registry.setEnabled(m.id, !m.enabled).then(() => { this.opts.onChange?.(null); this.say([{ text: 'Reload the page for the change to take full effect.', kind: 'note' }]); }); }));
        row.append(this.btn('Remove', () => { void this.registry.remove(m.id).then(() => { this.opts.onChange?.(null); this.say([{ text: `"${m.name}" was removed from this device. Reload the page to get the stock look back everywhere.`, kind: 'note' }]); }); }, 'danger'));
        card.append(row);
        return card;
      }));
    }
    const own = this.registry.totalBytes();
    const lim = this.registry.tier === 'phone' ? ' Model mods are not loaded on phones in this version; texture mods are.' : '';
    this.usage.textContent = `Mods use ${mb(own)} on this device${this.registry.store.persistent ? '' : ' (this browser blocks storage, so mods last only until you close the page)'}.${lim}`;
    void storageEstimate().then((e) => { if (e && this.opened) this.usage.textContent += ` The browser lets this site use up to ${mb(e.quota)} and ${mb(e.usage)} is used.`; });
  }
}
