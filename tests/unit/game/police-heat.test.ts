import { describe, expect, it } from 'vitest';
import { HeatModel, HEAT_FADE, HEAT_WARN, SERIOUS_COOLDOWN, WARN_WINDOW } from '@/game/police/heat';

const run = (h: HeatModel, s: number): void => { for (let t = 0; t < s; t += 0.1) h.update(0.1); };

describe('HeatModel', () => {
  it('builds heat from seen minor acts and fades it in about a minute', () => {
    const h = new HeatModel();
    h.crime('punch', true, 0);
    expect(h.heat).toBe(30);
    run(h, 30 / HEAT_FADE + 0.5);
    expect(h.heat).toBe(0);
    // a full bar (just under the star line) drains in well under 90 s
    h.heat = 99;
    run(h, 80);
    expect(h.heat).toBe(0);
  });

  it('one punch is heat only; two punches warn and add no star', () => {
    const h = new HeatModel();
    let r = h.crime('punch', true, 0);
    expect(r).toMatchObject({ stars: 0, reason: null, warned: false });
    r = h.crime('punch', true, 0);
    expect(r.stars).toBe(0);
    expect(r.warned).toBe(true);
    expect(h.heat).toBeGreaterThanOrEqual(HEAT_WARN);
    expect(h.warning).toBe(true);
  });

  it('a minor act after the warning is a star; after the window it is not', () => {
    const a = new HeatModel();
    a.crime('punch', true, 0); a.crime('punch', true, 0);
    run(a, 3);
    const r = a.crime('punch', true, 0);
    expect(r).toMatchObject({ stars: 1, reason: 'ignored-warning' });
    expect(a.heat).toBeLessThanOrEqual(40);

    const b = new HeatModel();
    b.crime('punch', true, 0); b.crime('punch', true, 0);
    run(b, WARN_WINDOW + 1);
    expect(b.warning).toBe(false);
    expect(b.crime('punch', true, 0).stars).toBe(0); // heat has fallen, the warning has lapsed
  });

  it('three or four small acts in a minute reach one star', () => {
    const h = new HeatModel();
    let stars = 0;
    let acts = 0;
    for (let i = 0; i < 6 && stars === 0; i++) { stars = h.crime('hitParked', true, stars).stars; acts++; run(h, 8); }
    expect(stars).toBe(1);
    expect(acts).toBeGreaterThanOrEqual(3);
    expect(acts).toBeLessThanOrEqual(4);
  });

  it('with a star already, heat itself raises the level; minor acts stop at two stars', () => {
    const h = new HeatModel();
    let stars = 1;
    for (let i = 0; i < 4; i++) stars = h.crime('punch', true, stars).stars;
    expect(stars).toBe(2);
    for (let i = 0; i < 8; i++) stars = h.crime('punch', true, stars).stars;
    expect(stars).toBe(2);
  });

  it('unseen crimes add a quarter of the heat and never a star', () => {
    const h = new HeatModel();
    let stars = 0;
    for (let i = 0; i < 30; i++) stars = h.crime('punch', false, stars).stars;
    expect(stars).toBe(0);
    expect(h.heat).toBeLessThan(100);
    const g = new HeatModel();
    expect(g.crime('gunshot', false, 0).stars).toBe(0);
    expect(g.heat).toBe(10);
  });

  it('serious crimes seen are a star at once, once per cooldown, up to their cap', () => {
    const h = new HeatModel();
    expect(h.crime('gunshot', true, 0).stars).toBe(1);
    expect(h.crime('gunshot', true, 1).stars).toBe(1); // same volley
    run(h, SERIOUS_COOLDOWN + 0.5);
    expect(h.crime('gunshot', true, 1).stars).toBe(2);
    run(h, SERIOUS_COOLDOWN + 0.5);
    expect(h.crime('gunshot', true, 2).stars).toBe(2); // capped
    expect(new HeatModel().crime('hitPed', true, 0).stars).toBe(1);
    expect(new HeatModel().crime('hitCop', true, 2).stars).toBe(3);
  });

  it('grace: minor acts are free, serious crimes still count, and it runs out', () => {
    const h = new HeatModel();
    h.setGrace(120);
    for (let i = 0; i < 6; i++) h.crime('punch', true, 0);
    expect(h.heat).toBe(0);
    expect(h.crime('gunshot', true, 0).stars).toBe(1);
    run(h, 121);
    expect(h.graceLeft).toBe(0);
    h.crime('punch', true, 0);
    expect(h.heat).toBeGreaterThan(0);
  });
});
