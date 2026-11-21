// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ACTIONS, ACTION_BY_ID, Bindings, BINDINGS_KEY, MAX_SLOTS, PAD_LAYOUT, codeBound, detectPadKind, glyphFor, keyLabel, keysText, padButtonName, type ActionId } from '@/core/Bindings';
import { controlsLines, gamepadRows, keyboardRows } from '@/core/ControlsHelp';

const fresh = () => new Bindings(false);

describe('the default table follows the GTA V PC layout', () => {
  const b = fresh();
  const keys = (id: ActionId) => [...b.get(id)];
  it('on foot', () => {
    expect(keys('moveForward')).toEqual(['KeyW']);
    expect(keys('sprint')).toEqual(['ShiftLeft']);
    expect(keys('jump')).toEqual(['Space']);
    expect(keys('attack')).toEqual(['MouseLeft', 'KeyG']); // left click as in V; G is the old alternative
    expect(keys('aim')).toEqual(['MouseRight']);
    expect(keys('cover')).toEqual(['KeyQ']);
    expect(keys('enter')).toEqual(['KeyF']);
    expect(keys('phone')).toEqual(['ArrowUp', 'MouseMiddle']);
    expect(keys('lookBack')).toEqual(['KeyC']);
    expect(keys('camera')).toEqual(['KeyV']);
    expect(keys('itemNext')).toContain('Tab');
  });
  it('in a vehicle', () => {
    expect(keys('handbrake')).toEqual(['Space']);
    expect(keys('horn')).toEqual(['KeyG']);
    expect(keys('radioNext')).toContain('Period');
    expect(keys('radioPrev')).toContain('Comma');
  });
  it('never binds Left Ctrl by default to anything that works without the keyboard lock', () => {
    for (const a of ACTIONS) if (a.kb.includes('ControlLeft')) expect(a.id).toBe('walk'); // a second key; Input ignores it until fullscreen
  });
  it('every action has at most two default keys and a unique id', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    for (const a of ACTIONS) expect(a.kb.length).toBeLessThanOrEqual(MAX_SLOTS);
  });
  it('no two actions that can be live together share a default key', () => {
    for (const a of ACTIONS) for (const k of a.kb) expect(b.conflicts(a.id, k)).toEqual([]);
  });
  it('the same key may serve an on-foot and a vehicle action (Space, G, wheel)', () => {
    expect(b.get('jump')).toEqual(b.get('handbrake'));
    expect(b.conflicts('handbrake', 'Space')).toEqual([]);
  });
});

describe('rebinding', () => {
  it('moves a key into a slot and reports what it took it from', () => {
    const b = fresh();
    const r = b.rebind('enter', 0, 'KeyE');
    expect(r.ok).toBe(true);
    expect(b.get('enter')).toEqual(['KeyE']);
    const taken = b.rebind('enter', 0, 'KeyW'); // W is move forward, live in both contexts
    expect(taken.stolenFrom).toEqual(['moveForward']);
    expect(b.get('moveForward')).toEqual([]);
    expect(b.unbound()).toContain('moveForward');
  });
  it('a key used in the other context is not a conflict', () => {
    const b = fresh();
    const r = b.rebind('horn', 0, 'ShiftLeft'); // sprint is on foot only
    expect(r.stolenFrom).toEqual([]);
    expect(b.get('sprint')).toEqual(['ShiftLeft']);
  });
  it('refuses reserved keys and Ctrl outside fullscreen, accepts Ctrl once the lock holds', () => {
    const b = fresh();
    expect(b.rebind('enter', 0, 'Escape').ok).toBe(false);
    expect(b.rebind('enter', 0, 'F5').ok).toBe(false);
    expect(b.rebind('enter', 0, 'ControlLeft').ok).toBe(false);
    expect(b.get('enter')).toEqual(['KeyF']);
    b.ctrlSafe = true;
    expect(b.rebind('walk', 1, 'ControlLeft').ok).toBe(true);
  });
  it('a key moves out of its other slot instead of appearing twice', () => {
    const b = fresh();
    b.rebind('attack', 1, 'MouseLeft'); // already in slot 0: the two keys swap
    expect(b.get('attack')).toEqual(['KeyG', 'MouseLeft']);
  });
  it('clearSlot, reset and resetAll', () => {
    const b = fresh();
    b.rebind('enter', 0, 'KeyE');
    b.clearSlot('attack', 0);
    expect(b.get('attack')).toEqual(['KeyG']);
    b.reset('enter');
    expect(b.get('enter')).toEqual(['KeyF']);
    b.rebind('jump', 0, 'KeyJ');
    b.resetAll();
    expect(b.isDefault()).toBe(true);
  });
  it('notifies listeners and bumps the version', () => {
    const b = fresh();
    let n = 0; b.onChange(() => n++);
    const v = b.version;
    b.rebind('enter', 0, 'KeyE');
    expect(n).toBe(1);
    expect(b.version).toBeGreaterThan(v);
  });
});

