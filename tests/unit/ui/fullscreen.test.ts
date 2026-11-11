// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FullscreenControl, FULLSCREEN_KEY } from '@/ui/Fullscreen';

function mockDoc() {
  const doc = document.implementation.createHTMLDocument('t') as Document & Record<string, unknown>;
  let el: Element | null = null;
  Object.defineProperty(doc, 'fullscreenElement', { get: () => el, configurable: true });
  Object.defineProperty(doc, 'fullscreenEnabled', { get: () => true, configurable: true });
  const fire = () => doc.dispatchEvent(new Event('fullscreenchange'));
  (doc.documentElement as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = vi.fn(async () => { el = doc.documentElement; fire(); });
  (doc as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = vi.fn(async () => { el = null; fire(); });
  return { doc, esc: () => { el = null; fire(); } };
}
const mem = () => { const d: Record<string, string> = {}; return { d, getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; } }; };

describe('FullscreenControl', () => {
  let m: ReturnType<typeof mockDoc>;
  beforeEach(() => { m = mockDoc(); });

  it('toggles through requestFullscreen / exitFullscreen and remembers the choice', async () => {
    const store = mem();
    const fs = new FullscreenControl(m.doc, store);
    expect(fs.supported).toBe(true);
    expect(fs.preferred).toBe(false);
    expect(await fs.toggle()).toBe(true);
    expect(fs.active).toBe(true);
    expect(store.d[FULLSCREEN_KEY]).toBe('1');
    expect(await fs.toggle()).toBe(false);
    expect(fs.active).toBe(false);
    expect(store.d[FULLSCREEN_KEY]).toBe('0');
    expect(new FullscreenControl(m.doc, { getItem: () => '1', setItem: () => {} }).preferred).toBe(true);
  });
  it('reports Esc exits as escaped and our own exit as not', async () => {
    const fs = new FullscreenControl(m.doc, null);
    const seen: Array<[boolean, boolean | undefined]> = [];
    fs.onChange((on, esc) => seen.push([on, esc]));
    await fs.enter();
    m.esc();
    await fs.enter();
    await fs.exit();
    expect(seen).toEqual([[true, false], [false, true], [true, false], [false, false]]);
  });
  it('uses the webkit prefixes when the standard API is missing (Safari)', async () => {
    const doc = document.implementation.createHTMLDocument('t') as Document & Record<string, unknown>;
    let el: Element | null = null;
    Object.defineProperty(doc, 'webkitFullscreenElement', { get: () => el, configurable: true });
    Object.defineProperty(doc, 'fullscreenEnabled', { get: () => undefined, configurable: true });
    const req = vi.fn(() => { el = doc.documentElement; });
    (doc.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen = req;
    (doc as unknown as Record<string, unknown>).webkitExitFullscreen = vi.fn(() => { el = null; });
    const fs = new FullscreenControl(doc, null);
    expect(fs.supported).toBe(true);
    expect(await fs.enter()).toBe(true);
    expect(req).toHaveBeenCalled();
    expect(fs.active).toBe(true);
    await fs.exit();
    expect(fs.active).toBe(false);
  });
  it('is unsupported (and enter resolves false) when nothing exists, or the request is refused', async () => {
    const bare = document.implementation.createHTMLDocument('t');
    expect(new FullscreenControl(bare, null).supported).toBe(false);
    expect(await new FullscreenControl(bare, null).enter()).toBe(false);
    (m.doc.documentElement as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = vi.fn(async () => { throw new Error('gesture'); });
    expect(await new FullscreenControl(m.doc, null).enter()).toBe(false);
  });
  it('Alt+Enter toggles; plain Enter and Ctrl+Alt+Enter do not', async () => {
    const win = m.doc.defaultView; // jsdom createHTMLDocument has no window: bind to the real one through a wrapper doc
    expect(win).toBeNull();
    const real = mockDoc();
    Object.defineProperty(real.doc, 'defaultView', { get: () => window });
    const fs = new FullscreenControl(real.doc, null);
    const send = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', cancelable: true, ...init }));
    send({});
    send({ altKey: true, ctrlKey: true });
    await Promise.resolve();
    expect(fs.active).toBe(false);
    send({ altKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(fs.active).toBe(true);
    fs.dispose();
  });
});
