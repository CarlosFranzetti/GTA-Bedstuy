// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TouchPrefs } from '@/ui/TouchControls';
import { Tutorial, GRACE_AFTER_DONE, GRACE_AFTER_SKIP, GRACE_NEW_GAME, GRACE_RUNNING, HINT_SECONDS } from '@/ui/tutorial/Tutorial';
import { tutorialRows } from '@/ui/tutorial/rows';
import { TUTORIAL_STORE_KEY, TutorialStore } from '@/ui/tutorial/store';
import { fakeGame, frames, keydown, makeTutorial, memoryStorage } from './tutorial-fake';

const card = (m: { root: HTMLElement }): HTMLElement => m.root.querySelector('.tut-card') as HTMLElement;
const line = (m: { root: HTMLElement }): string => (m.root.querySelector('.tut-line')?.textContent ?? '');

describe('tutorial: when it starts', () => {
  it('starts once, the moment the title is dismissed, on a new game', () => {
    const m = makeTutorial();
    m.g.state.splash = true;
    frames(m.t, 2);
    expect(m.t.active).toBe(false);
    expect(card(m).hidden).toBe(true);
    m.g.state.splash = false;
    frames(m.t, 0.2);
    expect(m.t.active).toBe(true);
    expect(line(m)).toBe('Move the mouse to look around.');
    expect(m.store.started).toBe(true);
  });

  it('never starts when a save was loaded, and shows no hint either', () => {
    const m = makeTutorial({ loadedSave: true });
    m.g.state.raining = true; m.g.events.emit('wantedChanged', { stars: 2 });
    frames(m.t, 3);
    expect(m.t.active).toBe(false);
    expect(card(m).hidden).toBe(true);
    expect(m.store.started).toBe(false);
  });

  it('never starts again on this device once it has run (a new game on the same machine)', () => {
    const storage = memoryStorage();
    const a = makeTutorial({ storage });
    frames(a.t, 0.2);
    expect(a.t.active).toBe(true);
    a.t.dispose();
    const b = makeTutorial({ storage });
    frames(b.t, 1);
    expect(b.t.active).toBe(false);
    expect(b.grace[0]).toBe(GRACE_NEW_GAME);    // the old new-game grace is still given
  });

  it('keeps working with no storage at all', () => {
    const m = makeTutorial({ store: new TutorialStore(null) });
    frames(m.t, 0.2);
    expect(m.t.active).toBe(true);
  });

  it('on a phone it marks the old first-run card as seen, so nobody sees both', () => {
    localStorage.removeItem(TouchPrefs.TUTORIAL_KEY);
    makeTutorial();
    expect(localStorage.getItem(TouchPrefs.TUTORIAL_KEY)).toBe('1');
  });
});

describe('tutorial: the card', () => {
  it('shows the instruction, the why, the dots and Skip tutorial with its key', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    expect(line(m)).toContain('look around');
    expect(card(m).querySelector('.tut-why')?.textContent).toMatch(/camera follows/i);
    expect(card(m).querySelectorAll('.tut-dots i').length).toBeGreaterThan(10);
    expect(card(m).querySelector('.tut-skip')?.textContent).toContain('Skip tutorial');
    expect(card(m).querySelector('.tut-skip kbd')?.textContent).toBe('Backspace');
  });

  it('never takes the pointer: no handlers, nothing focusable, pointer-events none in the style sheet; only the phone buttons take a tap', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    expect(card(m).querySelectorAll('button, a, input, [tabindex]').length).toBe(0);
    const css = readFileSync('src/ui/tutorial/tutorial.css', 'utf8');
    expect(css).toMatch(/\.tut-card \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.tut-btn \{[^}]*pointer-events: auto/);
    m.g.input.setMode('touch');
    frames(m.t, 0.1);
    expect(card(m).querySelectorAll('button').length).toBe(1);   // Skip tutorial
    expect(card(m).querySelector('button')?.textContent).toBe('Skip tutorial');
  });

  it('switching device mid-step redraws the line for the device in hand', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    expect(line(m)).toBe('Move the mouse to look around.');
    m.g.input.setMode('gamepad'); frames(m.t, 0.1);
    expect(line(m)).toBe('Push the Right stick to look around.');
    m.g.input.setMode('touch'); frames(m.t, 0.1);
    expect(line(m)).toBe('Drag on the right side of the screen to look around.');
    m.g.input.setMode('keyboard'); frames(m.t, 0.1);
    expect(line(m)).toBe('Move the mouse to look around.');
  });

  it('a rebind redraws the keys on the card', () => {
    const m = makeTutorial();
    const walk = (): string => { m.g.state.yaw += 0; return line(m); };
    frames(m.t, 0.3);
    m.g.state.yaw = 1.2; frames(m.t, 0.1);              // look done
    frames(m.t, 1.2);
    expect(walk()).toBe('Hold W A S D to walk.');
    m.g.bindings.rebind('moveForward', 0, 'KeyI');
    frames(m.t, 0.1);
    expect(line(m)).toBe('Hold I A S D to walk.');
  });

  it('hides while a panel is open, waits, and comes back where it was', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    const t0 = m.t.engine.stepTime;
    m.g.state.panel = 'menu';
    frames(m.t, 30);
    expect(card(m).classList.contains('on')).toBe(false);
    expect(m.t.engine.stepTime).toBeCloseTo(t0, 3);
    m.g.state.panel = null;
    frames(m.t, 0.1);
    expect(card(m).classList.contains('on')).toBe(true);
    expect(m.t.engine.current?.id).toBe('look');
  });

  it('hides while a room, a mission beat or the title is up', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    m.g.state.blocked = true; frames(m.t, 0.1);
    expect(card(m).classList.contains('on')).toBe(false);
    m.g.state.blocked = false; frames(m.t, 0.1);
    expect(card(m).classList.contains('on')).toBe(true);
  });
});

