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
