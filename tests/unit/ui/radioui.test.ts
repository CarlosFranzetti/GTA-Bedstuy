// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RadioUi } from '@/ui/RadioUi';
import { Library, type LibraryStorage, type PersistedLibrary } from '@/audio/library/Library';
import { LibraryController } from '@/audio/library/LibraryController';
import { memoryHandleStore } from '@/audio/library/import';

function memStorage(): LibraryStorage & { data: PersistedLibrary | null } {
  const s = { data: null as PersistedLibrary | null, load: () => (s.data ? JSON.parse(JSON.stringify(s.data)) : null), save: (d: PersistedLibrary) => { s.data = JSON.parse(JSON.stringify(d)); }, clear: () => { s.data = null; } };
  return s;
}

const importDeps = { probe: async () => 90, createUrl: (f: File) => `blob:${f.name}` };
const item = (path: string) => ({ path, size: path.length, lastModified: 1, duration: 90, url: `blob:${path}` });
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(win: unknown = {}) {
  document.body.innerHTML = '';
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const storage = memStorage();
  const library = new Library(storage);
  const libraryController = new LibraryController(library, { handles: memoryHandleStore(), importDeps, win });
  const onToggle = vi.fn();
  const ui = new RadioUi(parent, { library, libraryController }, { onToggle });
  return { ui, library, libraryController, parent, storage, onToggle };
}

const q = <T extends Element>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const qa = (root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel));
const btn = (root: ParentNode, text: string) => qa(root, 'button').find((b) => b.textContent === text) as HTMLButtonElement;

