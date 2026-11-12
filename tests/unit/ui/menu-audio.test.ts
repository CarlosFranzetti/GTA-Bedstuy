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
    menu.root.querySelector<HTMLButtonElement>('.gp-act-apply')!.click();
    expect(mixer.get('voices')).toBeCloseTo(0.95);
    expect(cb.onMasterVolume).not.toHaveBeenCalled();
  });
  it('without a mixer only Master and Radio show', () => {
    const menu = new Menu(parent, {}, { storage: null });
    expect(row(menu, 'master').hidden).toBe(false);
    for (const id of ['sfxvol', 'voicevol', 'ambvol']) expect(row(menu, id).hidden).toBe(true);
  });
});
