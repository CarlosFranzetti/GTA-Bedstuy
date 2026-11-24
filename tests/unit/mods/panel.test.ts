// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { ModsPanel } from '@/ui/ModsPanel';
import { ModRegistry } from '@/mods/registry';
import { PanelManager } from '@/ui/PanelManager';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import { carDff } from './carFixture';

const flush = async (n = 30): Promise<void> => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('ModsPanel', () => {
  it('opens and closes through the PanelManager with no Esc handler of its own', () => {
    const reg = new ModRegistry({ tier: 'high' });
    const parent = document.createElement('div'); document.body.append(parent);
    const mgr = new PanelManager(document);
    const panel = new ModsPanel(parent, reg, { vehicleTypes: Object.keys(VEHICLE_SPECS), onToggle: () => mgr.sync() });
    mgr.register({ id: 'mods', isOpen: () => panel.isOpen, close: () => panel.close(), back: () => panel.back() });
    expect(panel.root.hidden).toBe(true);
    panel.open();
    expect(mgr.top).toBe('mods');
    expect(panel.root.textContent).toContain('No mods installed');
    expect(panel.root.textContent).toContain('nothing is uploaded');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    expect(panel.isOpen).toBe(false);
    expect(mgr.escHandled).toBe(1);
    mgr.dispose();
  });

  it('asks which slot a plain dropped file is for, then installs it', async () => {
    const reg = new ModRegistry({ tier: 'high' });
    const parent = document.createElement('div'); document.body.append(parent);
    const onChange = vi.fn();
    const panel = new ModsPanel(parent, reg, { vehicleTypes: Object.keys(VEHICLE_SPECS), onChange });
    panel.open();
    const bytes = carDff();
    const file = { name: 'car.dff', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as File;
    const input = panel.root.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    const sel = panel.root.querySelector('.md-assign select') as HTMLSelectElement;
    expect(sel).not.toBeNull();
    expect(Array.from(sel.options).some((o) => o.value === 'vehicle:sedan')).toBe(true);
    sel.value = 'vehicle:sedan';
    (Array.from(panel.root.querySelectorAll('button')).find((b) => b.textContent === 'Install') as HTMLButtonElement).click();
    await flush();
    expect(reg.vehicleSource('sedan')).not.toBeNull();
    expect(onChange).toHaveBeenCalled();
    expect(panel.root.textContent).toContain('is installed');
    expect(panel.root.textContent).toContain('vehicle:sedan');
    (Array.from(panel.root.querySelectorAll('button')).find((b) => b.textContent === 'Remove') as HTMLButtonElement).click();
    await flush();
    expect(reg.vehicleSource('sedan')).toBeNull();
  });
});
