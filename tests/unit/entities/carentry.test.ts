/**
 * CARENTRY (owner, 27 Nov: "make sure enter exit car is smooth and no glitching camera showing in between the models; for the car
 * should be instant like gta"; he chose: the camera cuts, with a short animation).
 * Four vehicle types, from the driver's side, the passenger side, from behind and with a wall beside the player, in Classic and Modern,
 * at 30, 60 and 144 updates a second: on every frame from the press to the settled view the lens is outside the car's box, the
 * character's capsule and the wall, never nearer to them than the near plane, the camera cuts on the press and the whole move is
 * about half a second at a door.
 */
import { describe, expect, it } from 'vitest';
import { APPROACHES, TYPES, runCase } from './carentry-sweep';

const RATES = [30, 60, 144];
const STYLES = ['classic', 'modern'] as const;

describe('CARENTRY: lens never inside the car, the character or a wall', () => {
  for (const style of STYLES) for (const type of TYPES) for (const approach of APPROACHES) {
    it(`${style} ${type} ${approach}`, () => {
      for (const fps of RATES) {
        const r = runCase({ type, approach, style, fps });
        const tag = `${style} ${type} ${approach} @${fps}`;
        expect(r.m.framesInCar, `${tag}: frames with the lens inside the car box (first at ${r.m.firstInCar})`).toBe(0);
        expect(r.m.framesInBody, `${tag}: frames with the lens inside the character (first at ${r.m.firstInBody})`).toBe(0);
        expect(r.m.framesInWall, `${tag}: frames with the lens inside the wall (first at ${r.m.firstInWall})`).toBe(0);
        expect(r.m.framesNearClip, `${tag}: frames with the lens within the near plane of the car or the character (first at ${r.m.firstNearClip})`).toBe(0);
        if (approach === 'driver-wall') expect(r.m.minWallDist, `${tag}: lens to wall`).toBeGreaterThan(0.1);
        // the lens never flies through space between the two views: outside the cut frames it moves with the body it follows
        expect(r.m.maxRelStep, `${tag}: biggest lens step relative to its subject outside a cut`).toBeLessThan(0.1);
      }
    }, 120000);
  }
});

describe('CARENTRY: a cut on the press, about half a second', () => {
  for (const style of STYLES) for (const type of TYPES) {
    it(`${style} ${type}: cut at the press, driving in 0.5 s at a door, settled at once, exit cut`, () => {
      for (const fps of RATES) for (const approach of ['driver', 'passenger', 'driver-wall'] as const) {
        const r = runCase({ type, approach, style, fps });
        const tag = `${style} ${type} ${approach} @${fps}`;
        const f = r.frames, i0 = r.iEnter;
        // the first frame after the press that the player is entering is a camera cut into the car view
        const iCut = f.findIndex((x, i) => i >= i0 && x.mode === 'vehicle');
        expect(iCut, tag).toBeGreaterThanOrEqual(i0);
        expect(f[iCut].camCut, `${tag}: the switch to the car view is a cut`).toBe(true);
        expect((iCut - i0) / fps, `${tag}: seconds from the press to the cut`).toBeLessThanOrEqual(2 / fps + 1e-6);
        expect(r.m.enterPressToDrive, `${tag}: press to driving`).toBeGreaterThan(0.4);
        expect(r.m.enterPressToDrive, `${tag}: press to driving`).toBeLessThan(0.56);
        expect(r.m.enterSettled, `${tag}: press to a settled lens`).toBeLessThan(0.3);
        // leaving: a cut back to the on-foot view, settled at once
        const iOut = r.iOut;
        expect(f[iOut].mode, tag).toBe('foot');
        expect(f.slice(iOut, iOut + 3).some((x) => x.camCut), `${tag}: the exit is a cut`).toBe(true);
        expect(r.m.exitSettled, `${tag}: exit to a settled lens`).toBeLessThan(0.3);
      }
    }, 120000);
  }

  it('a door farther than 1.5 m: a longer walk round the car, still filmed from a clear lens, driving within 1.6 s', () => {
    for (const style of STYLES) for (const type of TYPES) {
      const r = runCase({ type, approach: 'behind', style, fps: 60 });
      expect(r.m.enterPressToDrive, `${style} ${type}`).toBeGreaterThan(0.6);
      expect(r.m.enterPressToDrive, `${style} ${type}`).toBeLessThan(1.6);
    }
  }, 120000);
});
