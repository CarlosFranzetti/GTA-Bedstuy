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

describe('RadioUi Radio SC section', () => {
  it('is absent without a station; with one it adds, validates, reorders, removes and tests', async () => {
    const { ScStation } = await import('@/audio/sc/ScStation');
    expect(make().ui.root.querySelector('.rl-sc')).toBeNull();
    document.body.innerHTML = '';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const library = new Library(memStorage());
    const libraryController = new LibraryController(library, { handles: memoryHandleStore(), importDeps, win: {} });
    const sc = new ScStation({ storage: null, canLoad: () => false });
    const ui = new RadioUi(parent, { library, libraryController, sc });
    ui.open();
    const input = q<HTMLInputElement>(ui.root, '.rl-sc-input');
    input.value = 'https://example.com/a/b';
    q<HTMLButtonElement>(ui.root, '.rl-sc-add').click();
    expect(sc.mixes).toHaveLength(0);
    expect(q(ui.root, '.rl-sc-msg').textContent).toContain('soundcloud.com');
    for (const u of ['https://soundcloud.com/a/one', 'https://soundcloud.com/b/two']) { input.value = u; q<HTMLButtonElement>(ui.root, '.rl-sc-add').click(); }
    expect(qa(ui.root, '.rl-sc-list .rl-slot')).toHaveLength(2);
    qa(ui.root, '.rl-sc-down')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sc.mixes[0].url).toBe('https://soundcloud.com/b/two');
    input.value = 'https://soundcloud.com/x/y';
    q<HTMLButtonElement>(ui.root, '.rl-sc-test').click();
    await flush();
    expect(q(ui.root, '.rl-sc-msg').textContent).toContain('Radio SC (needs the hosted build');
    qa(ui.root, '.rl-sc-remove')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sc.mixes).toHaveLength(1);
  });

  it('shows the RA pool status and a Random RA sets checkbox', async () => {
    const { ScStation } = await import('@/audio/sc/ScStation');
    const { RaFeed, RA_CACHE_KEY } = await import('@/audio/sc/RaFeed');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const library = new Library(memStorage());
    const libraryController = new LibraryController(library, { handles: memoryHandleStore(), importDeps, win: {} });
    const sets = [0, 1, 2].map((i) => ({ url: `https://soundcloud.com/dj/s${i}`, title: `S${i}`, dj: 'D', duration: 3600, artistId: String(i) }));
    const store = new Map([[RA_CACHE_KEY, JSON.stringify({ v: 1, fetchedAt: Date.now(), sets, played: [sets[0].url] })]]);
    const feed = new RaFeed({ fetch: null, storage: { getItem: (k) => store.get(k) ?? null, setItem: () => undefined }, base: 'x' });
    const sc = new ScStation({ storage: null, canLoad: () => false, feed });
    const ui = new RadioUi(parent, { library, libraryController, sc });
    ui.open();
    expect(q(ui.root, '.rl-sc-ra-status').textContent).toBe('Random RA NYC sets: 3 loaded, 1 heard');
    const box = q<HTMLInputElement>(ui.root, '.rl-sc-ra-toggle');
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(sc.randomSets).toBe(false);
    expect(q(ui.root, '.rl-sc-ra-status').textContent).toContain('off');
    const down = new ScStation({ storage: null, canLoad: () => false, feed: new RaFeed({ fetch: null, storage: { getItem: () => null, setItem: () => undefined }, base: 'x' }) });
    await down.feed!.ensure();
    const ui2 = new RadioUi(parent, { library, libraryController, sc: down });
    ui2.open();
    expect(q(ui2.root, '.rl-sc-ra-status').textContent).toBe('RA NYC sets unavailable (offline or blocked)');
  });
});