describe('tutorial: skip and move on', () => {
  it('Backspace skips the whole tutorial in one press; the grace period is short afterwards', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    keydown('Backspace');
    expect(m.t.active).toBe(false);
    expect(m.store.outcome).toBe('skipped');
    expect(m.grace[m.grace.length - 1]).toBe(GRACE_AFTER_SKIP);
    frames(m.t, 1);
    expect(card(m).classList.contains('on')).toBe(false);
  });

  it('Backspace does nothing while a panel is open (the menu owns the keys)', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    m.g.state.panel = 'menu'; frames(m.t, 0.1);
    keydown('Backspace');
    expect(m.t.active).toBe(true);
  });

  it('Enter moves past a step only once the card offers it (45 s)', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    keydown('Enter');
    expect(m.t.engine.current?.id).toBe('look');
    frames(m.t, 46);
    expect(card(m).querySelector('.tut-why')?.textContent).toMatch(/Taking a while\? Enter moves on/);
    keydown('Enter');
    frames(m.t, 1.2);
    expect(m.t.engine.current?.id).toBe('walk');
  });

  it('the pad skips with the d-pad down; the phone with the button', () => {
    let down = false;
    const m = makeTutorial({ padSkipEdge: () => down });
    m.g.input.setMode('gamepad');
    frames(m.t, 0.3);
    expect(card(m).querySelector('.tut-skip kbd')?.textContent).toBe('D-pad down');
    down = true; frames(m.t, 0.1);
    expect(m.t.active).toBe(false);
    const p = makeTutorial();
    p.g.input.setMode('touch'); frames(p.t, 0.3);
    (card(p).querySelector('.tut-skip') as HTMLButtonElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(p.t.active).toBe(false);
  });

  it('a step whose key has no binding moves on by itself', () => {
    const m = makeTutorial();
    m.g.bindings.clearSlot('moveLeft', 0); m.g.bindings.clearSlot('moveForward', 0);
    frames(m.t, 0.3); m.g.state.yaw = 2; frames(m.t, 1.5);          // look done
    expect(m.t.engine.current?.id).toBe('walk');
    frames(m.t, 3.6);
    expect(m.t.engine.current?.id).not.toBe('walk');   // (the tick then the next step)
  });
});

describe('tutorial: police grace', () => {
  it('is topped up while it runs, and a short while is left after it', () => {
    const m = makeTutorial();
    expect(m.grace).toEqual([GRACE_NEW_GAME]);
    frames(m.t, 0.2);
    expect(m.grace[m.grace.length - 1]).toBe(GRACE_RUNNING);
    const n = m.grace.length;
    frames(m.t, 12);
    expect(m.grace.length).toBeGreaterThan(n);
    keydown('Backspace');
    expect(m.grace[m.grace.length - 1]).toBe(GRACE_AFTER_SKIP);
    expect(GRACE_AFTER_DONE).toBeGreaterThan(GRACE_AFTER_SKIP);
  });

  it('a saved game gets no grace from the tutorial', () => {
    const m = makeTutorial({ loadedSave: true });
    frames(m.t, 1);
    expect(m.grace).toEqual([]);
  });
});

