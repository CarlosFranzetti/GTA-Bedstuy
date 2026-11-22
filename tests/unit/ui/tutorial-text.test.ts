// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Bindings } from '@/core/Bindings';
import { HINTS } from '@/ui/tutorial/hints';
import { plainText, resolveLine } from '@/ui/tutorial/resolve';
import { STEPS } from '@/ui/tutorial/steps';
import { DEVICES } from '@/ui/tutorial/types';

const OTHER_GAMES = /\b(gta|grand theft|rockstar|saints row|yakuza|mario|zelda|fortnite|minecraft)\b/i;

describe('tutorial words', () => {
  it('every step has a line and a why on every device, in the game\'s voice', () => {
    for (const s of STEPS) {
      expect(s.why.length, s.id).toBeGreaterThan(5);
      for (const d of DEVICES) {
        const t = s.text[d];
        expect(t && t.length > 8, `${s.id} ${d}`).toBe(true);
        for (const line of [t, s.plain?.[d] ?? '', s.why]) {
          expect(line, `${s.id} ${d}: no exclamation marks`).not.toMatch(/!/);
          expect(line, `${s.id} ${d}: no em dash`).not.toMatch(/—/);
          expect(line, `${s.id} ${d}: no other game`).not.toMatch(OTHER_GAMES);
          expect(line, `${s.id} ${d}: no double space`).not.toMatch(/ {2}/);
        }
      }
    }
  });

  it('every token resolves with the default bindings, on every device, on foot and in a car (no "Unbound", no bare TAP)', () => {
    const b = new Bindings(false);
    for (const s of STEPS) for (const d of DEVICES) for (const inVehicle of [false, true]) {
      for (const tpl of [s.text[d], s.plain?.[d]]) {
        if (!tpl) continue;
        const r = resolveLine(tpl, { device: d, inVehicle, bindings: b });
        expect(r.unbound, `${s.id} ${d}: ${plainText(r.parts)}`).toBe(false);
        expect(plainText(r.parts), `${s.id} ${d}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('the hints have text for every device and resolve too', () => {
    const b = new Bindings(false);
    for (const h of HINTS) for (const d of DEVICES) {
      expect(h.text[d].length, `${h.id} ${d}`).toBeGreaterThan(8);
      expect(h.text[d]).not.toMatch(/!/);
      expect(h.text[d]).not.toMatch(OTHER_GAMES);
      expect(resolveLine(h.text[d], { device: d, inVehicle: false, bindings: b }).unbound, `${h.id} ${d}`).toBe(false);
    }
  });

  it('the keyboard lines show the keys of the binding table, and follow a rebind', () => {
    const b = new Bindings(false);
    const jump = STEPS.find((s) => s.id === 'jump')!;
    expect(plainText(resolveLine(jump.text.keyboard, { device: 'keyboard', inVehicle: false, bindings: b }).parts)).toBe('Press [Space] to jump.');
    b.rebind('jump', 0, 'KeyJ');
    expect(plainText(resolveLine(jump.text.keyboard, { device: 'keyboard', inVehicle: false, bindings: b }).parts)).toBe('Press [J] to jump.');
    const walk = STEPS.find((s) => s.id === 'walk')!;
    expect(plainText(resolveLine(walk.text.keyboard, { device: 'keyboard', inVehicle: false, bindings: b }).parts)).toBe('Hold [W] [A] [S] [D] to walk.');
    b.rebind('moveForward', 0, 'KeyI');
    expect(plainText(resolveLine(walk.text.keyboard, { device: 'keyboard', inVehicle: false, bindings: b }).parts)).toBe('Hold [I] [A] [S] [D] to walk.');
    const radio = STEPS.find((s) => s.id === 'radio')!;
    expect(plainText(resolveLine(radio.text.keyboard, { device: 'keyboard', inVehicle: true, bindings: b }).parts)).toBe('Press [.] for the next station and [,] for the previous one.');
  });

  it('an action with no key is reported unbound, so the host can move on', () => {
    const b = new Bindings(false);
    b.clearSlot('jump', 0);
    const jump = STEPS.find((s) => s.id === 'jump')!;
    const r = resolveLine(jump.text.keyboard, { device: 'keyboard', inVehicle: false, bindings: b });
    expect(r.unbound).toBe(true);
  });

  it('the same step reads differently per device: keys, pad buttons, touch captions', () => {
    const b = new Bindings(false);
    const jump = STEPS.find((s) => s.id === 'jump')!;
    expect(plainText(resolveLine(jump.text.gamepad, { device: 'gamepad', inVehicle: false, bindings: b }).parts)).toBe('Press [X] to jump.');
    b.setPadKind('playstation');
    expect(plainText(resolveLine(jump.text.gamepad, { device: 'gamepad', inVehicle: false, bindings: b }).parts)).toBe('Press [Square] to jump.');
    expect(plainText(resolveLine(jump.text.touch, { device: 'touch', inVehicle: false, bindings: b }).parts)).toBe('Tap [JUMP] to jump.');
    const drive = STEPS.find((s) => s.id === 'drive')!;
    expect(plainText(resolveLine(drive.text.gamepad, { device: 'gamepad', inVehicle: true, bindings: b }).parts)).toBe('Pull [R2] to drive. Steer with the [Left stick].');
  });

  it('the police line is the one in the brief', () => {
    const p = STEPS.find((s) => s.id === 'police')!;
    expect(p.text.keyboard).toBe('Minor trouble builds heat. Get seen too often and you are wanted. Stand still for an officer and you are busted.');
  });

  it('step ids are unique and the last step is the walk home', () => {
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STEPS.filter((s) => s.last).map((s) => s.id)).toEqual(['home']);
  });
});
