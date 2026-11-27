// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireStory, PROMO_NIGHT_OF_MISSION, type StoryWire, type StoryWireHost } from '@/game/story/wire';
import { StoryState } from '@/game/story/StoryState';
import { ChoiceScene, DateScene } from '@/game/story/scenes';
import { DateSession } from '@/game/story/dates';
import { DATE_MARGO } from '@/game/story/dateScripts';
import type { MissionSystem } from '@/game/missions/MissionSystem';
import type { FlyerPed } from '@/ui/story/FlyerPrompt';

function fakeMissions() {
  const story = new StoryState();
  const m = { story, isActive: false, activeId: null as string | null, sceneRequest: null as { scene: string } | null, notified: [] as unknown[],
    on: () => () => {}, notify(s: unknown) { this.notified.push(s); } };
  return m;
}
const ped = (id: string, x: number, isMinor = false): FlyerPed => ({ id, isMinor, state: 'walking', body: { pos: { x, z: 0 } }, vitals: { temper: 'film' } });
let wires: StoryWire[] = [];
function build(o: Partial<StoryWireHost> = {}) {
  const m = fakeMissions(); const cash = { v: 300 }, toasts: string[] = [];
  const peds: FlyerPed[] = [];
  const host: StoryWireHost = {
    missions: m as unknown as MissionSystem, parent: document.body, panels: { register: () => {}, sync: () => {} },
    pay: (n) => { cash.v += n; }, canPay: (n) => cash.v >= n, cash: () => cash.v, toast: (t) => toasts.push(t), text: () => {}, hasFlag: (f) => story(m).has(f),
    hour: () => 12, playerPos: () => ({ x: 0, z: 0 }), pedestrians: () => peds, ...o,
  };
  const w = wireStory(host); wires.push(w);
  return { w, m, cash, toasts, peds };
}
const story = (m: ReturnType<typeof fakeMissions>) => m.story;
afterEach(() => { wires.forEach((w) => w.dispose()); wires = []; document.body.replaceChildren(); document.body.className = ''; });

describe('wireStory', () => {
  it('builds the story pieces and stays quiet until a scene or a promotion night is open', () => {
    const { w } = build();
    w.update(0.1);
    expect(w.anyOpen).toBe(false); expect(w.card.isOpen).toBe(false); expect(w.flyer.visible).toBe(false);
    expect(w.bridge.nl).toBe(w.nightlife);
  });
  it('opens the card for a scene, forwards a key to the bridge, shows the closing line and answers the mission', () => {
    const { w, m } = build();
    w.bridge.scene = new ChoiceScene('sleeve', [{ who: 'Pedro', line: 'The back of the sleeve.', options: [{ text: 'Read it.', outcome: 'read', flag: 'pico.sleeveCredit' }, { text: 'Put it back.', outcome: 'skip' }] }]);
    w.update(0.1);
    expect(w.card.isOpen).toBe(true); expect(w.anyOpen).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true, cancelable: true }));
    w.update(0.1);
    expect(w.bridge.scene).toBeNull();
    expect(m.notified).toContainEqual({ type: 'scene:done', scene: '', outcome: 'read' });
    expect(m.story.has('pico.sleeveCredit')).toBe(true);
    expect(w.card.isOpen).toBe(false); // a ChoiceScene's last line is the line already shown: nothing new to hold
  });
  it('a date scene reads Intimate scenes from the host: On gives a cut-away, Off a plain fade, and the card shows the cut', () => {
    for (const on of [true, false]) {
      const { w } = build({ intimate: () => on });
      const s = new DateScene('d', w.nightlife.dates.begin(DATE_MARGO, on)); w.bridge.scene = s;
      w.update(0.1);
      for (let i = 0; i < 12 && !s.result; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true, cancelable: true }));
      expect(s.result).not.toBeNull();
      w.update(0.1);
      expect(s.frame().cut).toBe(on ? 'cutaway' : 'fade');
      expect(w.card.showingEnding || !s.result?.text).toBe(true);
    }
  });
  it('offers the flyer prompt only while the paper-the-walls night is open, and never for a child', () => {
    const { w, m, peds } = build();
    w.nightlife.promo.startNight(PROMO_NIGHT_OF_MISSION['pico-paper-the-walls'], 'club', 22, { flyers: 5 });
    peds.push(ped('kid', 1, true));
    m.isActive = true; m.activeId = 'pico-paper-the-walls';
    w.update(0.1); expect(w.flyer.visible).toBe(false); expect(w.interact()).toBe(false);
    peds.push(ped('adult', 1.5));
    w.update(0.1); expect(w.flyer.visible).toBe(true);
    expect(w.interact()).toBe(true);
    m.activeId = 'something-else'; peds.push(ped('adult2', 1)); w.update(0.1); expect(w.flyer.visible).toBe(false);
  });
  it('the rack opens from the bridge and buying persists to the story state', () => {
    const { w, m, cash } = build();
    w.bridge.openRack!('rack-a', 50);
    expect(w.rack.isOpen).toBe(true); expect(w.anyOpen).toBe(true);
    const g = w.nightlife.racks.get('rack-a')!.available[0];
    w.rack.buy(g.id);
    expect(cash.v).toBe(300 - g.buy);
    expect(m.story.getExt('nightlife')).toBeTruthy();
    w.reload();
    expect(w.nightlife.bag.items.length).toBe(1);
  });
  it('reports a brawl once and the story save reloads', () => {
    const onBrawl = vi.fn();
    const { w } = build({ onBrawl });
    const fake = { id: 'clem', outcome: null, tick() {}, choose() {}, frame: () => ({ who: 'Clem', line: '', options: [], secondsLeft: 0, phase: 'brawl' as const }) };
    w.bridge.scene = fake as never;
    w.update(0.1); w.update(0.1);
    expect(onBrawl).toHaveBeenCalledTimes(1); expect(onBrawl).toHaveBeenCalledWith('clem', 'Clem');
    expect(w.card.isOpen).toBe(false); // the fight can be played
  });
});