describe('tutorial: replay and the menu rows', () => {
  it('Replay tutorial forgets the first run and starts again from the top', () => {
    const m = makeTutorial();
    frames(m.t, 0.3); keydown('Backspace');
    expect(m.t.active).toBe(false);
    m.t.replay();
    frames(m.t, 0.3);
    expect(m.t.active).toBe(true);
    expect(m.t.engine.current?.id).toBe('look');
    expect(m.store.started).toBe(true);
  });

  it('Replay works on a session that began from a loaded save', () => {
    const m = makeTutorial({ loadedSave: true });
    frames(m.t, 0.3);
    expect(m.t.active).toBe(false);
    m.t.replay(); frames(m.t, 0.3);
    expect(m.t.active).toBe(true);
  });

  it('the two rows: Replay tutorial closes the menu and replays; Hints is a toggle that persists', () => {
    const m = makeTutorial();
    let closed = 0;
    const rows = tutorialRows(m.t, () => { closed++; });
    expect(rows.map((r) => r.label)).toEqual(['Replay tutorial', 'Hints']);
    rows[0].press!();
    expect(closed).toBe(1);
    expect(rows[1].kind).toBe('toggle');
    expect(rows[1].get!()).toBe(true);
    (rows[1].set as (v: boolean) => void)(false);
    expect(rows[1].get!()).toBe(false);
    expect(JSON.parse(m.storage.data.get(TUTORIAL_STORE_KEY)!).hints).toBe(false);
    expect(new TutorialStore(m.storage).hintsOn).toBe(false);
  });

  it('cancel() (a save was loaded under it) takes the card away and never brings it back', () => {
    const m = makeTutorial();
    frames(m.t, 0.3);
    m.t.cancel();
    frames(m.t, 2);
    expect(m.t.active).toBe(false);
    expect(card(m).classList.contains('on')).toBe(false);
  });

  it('saves nothing in a save slot: the only key written is the tutorial\'s own', () => {
    const m = makeTutorial();
    frames(m.t, 0.3); keydown('Backspace');
    expect([...m.storage.data.keys()]).toEqual([TUTORIAL_STORE_KEY]);
  });
});

