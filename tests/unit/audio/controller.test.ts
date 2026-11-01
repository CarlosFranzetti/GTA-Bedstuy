import { describe, it, expect, vi } from 'vitest';
import { Library, type LibraryStorage, type PersistedLibrary } from '@/audio/library/Library';
import { LibraryController } from '@/audio/library/LibraryController';
import { memoryHandleStore, scanDirectory, importFiles, ensureReadPermission, folderPickerSupported, type DirHandleLike, type FileHandleLike } from '@/audio/library/import';

const file = (name: string, _size = 1000, lastModified = 1) => new File([new Uint8Array(1)], name, { lastModified, type: name.endsWith('.txt') ? 'text/plain' : 'audio/mpeg' });

const fh = (name: string, size = 1000): FileHandleLike => {
  const f = file(name, size);
  return { kind: 'file', name, getFile: async () => f };
};

function dir(name: string, entries: Array<FileHandleLike | DirHandleLike>, perm: PermissionState = 'granted'): DirHandleLike & { perm: PermissionState; requests: number } {
  const d = {
    kind: 'directory' as const, name, perm, requests: 0,
    async *values() { for (const e of entries) yield e; },
    queryPermission: async () => d.perm,
    requestPermission: async () => { d.requests++; return d.perm === 'prompt' ? 'granted' : d.perm; },
  };
  return d;
}

const importDeps = { probe: async () => 150, createUrl: (f: File) => `blob:${f.name}` };

function memStorage(): LibraryStorage & { data: PersistedLibrary | null } {
  const s = { data: null as PersistedLibrary | null, load: () => (s.data ? JSON.parse(JSON.stringify(s.data)) : null), save: (d: PersistedLibrary) => { s.data = JSON.parse(JSON.stringify(d)); }, clear: () => { s.data = null; } };
  return s;
}

const tree = () => dir('Music', [
  dir('Pop', [fh('one.mp3'), fh('two.mp3'), fh('notes.txt')]),
  dir('80s', [fh('three.m4a')]),
  dir('Trap', [fh('four.flac')]),
  fh('misc.ogg'),
]);

describe('import', () => {
  it('walks folders, skips non-audio, builds relative paths and probes durations', async () => {
    const tracks = await scanDirectory(tree(), importDeps);
    expect(tracks.map((t) => t.path)).toEqual(['Music/80s/three.m4a', 'Music/misc.ogg', 'Music/Pop/one.mp3', 'Music/Pop/two.mp3', 'Music/Trap/four.flac']);
    expect(tracks.every((t) => t.duration === 150 && t.url.startsWith('blob:'))).toBe(true);
  });

  it('imports a file list and drops non-audio files', async () => {
    const tracks = await importFiles([file('b.mp3'), file('a.mp3'), file('readme.txt')], importDeps);
    expect(tracks.map((t) => t.path)).toEqual(['a.mp3', 'b.mp3']);
  });

  it('survives a probe that throws', async () => {
    const tracks = await importFiles([file('a.mp3')], { probe: async () => { throw new Error('x'); }, createUrl: () => 'blob:a' });
    expect(tracks[0].duration).toBe(0);
  });

  it('detects the folder picker and permission states', async () => {
    expect(folderPickerSupported({})).toBe(false);
    expect(folderPickerSupported({ showDirectoryPicker: () => null })).toBe(true);
    const d = dir('x', [], 'prompt');
    expect(await ensureReadPermission(d, false)).toBe('prompt');
    expect(await ensureReadPermission(d, true)).toBe('granted');
    expect(d.requests).toBe(1);
    expect(await ensureReadPermission(dir('y', [], 'denied'), true)).toBe('denied');
  });
});

