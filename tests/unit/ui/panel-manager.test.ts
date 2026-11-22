// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PanelManager, type ManagedPanel, type InputGate } from '@/ui/PanelManager';
import { Menu } from '@/ui/Menu';
import { Input } from '@/core/Input';

/** A panel that is just a flag, with the body class the real ones set. */
function fake(id: string, extra: Partial<ManagedPanel> = {}) {
  let open = false;
  const p = {
    id, opens: 0, backs: 0, closes: 0,
    get isOpenNow() { return open; },
    isOpen: () => open,
    open() { open = true; p.opens++; },
    back() { p.backs++; open = false; },
    close() { p.closes++; open = false; },
    ...extra,
  };
  return p;
}

function gate(): InputGate & { locks: number } {
  const g = { blocked: false, locks: 0, mode: 'keyboard', requestLock() { g.locks++; } };
  return g;
}

const key = (code: string, init: KeyboardEventInit = {}) => { const e = new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true, cancelable: true, ...init }); window.dispatchEvent(e); return e; };

describe('PanelManager', () => {
  let pm: PanelManager;
  let lockEl: Element | null;
  let exit: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    lockEl = null;
    exit = vi.fn(() => { lockEl = null; document.dispatchEvent(new Event('pointerlockchange')); });
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl });
    (document as unknown as { exitPointerLock: unknown }).exitPointerLock = exit;
  });
  afterEach(() => { pm?.dispose(); vi.useRealTimers(); delete (document as unknown as Record<string, unknown>).pointerLockElement; document.body.className = ''; });

  it('opening a panel closes the input gate and releases the pointer at once', () => {
    const input = gate(); const shop = fake('shop');
    pm = new PanelManager(document, { input });
    pm.register(shop);
    lockEl = document.body; // the game had the mouse
    shop.open(); pm.sync();
    expect(input.blocked).toBe(true);
    expect(exit).toHaveBeenCalled();
    expect(pm.stack).toEqual(['shop']);
  });

  it('a lock that arrives while a panel is open is released again', () => {
    const input = gate(); const phone = fake('phone');
    pm = new PanelManager(document, { input }); pm.register(phone);
    phone.open(); pm.sync();
    lockEl = document.body; document.dispatchEvent(new Event('pointerlockchange'));
    expect(exit).toHaveBeenCalled();
  });

  it('Esc goes to the top panel only, one step at a time; the last Back resumes', () => {
    const input = gate(); const menu = fake('menu'); const radio = fake('radio');
    pm = new PanelManager(document, { input }); pm.register(menu); pm.register(radio);
    menu.open(); pm.sync(); radio.open(); pm.sync();
    expect(pm.stack).toEqual(['menu', 'radio']); expect(pm.top).toBe('radio');
    const e = key('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(radio.backs).toBe(1); expect(menu.backs).toBe(0);
    expect(pm.stack).toEqual(['menu']); expect(input.blocked).toBe(true);
    key('Escape');
    expect(menu.backs).toBe(1);
    expect(pm.anyOpen).toBe(false);
  });

  it('a key held down (repeat) does not skip levels', () => {
    const menu = fake('menu'); const radio = fake('radio');
    pm = new PanelManager(document, { input: gate() }); pm.register(menu); pm.register(radio);
    menu.open(); pm.sync(); radio.open(); pm.sync();
    key('Escape'); key('Escape', { repeat: true }); key('Escape', { repeat: true });
    expect(radio.backs).toBe(1); expect(menu.backs).toBe(0);
  });

  it('Esc with nothing open opens the pause menu once, and no other handler sees that Esc', () => {
    const other = vi.fn(); window.addEventListener('keydown', other);
    const openPause = vi.fn(); pm = new PanelManager(document, { input: gate(), openPause });
    key('Escape');
    expect(openPause).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    window.removeEventListener('keydown', other);
  });

  it('a panel that keeps Esc for itself (a key being rebound) gets it', () => {
    let busy = true;
    const menu = fake('menu', { keepsEscape: () => busy });
    const seen = vi.fn(); window.addEventListener('keydown', seen);
    pm = new PanelManager(document, { input: gate() }); pm.register(menu);
    menu.open(); pm.sync();
    const e = key('Escape');
    expect(e.defaultPrevented).toBe(false); expect(menu.backs).toBe(0); expect(seen).toHaveBeenCalled();
    busy = false; key('Escape');
    expect(menu.backs).toBe(1);
    window.removeEventListener('keydown', seen);
  });

  it('a browser lock exit with nothing open lands in the pause menu; with a panel open it does not', () => {
    const openPause = vi.fn(); const shop = fake('shop');
    pm = new PanelManager(document, { input: gate(), openPause }); pm.register(shop);
    lockEl = document.body; document.dispatchEvent(new Event('pointerlockchange'));
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'));
    expect(openPause).toHaveBeenCalledTimes(1);
    shop.open(); pm.sync();
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'));
    expect(openPause).toHaveBeenCalledTimes(1);
  });

  it('closing the last panel with a click re-locks the pointer from that click and opens the gate', () => {
    const input = gate(); const menu = fake('menu');
    pm = new PanelManager(document, { input }); pm.register(menu);
    menu.open(); pm.sync();
    window.dispatchEvent(new Event('pointerdown')); // the Resume click
    menu.close(); pm.sync();
    expect(input.blocked).toBe(false);
    expect(input.locks).toBe(1);
  });

  it('closing with Esc gives no re-lock (a browser grants none for Esc) and the gate opens one tick later', () => {
    const input = gate(); const menu = fake('menu');
    pm = new PanelManager(document, { input }); pm.register(menu);
    menu.open(); pm.sync();
    key('Escape');
    expect(input.blocked).toBe(true); // still closed while the key event is being delivered
    vi.advanceTimersByTime(1);
    expect(input.blocked).toBe(false);
    expect(input.locks).toBe(0);
  });

  it('closing with another key (Enter on Resume) re-locks after the tick', () => {
    const input = gate(); const menu = fake('menu');
    pm = new PanelManager(document, { input }); pm.register(menu);
    menu.open(); pm.sync();
    key('Enter'); menu.close(); pm.sync();
    vi.advanceTimersByTime(1);
    expect(input.blocked).toBe(false); expect(input.locks).toBe(1);
  });

  it('no re-lock on a touch or pad session', () => {
    const input = gate(); input.mode = 'touch'; const menu = fake('menu');
    pm = new PanelManager(document, { input }); pm.register(menu);
    menu.open(); pm.sync(); window.dispatchEvent(new Event('pointerdown')); menu.close(); pm.sync();
    expect(input.locks).toBe(0);
  });

  it('another panel opening before the tick keeps the gate closed', () => {
    const input = gate(); const a = fake('a'); const b = fake('b');
    pm = new PanelManager(document, { input }); pm.register(a); pm.register(b);
    a.open(); pm.sync(); key('Escape'); b.open(); pm.sync();
    vi.advanceTimersByTime(5);
    expect(input.blocked).toBe(true);
  });

  it('a right click goes back one step while a panel is open, and the browser menu never opens', () => {
    const menu = fake('menu');
    pm = new PanelManager(document, { input: gate() }); pm.register(menu);
    const idle = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.body.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    menu.open(); pm.sync();
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true); expect(menu.backs).toBe(1);
  });

  it('a panel inside another (the map tab of the pause menu) is not a level of its own', () => {
    const menu = fake('menu'); const map = fake('map', { insideOf: 'menu' });
    pm = new PanelManager(document, { input: gate() }); pm.register(menu); pm.register(map);
    map.open(); pm.sync(); expect(pm.stack).toEqual(['map']);
    menu.open(); pm.sync(); expect(pm.stack).toEqual(['menu']);
  });

  it('notices body-class changes made by the real panels (MutationObserver)', async () => {
    vi.useRealTimers();
    const input = gate(); const shop = fake('shop');
    pm = new PanelManager(document, { input }); pm.register(shop);
    shop.open(); document.body.classList.add('shop-open');
    await Promise.resolve(); await new Promise((r) => setTimeout(r, 0));
    expect(input.blocked).toBe(true);
  });
});

