// Sandboxed preload: self-contained (a sandboxed preload may only require 'electron').
import { contextBridge, ipcRenderer } from 'electron';

const version = ipcRenderer.sendSync('gta:version') as string;
contextBridge.exposeInMainWorld('gtaNative', {
  isNative: true,
  platform: process.platform,
  version,
  setFullscreen: (on: boolean) => { ipcRenderer.send('gta:fullscreen', !!on); },
  quit: () => { ipcRenderer.send('gta:quit'); },
  /** Opens a native save dialog and writes text. Resolves true if saved. */
  saveFile: (suggestedName: string, text: string): Promise<boolean> =>
    ipcRenderer.invoke('gta:save-file', String(suggestedName).slice(0, 120), String(text)),
});

// Saves live in localStorage. Keep a copy in the user data folder (main process) and bring it back if the storage is empty.
try {
  if (localStorage.length === 0) {
    const snap = ipcRenderer.sendSync('gta:storage-load') as Record<string, string> | null;
    if (snap) for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
  }
} catch { /* storage blocked: the game copes without it */ }
let lastDump = '';
const dump = (): void => {
  try {
    const o: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== null) o[k] = localStorage.getItem(k) ?? ''; }
    const j = JSON.stringify(o);
    if (j !== lastDump && j !== '{}') { lastDump = j; ipcRenderer.send('gta:storage-save', o); }
  } catch { /* ignore */ }
};
setInterval(dump, 15000);
addEventListener('pagehide', dump);
addEventListener('beforeunload', dump);
