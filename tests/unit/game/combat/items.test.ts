import { describe, expect, it } from 'vitest';
import { Hands, PISTOL, actionFor } from '@/game/combat/items';

describe('the action button: what it does with each item', () => {
  it('maps every item to one action', () => {
    expect(actionFor('fists')).toBe('punch');
    expect(actionFor('bottle')).toBe('throw');
    expect(actionFor('brick')).toBe('throw');
    expect(actionFor('pistol')).toBe('shoot');
  });
});

describe('Hands', () => {
  it('starts with fists only and cycling stays on fists', () => {
    const h = new Hands();
    expect(h.available()).toEqual(['fists']);
    expect(h.cycle(1)).toBe('fists');
    expect(h.state()).toEqual({ item: 'fists', count: null, reserve: null, reloading: false });
  });

  it('cycles forward and back through what it owns, skipping the rest', () => {
    const h = new Hands();
    h.add('brick'); h.add('pistol');
    expect(h.available()).toEqual(['fists', 'brick', 'pistol']);
    expect(h.cycle(1)).toBe('brick');
    expect(h.cycle(1)).toBe('pistol');
    expect(h.cycle(1)).toBe('fists');
    expect(h.cycle(-1)).toBe('pistol');
    expect(h.cycle(-1)).toBe('brick');
  });

  it('a pistol arrives with two magazines; another adds one spare, capped', () => {
    const h = new Hands();
    h.add('pistol');
    expect(h.mag).toBe(PISTOL.magSize);
    expect(h.reserve).toBe(PISTOL.magSize);
    h.add('pistol');
    expect(h.reserve).toBe(2 * PISTOL.magSize);
    for (let i = 0; i < 10; i++) h.add('pistol');
    expect(h.reserve).toBe(PISTOL.maxReserve);
  });

  it('fires rounds down to empty, then reloads from the spares', () => {
    const h = new Hands();
    h.add('pistol');
    for (let i = 0; i < PISTOL.magSize; i++) expect(h.fireRound()).toBe(true);
    expect(h.fireRound()).toBe(false);
    expect(h.needsReload).toBe(true);
    expect(h.reload()).toBe(PISTOL.magSize);
    expect([h.mag, h.reserve]).toEqual([PISTOL.magSize, 0]);
    h.fireRound();
    expect(h.reload()).toBe(0); // no spares left
    expect(h.mag).toBe(PISTOL.magSize - 1);
  });

  it('a partial reload only moves what fits', () => {
    const h = new Hands();
    h.add('pistol'); h.add('pistol'); // 12 + 24
    for (let i = 0; i < 5; i++) h.fireRound();
    expect(h.reload()).toBe(5);
    expect([h.mag, h.reserve]).toEqual([12, 19]);
  });

  it('throwing spends one and falls back to fists with the last', () => {
    const h = new Hands();
    h.add('bottle'); h.add('bottle'); h.cycle(1);
    expect(h.current).toBe('bottle');
    expect(h.state().count).toBe(2);
    expect(h.takeThrowable()).toBe('bottle');
    expect(h.current).toBe('bottle');
    expect(h.takeThrowable()).toBe('bottle');
    expect(h.current).toBe('fists');
    expect(h.takeThrowable()).toBeNull();
  });

  it('reports the change to the HUD', () => {
    const h = new Hands();
    let n = 0;
    h.onChange = () => { n++; };
    h.add('brick'); h.cycle(1); h.takeThrowable();
    expect(n).toBe(3);
  });
});
