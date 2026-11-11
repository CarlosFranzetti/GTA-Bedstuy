/** The story objective kinds on tiny synthetic missions: spots, pay, fork, chase, race, stakeout, stealth tail, escort, when, cargo. */
import { describe, it, expect } from 'vitest';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef, ObjectiveDef } from '@/game/missions/types';

const DT = 1 / 60;
const P = (x: number, z = 0) => ({ x, z });

function mk(objectives: ObjectiveDef[], extra: Partial<MissionDef> = {}, opts: ConstructorParameters<typeof MissionSystem>[1] = {}) {
  const def: MissionDef = { id: 'm', title: 'M', blurb: 'b', giverPoi: 'x', giver: P(0), triggerRadius: 3, objectives, reward: { cash: 1, message: 'ok' }, ...extra };
  const m = new MissionSystem([def], opts);
  const pos = { x: 0, z: 0 };
  const st = { car: false, stars: 0, speed: 0, veh: '' };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) m.update(DT, pos, st.car, st.stars, st.speed, 12, st.veh); };
  const secs = (s: number) => tick(Math.round(s / DT));
  m.start('m');
  return { m, pos, st, tick, secs };
}

describe('spots', () => {
  it('needs F at each point (any order), shows the prompt in reach, and honours ordered', () => {
    const { m, pos, tick } = mk([{ kind: 'spots', points: [P(10), P(30)], radius: 3, prompt: 'Peel', item: 'n', ordered: true, text: 's' }]);
    pos.x = 30; tick();
    expect(m.hud.prompt).toBe(''); // ordered: the second point is not yet live
    expect(m.interact(pos)).toBe(false);
    pos.x = 10; tick();
    expect(m.hud.prompt).toBe('F  Peel');
    expect(m.interact(pos)).toBe(true);
    expect(m.interact(pos)).toBe(false); // already done
    pos.x = 30; tick();
    expect(m.interact(pos)).toBe(true);
    tick();
    expect(m.isCompleted('m')).toBe(true);
    expect(m.carrying).toEqual([]);
  });
});

describe('pay', () => {
  it('spends through the host, refuses when broke, and completes when it goes through', () => {
    let wallet = 30;
    const { m, pos, tick } = mk([{ kind: 'pay', at: P(0), radius: 3, amount: 40, prompt: 'Pay', text: 'p' }], {}, { spend: (n) => { if (wallet < n) return false; wallet -= n; return true; } });
    tick();
    expect(m.hud.prompt).toContain('$40');
    expect(m.interact(pos)).toBe(true);
    expect(m.hud.toast).toContain('Not enough');
    expect(m.isActive).toBe(true);
    wallet = 100; tick();
    expect(m.interact(pos)).toBe(true);
    tick();
    expect(wallet).toBe(60);
    expect(m.isCompleted('m')).toBe(true);
  });
});

describe('fork and when', () => {
  const opts = (): ObjectiveDef[] => [
    { kind: 'fork', id: 'f', text: 'choose', options: [{ label: 'A', at: P(0), radius: 3, flag: 'a', cash: 50 }, { label: 'B', at: P(20), radius: 3, flag: 'b', cash: -20 }, { label: 'C', at: P(40), radius: 3, flag: 'c', when: { flag: 'unlock' } }] },
    { kind: 'timer', seconds: 0.5, text: 'only a', when: { flag: 'a' } },
    { kind: 'timer', seconds: 0.5, text: 'only b', when: { flag: 'b' } },
    { kind: 'timer', seconds: 0.5, text: 'not a', when: { not: 'a' } },
  ];
  it('marks one ring per open option, F takes the ring you stand in, and the branch skips the other beats', () => {
    const paid: number[] = [], flags: string[] = [], seen: string[] = [];
    const { m, pos, st, tick, secs } = mk(opts(), {}, { pay: (n) => paid.push(n), spend: () => true, setFlag: (f) => flags.push(f) });
    m.on('mission:objective', (e) => seen.push(e.text));
    expect(m.markers.map((k) => k.label)).toEqual(['A', 'B']); // C is hidden until 'unlock'
    pos.x = 20; tick();
    expect(m.hud.prompt).toBe('F  B');
    expect(m.interact(pos)).toBe(true);
    expect(m.story.has('b')).toBe(true);
    expect(m.story.choiceOf('f')).toBe('b');
    expect(flags).toEqual(['b']);
    secs(2);
    expect(seen).toEqual(['only b', 'not a']);
    expect(m.isCompleted('m')).toBe(true);
    expect(st.car).toBe(false);
    expect(paid).toEqual([1]); // -20 went through spend(); only the reward was paid in
  });
  it('a hidden option appears once its flag is set, and a plain press outside any ring does nothing', () => {
    const { m, pos, tick } = mk(opts());
    m.story.set('unlock');
    m.abandon(); m.start('m');
    expect(m.markers.map((k) => k.label)).toEqual(['A', 'B', 'C']);
    pos.x = 100; tick();
    expect(m.interact(pos)).toBe(false);
  });
  it('leading objectives that fail their rule are skipped at the start', () => {
    const { m } = mk([{ kind: 'timer', seconds: 1, text: 'skipped', when: { flag: 'nope' } }, { kind: 'timer', seconds: 1, text: 'first real', }]);
    expect(m.hud.objective).toBe('first real');
    expect(m.objectiveIndex).toBe(1);
  });
});