describe('Input gate (MENU2)', () => {
  let el: HTMLElement; let input: Input;
  beforeEach(() => { el = document.createElement('canvas'); document.body.appendChild(el); input = new Input(el); });
  afterEach(() => { el.remove(); });
  const down = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const up = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

  it('ignores keys, clicks and virtual buttons while blocked, and drops what was held', () => {
    down('KeyW'); expect(input.isDown('KeyW')).toBe(true);
    input.blocked = true;
    expect(input.isDown('KeyW')).toBe(false);
    down('Space'); expect(input.pressed('Space')).toBe(false); expect(input.isDown('Space')).toBe(false);
    input.setVirtual('ActionButton', true); input.pulse('KeyF');
    expect(input.isDown('ActionButton')).toBe(false); expect(input.pressed('KeyF')).toBe(false);
    el.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(input.isDown('MouseLeft')).toBe(false);
  });

  it('a key held when the gate reopens stays ignored until it is released: no jump on resume', () => {
    input.blocked = true;
    down('Space'); // the key that closed the panel
    input.blocked = false;
    down('Space'); down('Space'); // auto-repeat
    expect(input.pressed('Space')).toBe(false); expect(input.isDown('Space')).toBe(false);
    up('Space'); down('Space');
    expect(input.pressed('Space')).toBe(true);
  });

  it('requestLock is refused while blocked and a click inside a panel never asks for the lock', () => {
    const req = vi.fn(); (el as unknown as { requestPointerLock: unknown }).requestPointerLock = req;
    input.blocked = true;
    input.requestLock(); input.notifyGesture();
    el.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(req).not.toHaveBeenCalled();
    input.blocked = false;
    input.requestLock();
    expect(req).toHaveBeenCalledTimes(1);
  });
});

