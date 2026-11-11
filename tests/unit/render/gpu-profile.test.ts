/** Default tier per device over recorded WebGL renderer strings (Chrome/ANGLE, Safari, Firefox) + context-loss guard. */
import { describe, it, expect } from 'vitest';
import { classifyGpu, detectOs, profilePixelRatio, type GpuInfo } from '@/render/GpuProfile';
import { ContextGuard } from '@/render/ContextGuard';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const mac = (renderer: string, cores = 10, mem = 8): GpuInfo => ({ renderer, userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0, cores, memoryGB: mem });
const win = (renderer: string, cores = 12, mem = 8): GpuInfo => ({ renderer, userAgent: WIN, platform: 'Win32', maxTouchPoints: 0, cores, memoryGB: mem });

describe('classifyGpu: recorded renderer strings', () => {
  const cases: Array<[string, GpuInfo, string, number]> = [
    ['M1 Chrome', mac('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 8), 'high', 1.5],
    ['M2 Pro Chrome', mac('ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)', 12), 'high', 1.75],
    ['M3 Firefox', mac('Apple M3', 8), 'high', 1.5],
    ['M4 Chrome', mac('ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)', 10), 'high', 1.75],
    ['M4 Max Chrome', mac('ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)', 16), 'high', 1.75],
    ['Safari masked Apple GPU on a Mac', mac('Apple GPU', 10), 'high', 1.75],
    ['Intel Mac Iris Plus', mac('ANGLE (Intel Inc., ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics 655, Unspecified Version)', 8), 'medium', 1.25],
    ['Intel Mac + Radeon Pro 5500M', mac('ANGLE (AMD, ANGLE Metal Renderer: AMD Radeon Pro 5500M, Unspecified Version)', 12), 'high', 1.75],
    ['Intel UHD 620', win('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 8), 'low', 1],
    ['Intel Iris Xe', win('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'medium', 1.25],
    ['Intel Arc A770', win('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 16), 'high', 1.75],
    ['NVIDIA RTX 4070', win('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)', 16), 'high', 1.75],
    ['NVIDIA GTX 1650', win('ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'medium', 1.5],
    ['NVIDIA GTX 1070', win('ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'high', 1.75],
    ['NVIDIA MX150', win('ANGLE (NVIDIA, NVIDIA GeForce MX150 Direct3D11 vs_5_0 ps_5_0, D3D11)', 8), 'medium', 1.5],
    ['AMD RX 6700 XT', win('ANGLE (AMD, AMD Radeon RX 6700 XT (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 16), 'high', 1.75],
    ['AMD RX 580', win('ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'medium', 1.5],
    ['AMD 780M iGPU', win('ANGLE (AMD, AMD Radeon(TM) 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 16), 'medium', 1.25],
    ['Snapdragon X Windows', win('ANGLE (Qualcomm, Adreno(TM) X1-85 GPU (0x36334330) Direct3D11 vs_5_0 ps_5_0, D3D11)', 12), 'medium', 1.5],
    ['SwiftShader', win('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 4), 'low', 1],
    ['unknown renderer', win('Totally New GPU 9000'), 'medium', 1.5],
    ['no renderer (blocked)', win(''), 'medium', 1.5],
  ];
  for (const [name, info, tier, dpr] of cases) {
    it(`${name} -> ${tier}, pixel ratio <= ${dpr}`, () => {
      const p = classifyGpu(info);
      expect(p.tier).toBe(tier);
      expect(p.maxPixelRatio).toBe(dpr);
      expect(p.contextAttributes.antialias).toBe(false);
    });
  }

  it('desktop requests the high-performance GPU; phones do not', () => {
    expect(classifyGpu(mac('Apple M4')).contextAttributes.powerPreference).toBe('high-performance');
    expect(classifyGpu(win('NVIDIA GeForce RTX 3060')).contextAttributes.powerPreference).toBe('high-performance');
    expect(classifyGpu({ renderer: 'Apple GPU', userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }).contextAttributes.powerPreference).toBe('default');
  });

  it('SMAA is on for Apple Silicon and discrete GPUs and off for low / software', () => {
    expect(classifyGpu(mac('Apple M4')).smaa).toBe(true);
    expect(classifyGpu(win('NVIDIA GeForce RTX 3060')).smaa).toBe(true);
    expect(classifyGpu(win('Intel(R) UHD Graphics 620')).smaa).toBe(false);
  });

  it('phones stay on the phone tier: iPhone, Android Adreno / Mali, iPad (also in desktop mode)', () => {
    const phones: GpuInfo[] = [
      { renderer: 'Apple GPU', userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5, cores: 6 },
      { renderer: 'Apple A15 GPU', userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 },
      { renderer: 'Apple GPU', userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5, cores: 8 },
      { renderer: 'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)', userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 },
      { renderer: 'Mali-G78', userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 },
    ];
    for (const i of phones) { const p = classifyGpu(i); expect(p.tier).toBe('phone'); expect(p.maxPixelRatio).toBe(1); expect(p.maxBufferWidth).toBe(720); }
  });

  it('a Windows touch-screen laptop is still a desktop (touch points alone do not make it a phone)', () => {
    const p = classifyGpu({ ...win('ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Direct3D11 vs_5_0 ps_5_0, D3D11)'), maxTouchPoints: 10 });
    expect(p.os).toBe('windows'); expect(p.tier).toBe('high');
  });

  it('few cores or little memory never start on high', () => {
    expect(classifyGpu(win('NVIDIA GeForce RTX 3060', 2, 8)).tier).toBe('medium');
    expect(classifyGpu(win('NVIDIA GeForce RTX 3060', 8, 2)).tier).toBe('medium');
  });

  it('detectOs', () => {
    expect(detectOs({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe('mac');
    expect(detectOs({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios');
    expect(detectOs({ userAgent: WIN, platform: 'Win32', maxTouchPoints: 0 })).toBe('windows');
    expect(detectOs({ userAgent: 'X11; Linux x86_64', platform: 'Linux x86_64' })).toBe('linux');
  });
});

describe('profilePixelRatio', () => {
  it('Retina DPR 2 on a 1512 px laptop lands on the profile cap, a 5K display is held by the buffer width', () => {
    const m4 = classifyGpu(mac('Apple M4'));
    expect(profilePixelRatio(1.75, m4, 1512)).toBe(1.75);
    const m1 = classifyGpu(mac('Apple M1', 8));
    expect(profilePixelRatio(1.75, m1, 1512)).toBe(1.5);
    expect(profilePixelRatio(1.75, m4, 2560) * 2560).toBeLessThanOrEqual(3840);
    expect(profilePixelRatio(1.75, m4, 3840) * 3840).toBeLessThanOrEqual(3840 + 1);
  });
});

describe('ContextGuard', () => {
  class Tgt { l = new Map<string, Array<(e: Event) => void>>();
    addEventListener(t: string, f: (e: Event) => void): void { (this.l.get(t) ?? this.l.set(t, []).get(t)!).push(f); }
    removeEventListener(t: string, f: (e: Event) => void): void { this.l.set(t, (this.l.get(t) ?? []).filter((x) => x !== f)); }
    fire(t: string): { prevented: boolean } { const e = { prevented: false, preventDefault() { this.prevented = true; } }; for (const f of this.l.get(t) ?? []) f(e as unknown as Event); return e; } }

  it('prevents default on loss (so the browser restores), pauses rendering, then asks for a refresh on restore', () => {
    const t = new Tgt(); const log: string[] = [];
    const g = new ContextGuard(t as never, { onLost: () => log.push('lost'), onRestored: () => log.push('restored') });
    expect(g.isLost).toBe(false);
    expect(t.fire('webglcontextlost').prevented).toBe(true);
    expect(g.isLost).toBe(true);
    t.fire('webglcontextlost'); // duplicate event
    t.fire('webglcontextrestored');
    expect(g.isLost).toBe(false);
    expect(log).toEqual(['lost', 'restored']);
    expect(g.lostCount).toBe(1); expect(g.restoredCount).toBe(1);
  });

  it('gives up after the timeout if no restore comes, and not after a restore', () => {
    const t = new Tgt(); let fn: (() => void) | null = null; const log: string[] = [];
    const g = new ContextGuard(t as never, { onGiveUp: () => log.push('giveup'), giveUpMs: 5000, setTimer: (f) => { fn = f; return 1; }, clearTimer: () => { fn = null; } });
    t.fire('webglcontextlost'); fn!(); expect(log).toEqual(['giveup']);
    t.fire('webglcontextrestored'); t.fire('webglcontextlost'); t.fire('webglcontextrestored');
    expect(fn).toBeNull(); expect(g.restoredCount).toBe(2);
  });
});

describe('native app hint', () => {
  it('Electron on a Mac arm64 and on Windows is a desktop with the high-performance GPU, whatever the touch points', () => {
    const el = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) gta/1.0 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36';
    const p = classifyGpu({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)', userAgent: el, platform: 'MacIntel', maxTouchPoints: 5, cores: 12 });
    expect(p.native).toBe(true); expect(p.os).toBe('mac'); expect(p.tier).toBe('high'); expect(p.contextAttributes.powerPreference).toBe('high-performance');
    const w = classifyGpu({ ...win('ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)'), native: true });
    expect(w.native).toBe(true); expect(w.tier).toBe('high');
    expect(classifyGpu(win('NVIDIA GeForce RTX 4060')).native).toBe(false);
  });
});

import { describeGfx, gfxDebugRequested, flagToggle } from '@/render/GfxDebug';
describe('gfx debug overlay model', () => {
  it('?debug=gfx is the only trigger; the report lists renderer, tier, dpr, passes and what is switched off', () => {
    expect(gfxDebugRequested('?debug=gfx')).toBe(true);
    expect(gfxDebugRequested('?debug=1')).toBe(false);
    let bloom = true;
    const lines = describeGfx({
      rendererString: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)', profile: classifyGpu(mac('Apple M4')),
      tier: () => 'high', pixelRatio: () => 1.75, bufferSize: () => ({ w: 2646, h: 1708 }), activePasses: () => ['RenderPass', 'GTAOPass'],
      toggles: [flagToggle('bloom', 'Bloom', () => bloom, (o) => { bloom = o; })],
    }).join('\n');
    expect(lines).toContain('Apple M4'); expect(lines).toContain('dpr 1.75'); expect(lines).toContain('RenderPass > GTAOPass'); expect(lines).toContain('switched off: nothing');
    bloom = false;
    expect(describeGfx({ rendererString: '', profile: classifyGpu(mac('Apple M4')), tier: () => 'high', pixelRatio: () => 1, bufferSize: () => ({ w: 1, h: 1 }), activePasses: () => [], toggles: [flagToggle('bloom', 'Bloom', () => bloom, (o) => { bloom = o; })] }).join('\n')).toContain('switched off: bloom');
  });
});
