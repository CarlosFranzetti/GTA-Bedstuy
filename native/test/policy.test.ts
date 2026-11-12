import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { buildCsp, hostAllowed, isAllowedNavigation, isAppNavigation, isExternalOpenable, loadState, mapRaApi, resolveAppPath, sanitizeState, saveState } from '../src/policy';

const root = path.resolve('/srv/web');
describe('resolveAppPath', () => {
  it('maps root and files', () => {
    expect(resolveAppPath('app://bedstuy/', root)).toBe(path.join(root, 'index.html'));
    expect(resolveAppPath('app://bedstuy/assets/a-1.js?x=1', root)).toBe(path.join(root, 'assets', 'a-1.js'));
  });
  it('blocks traversal and bad hosts', () => {
    for (const u of ['app://bedstuy/../secret', 'app://bedstuy/%2e%2e/secret', 'app://bedstuy/a/%2e%2e/%2e%2e/etc/passwd', 'app://bedstuy/..%5c..%5cx', 'app://bedstuy/a%00.js', 'app://evil/index.html', 'https://bedstuy/index.html', 'not a url']) {
      const r = resolveAppPath(u, root);
      expect(r === null || r.startsWith(root + path.sep)).toBe(true);
    }
    expect(resolveAppPath('app://bedstuy/%2e%2e/secret', root)).toBe(path.join(root, 'secret')); // normalised inside root
    expect(resolveAppPath('app://bedstuy/..%5cx', root)).toBeNull();
    expect(resolveAppPath('app://bedstuy/a%00.js', root)).toBeNull();
    expect(resolveAppPath('app://evil/index.html', root)).toBeNull();
  });
});
describe('mapRaApi', () => {
  it('maps to upstream', () => {
    expect(mapRaApi('app://bedstuy/ra-api/tracks?limit=5')).toBe('https://ra-nyc.vercel.app/api/tracks?limit=5');
  });
  it('rejects other paths, dotdot and encoded slashes', () => {
    expect(mapRaApi('app://bedstuy/other')).toBeNull();
    expect(mapRaApi('app://bedstuy/ra-api/../x')).toBeNull();
    expect(mapRaApi('app://bedstuy/ra-api/%2e%2e%2fx')).toBeNull();
    expect(mapRaApi('app://evil/ra-api/x')).toBeNull();
  });
});
describe('navigation', () => {
  it('allows app origin and soundcloud widget only', () => {
    expect(isAllowedNavigation('app://bedstuy/index.html')).toBe(true);
    expect(isAllowedNavigation('https://w.soundcloud.com/player/?url=x')).toBe(true);
    expect(isAllowedNavigation('https://evil.example/')).toBe(false);
    expect(isAllowedNavigation('file:///etc/passwd')).toBe(false);
    expect(isAllowedNavigation('app://other/')).toBe(false);
    expect(isAllowedNavigation('javascript:alert(1)')).toBe(false);
  });
  it('top-level is app only; external only http(s)', () => {
    expect(isAppNavigation('https://w.soundcloud.com/')).toBe(false);
    expect(isAppNavigation('app://bedstuy/x')).toBe(true);
    expect(isExternalOpenable('https://soundcloud.com/a')).toBe(true);
    expect(isExternalOpenable('file:///x')).toBe(false);
  });
  it('wildcard hosts', () => {
    expect(hostAllowed('i1.sndcdn.com')).toBe(true);
    expect(hostAllowed('sndcdn.com')).toBe(false);
    expect(hostAllowed('evilsndcdn.com')).toBe(false);
  });
  it('csp is strict', () => {
    const c = buildCsp();
    expect(c).toContain("default-src 'self'");
    expect(c).toContain('frame-src https://w.soundcloud.com');
    expect(c).not.toMatch(/'unsafe-eval'/);
  });
});
describe('window state', () => {
  const d = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  it('defaults on junk', () => {
    expect(sanitizeState(null, d).width).toBe(1280);
    expect(sanitizeState({ width: 5, height: 5 }, d).width).toBe(1280);
  });
  it('drops off-screen position, keeps size', () => {
    const s = sanitizeState({ x: 5000, y: 10, width: 1000, height: 700, fullscreen: true }, d);
    expect(s.x).toBeUndefined();
    expect(s.width).toBe(1000);
    expect(s.fullscreen).toBe(true);
  });
  it('round-trips through disk', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gtaws-')), 'sub', 's.json');
    expect(saveState(fs, f, { x: 100, y: 50, width: 1100, height: 750, maximized: true, fullscreen: false })).toBe(true);
    expect(loadState(fs, f, d)).toEqual({ x: 100, y: 50, width: 1100, height: 750, maximized: true, fullscreen: false });
    expect(loadState(fs, f + '.missing', d).width).toBe(1280);
  });
});

describe('appQueryFromArgs', () => {
  it('maps the debug and tier switches and ignores anything else', async () => {
    const { appQueryFromArgs } = await import('../src/policy');
    expect(appQueryFromArgs(['/Applications/GTA Bed-Stuy.app/Contents/MacOS/GTA Bed-Stuy'])).toBe('');
    expect(appQueryFromArgs(['x', '--debug-gfx'])).toBe('?debug=gfx');
    expect(appQueryFromArgs(['x', '--debug-gfx', '--q=low'])).toBe('?debug=gfx&q=low');
    expect(appQueryFromArgs(['x', '--q=ultra', '--q=<script>', '--url=evil'])).toBe('');
  });
});

