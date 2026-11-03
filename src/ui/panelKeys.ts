/**
 * Shared plumbing for the full-screen interior panels (shop, decks): body classes so CSS, the harness and tests can
 * tell a panel is open, a touch-friendly key map, and a gamepad-direction type.
 */
import type { NavDir } from '@/core/Gamepad';

export type { NavDir };

/** Marks `<body>` while a panel is open: `ui-panel-open` plus a panel-specific class (`shop-open`, `dj-open`). */
export function setPanelClass(doc: Document, name: string, open: boolean): void {
  const cl = doc.body?.classList;
  if (!cl) return;
  cl.toggle(name, open);
  const any = [...cl].some((c) => c === 'shop-open' || c === 'dj-open');
  cl.toggle('ui-panel-open', any);
}

/** Keys that leave a panel, any layout: Escape, X, B, Backspace. */
export function isCloseKey(e: Pick<KeyboardEvent, 'code' | 'key'>): boolean {
  return e.code === 'Escape' || e.key === 'Escape' || e.code === 'KeyX' || e.code === 'KeyB' || e.code === 'Backspace';
}

/** Direction for a navigation key (arrows and WASD), or null. */
export function navDirOf(e: Pick<KeyboardEvent, 'code' | 'key'>): NavDir | null {
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    default: break;
  }
  switch (e.key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    default: return null;
  }
}

export function isConfirmKey(e: Pick<KeyboardEvent, 'code' | 'key'>): boolean {
  return e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyF' || e.key === 'Enter' || e.key === ' ';
}

/**
 * While the mouse is captured (pointer lock) every click lands on the canvas, so panel buttons cannot be clicked.
 * Releases the lock when a panel opens. The pause menu must not pop up for this unlock: Menu ignores
 * `pointerlockchange` while `<body>` carries `ui-panel-open` (see the FOR FABLE note); hence opt-in.
 */
export function releasePointerLock(doc: Document): void {
  try { if (doc.pointerLockElement) doc.exitPointerLock(); } catch { /* unsupported */ }
}
