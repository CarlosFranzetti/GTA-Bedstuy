/**
 * Glue between the library and the browser: folder picker + remembered handle, file-input fallback, permission
 * re-request, "fill from folder" and reset. UI-free so it can be driven by tests and by RadioUi.
 */
import type { Library } from './Library';
import {
  ensureReadPermission, folderPickerSupported, idbHandleStore, importFiles, pickFolder, scanDirectory,
  type DirHandleLike, type HandleStore, type ImportDeps,
} from './import';

export type FolderStatus =
  | 'unsupported'   // no File System Access API: use "Add files" each session
  | 'none'          // supported, no folder chosen yet
  | 'needs-permission' // a folder is remembered but the browser wants a tap to read it again
  | 'connected'     // folder readable, files loaded this session
  | 'busy';

export interface ControllerDeps {
  handles?: HandleStore;
  importDeps?: ImportDeps;
  /** Window-like object with showDirectoryPicker (tests inject a fake). */
  win?: unknown;
}

export class LibraryController {
  status: FolderStatus;
  message = '';
  private handle: DirHandleLike | null = null;
  private readonly handles: HandleStore;
  private readonly listeners = new Set<() => void>();
  private ready: Promise<void> | null = null;
  private readonly win: unknown;

  constructor(readonly library: Library, private readonly deps: ControllerDeps = {}) {
    this.win = deps.win ?? (typeof window === 'undefined' ? undefined : window);
    this.handles = deps.handles ?? idbHandleStore();
    this.status = folderPickerSupported(this.win) ? 'none' : 'unsupported';
  }

  get folderSupported(): boolean { return folderPickerSupported(this.win); }
  get hasFolder(): boolean { return this.handle !== null; }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /**
   * Loads the remembered folder handle and, when the browser still lets us read it without asking,
   * re-reads its files. Safe to call more than once.
   */
  init(): Promise<void> {
    this.ready ??= (async () => {
      if (!this.folderSupported) return;
      try { this.handle = await this.handles.get(); } catch { this.handle = null; }
      if (!this.handle) return;
      const perm = await ensureReadPermission(this.handle, false);
      if (perm === 'granted') await this.scan('Reconnected');
      else this.set('needs-permission', `Tap "Reconnect folder" to let the game read "${this.handle.name}" again.`);
    })();
    return this.ready;
  }

  /** Called on the first user gesture: asks for read permission again when a folder is remembered. */
  async autoReconnect(): Promise<void> {
    await this.init();
    if (this.status === 'needs-permission') await this.reconnect();
  }

  /** Folder picker (must run inside a user gesture). */
  async chooseFolder(): Promise<void> {
    if (!this.folderSupported) { this.set(this.status, 'This browser cannot pick folders. Use "Add files".'); return; }
    const h = await pickFolder(this.win);
    if (!h) return;
    this.handle = h;
    try { await this.handles.put(h); } catch { /* handle not persistable: works for this session */ }
    this.library.folderName = h.name;
    await this.scan(`Loaded "${h.name}"`);
  }

  /** Re-asks permission on the remembered folder and re-reads it. */
  async reconnect(): Promise<void> {
    await this.init();
    if (!this.handle) { this.set(this.status, 'No folder remembered yet.'); return; }
    const perm = await ensureReadPermission(this.handle, true);
    if (perm !== 'granted') { this.set('needs-permission', 'Permission was not granted for that folder.'); return; }
    await this.scan('Reconnected');
  }

  /** "Fill from folder": re-reads the folder and gives every unassigned track a slot where its genre has room. */
  async fillFromFolder(): Promise<void> {
    await this.init();
    if (!this.handle) { this.set(this.status, 'Pick a folder first.'); return; }
    if (this.status !== 'connected') await this.reconnect();
    else await this.scan('Refreshed');
    if (this.status === 'connected') {
      const n = this.library.autoAssign();
      this.set('connected', `${n} more track${n === 1 ? '' : 's'} placed. ${this.library.unassigned().length} left unassigned.`);
    }
  }

  /** File-input fallback: files are re-picked each session; only their metadata is stored. */
  async addFiles(files: ArrayLike<File>): Promise<void> {
    this.set('busy', 'Reading files...');
    try {
      const tracks = await importFiles(files, this.deps.importDeps);
      const r = this.library.addTracks(tracks);
      this.set(this.handle ? 'connected' : this.folderSupported ? 'none' : 'unsupported',
        tracks.length === 0 ? 'No audio files found.' : `${tracks.length} file${tracks.length === 1 ? '' : 's'} read, ${r.assigned} placed by genre, ${r.unassigned} unassigned.`);
    } catch {
      this.set('none', 'Could not read those files.');
    }
  }

  /** Forgets all assignments, the remembered folder and every blob URL. */
  async reset(): Promise<void> {
    this.library.reset();
    this.handle = null;
    try { await this.handles.clear(); } catch { /* ignore */ }
    this.set(this.folderSupported ? 'none' : 'unsupported', 'Library reset. Nothing is stored any more.');
  }

  private async scan(prefix: string): Promise<void> {
    if (!this.handle) return;
    this.set('busy', 'Reading your music...');
    try {
      const tracks = await scanDirectory(this.handle, this.deps.importDeps);
      this.library.folderName = this.handle.name;
      const r = this.library.addTracks(tracks);
      this.set('connected', `${prefix}: ${tracks.length} audio file${tracks.length === 1 ? '' : 's'}, ${r.assigned} placed by genre, ${this.library.unassigned().length} unassigned.`);
    } catch {
      this.set('needs-permission', 'The folder could not be read. Tap "Reconnect folder".');
    }
  }

  private set(status: FolderStatus, message: string): void {
    this.status = status;
    this.message = message;
    for (const fn of [...this.listeners]) fn();
  }
}