describe('launch choices', () => {
  it('starts in full screen unless told otherwise', async () => {
    const { wantsFullscreenAtLaunch } = await import('../src/policy');
    expect(wantsFullscreenAtLaunch({}, ['app'], false)).toBe(true);
    expect(wantsFullscreenAtLaunch({ startFullscreen: true }, ['app'], false)).toBe(true);
    expect(wantsFullscreenAtLaunch({ startFullscreen: false }, ['app'], false)).toBe(false);
    expect(wantsFullscreenAtLaunch({}, ['app', '--windowed'], false)).toBe(false);
    expect(wantsFullscreenAtLaunch({ startFullscreen: false }, ['app', '--fullscreen'], false)).toBe(true);
    expect(wantsFullscreenAtLaunch({}, ['app'], true)).toBe(false); // smoke test is windowed
  });
  it('picks the ANGLE backend per platform and honours --angle', async () => {
    const { chooseAngle } = await import('../src/policy');
    expect(chooseAngle('darwin', [])).toBe('metal');
    expect(chooseAngle('win32', [])).toBe('d3d11');
    expect(chooseAngle('linux', [])).toBeUndefined();
    expect(chooseAngle('darwin', ['--angle=gl'])).toBe('gl');
    expect(chooseAngle('win32', ['--angle=vulkan'])).toBe('vulkan');
    expect(chooseAngle('win32', ['--angle=evil;rm'])).toBe('d3d11');
    expect(chooseAngle('darwin', ['--angle=metal ', '--angle=nope'])).toBe('metal');
  });
});

describe('csp for radio and voice', () => {
  it('lets live radio streams through and keeps scripts on the short list', () => {
    const c = buildCsp();
    expect(c).toMatch(/media-src [^;]*\bhttps:(;|$)/);
    expect(c).toMatch(/connect-src [^;]*https:\/\/api\.kexp\.org/);
    expect(c).toMatch(/connect-src [^;]*https:\/\/api\.somafm\.com/);
    const script = c.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(script).toContain('https://w.soundcloud.com');
    expect(script).toContain('https://cdn.jsdelivr.net');
    expect(script).not.toMatch(/unpkg|esm\.sh|https:(\s|$)/);
    expect(c).toContain("worker-src 'self' blob:");
  });
});

describe('saved-game backup', () => {
  it('keeps strings only and caps the size', async () => {
    const { sanitizeStorageSnapshot, STORAGE_BACKUP_MAX_BYTES } = await import('../src/policy');
    expect(sanitizeStorageSnapshot(null)).toBeNull();
    expect(sanitizeStorageSnapshot([1, 2])).toBeNull();
    expect(sanitizeStorageSnapshot({ a: '1', b: 2, c: { x: 1 } })).toEqual({ a: '1' });
    const big = sanitizeStorageSnapshot({ a: 'x'.repeat(900_000), b: 'y'.repeat(900_000), c: 'z'.repeat(900_000), d: 'w'.repeat(900_000), e: 'v'.repeat(900_000), f: 'u'.repeat(900_000) })!;
    expect(JSON.stringify(big).length).toBeLessThanOrEqual(STORAGE_BACKUP_MAX_BYTES + 100);
    expect(sanitizeStorageSnapshot({ a: 'x'.repeat(1_000_001) })).toEqual({});
  });
});

describe('graphics report', () => {
  it('names the renderer, the backend and what is not enabled', async () => {
    const { formatGraphicsReport } = await import('../src/report');
    const t = formatGraphicsReport({
      app: 'GTA Bed-Stuy 0.1.0', versions: { electron: '45.3.0' }, platform: 'darwin', arch: 'arm64', angle: 'metal', switches: ['--debug-gfx'], fullscreen: true,
      displays: [{ w: 3024, h: 1964, scale: 2, hz: 120 }], gpuDevices: [{ vendorId: 0x106b, deviceId: 0x1, active: true, deviceString: 'Apple M4' }],
      featureStatus: { webgl2: 'enabled', gpu_compositing: 'disabled_software' },
      page: { renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)', vendor: 'Google Inc. (Apple)', version: 'WebGL 2.0', overlay: 'tier now: high', dpr: 2, innerWidth: 1512, innerHeight: 982 },
    });
    expect(t).toContain('angle backend: metal');
    expect(t).toContain('Apple M4');
    expect(t).toContain('gpu_compositing=disabled_software');
    expect(t).toContain('tier now: high');
    expect(t).toContain('3024x1964 @2x 120Hz');
  });
  it('says so when the page cannot be read', async () => {
    const { formatGraphicsReport } = await import('../src/report');
    const t = formatGraphicsReport({ app: 'x', versions: {}, platform: 'win32', arch: 'x64', angle: 'd3d11', switches: [], fullscreen: false, displays: [], gpuDevices: [], featureStatus: {}, page: { error: 'boom' } });
    expect(t).toContain('could not read (boom)');
    expect(t).toContain('gpu features not plainly enabled: none');
  });
});