describe('tutorial: hints', () => {
  const finish = (m: ReturnType<typeof makeTutorial>): void => { frames(m.t, 0.3); keydown('Backspace'); frames(m.t, 0.3); };

  it('the first time wanted: one hint, then never again (even after a restart)', () => {
    const storage = memoryStorage();
    const m = makeTutorial({ storage }); finish(m);
    m.g.events.emit('wantedChanged', { stars: 1 });
    frames(m.t, 0.3);
    expect(line(m)).toMatch(/You are wanted/);
    expect(card(m).querySelector('.tut-why')?.textContent).toMatch(/turn hints off in Settings/);
    frames(m.t, HINT_SECONDS + 0.5);
    expect(card(m).classList.contains('on')).toBe(false);
    m.g.events.emit('wantedChanged', { stars: 2 });
    frames(m.t, 0.5);
    expect(card(m).classList.contains('on')).toBe(false);
    m.t.dispose();
    const again = makeTutorial({ storage });
    again.g.events.emit('wantedChanged', { stars: 1 });
    frames(again.t, 0.5);
    expect(card(again).classList.contains('on')).toBe(false);
  });

  it('wanted at zero stars is not a hint', () => {
    const m = makeTutorial(); finish(m);
    m.g.events.emit('wantedChanged', { stars: 0 }); frames(m.t, 0.3);
    expect(card(m).classList.contains('on')).toBe(false);
  });

  it('a shop, a record bought, the decks and the first rain each get one hint', () => {
    const m = makeTutorial(); finish(m);
    const seen: string[] = [];
    const next = (): void => { frames(m.t, 0.3); seen.push(line(m)); frames(m.t, HINT_SECONDS + 0.5); };
    m.g.events.emit('interior:entered', { id: 'home' }); frames(m.t, 0.3);
    expect(card(m).classList.contains('on')).toBe(false);      // not a shop
    m.g.events.emit('interior:entered', { id: 'wax-deli' }); next();
    m.g.events.emit('shop:bought', { recordId: 'x', price: 5, shop: 'wax-deli' }); next();
    m.g.state.prompt = 'F  Play the turntables'; next();
    m.g.state.raining = true; next();
    expect(seen[0]).toBe('The records are in the bins. Stand by them and press F.');
    expect(seen[1]).toMatch(/That one is yours now/);
    expect(seen[2]).toMatch(/crossfader/);
    expect(seen[3]).toMatch(/^Rain\./);
    m.g.state.raining = false; m.g.state.raining = true; frames(m.t, 1);
    expect(card(m).classList.contains('on')).toBe(false);      // each only once
  });

  it('Hints: Off shows none; turning it on again shows the ones not yet seen', () => {
    const m = makeTutorial(); finish(m);
    m.t.setHints(false);
    m.g.events.emit('wantedChanged', { stars: 1 }); m.g.state.raining = true;
    frames(m.t, 1);
    expect(card(m).classList.contains('on')).toBe(false);
    m.t.setHints(true); frames(m.t, 0.5);
    expect(line(m)).toMatch(/^Rain\./);
  });

  it('a hint waits for a panel to close and for a mission to end, and the hint timer does not run while hidden', () => {
    const m = makeTutorial(); finish(m);
    m.g.state.panel = 'phone';
    m.g.events.emit('wantedChanged', { stars: 1 });
    frames(m.t, 20);
    expect(card(m).classList.contains('on')).toBe(false);
    m.g.state.panel = null; frames(m.t, 3);
    expect(card(m).classList.contains('on')).toBe(true);
  });

  it('no hint while the tutorial itself is running', () => {
    const m = makeTutorial(); frames(m.t, 0.3);
    m.g.events.emit('wantedChanged', { stars: 1 });
    frames(m.t, 1);
    expect(line(m)).toContain('look around');
    keydown('Backspace'); frames(m.t, 0.5);
    expect(card(m).classList.contains('on')).toBe(false);       // the missed hint is not replayed later
  });

  it('shows the keys of the device in hand', () => {
    const m = makeTutorial(); finish(m);
    m.g.input.setMode('gamepad');
    m.g.events.emit('interior:entered', { id: 'wax-deli' }); frames(m.t, 0.3);
    expect(line(m)).toBe('The records are in the bins. Stand by them and press Y.');
  });
});

describe('tutorial: the cars come back', () => {
  it('a player who was never near a car gets the car steps the first time they get in one', () => {
    const m = makeTutorial();
    m.g.state.homeDist = 1;                              // home is near: the last step completes at once
    frames(m.t, 0.3);
    // do the on-foot steps quickly by feeding what the steps look for
    const g = m.g;
    for (let i = 0; i < 2000 && m.t.active; i++) {
      g.state.yaw += 0.2; g.player.body.pos.x += 1; g.player.sprint = 1; g.player.body.vel.x = 6; g.player.jumpHeight = i % 20 === 0 ? 0.3 : 0;
      g.state.panel = null;
      const cur = m.t.engine.current?.id, fresh = (id: string): boolean => cur === id && !m.t.engine.completed.includes(id);
      if (fresh('phone')) { g.state.panel = 'phone'; }
      if (fresh('map')) { g.state.panel = 'map'; g.state.waypoint = true; }
      if (fresh('pause')) { g.state.panel = 'menu'; }
      if (m.t.engine.current?.id === 'action') { g.input.pulse('ActionButton'); g.input.pulse('ItemNext'); }
      m.t.update(0.1);
    }
    expect(m.t.active).toBe(false);
    expect(m.store.outcome).toBe('done');
    expect(m.store.deferred).toEqual(expect.arrayContaining(['drive', 'out']));
    g.state.panel = null;
    g.player.inVehicle = true; g.player.vehicle = { speed: 0, id: 'c1', body: { pos: { x: 0, z: 0 } } };
    g.events.emit('enterVehicle', { vehicleId: 'c1' });
    frames(m.t, 0.3);
    expect(m.t.active).toBe(true);
    expect(m.t.engine.current?.id).toBe('drive');
    expect(m.store.deferred).toEqual([]);
  });
});

void fakeGame; void Tutorial;
