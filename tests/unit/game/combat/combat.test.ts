import { describe, expect, it } from 'vitest';
import { Combat } from '@/game/combat/Combat';
import { PISTOL } from '@/game/combat/items';
import { WantedSystem } from '@/game/WantedSystem';
import { EventBus, World2D, fakeInput, fakePlayer, makeCar, makePed, makeWall, recordEvents, soundRecorder } from './helpers';
import type { Pedestrian } from '@/entities/Pedestrian';

const DT = 1 / 60;

function rig(opts: { pistol?: boolean; bottles?: number; bricks?: number } = {}) {
  const events = new EventBus();
  const world = new World2D();
  const player = fakePlayer(0, 0, 0); // facing -z
  const peds: Pedestrian[] = [];
  const input = fakeInput();
  const sfx = soundRecorder();
  const log = recordEvents(events, ['crime', 'pedHit', 'gunshot', 'pedKnockedDown']);
  const combat = new Combat({ events, world, peds: () => peds, player, sfx });
  for (let i = 0; i < (opts.bottles ?? 0); i++) combat.hands.add('bottle');
  for (let i = 0; i < (opts.bricks ?? 0); i++) combat.hands.add('brick');
  if (opts.pistol) combat.hands.add('pistol');
  const frame = (viewYaw = 0, blocked = false) => ({ viewYaw, blocked, input });
  // pedestrians only get their own update when asked: left alone they stand exactly where they were put
  const sim = { tickPeds: false };
  const step = (n: number, viewYaw = 0, blocked = false) => {
    for (let i = 0; i < n; i++) {
      combat.update(DT, frame(viewYaw, blocked));
      if (sim.tickPeds) for (const p of peds) p.update(DT);
      input.edge = false;
    }
  };
  const addPed = (id: string, x: number, z: number) => { const p = makePed(world, events, id, x, z); peds.push(p); return p; };
  return { events, world, player, peds, input, sfx, log, combat, step, addPed, sim };
}

describe('punching', () => {
  it('the first blow staggers, the second knocks down, and the person runs when they get up', () => {
    const r = rig();
    const ped = r.addPed('p1', 0, -0.9);
    r.addPed('witness', 12, 0);
    r.sim.tickPeds = true;
    r.input.press(); r.step(30);          // first jab lands
    expect(ped.state).toBe('fleeing');     // staggered: a startle and off they go
    expect(r.log.filter((l) => l.type === 'pedHit')).toHaveLength(1);
    ped.state = 'walking'; ped.body.pos.z = -0.9; ped.body.pos.x = 0; // they stop in reach again
    r.input.press(); r.step(30);
    expect(ped.state).toBe('down');
    expect(r.log.some((l) => l.type === 'pedKnockedDown')).toBe(true);
    for (let i = 0; i < 60 * 7; i++) r.step(1);
    expect(ped.state).toBe('fleeing'); // up again, and running
  });

  it('three quick presses end in a heavy hit that puts a fresh person down', () => {
    const r = rig();
    r.addPed('b', 0, 12);
    r.input.press(); r.step(22); // jab one into the air
    r.input.press(); r.step(22); // jab two into the air
    const a = r.addPed('a', 0, -1.0);
    r.input.press(); r.step(40); // the third, inside the window, is heavy
    expect(a.state).toBe('down');
    expect(r.log.find((l) => l.type === 'pedHit' && (l.payload as { down: boolean }).down)).toBeTruthy();
  });

  it('misses a pedestrian behind the player or out of reach', () => {
    const r = rig();
    const behind = r.addPed('behind', 0, 0.9);
    const far = r.addPed('far', 0, -2);
    r.input.press(); r.step(30);
    expect(behind.state).not.toBe('down');
    expect(far.state).toBe('walking');
    expect(r.log.filter((l) => l.type === 'pedHit')).toHaveLength(0);
  });

  it('punching a car makes a thud and nothing else', () => {
    const r = rig();
    makeCar(r.world, 'car', 0, -2.2);
    r.input.press(); r.step(30);
    expect(r.sfx.log).toContain('thud');
    expect(r.log).toHaveLength(0);
  });

  it('turns to face a pedestrian who is close but off to the side', () => {
    const r = rig();
    r.addPed('p', -1.0, -0.5); // front-left, 63 degrees off the facing: outside the 35 degree half arc until the body turns
    r.input.press(); r.step(30);
    expect(r.log.filter((l) => l.type === 'pedHit').length).toBe(1);
  });

  it('does nothing in a car, while entering, or while a menu is open', () => {
    const r = rig();
    const ped = r.addPed('p', 0, -0.9);
    r.player.inVehicle = true; r.input.press(); r.step(30);
    expect(ped.state).toBe('walking');
    r.player.inVehicle = false; r.input.press(); r.step(30, 0, true);
    expect(ped.state).toBe('walking');
    expect(r.combat.hudState()?.item).toBe('fists');
  });

  it('dims the hands widget in a car instead of hiding it, and shoots nothing', () => {
    const r = rig({ pistol: true });
    r.combat.cycle(1);
    r.step(2);
    expect(r.combat.hudState()?.dim).toBeUndefined();
    expect(r.combat.hudState()?.aim).toBe(true);
    r.player.inVehicle = true;
    r.input.press(); r.step(30);
    const s = r.combat.hudState();
    expect(s?.dim).toBe(true);
    expect(s?.aim).toBeFalsy();
    expect(s?.item).toBe('pistol');
    expect(r.combat.hands.mag).toBe(12);               // no rounds fired from the car
    expect(r.log.some((l) => l.type === 'gunshot')).toBe(false);
    expect(r.combat.aimBias).toBe(0);
  });
});

