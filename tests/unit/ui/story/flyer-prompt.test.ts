// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlyerPrompt, pickFlyerTarget, FLYER_REACH_M, type FlyerPed } from '@/ui/story/FlyerPrompt';
import { Promotion } from '@/game/story/promo';

const ped = (id: string, x: number, o: Partial<FlyerPed> = {}): FlyerPed => ({ id, isMinor: false, state: 'walking', body: { pos: { x, z: 0 } }, vitals: { temper: 'film' }, ...o });
afterEach(() => document.body.replaceChildren());

describe('flyer hand-out', () => {
  const night = { flyersLeft: 5, asked: [] as Array<string | number> };
  it('picks the nearest adult inside reach', () => {
    const t = pickFlyerTarget({ x: 0, z: 0 }, [ped('far', FLYER_REACH_M + 1), ped('b', 2), ped('a', 1)], night);
    expect(t?.id).toBe('a');
    expect(pickFlyerTarget({ x: 0, z: 0 }, [ped('far', 9)], night)).toBeNull();
  });
  it('never offers a minor, however close', () => {
    expect(pickFlyerTarget({ x: 0, z: 0 }, [ped('kid', 0.5, { isMinor: true })], night)).toBeNull();
    expect(pickFlyerTarget({ x: 0, z: 0 }, [ped('kid', 0.5, { isMinor: true }), ped('adult', 2)], night)?.id).toBe('adult');
  });
  it('skips people who are down, fleeing, seated or already asked, and does nothing without flyers', () => {
    const peds = [ped('d', 1, { state: 'down' }), ped('f', 1, { state: 'fleeing' }), ped('s', 1, { state: 'sitting' }), ped('asked', 1)];
    expect(pickFlyerTarget({ x: 0, z: 0 }, peds, { flyersLeft: 3, asked: ['asked'] })).toBeNull();
    expect(pickFlyerTarget({ x: 0, z: 0 }, [ped('a', 1)], { flyersLeft: 0, asked: [] })).toBeNull();
    expect(pickFlyerTarget({ x: 0, z: 0 }, [ped('a', 1)], null)).toBeNull();
  });
  it('shows a prompt near an adult while a night is open and F hands the flyer over', () => {
    const promo = new Promotion(); promo.startNight('n', 'club', 22, { flyers: 3 });
    const handFlyer = vi.fn((id: string, p: { id: number | string; isMinor: boolean; temperament: 'flee' | 'cower' | 'film' | 'fight' }) => promo.handFlyer(id, p));
    const fp = new FlyerPrompt(document.body, { handFlyer }, (id) => promo.nights.get(id) ?? null);
    fp.update({ x: 0, z: 0 }, [ped('a', 1)], 'n');
    expect(fp.visible).toBe(true); expect(fp.el.textContent).toContain('Hand a flyer'); expect(fp.el.textContent).toContain('3 left');
    const r = fp.press();
    expect(r).not.toBeNull();
    expect(handFlyer).toHaveBeenCalledWith('n', { id: 'a', isMinor: false, temperament: 'film' });
    expect(fp.visible).toBe(false);
  });
  it('shows nothing and sends nothing when only a child is near, when no night is open, or when a panel is up', () => {
    const promo = new Promotion(); promo.startNight('n', 'club', 22, { flyers: 3 });
    const handFlyer = vi.fn(() => ({ kind: 'refusedMinor' } as const));
    const fp = new FlyerPrompt(document.body, { handFlyer }, (id) => promo.nights.get(id) ?? null);
    fp.update({ x: 0, z: 0 }, [ped('kid', 1, { isMinor: true })], 'n');
    expect(fp.visible).toBe(false); expect(fp.press()).toBeNull();
    fp.update({ x: 0, z: 0 }, [ped('a', 1)], null); expect(fp.visible).toBe(false);
    fp.update({ x: 0, z: 0 }, [ped('a', 1)], 'n', true); expect(fp.visible).toBe(false);
    expect(handFlyer).not.toHaveBeenCalled();
  });
  it('a person who was asked is not offered again', () => {
    const promo = new Promotion(); promo.startNight('n', 'club', 22, { flyers: 3 });
    const fp = new FlyerPrompt(document.body, { handFlyer: (i, p) => promo.handFlyer(i, p) }, (id) => promo.nights.get(id) ?? null);
    const a = ped('a', 1);
    fp.update({ x: 0, z: 0 }, [a], 'n'); fp.press();
    fp.update({ x: 0, z: 0 }, [a], 'n'); expect(fp.visible).toBe(false);
  });
});
