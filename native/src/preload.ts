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