describe('aiming', () => {
  it('shows the reticle flag for the pistol and a throwable on foot, never for fists, and kicks with every shot', () => {
    const r = rig({ pistol: true, bottles: 1 });
    r.step(2);
    expect(r.combat.hudState()?.aim).toBe(false);       // fists
    r.combat.cycle(1); r.step(1);
    expect(r.combat.hudState()?.item).toBe('bottle');
    expect(r.combat.hudState()?.aim).toBe(true);
    r.combat.cycle(1); r.step(1);
    expect(r.combat.hudState()?.item).toBe('pistol');
    const before = r.combat.hudState()?.shots;
    r.input.press(); r.step(20);
    expect(r.combat.hudState()?.shots).toBe((before ?? 0) + 1);
    r.step(2, 0, true);                                 // a menu is up: no reticle
    expect(r.combat.hudState()?.aim).toBe(false);
  });
  it('pushes the shoulder bias while the button is held with a pistol or a throwable, and not with fists or empty hands', () => {
    const r = rig({ pistol: true, bricks: 1 });
    r.input.press(); r.step(5);
    expect(r.combat.aimBias).toBe(0);                    // fists punch: no aim
    r.input.release(); r.combat.cycle(1); r.combat.cycle(1); r.step(2);   // bricks, then the pistol
    expect(r.combat.hands.current).toBe('pistol');
    expect(r.combat.aimBias).toBe(0);                    // not held yet
    r.input.press(); r.step(3);
    expect(r.combat.aimBias).toBe(1);
    r.input.release(); r.step(3);
    expect(r.combat.aimBias).toBe(0);
    r.combat.cycle(-1); r.step(1);
    expect(r.combat.hands.current).toBe('brick');
    r.input.press(); r.step(3);
    expect(r.combat.aimBias).toBe(1);
  });
});

