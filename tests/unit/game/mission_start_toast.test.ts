import { describe, it, expect } from 'vitest';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef } from '@/game/missions/types';

const P = (x: number, z = 0) => ({ x, z });
const def = (id: string, title: string, stake?: number): MissionDef => ({
  id, title, blurb: `${title} blurb`, giverPoi: 'x', giver: P(0), triggerRadius: 3, stake, reward: { cash: 10, message: 'ok' },
  objectives: [{ kind: 'goTo', at: P(200), radius: 3, presence: 'onFoot', text: 'go' }],
});

describe('mission start toast', () => {
  it('names the mission and the advance when it pays one', () => {
    const paid: number[] = [];
    const m = new MissionSystem([def('a', 'Crate Digger', 60)], { pay: (c) => paid.push(c) });
    const events: unknown[] = [];
    m.on('mission:started', (e) => events.push(e));
    expect(m.start('a')).toBe(true);
    expect(m.hud.toast).toBe('Mission started: Crate Digger  +$60 advance');
    expect(m.hud.toastKind).toBe('good');
    expect(paid).toEqual([60]);
    expect(events).toEqual([{ id: 'a', title: 'Crate Digger', blurb: 'Crate Digger blurb' }]); // event shape unchanged
  });

  it('plain start without an advance', () => {
    const m = new MissionSystem([def('a', 'Bodega Run')]);
    m.start('a');
    expect(m.hud.toast).toBe('Mission started: Bodega Run');
  });

  it('a retry after the advance was paid does not claim another advance', () => {
    const m = new MissionSystem([def('a', 'Crate Digger', 60)], { pay: () => undefined });
    m.start('a');
    m.abandon();
    m.start('a');
    expect(m.hud.toast).toBe('Mission started: Crate Digger');
  });

  it('hud.inside follows interior enter and exit signals', () => {
    const m = new MissionSystem([def('a', 'Crate Digger')]);
    m.start('a');
    m.notify({ type: 'interior:entered', id: 'wax-deli' });
    expect(m.hud.inside).toBe(true);
    m.notify({ type: 'interior:exited', id: 'wax-deli' });
    expect(m.hud.inside).toBe(false);
  });
});
