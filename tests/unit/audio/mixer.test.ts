import { describe, it, expect, vi } from 'vitest';
import { Mixer, taper, storedMusicGain, MIX_KEY } from '@/audio/Mixer';
import { AudioSystem } from '@/audio/AudioSystem';
import { EventBus } from '@/core/Events';

const mem = (init: Record<string, string> = {}) => { const d = { ...init }; return { d, getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; } }; };

class P { targets: number[] = []; value = 0; setValueAtTime(v: number) { this.value = v; } linearRampToValueAtTime(v: number) { this.value = v; } exponentialRampToValueAtTime(v: number) { this.value = v; } setTargetAtTime(v: number) { this.value = v; this.targets.push(v); } cancelScheduledValues() {} }
class N { out: unknown[] = []; connect(d: unknown) { this.out.push(d); return d; } disconnect() {} start() {} stop() {} }
class G extends N { gain = new P(); }
class F extends N { type = 'lowpass'; frequency = new P(); Q = new P(); }
class O extends N { type = 'sine'; frequency = new P(); }
function rig() {
  const gains: G[] = [];
  const dest = new N();
  const ctx = {
    currentTime: 0, sampleRate: 8000, destination: dest, state: 'running', resume: vi.fn(async () => undefined), suspend: vi.fn(async () => undefined),
    createOscillator: () => new O(), createGain: () => { const g = new G(); gains.push(g); return g; }, createBiquadFilter: () => new F(),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }), createBufferSource: () => Object.assign(new N(), { buffer: null, loop: false }),
  };
  const mixer = new Mixer(mem());
  const audio = new AudioSystem(new EventBus(), () => ctx as unknown as AudioContext, { mixer });
  const master = () => gains.find((g) => g.out.includes(dest))!;
  const buses = () => gains.filter((g) => g.out.includes(master()));
  return { audio, mixer, gains, master, buses };
}

describe('Mixer', () => {
  it('uses a squared taper', () => {
    expect(taper(0)).toBe(0); expect(taper(1)).toBe(1); expect(taper(0.5)).toBe(0.25); expect(taper(NaN)).toBe(0); expect(taper(3)).toBe(1);
    const m = new Mixer(mem()); m.set('sfx', 0.5);
    expect(m.get('sfx')).toBe(0.5); expect(m.gain('sfx')).toBe(0.25); expect(m.level('sfx')).toBe(0.25);
  });
  it('defaults to full and persists, with a safe fallback', () => {
    const s = mem();
    const a = new Mixer(s); expect(a.get('voices')).toBe(1);
    a.set('voices', 0.3); a.set('master', 0.8);
    const b = new Mixer(s); expect(b.get('voices')).toBe(0.3); expect(b.get('master')).toBe(0.8);
    expect(storedMusicGain(s)).toBeCloseTo(0.64);
    expect(new Mixer(mem({ [MIX_KEY]: '{oops' })).get('radio')).toBe(1);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    const c = new Mixer(broken); c.set('radio', 0.2); expect(c.get('radio')).toBe(0.2);
    expect(new Mixer(null).get('master')).toBe(1);
  });
  it('notifies only on a real change', () => {
    const m = new Mixer(mem()); const f = vi.fn(); m.onChange(f);
    m.set('radio', 1); expect(f).not.toHaveBeenCalled();
    m.set('radio', 0.5); expect(f).toHaveBeenCalledWith('radio');
  });
});

describe('Mixer migration', () => {
  it('starts from the old menu Master and Radio once', () => {
    const s = mem({ 'gta-bedstuy.settings.v1': JSON.stringify({ master: 0.25, radio: 0.64 }) });
    const m = new Mixer(s);
    expect(m.get('master')).toBeCloseTo(0.5); expect(m.gain('master')).toBeCloseTo(0.25); expect(m.get('radio')).toBeCloseTo(0.8);
    expect(s.d[MIX_KEY]).toBeDefined();
    s.d['gta-bedstuy.settings.v1'] = JSON.stringify({ master: 1 });
    expect(new Mixer(s).get('master')).toBeCloseTo(0.5); // mixer value wins
  });
});

describe('Mixer reaches the buses', () => {
  it('each slider ramps its own bus once per change', async () => {
    const { audio, mixer, master, buses } = rig();
    await audio.start();
    mixer.set('sfx', 0.5); mixer.set('voices', 0.6); mixer.set('ambience', 0.7); mixer.set('master', 0.4);
    const last = buses().map((b) => b.gain.targets.at(-1)).filter((v) => v !== undefined);
    expect(last).toEqual(expect.arrayContaining([0.25, 0.36, 0.49].map((x) => expect.closeTo(x, 6))));
    expect(master().gain.targets.at(-1)).toBeCloseTo(0.16);
    const sfx = buses().find((b) => b.gain.targets.at(-1) === 0.25)!;
    expect(sfx.gain.targets).toHaveLength(1); // one ramp, not one per frame
    audio.update(0.016); audio.update(0.016);
    expect(sfx.gain.targets).toHaveLength(1);
  });
  it('the SoundCloud and live volume is sent only when it changes', async () => {
    const { audio, mixer } = rig();
    const spy = vi.spyOn((audio as unknown as { radio: { setScVolume(v: number): void } }).radio, 'setScVolume');
    await audio.start();
    spy.mockClear();
    mixer.set('radio', 0.5);
    expect(spy).toHaveBeenCalledTimes(1); expect(spy).toHaveBeenLastCalledWith(0.25);
    mixer.set('sfx', 0.2); mixer.set('radio', 0.5); audio.setRadioVolume(0.5);
    expect(spy).toHaveBeenCalledTimes(1);
    mixer.set('master', 0.5);
    expect(spy).toHaveBeenCalledTimes(2); expect(spy).toHaveBeenLastCalledWith(0.06);
  });
});