describe('the hands are saved and reset', () => {
  it('round trips through serialize / restore, and reset empties them', () => {
    const r = rig({ pistol: true, bottles: 2, bricks: 3 });
    r.combat.cycle(1); r.combat.cycle(1); r.combat.cycle(1);
    r.combat.hands.mag = 5; r.combat.hands.reserve = 20;
    const saved = JSON.parse(JSON.stringify(r.combat.serialize()));
    const r2 = rig();
    r2.combat.restore(saved);
    expect(r2.combat.hands.serialize()).toEqual(r.combat.hands.serialize());
    expect(r2.combat.hands.current).toBe('pistol');
    expect(r2.combat.hudState()).toMatchObject({ item: 'pistol', count: 5, reserve: 20 });
    r2.combat.reset();
    expect(r2.combat.hands.serialize()).toEqual({ bottles: 0, bricks: 0, pistol: false, mag: 0, reserve: 0, current: 'fists' });
  });
  it('a restored game with bad data ends up with empty hands and no crash', () => {
    const r = rig({ pistol: true });
    for (const bad of [null, undefined, 5, 'x', { bottles: 'many', current: 'rocket', pistol: true, mag: 99, reserve: -4 }]) {
      r.combat.restore(bad);
      const h = r.combat.hands;
      expect(h.owns(h.current)).toBe(true);
      expect(h.mag).toBeLessThanOrEqual(12);
      expect(h.reserve).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('people scatter and look', () => {
  it('a hit person turns to face the attacker before running, and a gunshot sends a crowd both ways', () => {
    const r = rig({ pistol: true });
    r.sim.tickPeds = true;
    // a bystander to the left of the shooter faces the shot for a beat, then runs away from it
    const a = r.addPed('a', -6, 0);
    r.combat.cycle(1);
    r.input.press(); r.step(3);
    expect(a.state).toBe('fleeing');
    const x0 = a.body.pos.x;
    r.step(2);
    expect(Math.abs(a.body.pos.x - x0)).toBeLessThan(0.01);   // still frozen: looking
    r.step(60);
    expect(a.body.pos.x).toBeLessThan(x0 - 0.5);              // then away from the shot (the shooter is at x 0)
  });
});

describe('wanted level through the existing system', () => {
  function withWanted() {
    const r = rig();
    const wanted = new WantedSystem(r.events);
    return { ...r, wanted };
  }
  it('a punch that puts someone down in view of others is one star, and never more than one', () => {
    const r = withWanted();
    const v = r.addPed('v', 0, -0.9);
    r.addPed('w', 10, 0);
    r.input.press(); r.step(30);       // stagger: nothing yet
    expect(r.wanted.stars).toBe(0);
    v.state = 'walking'; v.body.pos.x = 0; v.body.pos.z = -0.9;
    r.input.press(); r.step(30);       // down, witnessed
    expect(v.state).toBe('down');
    expect(r.wanted.stars).toBe(1);
    const v2 = r.addPed('v2', 0, -0.9); // a second victim: still one star from fists
    r.input.press(); r.step(30); v2.state = 'walking'; v2.body.pos.z = -0.9;
    r.input.press(); r.step(30);
    expect(r.wanted.stars).toBe(1);
  });
  it('a knockdown with nobody watching is no crime', () => {
    const r = withWanted();
    const v = r.addPed('v', 0, -0.9);
    r.input.press(); r.step(30); v.state = 'walking'; v.body.pos.x = 0; v.body.pos.z = -0.9;
    r.input.press(); r.step(30);
    expect(v.state).toBe('down');
    expect(r.wanted.stars).toBe(0);
  });
  it('a thrown item that hits a person is more, and a gunshot is a lot', () => {
    const t = withWanted();
    t.combat.hands.add('brick'); t.combat.cycle(1);
    t.addPed('v', 0, -6);
    t.input.press(); t.step(80);
    expect(t.wanted.stars).toBe(1);

    const g = withWanted();
    g.combat.hands.add('pistol'); g.combat.cycle(1);
    g.input.press(); g.step(2);
    expect(g.wanted.stars).toBe(2); // one shot, nobody even hit
    g.step(20);
    expect(g.log.filter((l) => l.type === 'gunshot').length).toBeGreaterThanOrEqual(1);
  });
});

describe('throwing', () => {
  it('a bottle leaves the hand after a wind-up, is spent, and knocks the pedestrian it hits down', () => {
    const r = rig({ bottles: 2 });
    r.combat.cycle(1);
    const v = r.addPed('v', 0, -6);
    r.input.press();
    r.step(5);
    expect(r.combat.flying).toHaveLength(0); // still winding up
    r.step(20);
    expect(r.combat.hands.bottles).toBe(1);
    r.step(60);
    expect(v.state).toBe('down');
    expect(r.sfx.log).toContain('glass');
    expect(r.combat.flying).toHaveLength(0);
    expect(r.combat.pickups.droppedCount).toBe(0); // glass is gone
  });

  it('the last bottle puts the fists back in hand', () => {
    const r = rig({ bottles: 1 });
    r.combat.cycle(1);
    r.input.press(); r.step(120);
    expect(r.combat.hands.current).toBe('fists');
  });

  it('a brick that lands stays in the world as a pickup, and walking onto it gets it back', () => {
    const r = rig({ bricks: 1 });
    r.combat.cycle(1);
    r.input.press(); r.step(150);
    expect(r.combat.hands.bricks).toBe(0);
    expect(r.combat.pickups.droppedCount).toBe(1);
    const d = [...r.combat.pickups.active()][0];
    r.player.body.pos.x = d.x; r.player.body.pos.z = d.z;
    r.step(60);
    expect(r.combat.hands.bricks).toBe(1);
    expect(r.combat.pickups.droppedCount).toBe(0);
  });

  it('a brick against a wall thuds and is dropped near it', () => {
    const r = rig({ bricks: 1 });
    makeWall(r.world, 'w', -4);
    r.combat.cycle(1);
    r.input.press(); r.step(150);
    expect(r.sfx.log).toContain('thud');
    const d = [...r.combat.pickups.active()][0];
    expect(d.z).toBeLessThan(0);
    expect(d.z).toBeGreaterThan(-4.5);
  });

  it('turns the body toward the camera yaw for the throw', () => {
    const r = rig({ bottles: 1 });
    r.combat.cycle(1);
    r.input.press(); r.step(3, Math.PI / 2);
    expect(r.player.aimYaw).toBeCloseTo(Math.PI / 2);
  });
});

describe('the pistol', () => {
  it('fires about three shots a second, twelve to a magazine, then reloads from the spare', () => {
    const r = rig({ pistol: true });
    r.combat.cycle(1);
    r.input.press();
    r.step(60); // one second held
    const shots = r.log.filter((l) => l.type === 'gunshot').length;
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(shots).toBeLessThanOrEqual(4);
    // keep holding until the magazine is empty
    for (let i = 0; i < 60 * 4 && r.combat.hands.mag > 0; i++) r.step(1);
    expect(r.combat.hands.mag).toBe(0);
    expect(r.combat.reloading).toBe(true);
    expect(r.sfx.log).toContain('reload');
    r.input.release();
    r.step(Math.ceil(PISTOL.reloadTime / DT) + 2);
    expect(r.combat.hands.mag).toBe(PISTOL.magSize);
    expect(r.combat.hands.reserve).toBe(0);
  });

  it('cannot fire while reloading, and clicks dry with nothing left', () => {
    const r = rig({ pistol: true });
    r.combat.cycle(1);
    r.combat.hands.reserve = 0;
    for (let i = 0; i < PISTOL.magSize; i++) r.combat.hands.fireRound();
    r.input.press(); r.step(30);
    expect(r.sfx.log).toContain('click');
    expect(r.log.filter((l) => l.type === 'gunshot')).toHaveLength(0);
  });

  it('holds the camera and faces the camera yaw while the button is held, and lets go shortly after', () => {
    const r = rig({ pistol: true });
    r.combat.cycle(1);
    expect(r.combat.holdView).toBe(false);
    r.input.press(); r.step(5, 1.2);
    expect(r.combat.holdView).toBe(true);
    expect(r.player.aimYaw).toBeCloseTo(1.2);
    expect(r.player.actionPose?.kind).toBe('aim');
    r.input.release(); r.step(1, 1.2);
    expect(r.combat.holdView).toBe(false);
    expect(r.player.aimYaw).toBeCloseTo(1.2); // still turned for a moment
    r.step(40, 1.2);
    expect(r.player.aimYaw).toBeNull();
  });

  it('a shot puts a pedestrian down, a car gets a tick and a spark, a wall a puff, with the tracer', () => {
    const r = rig({ pistol: true });
    r.combat.cycle(1);
    const ped = r.addPed('v', 0, -15);
    const car = makeCar(r.world, 'car', 0, -30);
    const shot = r.combat.fire(0);
    expect(shot?.target).toBe('ped');
    expect(ped.state).toBe('down');
    ped.body.pos.x = 30; r.world.removeBody('v'); r.peds.length = 0; // out of the way
    expect(r.combat.fire(0)?.target).toBe('vehicle');
    expect(r.sfx.log).toContain('tick');
    r.world.removeBody(car.id);
    makeWall(r.world, 'w', -40);
    expect(r.combat.fire(0)?.target).toBe('wall');
    expect(r.sfx.log.filter((s) => s === 'crack')).toHaveLength(3);
  });

  it('people near a gunshot run', () => {
    const r = rig({ pistol: true });
    r.combat.cycle(1);
    const near = r.addPed('near', 6, 6);
    const far = r.addPed('far', 60, 0);
    r.combat.fire(0);
    expect(near.state).toBe('fleeing');
    expect(far.state).toBe('walking');
  });
});

describe('cycling', () => {
  it('Q-style cycle requests step through what is owned, and are drained while blocked', () => {
    const r = rig({ bricks: 1, pistol: true });
    r.input.cycle = 1; r.step(1);
    expect(r.combat.hands.current).toBe('brick');
    r.input.cycle = 1; r.step(1, 0, true); // menu open: the request is eaten, nothing changes
    expect(r.combat.hands.current).toBe('brick');
    r.step(1);
    expect(r.combat.hands.current).toBe('brick');
    r.input.cycle = -1; r.step(1);
    expect(r.combat.hands.current).toBe('fists');
  });
  it('tells the HUD when the item or the ammunition changes', () => {
    const states: string[] = [];
    const events = new EventBus(); const world = new World2D(); const player = fakePlayer();
    const input = fakeInput();
    const combat = new Combat({ events, world, peds: () => [], player, onHands: (s) => states.push(s ? `${s.item}:${s.count}:${s.reserve}` : 'none') });
    combat.hands.add('pistol'); combat.cycle(1);
    combat.update(DT, { viewYaw: 0, blocked: false, input });
    combat.fire(0);
    expect(states).toContain('pistol:12:12');
    expect(states).toContain('pistol:11:12');
  });
});
