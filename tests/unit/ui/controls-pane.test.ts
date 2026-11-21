// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Bindings } from '@/core/Bindings';
import { DEFAULT_TUNING, PAD_TUNING_KEY, sanitizeTuning, type PadTuning } from '@/core/Gamepad';
import { ControlsPane } from '@/ui/ControlsPane';

const keyDown = (code: string, extra: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }));
const slot = (pane: ControlsPane, id: string, n: number) => pane.root.querySelector<HTMLButtonElement>(`.ctl-key[data-action="${id}"][data-slot="${n}"]`)!;

describe('ControlsPane (the rebinding screen)', () => {
  let b: Bindings; let t: PadTuning; let pane: ControlsPane;
  beforeEach(() => {
    localStorage.clear();
    b = new Bindings(false); t = { ...DEFAULT_TUNING };
    pane = new ControlsPane(document, b, t);
    document.body.append(pane.root);
  });

  it('lists every action with its keys, grouped, reserved ones marked', () => {
    expect(slot(pane, 'enter', 0).textContent).toBe('F');
    expect(slot(pane, 'attack', 0).textContent).toBe('Left click');
    expect(slot(pane, 'attack', 1).textContent).toBe('G');
    expect(slot(pane, 'enter', 1).textContent).toBe('—');
    expect([...pane.root.querySelectorAll('.ctl-group')].map((n) => n.textContent)).toEqual(['Movement', 'On foot', 'Anywhere', 'In a vehicle']);
  });

  it('click, press a key: the binding changes and the screen says so', () => {
    slot(pane, 'enter', 0).click();
    expect(pane.capturing).toEqual({ id: 'enter', slot: 0 });
    expect(slot(pane, 'enter', 0).textContent).toBe('Press a key...');
    keyDown('KeyE');
    expect(pane.capturing).toBeNull();
    expect(b.get('enter')).toEqual(['KeyE']);
    expect(slot(pane, 'enter', 0).textContent).toBe('E');
    expect(pane.side.querySelector('.ctl-status')!.textContent).toContain('"Enter / exit vehicle"');
  });

  it('shows the conflict: the key is taken from the other action', () => {
    slot(pane, 'enter', 0).click();
    keyDown('KeyW');
    expect(pane.side.querySelector('.ctl-status')!.textContent).toContain('taken from "Move forward / accelerate"');
    expect(slot(pane, 'moveForward', 0).textContent).toBe('—');
    expect(pane.root.querySelector('.ctl-row.unbound')).not.toBeNull();
  });

  it('Esc cancels, Backspace clears, Enter and the browser keys are refused', () => {
    slot(pane, 'enter', 0).click(); keyDown('Escape');
    expect(b.get('enter')).toEqual(['KeyF']);
    slot(pane, 'enter', 0).click(); keyDown('F5');
    expect(b.get('enter')).toEqual(['KeyF']);
    expect(pane.side.querySelector('.ctl-status')!.textContent).toContain('cannot be used');
    slot(pane, 'attack', 1).click(); keyDown('Backspace');
    expect(b.get('attack')).toEqual(['MouseLeft']);
  });

  it('a mouse button or the wheel can be captured', () => {
    slot(pane, 'phone', 1).click();
    return new Promise<void>((resolve) => setTimeout(() => {
      window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }));
      expect(b.get('phone')).toEqual(['ArrowUp', 'MouseRight']);
      resolve();
    }, 5));
  });

  it('Reset to defaults restores every key', () => {
    b.rebind('enter', 0, 'KeyE');
    pane.root.querySelector<HTMLButtonElement>('.ctl-reset')!.click();
    expect(b.isDefault()).toBe(true);
    expect(slot(pane, 'enter', 0).textContent).toBe('F');
  });

  it('pad feel: a slider writes the shared tuning and saves it', () => {
    const range = pane.root.querySelector<HTMLInputElement>('.ctl-range')!;
    range.value = '25'; range.dispatchEvent(new Event('input'));
    expect(t.moveDeadZone).toBeCloseTo(0.25);
    expect(JSON.parse(localStorage.getItem(PAD_TUNING_KEY)!).moveDeadZone).toBeCloseTo(0.25);
    expect(sanitizeTuning({ moveDeadZone: 9, lookCurve: 'x', vibration: 3 })).toEqual({ ...DEFAULT_TUNING, moveDeadZone: 0.4 });
  });

  it('the pad reference follows the connected pad', () => {
    expect(pane.root.querySelector('.ctl-padrows')!.textContent).toContain('Enter / exit vehicle');
    b.setPadKind('playstation');
    expect(pane.root.querySelector('.ctl-padrows')!.textContent).toContain('Triangle');
  });
});
