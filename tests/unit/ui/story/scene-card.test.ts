// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneCard, type SceneSource } from '@/ui/story/SceneCard';
import { PanelManager } from '@/ui/PanelManager';
import { ChoiceScene, FightScene, DateScene, type Scene } from '@/game/story/scenes';
import { FIGHT_CLEM } from '@/game/story/fights';
import { DATE_MARGO } from '@/game/story/dateScripts';
import { DateSession } from '@/game/story/dates';

const key = (code: string, extra: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, key: code.replace('Digit', ''), bubbles: true, cancelable: true, ...extra });
  window.dispatchEvent(e);
  return e;
};
class Src implements SceneSource {
  scene: Scene | null = null;
  chosen: number[] = [];
  choose(n: number): void { this.chosen.push(n); this.scene?.choose(n); }
}
const choice = (): ChoiceScene => new ChoiceScene('t', [
  { who: 'Ms. Odette', line: 'Good morning.', options: [{ text: 'Hello.', outcome: 'hi' }, { text: 'Put it back.', outcome: 'skip' }] },
  { who: 'Ms. Odette', line: 'Anything else?', options: [{ text: 'No.' }, { text: 'Yes.' }, { text: 'Maybe.' }, { text: 'Later.' }] },
]);
const fakeHost = () => ({ canPay: () => true, pay: () => {}, hasFlag: () => false });
let cards: SceneCard[] = [];
const make = (src: Src, o: ConstructorParameters<typeof SceneCard>[2] = {}): SceneCard => { const c = new SceneCard(document.body, src, { pads: () => [], ...o }); cards.push(c); return c; };
afterEach(() => { cards.forEach((c) => c.dispose()); cards = []; document.body.className = ''; document.body.replaceChildren(); });

