/**
 * Settings, Game, "Intimate scenes: On / Off" (default On), for the Pedro Martinez story. Stored like Blood (`combat/blood.ts`): localStorage
 * when it is there, in memory when it is not. Off turns every intimate beat into a plain fade (DateSession's `intimate` flag). Either way a date's
 * warm ending is suggestive and never explicit: a cut-away line and a morning after; nothing is drawn.
 * The bridge host reads `intimateOn()`; the Settings row is `intimateRows()` for the `gameRows` list in main.ts.
 */
import type { RowSpec } from '../menuRows';

const KEY = 'gta-bedstuy.intimate.v1';
let setting = true;
let loaded = false;
const listeners = new Set<(on: boolean) => void>();

export function intimateOn(): boolean {
  if (!loaded) {
    loaded = true;
    try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; if (v === '0') setting = false; } catch { /* storage may be blocked */ }
  }
  return setting;
}
export function setIntimate(on: boolean): void {
  loaded = true; setting = on;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  for (const l of listeners) l(on);
}
export function onIntimateChange(fn: (on: boolean) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
/** Test hook: forget the cached value so the next read goes to storage again. */
export function resetIntimateCache(): void { loaded = false; setting = true; }

export function intimateRows(): RowSpec[] {
  return [{
    id: 'intimate', label: 'Intimate scenes', kind: 'toggle', def: () => true,
    desc: 'On: a date that goes well ends in a suggestive cut-away (a closing door, a line, the morning after). Off: a plain fade to the next morning. Nothing explicit is ever shown either way. Adults only.',
    get: () => intimateOn(), set: ((v: boolean) => setIntimate(v)) as RowSpec['set'],
  }];
}
