/**
 * Navigation targets the player can pick when no mission is active (H6 P1: a new player never found HOME). The HUD pointer
 * (MissionHud) aims at the selected one instead of the nearest mission offer, and the minimap (ui/Minimap) marks them all
 * and rings the selected one. Selection is one tiny shared store so the two views agree without extra wiring.
 * Pure: no DOM, no three.js. Door positions come from the interior definitions, so they cannot drift from the real doors.
 */
import { INTERIORS, doorTrigger, type InteriorId } from '@/world/interiors/defs';

export interface NavTarget { id: InteriorId; label: string; x: number; z: number; radius: number }

/** HOME first (the default pick), then the deli. The club is not listed: its door is a secret until the story reveals it. */
export const NAV_TARGETS: readonly NavTarget[] = (['home', 'deli'] as const).map((id) => {
  const def = INTERIORS[id];
  const t = doorTrigger(def);
  return { id, label: def.name, x: t.x, z: t.z, radius: 2.5 };
});

let selected: InteriorId | null = null;
const listeners = new Set<() => void>();

export const getNavTarget = (): NavTarget | null => NAV_TARGETS.find((t) => t.id === selected) ?? null;

export function setNavTarget(id: InteriorId | null): void {
  const next = id !== null && NAV_TARGETS.some((t) => t.id === id) ? id : null;
  if (next === selected) return;
  selected = next;
  for (const fn of listeners) fn();
}

/** Off -> HOME -> WAX DELI -> off. Returns the new selection. */
export function cycleNavTarget(): NavTarget | null {
  const i = selected === null ? -1 : NAV_TARGETS.findIndex((t) => t.id === selected);
  setNavTarget(i + 1 >= NAV_TARGETS.length ? null : NAV_TARGETS[i + 1].id);
  return getNavTarget();
}

export function onNavTargetChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