describe('RadioUi', () => {
  let ctx: ReturnType<typeof make>;
  beforeEach(() => { ctx = make(); });

  it('is a hidden modal dialog until opened, and reports open/close', () => {
    const { ui, onToggle } = ctx;
    expect(ui.root.hidden).toBe(true);
    expect(ui.root.getAttribute('role')).toBe('dialog');
    expect(ui.root.hasAttribute('data-ui-modal')).toBe(true);
    ui.open();
    expect(ui.root.hidden).toBe(false);
    expect(ui.isOpen).toBe(true);
    ui.close();
    expect(ui.root.hidden).toBe(true);
    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });

  it('lists the eight stations with their slot counts, 147 slots in all', () => {
    const { ui } = ctx;
    ui.open();
    const heads = qa(ui.root, '.rl-station:not(.rl-pool) .rl-station-name').map((e) => e.textContent);
    expect(heads).toEqual(['Bed-Stuy Pop FM', 'Flashback 80s', 'Throop Rap Radio', 'Garvey House & Dub', 'Marcy Trap & Plug 808', 'Hazy Tompkins Weird Radio', 'Lewis Ave Echo-Dub Folk', 'Nostrand Jazz-Rock Gets Lit']);
    expect(qa(ui.root, '.rl-station:not(.rl-pool) .rl-count').map((e) => e.textContent)).toEqual(['0/15', '0/12', '0/13', '0/22', '0/25', '0/28', '0/16', '0/16']);
    expect(qa(ui.root, '.rl-station:not(.rl-pool) .rl-slot')).toHaveLength(147);
  });

  it('shows counts like 7/15 and the file names after an import', () => {
    const { ui, library } = ctx;
    library.addTracks(Array.from({ length: 7 }, (_, i) => item(`Pop/song ${i + 1}.mp3`)));
    ui.open();
    expect(q(ui.root, '[data-station="pop"] .rl-count').textContent).toBe('7/15');
    const names = qa(q(ui.root, '[data-station="pop"]'), '.rl-name').map((e) => e.textContent);
    expect(names.slice(0, 2)).toEqual(['song 1', 'song 2']);
    expect(names[7]).toBe('Empty — plays synth');
  });

  it('hides folder buttons where the browser has no folder picker and keeps Add files', () => {
    const { ui } = ctx;
    expect(btn(ui.root, 'Pick folder').hidden).toBe(true);
    expect(btn(ui.root, 'Fill from folder').hidden).toBe(true);
    expect(btn(ui.root, 'Reconnect folder').hidden).toBe(true);
    expect(btn(ui.root, 'Add files').hidden).toBe(false);
    const input = q<HTMLInputElement>(ui.root, 'input[type=file]');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('audio/*');
  });

  it('shows Pick folder where showDirectoryPicker exists', () => {
    const c = make({ showDirectoryPicker: async () => null });
    expect(btn(c.ui.root, 'Pick folder').hidden).toBe(false);
  });

  it('imports picked files and assigns them by keyword', async () => {
    const { ui, library } = ctx;
    const input = q<HTMLInputElement>(ui.root, 'input[type=file]');
    const files = [new File([new Uint8Array(1)], 'Rap - a.mp3', { type: 'audio/mpeg', lastModified: 2 }), new File([new Uint8Array(1)], 'weird thing.mp3', { type: 'audio/mpeg', lastModified: 3 }), new File([new Uint8Array(1)], 'unknown.mp3', { type: 'audio/mpeg', lastModified: 4 })];
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(library.countLabel('rap')).toBe('1/13');
    expect(library.countLabel('psych')).toBe('1/28');
    expect(library.unassigned().map((t) => t.name)).toEqual(['unknown']);
    expect(q(ui.root, '.rl-status').textContent).toMatch(/3 files read/);
    expect(q(ui.root, '.rl-pool .rl-count').textContent).toBe('1');
  });

  it('moves a track to another station with the dropdown and assigns pool tracks', () => {
    const { ui, library } = ctx;
    library.addTracks([item('Pop/a.mp3'), item('Other/mystery.mp3')]);
    ui.open();
    const popRow = qa(q(ui.root, '[data-station="pop"]'), '.rl-slot')[0];
    const sel = q<HTMLSelectElement>(popRow, 'select');
    sel.value = 'trap';
    sel.dispatchEvent(new Event('change'));
    expect(library.countLabel('trap')).toBe('1/25');
    expect(library.count('pop')).toBe(0);
    const poolSel = q<HTMLSelectElement>(q(ui.root, '.rl-pool'), 'select');
    poolSel.value = 'jazzrock';
    poolSel.dispatchEvent(new Event('change'));
    expect(library.countLabel('jazzrock')).toBe('1/16');
    expect(library.unassigned()).toHaveLength(0);
  });

  it('disables full stations in the dropdown', () => {
    const { ui, library } = ctx;
    library.addTracks([...Array.from({ length: 12 }, (_, i) => item(`80s/s${i}.mp3`)), item('Pop/a.mp3')]);
    ui.open();
    const sel = q<HTMLSelectElement>(qa(q(ui.root, '[data-station="pop"]'), '.rl-slot')[0], 'select');
    const opt = Array.from(sel.options).find((o) => o.value === 'eighties')!;
    expect(opt.disabled).toBe(true);
    expect(opt.textContent).toContain('12/12');
  });

  it('clears a single slot with its button; the track goes back to the pool', () => {
    const { ui, library } = ctx;
    library.addTracks([item('Pop/a.mp3'), item('Pop/b.mp3')]);
    ui.open();
    q<HTMLButtonElement>(qa(q(ui.root, '[data-station="pop"]'), '.rl-slot')[0], '.rl-x').click();
    expect(library.countLabel('pop')).toBe('1/15');
    expect(library.unassigned().map((t) => t.name)).toEqual(['a']);
  });

  it('drag and drop: dropping a dragged track on a station puts it in the first free slot', () => {
    const { ui, library } = ctx;
    library.addTracks([item('Pop/a.mp3')]);
    ui.open();
    const id = library.slotTrack('pop', 0)!.id;
    const store = new Map<string, string>();
    const dt = { types: ['text/x-rl-track'], getData: (k: string) => store.get(k) ?? '', setData: (k: string, v: string) => { store.set(k, v); }, effectAllowed: '' };
    const row = qa(q(ui.root, '[data-station="pop"]'), '.rl-slot')[0];
    const start = new Event('dragstart', { bubbles: true });
    Object.defineProperty(start, 'dataTransfer', { value: dt });
    row.dispatchEvent(start);
    expect(store.get('text/x-rl-track')).toBe(id);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: dt });
    q(ui.root, '[data-station="rap"]').dispatchEvent(drop);
    expect(library.slotTrack('rap', 0)!.id).toBe(id);
    expect(library.count('pop')).toBe(0);
  });

  it('marks saved songs whose files need picking again', () => {
    const storage = memStorage();
    const first = new Library(storage);
    first.addTracks([item('Pop/a.mp3')]);
    document.body.innerHTML = '';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const library = new Library(storage);
    const ui = new RadioUi(parent, { library, libraryController: new LibraryController(library, { handles: memoryHandleStore(), importDeps, win: {} }) });
    ui.open();
    expect(q(ui.root, '[data-station="pop"] .rl-name').textContent).toBe('a (add file again)');
    expect(q(ui.root, '.rl-status').textContent).toMatch(/need their files again/);
  });

  it('Reset library needs a second tap, then forgets everything', async () => {
    const { ui, library, storage } = ctx;
    library.addTracks([item('Pop/a.mp3')]);
    ui.open();
    btn(ui.root, 'Reset library').click();
    expect(library.size).toBe(1);
    const again = btn(ui.root, 'Tap again to forget everything');
    expect(again).toBeTruthy();
    again.click();
    await flush();
    expect(library.size).toBe(0);
    expect(storage.data).toBeNull();
    expect(q(ui.root, '[data-station="pop"] .rl-count').textContent).toBe('0/15');
  });

  it('closing resets a half-finished reset confirmation', () => {
    const { ui } = ctx;
    ui.open();
    btn(ui.root, 'Reset library').click();
    ui.close();
    ui.open();
    expect(btn(ui.root, 'Reset library')).toBeTruthy();
  });

  it('Escape closes the panel without reaching the pause menu', () => {
    const { ui } = ctx;
    ui.open();
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    ui.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.removeEventListener('keydown', seen);
    expect(ui.isOpen).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it('keeps stations open across re-renders', () => {
    const { ui, library } = ctx;
    ui.open();
    const det = q<HTMLDetailsElement>(ui.root, '[data-station="rap"]');
    det.open = true;
    det.dispatchEvent(new Event('toggle'));
    library.addTracks([item('Rap/a.mp3')]);
    expect(q<HTMLDetailsElement>(ui.root, '[data-station="rap"]').open).toBe(true);
  });

  it('dispose removes the panel', () => {
    const { ui, parent } = ctx;
    ui.dispose();
    expect(parent.querySelector('.rl-root')).toBeNull();
  });
});