describe('SceneCard', () => {
  it('stays hidden with no scene and shows who, line and numbered replies when one is open', () => {
    const src = new Src(); const c = make(src);
    c.update(0.1);
    expect(c.isOpen).toBe(false); expect(c.root.hidden).toBe(true);
    src.scene = choice(); c.update(0.1);
    expect(c.isOpen).toBe(true); expect(c.root.hidden).toBe(false);
    expect(c.root.querySelector('.scene-who')!.textContent).toBe('Ms. Odette');
    expect(c.root.querySelector('.scene-line')!.textContent).toBe('Good morning.');
    const opts = [...c.root.querySelectorAll('.scene-opt')];
    expect(opts.map((o) => o.querySelector('.scene-key')!.textContent)).toEqual(['1', '2']);
    expect(opts[1].querySelector('.scene-text')!.textContent).toBe('Put it back.');
    expect(document.body.classList.contains('scene-open')).toBe(true);
    expect(document.body.classList.contains('ui-panel-open')).toBe(true);
  });
  it('keys 1 to 4 choose, and the card moves on to the next beat', () => {
    const src = new Src(); const c = make(src); src.scene = choice(); c.update(0.1);
    key('Digit1'); expect(src.chosen).toEqual([1]);
    c.update(0.1);
    expect(c.root.querySelector('.scene-line')!.textContent).toBe('Anything else?');
    expect(c.root.querySelectorAll('.scene-opt').length).toBe(4);
    key('Digit4'); expect(src.chosen).toEqual([1, 4]);
    key('Digit9'); expect(src.chosen).toEqual([1, 4]); // not an option on this frame: nothing is sent
  });
  it('a click or a tap on a reply chooses it; up, down and Enter choose the selected one', () => {
    const src = new Src(); const c = make(src); src.scene = choice(); c.update(0.1);
    (c.root.querySelectorAll('.scene-opt')[1] as HTMLElement).click();
    expect(src.chosen).toEqual([2]);
    c.update(0.1);
    key('ArrowDown'); key('ArrowDown'); expect(c.selected).toBe(2);
    key('Enter'); expect(src.chosen).toEqual([2, 3]);
  });
  it('the timer bar follows secondsLeft and goes low near the end', () => {
    const src = new Src(); const c = make(src); const s = choice(); src.scene = s; c.update(0);
    const fill = c.root.querySelector('.scene-timer-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
    s.tick(6); c.update(0);
    expect(fill.style.width).toBe('40%');
    s.tick(4); // 0 left: silence is an answer, the beat moves on and the timer is full again
    c.update(0);
    expect(c.root.querySelector('.scene-line')!.textContent).toBe('Anything else?');
    expect(fill.style.width).toBe('100%');
  });
  it('draws the calm and tension of a talk-down and the liking of a date', () => {
    const src = new Src(); const c = make(src);
    const fight = new FightScene('clem', FIGHT_CLEM, fakeHost()); src.scene = fight; c.update(0);
    const labels = [...c.root.querySelectorAll('.scene-meter-label')].map((e) => e.textContent);
    expect(labels).toEqual(['Calm', 'Tension']);
    expect(c.root.querySelector('.scene-meter.calm [role=meter]')).toBeTruthy();
    const many = c.root.querySelectorAll('.scene-opt').length;
    expect(many).toBeGreaterThanOrEqual(4); // more than four talk options are all shown, plus Walk away
    src.scene = new DateScene('d', new DateSession(DATE_MARGO, 0, true)); c.update(0);
    expect([...c.root.querySelectorAll('.scene-meter-label')].map((e) => e.textContent)).toEqual(['Liking']);
  });
  it('a disabled reply (cannot pay) is not sent', () => {
    const src = new Src(); const c = make(src);
    const fight = new FightScene('kyle', { ...FIGHT_CLEM, id: 'k', options: [{ ...FIGHT_CLEM.options[0], cost: 20 }, ...FIGHT_CLEM.options.slice(1)] }, { canPay: () => false, pay: () => {}, hasFlag: () => false });
    src.scene = fight; c.update(0);
    expect((c.root.querySelector('.scene-opt') as HTMLButtonElement).disabled).toBe(true);
    key('Digit1'); expect(src.chosen).toEqual([]);
  });
  it('hides during a brawl and gives the game back, then closes at the end', () => {
    const src = new Src(); const c = make(src);
    const fight = new FightScene('clem', FIGHT_CLEM, fakeHost()); src.scene = fight; c.update(0);
    expect(c.isOpen).toBe(true);
    fight.enc.anger = 99; fight.enc.tick(60); // pushes the encounter on; whichever phase it reaches, a brawl hides the card
    if (fight.frame().phase !== 'brawl') { (fight.enc as unknown as { phase: string }).phase = 'brawl'; }
    c.update(0);
    expect(c.isOpen).toBe(false); expect(document.body.classList.contains('scene-open')).toBe(false);
  });
  it('shows the closing line after the bridge ended the scene, until a key or the time is up', () => {
    const src = new Src(); const c = make(src, { endingSeconds: 3 });
    const s = new DateScene('d', new DateSession(DATE_MARGO, 6, true)); src.scene = s; c.update(0);
    const warm = s.session.script.beats ? 0 : 0; void warm;
    // play the date to its end with the first reply each time
    for (let i = 0; i < 12 && !s.result; i++) s.choose(1);
    const f = s.frame();
    expect(f.phase).toBe('ended');
    src.scene = null; c.showEnding(f); c.update(0);
    expect(c.isOpen).toBe(true); expect(c.showingEnding).toBe(true);
    expect(c.root.querySelector('.scene-line')!.textContent).toBe(f.line);
    c.update(1); expect(c.showingEnding).toBe(true);
    key('Space'); expect(c.showingEnding).toBe(false); expect(c.isOpen).toBe(false);
    c.showEnding(f); c.update(0); c.update(3.5); expect(c.isOpen).toBe(false);
  });
  it('a warm date with Intimate scenes On or Off is a dark cut, a line and nothing drawn', () => {
    for (const on of [true, false]) {
      const src = new Src(); const c = make(src);
      const s = new DateScene('d', new DateSession(DATE_MARGO, 99, on)); src.scene = s;
      for (let i = 0; i < 12 && !s.result; i++) s.choose(1);
      const f = s.frame();
      expect(f.cut).toBe(on ? 'cutaway' : 'fade');
      src.scene = null; c.showEnding(f); c.update(0);
      expect(c.root.classList.contains('cut')).toBe(true);
      expect(c.root.querySelectorAll('img, canvas, svg').length).toBe(0);
    }
  });
  it('is a PanelManager panel: the gate closes while it is open, Esc does nothing mid-scene and reopens on close', () => {
    const input = { blocked: false, requestLock: vi.fn() };
    const panels = new PanelManager(document, { input, canOpenPause: () => false, relockOnClose: false });
    const src = new Src(); const c = make(src, { panels });
    src.scene = choice(); c.update(0);
    expect(panels.isOpen('scene')).toBe(true); expect(input.blocked).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    expect(c.isOpen).toBe(true); // silence is an answer: Esc does not dismiss a live scene
    src.scene = null; c.update(0);
    expect(panels.isOpen('scene')).toBe(false);
    panels.dispose();
  });
  it('does not clear ui-panel-open while another panel is still open', () => {
    document.body.classList.add('shop-open', 'ui-panel-open');
    const src = new Src(); const c = make(src); src.scene = choice(); c.update(0);
    src.scene = null; c.update(0);
    expect(document.body.classList.contains('ui-panel-open')).toBe(true);
  });
  it('pad face buttons A B X Y choose replies 1 to 4, on a fresh press only', () => {
    const pad = (down: number[]): Gamepad => ({ buttons: [0, 1, 2, 3].map((i) => ({ pressed: down.includes(i), touched: false, value: 0 })) } as unknown as Gamepad);
    let cur: Gamepad = pad([0]); // A is already held when the card opens
    const src = new Src(); const c = make(src, { pads: () => [cur] });
    c.update(0); src.scene = choice(); c.update(0);
    expect(src.chosen).toEqual([]);
    cur = pad([]); c.update(0);
    cur = pad([1]); c.update(0);
    expect(src.chosen).toEqual([2]);
    c.update(0); expect(src.chosen).toEqual([2]); // still held: no repeat
  });
  it('writes text only as text (a line with markup is shown as typed)', () => {
    const src = new Src(); const c = make(src);
    src.scene = new ChoiceScene('x', [{ who: '<b>Who</b>', line: '<img src=x onerror=alert(1)>', options: [{ text: '<i>ok</i>' }] }]); c.update(0);
    expect(c.root.querySelector('img')).toBeNull();
    expect(c.root.querySelector('.scene-line')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