describe('chase and race', () => {
  it('chase: catch the runner inside the radius to win, let it reach the end and you lose it', () => {
    const route = [P(10), P(110)];
    const a = mk([{ kind: 'chase', route, speed: 5, catchRadius: 3, target: 'kid', text: 'c', stumbles: [{ at: 0.3, pause: 3 }] }]);
    // chaser at 7 m/s from the start line
    let chased = false;
    for (let i = 0; i < 60 * 40 && a.m.isActive; i++) {
      const rv = a.m.markers.find((k) => k.id.endsWith('rival'));
      if (rv) { const d = Math.hypot(rv.x - a.pos.x, rv.z - a.pos.z) || 1; const s = Math.min(d, 7 * DT); a.pos.x += ((rv.x - a.pos.x) / d) * s; a.pos.z += ((rv.z - a.pos.z) / d) * s; chased = true; }
      a.tick();
    }
    expect(chased).toBe(true);
    expect(a.m.isCompleted('m')).toBe(true);
    const b = mk([{ kind: 'chase', route, speed: 5, catchRadius: 3, target: 'kid', text: 'c' }]);
    b.secs(25);
    expect(b.m.failReason).toBe('lostTarget');
  });

  it('race: checkpoints in order beat the rival; sit still and the rival wins', () => {
    const route = [P(0), P(50), P(100), P(150)];
    const win = mk([{ kind: 'race', route, radius: 6, rivalSpeed: 8, rival: 'r', text: 'r' }]);
    win.st.car = true;
    for (let i = 0; i < 60 * 30 && win.m.isActive; i++) { win.pos.x += 14 * DT; win.st.speed = 14; win.tick(); }
    expect(win.m.isCompleted('m')).toBe(true);
    const lose = mk([{ kind: 'race', route, radius: 6, rivalSpeed: 8, rival: 'r', text: 'r' }]);
    lose.st.car = true;
    lose.secs(25);
    expect(lose.m.failReason).toBe('lostRace');
  });
});

