import { describe, expect, it } from 'vitest';
import { ORIENTATION_RETRY_MS, installMobileViewportFixes } from '@/render/MobileViewport';

function target() {
  const l = new Map<string, Array<(e?: Event) => void>>();
  return {
    addEventListener: (t: string, f: (e?: Event) => void) => { l.set(t, [...(l.get(t) ?? []), f]); },
    removeEventListener: (t: string, f: (e?: Event) => void) => { l.set(t, (l.get(t) ?? []).filter((x) => x !== f)); },
    fire: (t: string, e?: Event) => { for (const f of l.get(t) ?? []) f(e); },
    count: (t: string) => (l.get(t) ?? []).length,
  };
}

describe('iPhone viewport fixes', () => {
  it('re-applies the size right away and again after the rotation settles', () => {
    const win = target(), doc = Object.assign(target(), { hidden: false }), visual = target();
    const timers: Array<[() => void, number]> = [];
    let n = 0;
    installMobileViewportFixes(() => { n++; }, win, doc, (fn, ms) => { timers.push([fn, ms]); return 1; }, visual);
    win.fire('orientationchange');
    expect(n).toBe(1);
    expect(timers.map((t) => t[1])).toEqual([...ORIENTATION_RETRY_MS]);
    for (const [fn] of timers) fn();
    expect(n).toBe(1 + ORIENTATION_RETRY_MS.length);
    visual.fire('resize'); // the dynamic toolbar
    expect(n).toBe(2 + ORIENTATION_RETRY_MS.length);
  });
  it('re-applies on return from the background and from the back-forward cache only', () => {
    const win = target(), doc = Object.assign(target(), { hidden: true });
    let n = 0;
    installMobileViewportFixes(() => { n++; }, win, doc, () => 1, null);
    doc.fire('visibilitychange'); // still hidden: nothing
    expect(n).toBe(0);
    doc.hidden = false; doc.fire('visibilitychange');
    expect(n).toBe(1);
    win.fire('pageshow', { persisted: false } as unknown as Event);
    expect(n).toBe(1);
    win.fire('pageshow', { persisted: true } as unknown as Event);
    expect(n).toBe(2);
  });
  it('removes its listeners', () => {
    const win = target(), doc = Object.assign(target(), { hidden: false });
    const off = installMobileViewportFixes(() => {}, win, doc, () => 1, null);
    off();
    expect(win.count('orientationchange')).toBe(0);
    expect(doc.count('visibilitychange')).toBe(0);
  });
});