describe('saving', () => {
  it('stores only what differs and reads it back; junk is ignored', () => {
    localStorage.clear();
    const a = new Bindings(true);
    a.rebind('enter', 0, 'KeyE');
    const raw = JSON.parse(localStorage.getItem(BINDINGS_KEY)!);
    expect(Object.keys(raw.keys)).toEqual(['enter']);
    const b = new Bindings(true);
    expect(b.get('enter')).toEqual(['KeyE']);
    expect(b.get('jump')).toEqual(['Space']);
    a.resetAll();
    expect(localStorage.getItem(BINDINGS_KEY)).toBeNull();
    const c = fresh();
    c.applySaved({ keys: { enter: ['Escape', 'KeyZ', 7, '<script>'], nonsense: ['KeyA'], jump: 'Space' } });
    expect(c.get('enter')).toEqual(['KeyZ']);
    expect(c.get('jump')).toEqual(['Space']);
    localStorage.setItem(BINDINGS_KEY, '{not json');
    expect(new Bindings(true).isDefault()).toBe(true);
    localStorage.clear();
  });
});

describe('prompts show the binding of the device in use', () => {
  it('keyboard follows rebinding', () => {
    const b = fresh();
    expect(glyphFor('enter', { mode: 'keyboard', bindings: b })).toBe('F');
    b.rebind('enter', 0, 'KeyE');
    expect(glyphFor('enter', { mode: 'keyboard', bindings: b })).toBe('E');
    b.clearSlot('enter', 0);
    expect(glyphFor('enter', { mode: 'keyboard', bindings: b })).toBe('Unbound');
  });
  it('a pad shows its own names: Y on an Xbox pad, Triangle on a PlayStation pad', () => {
    const b = fresh();
    expect(glyphFor('enter', { mode: 'gamepad', bindings: b })).toBe('Y');
    b.setPadKind('playstation');
    expect(glyphFor('enter', { mode: 'gamepad', bindings: b })).toBe('Triangle');
    expect(glyphFor('jump', { mode: 'gamepad', bindings: b })).toBe('Square');
    expect(glyphFor('handbrake', { mode: 'gamepad', bindings: b, inVehicle: true })).toBe('R1');
  });
  it('touch uses the on-screen caption', () => {
    expect(glyphFor('enter', { mode: 'touch', bindings: fresh() })).toBe('CAR');
  });
  it('key names', () => {
    expect(keyLabel('KeyF')).toBe('F');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('MouseMiddle')).toBe('Middle click');
    expect(keyLabel('Digit5')).toBe('5');
    expect(keysText('attack', fresh())).toBe('Left click / G');
  });
  it('pad family detection from the id string', () => {
    expect(detectPadKind('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(detectPadKind('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)')).toBe('xbox');
    expect(detectPadKind('Acme Pad 3000')).toBe('generic');
    expect(padButtonName('LT', 'playstation')).toBe('L2');
  });
  it('codeBound reads the table (for the map, phone and mission pointer listeners)', () => {
    const b = fresh();
    expect(codeBound('map', 'KeyM', b)).toBe(true);
    b.rebind('map', 0, 'KeyO');
    expect(codeBound('map', 'KeyM', b)).toBe(false);
    expect(codeBound('map', 'KeyO', b)).toBe(true);
  });
});

describe('the pad layout table agrees with the action table', () => {
  it('only names real actions and real contexts', () => {
    for (const id of Object.keys(PAD_LAYOUT) as ActionId[]) expect(ACTION_BY_ID.has(id)).toBe(true);
  });
  it('help text is built from the table', () => {
    const rows = keyboardRows(fresh());
    expect(rows.find(([, v]) => v.startsWith('Enter / exit vehicle'))![0]).toBe('F');
    expect(gamepadRows('playstation').some(([k]) => k.includes('Triangle'))).toBe(true);
    expect(gamepadRows('xbox').some(([k]) => k === 'Y')).toBe(true);
    expect(controlsLines(fresh()).some((l) => l.startsWith('F enter/exit vehicle'))).toBe(true);
  });
});
