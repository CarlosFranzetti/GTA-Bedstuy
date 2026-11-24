/**
 * The one entry the game loads (lazily, hosted builds only): `const { startMods } = await import('@/mods/boot')`.
 * Builds the registry on this device's storage, restores what the player installed, applies it, and makes the Mods panel.
 * Never throws: a failure here leaves the stock game running.
 */
import type { PanelManager } from '@/ui/PanelManager';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { ModsPanel } from '@/ui/ModsPanel';
import type { ModTier } from './limits';
import { ModRegistry, type ModTarget } from './registry';
import { defaultStore } from './store';

export interface StartModsOptions {
  tier: ModTier;
  overlay: HTMLElement;
  panels: PanelManager;
  /** `Vehicle.sources` and the material library */
  target: ModTarget;
  /** milliseconds to wait for stored mods at boot before carrying on without them (default 6000) */
  restoreTimeoutMs?: number;
  /** ?mods=off: load nothing; the panel only offers to clear the device's mods */
  safe?: boolean;
}

export interface ModsApi { registry: ModRegistry; panel: ModsPanel; open(): void }

export async function startMods(o: StartModsOptions): Promise<ModsApi | null> {
  try {
    const registry = new ModRegistry({ tier: o.tier, store: defaultStore() });
    const apply = (): void => { try { registry.applyTo(o.target); } catch (e) { console.warn('[mods] could not apply', e); } };
    const panel = new ModsPanel(o.overlay, registry, {
      vehicleTypes: Object.keys(VEHICLE_SPECS),
      onToggle: () => o.panels.sync(),
      onChange: apply,
      safeMode: o.safe,
    });
    o.panels.register({ id: 'mods', isOpen: () => panel.isOpen, close: () => panel.close(), back: () => panel.back() });
    if (o.safe) return { registry, panel, open: () => panel.open() };
    const restoring = registry.restore().then(apply, (e) => console.warn('[mods] restore failed', e));
    await Promise.race([restoring, new Promise((r) => setTimeout(r, o.restoreTimeoutMs ?? 6000))]);
    return { registry, panel, open: () => panel.open() };
  } catch (e) {
    console.warn('[mods] disabled', e);
    return null;
  }
}
