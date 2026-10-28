/**
 * Mission progress persistence: one small JSON under its own localStorage key. Every access is wrapped in
 * try/catch (blocked or full storage just means nothing persists). If the SaveState lane wants a single store,
 * `saveMissionData` / `loadMissionData` can be folded into src/ui/SaveState.ts unchanged.
 */
import type { MissionSave } from './types';

export const MISSION_SAVE_KEY = 'gta-bedstuy.missions.v1';

function store(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function saveMissionData(save: MissionSave): void {
  try { store()?.setItem(MISSION_SAVE_KEY, JSON.stringify(save)); } catch { /* quota / blocked */ }
}

/** Raw parsed save (or null). Pass it to `MissionSystem.restore`, which validates it. */
export function loadMissionData(): unknown {
  try {
    const raw = store()?.getItem(MISSION_SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearMissionData(): void {
  try { store()?.removeItem(MISSION_SAVE_KEY); } catch { /* ignore */ }
}
