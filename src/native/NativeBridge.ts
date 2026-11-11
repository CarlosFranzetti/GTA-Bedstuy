/**
 * Feature-detected bridge to the desktop shell (native/). Everything here is a no-op in a normal browser.
 * The shell's preload exposes window.gtaNative; see native/src/preload.ts and docs/NATIVE.md.
 */
export interface GtaNative {
  isNative: true;
  platform: string;
  version: string;
  setFullscreen(on: boolean): void;
  quit(): void;
  saveFile(suggestedName: string, text: string): Promise<boolean>;
}

export function nativeShell(): GtaNative | null {
  const n = (globalThis as { gtaNative?: GtaNative }).gtaNative;
  return n?.isNative ? n : null;
}
export const isNativeApp = (): boolean => nativeShell() !== null;

/** Apple Silicon Macs and Windows PCs run the bundled Chromium with a real GPU: hint the device tier to "high". */
export function nativeTierHint(): 'high' | null {
  const n = nativeShell();
  return n && (n.platform === 'darwin' || n.platform === 'win32') ? 'high' : null;
}

/** Quit entry for the pause menu: returns null in a browser so the row is not shown. */
export function nativeQuit(): (() => void) | null {
  const n = nativeShell();
  return n ? () => n.quit() : null;
}

/** Save a JSON string through a native dialog; false if cancelled or not native (caller falls back to a download). */
export async function exportSavesToFile(json: string, name = 'gta-bedstuy-saves.json'): Promise<boolean> {
  const n = nativeShell();
  return n ? n.saveFile(name, json) : false;
}

/** Dump all game localStorage keys (the game's saves live there) as one JSON document. */
export function collectSavesJson(storage: Pick<Storage, 'length' | 'key' | 'getItem'> = localStorage): string {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k) out[k] = storage.getItem(k); }
  return JSON.stringify({ app: 'gta-bedstuy', exported: new Date().toISOString(), data: out }, null, 1);
}