describe('stakeout, stealth tail, escort', () => {
  it('stakeout counts time inside, ignores the approach, fails when you leave your post for too long', () => {
    const a = mk([{ kind: 'stakeout', at: P(50), radius: 5, seconds: 5, slack: 2, text: 's', events: [{ at: 1, text: 'someone arrives' }] }]);
    a.secs(10); // still on the way: no failure yet
    expect(a.m.isActive).toBe(true);
    a.pos.x = 50; a.secs(1.5);
    expect(a.m.hud.toast).toBe('someone arrives');
    a.secs(4);
    expect(a.m.isCompleted('m')).toBe(true);
    const b = mk([{ kind: 'stakeout', at: P(50), radius: 5, seconds: 20, slack: 2, text: 's' }]);
    b.pos.x = 50; b.secs(1); b.pos.x = 90; b.secs(3);
    expect(b.m.failReason).toBe('blownCover');
  });

  it('a stealth tail is made when too close for 2.5 s but survives brief approaches', () => {
    const tail = (): ObjectiveDef => ({ kind: 'tail', route: [P(0), P(300)], speed: 8, maxDistance: 50, minDistance: 15, target: 't', text: 't' });
    const a = mk([tail()]);
    for (let i = 0; i < 60 * 6 && a.m.isActive; i++) { const k = a.m.markers[0]; a.pos.x = k.x + 5; a.tick(); }
    expect(a.m.failReason).toBe('spotted');
    const b = mk([tail()]);
    b.pos.x = 30; b.tick(); // engage in the band, then a quick close pass
    for (let i = 0; i < 60; i++) { const k = b.m.markers[0]; b.pos.x = k.x + (i < 60 ? 5 : 30); b.tick(); }
    expect(b.m.isFailed).toBe(false);
  });

  it('an escort target waits for you while you are within the abandon range, and only abandonment fails it', () => {
    const esc = (): ObjectiveDef => ({ kind: 'tail', route: [P(0), P(100)], speed: 3, maxDistance: 30, waitDistance: 8, grace: 5, target: 'dee', text: 'e' });
    const a = mk([esc()]);
    a.pos.x = 2; a.tick();
    const k0 = a.m.markers[0].x;
    a.pos.x = 2 - 20; // 22 m behind, still inside 30
    a.secs(3);
    expect(a.m.markers[0].x).toBeCloseTo(k0, 0);   // waited
    expect(a.m.isFailed).toBe(false);
    a.pos.x = -200; a.secs(6);
    expect(a.m.failReason).toBe('lostTarget');
  });
});

describe('fragile cargo and vehicle gates', () => {
  const fr = { label: 'Eggs', hp: 100, minImpact: 2, perImpact: 5 };
  it('wears down only during cargo objectives, fails at zero, and reports health', () => {
    const { m, tick } = mk([{ kind: 'timer', seconds: 1, text: 'free', }, { kind: 'timer', seconds: 20, text: 'carry', cargo: true }], { fragile: fr });
    m.notify({ type: 'impact', strength: 50 }); tick();
    expect(m.cargoHealth).toBe(100); // not a cargo objective yet
    tick(70);
    expect(m.objectiveIndex).toBe(1);
    m.notify({ type: 'impact', strength: 6 }); tick();
    expect(m.cargoHealth).toBe(80);
    expect(m.hud.carrying).toBe('Eggs 80%');
    m.notify({ type: 'impact', strength: 30 }); tick();
    expect(m.failReason).toBe('cargoBroken');
  });
  it('a vehicle gate waits for the right type, relaxes after 45 s, and is waived when the host reports none', () => {
    const a = mk([{ kind: 'enterVehicle', vehicle: ['bus'], text: 'bus' }]);
    a.st.car = true; a.st.veh = 'sedan'; a.secs(10);
    expect(a.m.isActive).toBe(true);
    a.secs(40);
    expect(a.m.isCompleted('m')).toBe(true);
    const b = mk([{ kind: 'enterVehicle', vehicle: ['bus'], text: 'bus' }]);
    b.st.car = true; b.st.veh = 'bus'; b.secs(0.2);
    expect(b.m.isCompleted('m')).toBe(true);
    const c = mk([{ kind: 'enterVehicle', vehicle: ['bus'], text: 'bus' }]);
    c.st.car = true; c.st.veh = ''; c.secs(0.2);
    expect(c.m.isCompleted('m')).toBe(true);
  });
  it('requiresFlags and forbidFlags gate the offer and the pointer', () => {
    const defs: MissionDef[] = [
      { id: 'x', title: 'X', blurb: 'b', giverPoi: 'p', giver: P(0), triggerRadius: 3, objectives: [{ kind: 'timer', seconds: 1, text: 't' }], reward: { cash: 1, message: 'm' }, requiresFlags: ['k'] },
      { id: 'y', title: 'Y', blurb: 'b', giverPoi: 'p', giver: P(100), triggerRadius: 3, objectives: [{ kind: 'timer', seconds: 1, text: 't' }], reward: { cash: 1, message: 'm' }, forbidFlags: ['k'] },
    ];
    const m = new MissionSystem(defs);
    expect(m.isOffered('x')).toBe(false);
    expect(m.isOffered('y')).toBe(true);
    m.story.set('k');
    expect(m.isOffered('x')).toBe(true);
    expect(m.isOffered('y')).toBe(false);
  });
});
