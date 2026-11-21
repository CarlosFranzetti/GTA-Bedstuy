import { describe, expect, it } from 'vitest';
import { ContextGuard, showReloadNotice } from '@/render/ContextGuard';

function fakeTarget() {
  const l = new Map<string, EventListener>();
  return {
    addEventListener: (t: string, f: EventListener) => { l.set(t, f); },
    removeEventListener: (t: string) => { l.delete(t); },
    fire: (t: string) => l.get(t)?.({ preventDefault() {} } as unknown as Event),
  };
}

describe('ContextGuard on iOS: a lost context never leaves a frozen page', () => {
  it('shows the reload notice when no restore arrives', () => {
    const t = fakeTarget();
    let timer: (() => void) | null = null;
    let notified = 0, gaveUp = 0;
    new ContextGuard(t as never, { setTimer: (fn) => { timer = fn; return 1; }, clearTimer: () => { timer = null; }, notify: () => { notified++; }, onGiveUp: () => { gaveUp++; } });
    t.fire('webglcontextlost');
    expect(notified).toBe(0);
    timer!();
    expect(gaveUp).toBe(1);
    expect(notified).toBe(1);
  });
  it('a restore after canvases were freed asks for a reload instead of drawing blank textures', () => {
    const t = fakeTarget();
    let restored = 0, notified = 0;
    new ContextGuard(t as never, { mustReload: () => true, notify: () => { notified++; }, onRestored: () => { restored++; }, setTimer: () => 1, clearTimer: () => {} });
    t.fire('webglcontextlost'); t.fire('webglcontextrestored');
    expect(restored).toBe(0);
    expect(notified).toBe(1);
  });
  it('a restore with every source still in memory carries on as before', () => {
    const t = fakeTarget();
    let restored = 0, notified = 0;
    new ContextGuard(t as never, { mustReload: () => false, notify: () => { notified++; }, onRestored: () => { restored++; }, setTimer: () => 1, clearTimer: () => {} });
    t.fire('webglcontextlost'); t.fire('webglcontextrestored');
    expect(restored).toBe(1);
    expect(notified).toBe(0);
  });
  it('the notice is one element with a tap-to-reload button wired to reload', () => {
    const made: Array<{ tag: string; children: unknown[]; listeners: Record<string, () => void>; style: { cssText: string }; textContent: string; id?: string; type?: string }> = [];
    const el = (tag: string) => { const e = { tag, children: [] as unknown[], listeners: {} as Record<string, () => void>, style: { cssText: '' }, textContent: '', setAttribute() {}, addEventListener(n: string, f: () => void) { e.listeners[n] = f; }, append(...c: unknown[]) { e.children.push(...c); } }; made.push(e); return e; };
    const doc = { getElementById: (id: string) => made.find((m) => m.id === id) ?? null, createElement: el, body: { appendChild: () => {} } } as unknown as Document;
    let reloads = 0;
    const n1 = showReloadNotice(doc, () => { reloads++; });
    const n2 = showReloadNotice(doc, () => { reloads++; });
    expect(n2).toBe(n1);
    const btn = made.find((m) => m.tag === 'button')!;
    expect(btn.textContent).toMatch(/reload/i);
    btn.listeners.click();
    expect(reloads).toBe(1);
  });
});
