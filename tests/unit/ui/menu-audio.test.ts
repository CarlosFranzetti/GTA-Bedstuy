// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Menu } from '@/ui/Menu';
import { Mixer } from '@/audio/Mixer';

describe('Menu Audio group', () => {
  let parent: HTMLElement;
  beforeEach(() => { parent = document.createElement('div'); document.body.appendChild(parent); });
  afterEach(() => { parent.remove(); });
  const row = (m: Menu, id: string) => m.root.querySelector<HTMLElement>(`.gp-pane-settings .gp-list [data-id="${id}"]`)!;
  const val = (m: Menu, id: string) => row(m, id).querySelector('.gp-text')?.textContent;

  it('shows the five sliders with a mixer and drives it on Apply', () => {
    const mixer = new Mixer(null); const cb = { onMasterVolume: vi.fn(), onRadioVolume: vi.fn() };
    const menu = new Menu(parent, cb, { storage: null, mixer });
    for (const id of ['master', 'radiovol', 'sfxvol', 'voicevol', 'ambvol']) { expect(row(menu, id).hidden).toBe(false); expect(val(menu, id)).toContain('100%'); }
    expect(row(menu, 'sfxvol').textContent).toContain('Sound Effects');
    menu.open();
    for (let i = 0; i < 80 && menu.root.querySelector<HTMLElement>('.gp-pane-settings .gp-row.hi')?.dataset.id !== 'voicevol'; i++) menu.navigate('down');
    menu.navigate('left');
    expect(val(menu, 'voicevol')).toContain('95%');
    expect(mixer.get('voices')).toBeCloseTo(0.95); // live, before any Apply
    expect(menu.pendingCount).toBe(0);
    expect(cb.onMasterVolume).not.toHaveBeenCalled();
  });
  it('has an Engine Sound row: 100% by default, steps of 5, Off at 0, applied live to the mixer (AUDIOFIX)', () => {
    const mixer = new Mixer(null);
    const menu = new Menu(parent, {}, { storage: null, mixer });
    expect(row(menu, 'enginevol').hidden).toBe(false);
    expect(row(menu, 'enginevol').textContent).toContain('Engine Sound');
    expect(val(menu, 'enginevol')).toContain('100%');
    menu.open();
    for (let i = 0; i < 80 && menu.root.querySelector<HTMLElement>('.gp-pane-settings .gp-row.hi')?.dataset.id !== 'enginevol'; i++) menu.navigate('down');
    menu.navigate('left');
    expect(val(menu, 'enginevol')).toContain('95%');
    expect(mixer.get('engine')).toBeCloseTo(0.95);
    for (let i = 0; i < 19; i++) menu.navigate('left');
    expect(val(menu, 'enginevol')).toContain('Off');
    expect(mixer.get('engine')).toBe(0);
  });
  it('without a mixer only Master and Radio show', () => {
    const menu = new Menu(parent, {}, { storage: null });
    expect(row(menu, 'master').hidden).toBe(false);
    for (const id of ['sfxvol', 'enginevol', 'voicevol', 'ambvol']) expect(row(menu, id).hidden).toBe(true);
  });
});
