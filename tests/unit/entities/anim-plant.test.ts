import { describe, expect, it } from 'vitest';
import { play, footSlide, floatSink, maxJump } from './anim-measure';
import { SCENARIOS } from './anim-scenarios';

// ANIM2: feet that plant, blends that do not pop. Limits are the measured results with a margin (docs/swarm/tasks/ANIM2.md).
describe('feet that plant', () => {
  for (const [name, v, limit] of [['walk', 1.8, 0.02], ['jog', 3.0, 0.02]] as const) {
    it(`${name}: a planted foot (ball on the ground) moves under 2 cm per stance`, () => {
      const s = play({ seconds: 8, speed: () => v, ankles: true });
      const sl = footSlide({ frames: s.frames.slice(120), dt: s.dt });
      expect(sl.stances).toBeGreaterThan(8);
      expect(sl.max).toBeLessThan(limit);
    });
  }
  it('the lowest sole sits on the ground at walk and jog, never through it', () => {
    for (const v of [1.8, 3.0, 6.5]) {
      const s = play({ seconds: 6, speed: () => v, ankles: true });
      const f = floatSink({ frames: s.frames.slice(120), dt: s.dt });
      expect(f.min).toBeGreaterThan(-0.005);
      if (v < 2) expect(f.max).toBeLessThan(0.005);
    }
  });
  it('a cheap controller (far level) never takes the legs over', () => {
    let used = 0;
    play({ seconds: 3, speed: () => 1.8, ankles: true, setup: (c) => { c.cheap = true; }, onFrame: (c) => { used += c.footLock[0] + c.footLock[1]; } });
    expect(used).toBe(0);
  });
});

describe('blends that do not pop', () => {
  const run = (k: string): number => { const sc = SCENARIOS[k]; return maxJump(play({ seconds: sc.seconds, speed: sc.speed, extra: sc.extra, ankles: true })).deg; };
  it('a turn on the spot ends without the mirrored pose flipping in (was 137 degrees in one frame)', () => { expect(run('turn90')).toBeLessThan(25); });
  it('a start and a stop of a walk change no joint by more than a stride does', () => {
    expect(run('start')).toBeLessThan(20);
    expect(run('stop')).toBeLessThan(20);
    expect(run('stopSnap')).toBeLessThan(25);
  });
  it('a corner while walking and a speed change are as smooth as the steady stride', () => {
    expect(run('corner')).toBeLessThan(20);
    expect(run('walkJogSprint')).toBeLessThan(25);
  });
});