describe('Menu + PanelManager + Input together', () => {
  it('a click on a menu row never re-locks the pointer, Esc steps back, and Resume re-locks from its own click', () => {
    vi.useFakeTimers();
    const parent = document.createElement('div'); document.body.appendChild(parent);
    const canvas = document.createElement('canvas'); parent.appendChild(canvas);
    const req = vi.fn(); (canvas as unknown as { requestPointerLock: unknown }).requestPointerLock = req;
    const input = new Input(canvas);
    // main.ts does exactly this on the overlay: any press anywhere inside it is a "gesture"
    parent.addEventListener('mousedown', () => input.notifyGesture());
    const pm = new PanelManager(document, { input });
    const menu = new Menu(parent, {}, { storage: null, openOnPointerUnlock: false });
    pm.register({ id: 'menu', isOpen: () => menu.isOpen, close: () => menu.close(), back: () => menu.back(), keepsEscape: () => menu.keepsEscape });
    menu.open(); pm.sync();
    const row = menu.root.querySelector<HTMLElement>('[data-id="radiolib"]')!;
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(req).not.toHaveBeenCalled(); // before MENU2 this was a pointer lock request
    window.dispatchEvent(new Event('pointerdown'));
    menu.root.querySelector<HTMLButtonElement>('.gp-resume')!.click();
    pm.sync();
    expect(menu.isOpen).toBe(false);
    expect(input.blocked).toBe(false);
    expect(req).toHaveBeenCalledTimes(1);
    pm.dispose(); menu.dispose(); parent.remove(); vi.useRealTimers();
  });
});

describe('PanelManager on touch', () => {
  it('a long press (a touch contextmenu) opens no browser menu and does not go back', () => {
    const menu = fake('menu');
    const pm = new PanelManager(document, { input: gate() }); pm.register(menu);
    menu.open(); pm.sync();
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }) as MouseEvent & { pointerType?: string };
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true); expect(menu.backs).toBe(0);
    pm.dispose();
  });
});