describe('RadioUi SoundCloud stations', () => {
  it('shows one section per station with its pool count, keywords and its own pasted-link list', async () => {
    const { RadioDirector } = await import('@/audio/RadioDirector');
    const { TalkPlayer } = await import('@/audio/talk/TalkPlayer');
    const { RaFeed, RA_CACHE_KEY } = await import('@/audio/sc/RaFeed');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const library = new Library(memStorage());
    const libraryController = new LibraryController(library, { handles: memoryHandleStore(), importDeps, win: {} });
    const sets = [
      { url: 'https://soundcloud.com/dj/a', title: 'Deep House Night', dj: 'A', duration: 3600, artistId: '1' },
      { url: 'https://soundcloud.com/dj/b', title: 'Garage Hour', dj: 'B', duration: 3600, artistId: '2' },
      { url: 'https://soundcloud.com/dj/c', title: 'Dub Techno', dj: 'C', duration: 3600, artistId: '3' },
    ];
    const store = new Map([[RA_CACHE_KEY, JSON.stringify({ v: 1, fetchedAt: Date.now(), sets, played: [] })]]);
    const feed = new RaFeed({ fetch: null, storage: { getItem: (k) => store.get(k) ?? null, setItem: () => undefined }, base: 'x' });
    const talk = new TalkPlayer({ speech: null, makeUtterance: () => { throw new Error('x'); }, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    const dir = new RadioDirector(library, talk, undefined, undefined, { feed, scEnv: { canLoad: () => false, storage: null } });
    const ui = new RadioUi(parent, { library, libraryController, scStations: dir.scStations });
    ui.open();
    const sections = qa(ui.root, '.rl-sc');
    expect(sections).toHaveLength(8);
    expect(sections.map((s) => (s as HTMLElement).dataset.station)).toEqual(['bkhouse', 'dublab', 'stoop', 'boogie', 'weird', 'yard', 'flashback', 'sc']);
    const houseSec = sections[0];
    expect(q(houseSec, '.rl-station-name').textContent).toBe('BK House');
    expect(q(houseSec, '.rl-sc-pool').textContent).toBe('Pool for BK House: 2 of 3 sets match, 2 not heard yet.');
    expect(q(houseSec, '.rl-sc-keywords').textContent).toContain('house');
    expect(q(sections[1], '.rl-sc-pool').textContent).toBe('Pool for Dub Lab: 1 of 3 sets match, 1 not heard yet.');
    expect(q(sections[7], '.rl-sc-pool').textContent).toContain('3 of 3 sets match');
    // links are per station
    const input = q<HTMLInputElement>(houseSec, '.rl-sc-input');
    input.value = 'https://soundcloud.com/a/one';
    q<HTMLButtonElement>(houseSec, '.rl-sc-add').click();
    expect(dir.scStation('bkhouse')!.mixes).toHaveLength(1);
    expect(dir.scStation('dublab')!.mixes).toHaveLength(0);
    expect(qa(houseSec, '.rl-sc-list .rl-slot')).toHaveLength(1);
    expect(q(sections[1], '.rl-sc-list .rl-empty')).not.toBeNull();
    expect(q(houseSec, '.rl-sc-count').textContent).toBe('2 sets · 1 links');
  });
});

describe('RadioUi tap to start radio', () => {
  it('shows "Tap to start radio" when the browser blocks sound, calls play() inside the click, and hides on PLAY', async () => {
    vi.useFakeTimers();
    try {
      const { ScStation, SC_TAP_PROMPT } = await import('@/audio/sc/ScStation');
      const handlers = new Map<string, Array<(e?: unknown) => void>>();
      const calls: string[] = [];
      const w = {
        bind: (e: string, f: (x?: unknown) => void) => { handlers.set(e, [...(handlers.get(e) ?? []), f]); },
        load: () => undefined, play: () => { calls.push('play'); }, pause: () => undefined, setVolume: () => undefined, seekTo: () => undefined,
        next: () => undefined, prev: () => undefined,
        getCurrentSound: (cb: (s: unknown) => void) => cb({ title: 'T', user: { username: 'DJ' } }), getDuration: (cb: (n: number) => void) => cb(600000),
      };
      const api = { Widget: Object.assign(() => { queueMicrotask(() => handlers.get('ready')?.forEach((f) => f())); return w; }, { Events: { READY: 'ready', PLAY: 'play', ERROR: 'error', PLAY_PROGRESS: 'playProgress', FINISH: 'finish' } }) };
      const sc = new ScStation({ loadApi: async () => api as never, canLoad: () => true, feed: null, blockedMs: 100, storage: { load: () => [{ url: 'https://soundcloud.com/a/b' }], save: () => undefined } });
      document.body.innerHTML = '';
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const library = new Library(memStorage());
      const ui = new RadioUi(parent, { library, libraryController: new LibraryController(library, { handles: memoryHandleStore(), importDeps, win: {} }), scStations: [sc] });
      expect(ui.tapBar.hidden).toBe(true);
      sc.setActive(true);
      await vi.advanceTimersByTimeAsync(10);
      expect(ui.tapBar.hidden).toBe(true);
      await vi.advanceTimersByTimeAsync(200);
      expect(ui.tapBar.hidden).toBe(false);
      const b = q<HTMLButtonElement>(ui.tapBar, '.rl-tap');
      expect(b.textContent).toBe(SC_TAP_PROMPT);
      const before = calls.length;
      b.click();
      expect(calls.length).toBe(before + 1); // once, not twice (the page-wide hook already fired)
      handlers.get('play')?.forEach((f) => f());
      expect(ui.tapBar.hidden).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