describe('LibraryController', () => {
  it('picks a folder, auto-assigns by keyword and remembers the handle', async () => {
    const root = tree();
    const handles = memoryHandleStore();
    const lib = new Library(memStorage());
    const ctl = new LibraryController(lib, { handles, importDeps, win: { showDirectoryPicker: async () => root } });
    await ctl.init();
    expect(ctl.status).toBe('none');
    await ctl.chooseFolder();
    expect(ctl.status).toBe('connected');
    expect(lib.countLabel('pop')).toBe('2/15');
    expect(lib.countLabel('eighties')).toBe('1/12');
    expect(lib.countLabel('trap')).toBe('1/25');
    expect(lib.unassigned().map((t) => t.name)).toEqual(['misc']);
    expect(lib.folderName).toBe('Music');
    expect(await handles.get()).toBe(root);
  });

  it('cancelling the picker changes nothing', async () => {
    const ctl = new LibraryController(new Library(), { handles: memoryHandleStore(), importDeps, win: { showDirectoryPicker: async () => { throw new DOMException('cancel', 'AbortError'); } } });
    await ctl.chooseFolder();
    expect(ctl.status).toBe('none');
    expect(ctl.library.size).toBe(0);
  });

  it('round trip across sessions: handle + metadata restore, permission re-requested when needed', async () => {
    const root = tree();
    const handles = memoryHandleStore();
    const storage = memStorage();
    const s1 = new LibraryController(new Library(storage), { handles, importDeps, win: { showDirectoryPicker: async () => root } });
    await s1.chooseFolder();
    s1.library.assign(s1.library.slotTrack('pop', 0)!.id, 'jazzrock', 5);

    // next session, browser asks again
    root.perm = 'prompt';
    const lib2 = new Library(storage);
    expect(lib2.needsReconnect).toBe(true);
    const s2 = new LibraryController(lib2, { handles, importDeps, win: { showDirectoryPicker: async () => root } });
    await s2.init();
    expect(s2.status).toBe('needs-permission');
    expect(lib2.playableCount('pop')).toBe(0);
    await s2.reconnect();
    expect(root.requests).toBe(1);
    expect(s2.status).toBe('connected');
    expect(lib2.slotTrack('jazzrock', 5)!.name).toBe('one'); // manual choice survived
    expect(lib2.slotTrack('jazzrock', 5)!.url).toBe('blob:one.mp3');
    expect(lib2.countLabel('pop')).toBe('1/15');
    expect(lib2.needsReconnect).toBe(false);
  });

  it('reconnects silently when the permission is still granted', async () => {
    const root = tree();
    const handles = memoryHandleStore(root);
    const storage = memStorage();
    const s = new LibraryController(new Library(storage), { handles, importDeps, win: { showDirectoryPicker: async () => root } });
    await s.init();
    expect(s.status).toBe('connected');
    expect(root.requests).toBe(0);
    expect(s.library.size).toBe(5);
  });

  it('autoReconnect asks for permission on the first gesture', async () => {
    const root = tree();
    root.perm = 'prompt';
    const s = new LibraryController(new Library(), { handles: memoryHandleStore(root), importDeps, win: { showDirectoryPicker: async () => root } });
    await s.autoReconnect();
    expect(root.requests).toBe(1);
    expect(s.status).toBe('connected');
  });

  it('denied permission leaves the slots on synth and keeps asking via the button', async () => {
    const root = dir('Music', [fh('one.mp3')], 'denied');
    const s = new LibraryController(new Library(), { handles: memoryHandleStore(root), importDeps, win: { showDirectoryPicker: async () => root } });
    await s.init();
    await s.reconnect();
    expect(s.status).toBe('needs-permission');
    expect(s.library.size).toBe(0);
  });

  it('fill from folder places tracks that had no room or were cleared, and reports counts', async () => {
    const root = tree();
    const lib = new Library();
    const ctl = new LibraryController(lib, { handles: memoryHandleStore(), importDeps, win: { showDirectoryPicker: async () => root } });
    await ctl.chooseFolder();
    lib.clearSlot('pop', 0);
    lib.clearSlot('pop', 1);
    expect(lib.count('pop')).toBe(0);
    await ctl.fillFromFolder();
    expect(lib.count('pop')).toBe(2);
    expect(ctl.message).toMatch(/placed/);
  });

  it('file-input fallback (no folder picker): re-pick each session, only metadata stored', async () => {
    const storage = memStorage();
    const lib = new Library(storage);
    const ctl = new LibraryController(lib, { handles: memoryHandleStore(), importDeps, win: {} });
    expect(ctl.status).toBe('unsupported');
    expect(ctl.folderSupported).toBe(false);
    await ctl.addFiles([file('House Mix.mp3'), file('rap jam.mp3'), file('cover.txt')]);
    expect(lib.countLabel('house')).toBe('1/22');
    expect(lib.countLabel('rap')).toBe('1/13');
    expect(JSON.stringify(storage.data)).not.toContain('blob:');
    // next session
    const lib2 = new Library(storage);
    expect(lib2.countLabel('house')).toBe('1/22');
    expect(lib2.playableCount('house')).toBe(0);
    await new LibraryController(lib2, { handles: memoryHandleStore(), importDeps, win: {} }).addFiles([file('House Mix.mp3')]);
    expect(lib2.playableCount('house')).toBe(1);
  });

  it('reset clears library, storage and the remembered folder', async () => {
    const root = tree();
    const handles = memoryHandleStore();
    const storage = memStorage();
    const lib = new Library(storage);
    const ctl = new LibraryController(lib, { handles, importDeps, win: { showDirectoryPicker: async () => root } });
    await ctl.chooseFolder();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    await ctl.reset();
    revoke.mockRestore();
    expect(lib.size).toBe(0);
    expect(storage.data).toBeNull();
    expect(await handles.get()).toBeNull();
    expect(ctl.hasFolder).toBe(false);
    expect(ctl.status).toBe('none');
  });
});
