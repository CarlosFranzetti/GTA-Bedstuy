// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Menu, SETTINGS_KEY } from '@/ui/Menu';
import { Mixer } from '@/audio/Mixer';

function memStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

describe('Menu Audio group', () => {
  let parent: HTMLElement;
  beforeEach(() => { parent = document.createElement('div'); document.body.appendChild(parent); });
  afterEach(() => { parent.remove(); document.body.className = ''; });
  const row = (m: Menu, id: string) => m.root.querySelector<HTMLElement>(`.gp-pane-settings .gp-list [data-id="${id}"]`)!;
  const val = (m: Menu, id: string) => row(m, id).querySelector('.gp-text')?.textContent;
  const hiId = (m: Menu) => m.root.querySelector<HTMLElement>('.gp-pane-settings .gp-row.hi')?.dataset.id;
  const goto = (m: Menu, id: string) => { for (let i = 0; i < 80 && hiId(m) !== id; i++) m.navigate('down'); };

  it('shows the five sliders with a mixer and drives it at once', () => {
    const mixer = new Mixer(null); const cb = { onMasterVolume: vi.fn(), onRadioVolume: vi.fn() };
    const menu = new Menu(parent, cb, { storage: null, mixer });
    menu.open(); menu.showGroup('audio');
    for (const id of ['master', 'radiovol', 'sfxvol', 'voicevol', 'ambvol']) { expect(row(menu, id).hidden).toBe(false); expect(val(menu, id)).toContain('100%'); }
    expect(row(menu, 'sfxvol').textContent).toContain('Sound Effects');
    goto(menu, 'voicevol');
    menu.navigate('left');
    expect(val(menu, 'voicevol')).toContain('95%');
    expect(mixer.get('voices')).toBeCloseTo(0.95);
    expect(cb.onMasterVolume).not.toHaveBeenCalled();
  });

  it('has an Engine sound On / Off switch directly above the Engine Sound slider (owner, 22 Nov)', () => {
    const mixer = new Mixer(null);
    const menu = new Menu(parent, {}, { storage: null, mixer });
    menu.open(); menu.showGroup('audio');
    const ids = [...menu.root.querySelectorAll<HTMLElement>('.gp-pane-settings .gp-row')].filter((r) => !r.hidden).map((r) => r.dataset.id);
    expect(ids.indexOf('enginevol') - ids.indexOf('engineon')).toBe(1);
    expect(row(menu, 'engineon').querySelector('.gp-lab')!.textContent).toBe('Engine sound');
    expect(val(menu, 'engineon')).toBe('ON');
  });

  it('Off sets the engine slider to 0 (no engine voice is created); On brings back the level it had', () => {
    const mixer = new Mixer(null);
    const store = memStore();
    const menu = new Menu(parent, {}, { storage: store, mixer });
    menu.open(); menu.showGroup('audio');
    goto(menu, 'enginevol');
    for (let i = 0; i < 8; i++) menu.navigate('left'); // 60%
    expect(mixer.get('engine')).toBeCloseTo(0.6);
    row(menu, 'engineon').click(); // one click: Off
    expect(mixer.get('engine')).toBe(0);
    expect(val(menu, 'engineon')).toBe('OFF');
    expect(val(menu, 'enginevol')).toBe('Off');
    expect(JSON.parse(store.data[SETTINGS_KEY]).engineLast).toBeCloseTo(0.6);
    row(menu, 'engineon').click(); // one click: On, back to 60%
    expect(mixer.get('engine')).toBeCloseTo(0.6);
    expect(val(menu, 'engineon')).toBe('ON');
    expect(val(menu, 'enginevol')).toContain('60%');
  });

  it('On with nothing remembered restores the default level (100% on the slider, the engine bus at 0.55)', () => {
    const mixer = new Mixer(null);
    mixer.set('engine', 0);
    const menu = new Menu(parent, {}, { storage: null, mixer });
    menu.open(); menu.showGroup('audio');
    expect(val(menu, 'engineon')).toBe('OFF');
    row(menu, 'engineon').click();
    expect(mixer.get('engine')).toBe(1);
  });

  it('dragging the slider to 0 turns the switch Off, and a saved level survives a restart', () => {
    const mixer = new Mixer(null);
    const store = memStore({ [SETTINGS_KEY]: JSON.stringify({ engineLast: 0.35 }) });
    const menu = new Menu(parent, {}, { storage: store, mixer });
    menu.open(); menu.showGroup('audio');
    mixer.set('engine', 0);
    menu.showGroup('audio'); // re-read
    expect(val(menu, 'engineon')).toBe('OFF');
    row(menu, 'engineon').click();
    expect(mixer.get('engine')).toBeCloseTo(0.35);
  });

  it('the slider still steps in 5s and reads Off at 0', () => {
    const mixer = new Mixer(null);
    const menu = new Menu(parent, {}, { storage: null, mixer });
    menu.open(); menu.showGroup('audio');
    expect(val(menu, 'enginevol')).toContain('100%');
    goto(menu, 'enginevol');
    menu.navigate('left');
    expect(val(menu, 'enginevol')).toContain('95%');
    expect(mixer.get('engine')).toBeCloseTo(0.95);
    for (let i = 0; i < 19; i++) menu.navigate('left');
    expect(val(menu, 'enginevol')).toContain('Off');
    expect(mixer.get('engine')).toBe(0);
  });

  it('without a mixer only Master and Radio show, and there is no engine switch', () => {
    const menu = new Menu(parent, {}, { storage: null });
    menu.open(); menu.showGroup('audio');
    expect(row(menu, 'master').hidden).toBe(false);
    for (const id of ['sfxvol', 'enginevol', 'engineon', 'voicevol', 'ambvol']) expect(row(menu, id).hidden).toBe(true);
  });
});
