import { describe, it, expect } from 'vitest';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef } from '@/game/missions/types';

const P = (x: number, z = 0) => ({ x, z });
const def: MissionDef = {
  id: 'p1', title: 'Crate Digger', blurb: 'go', giverPoi: 'x', giver: P(0), triggerRadius: 5, timeLimit: 480,
  objectives: [{ kind: 'goTo', at: P(100), radius: 4, presence: 'any', text: 'go' }],
  reward: { cash: 10, message: 'ok' },
};

describe('mission clock while a shop / decks panel is open', () => {
  it('main.ts passes dt = 0 while uiOpen(): timeLeft, elapsed-based failure and objective stay put', () => {
    const m = new MissionSystem([def]);
    m.update(1 / 60, P(50), false, 0); m.update(1 / 60, P(0), false, 0);
    expect(m.hud.status).toBe('active');
    for (let i = 0; i < 60 * 10; i++) m.update(1 / 60, P(0), false, 0);
    const before = m.hud.timeLeft;
    expect(before).toBeCloseTo(470, 0);
    // the panel is open for 20 minutes of wall time: the host feeds dt = 0
    let uiOpen = true;
    for (let i = 0; i < 60 * 60 * 20; i++) m.update(uiOpen ? 0 : 1 / 60, P(0), false, 0);
    expect(m.hud.status).toBe('active');
    expect(m.hud.timeLeft).toBe(before);
    uiOpen = false;
    for (let i = 0; i < 60 * 5; i++) m.update(uiOpen ? 0 : 1 / 60, P(0), false, 0);
    expect(m.hud.timeLeft).toBeCloseTo(before - 5, 0);
  });
  it('without the pause the same wait would have failed the job (why the host line matters)', () => {
    const m = new MissionSystem([def]);
    m.update(1 / 60, P(50), false, 0); m.update(1 / 60, P(0), false, 0);
    for (let i = 0; i < 60 * 500; i++) m.update(1 / 60, P(0), false, 0);
    expect(m.hud.status).toBe('failed');
  });
});
