/** The Act 1 scenes (placeholder lines; the writer's scene files replace the text). Keys are the `scene` ids missions use. */
import type { SceneEnv, SceneFactory } from './StoryBridge';
import { ChoiceScene, DateScene, FightScene, HaggleScene } from './scenes';
import { FIGHT_CLEM, FIGHT_KYLE } from './fights';
import { DATE_MARGO, DATE_REMY } from './dateScripts';

const fightHost = (e: SceneEnv) => ({ canPay: (n: number) => e.host.canPay(n), pay: (n: number) => e.host.pay(n), hasFlag: (f: string) => e.host.hasFlag(f) });

const GUEST_NAMES: Array<{ text: string; flag: string }> = [
  { text: 'Put Yesenia down.', flag: 'pico.guest.yesenia' }, { text: 'Put Lana down.', flag: 'pico.guest.lana' }, { text: 'Put Clem down.', flag: 'pico.guest.clem' },
  { text: 'Put Ms. Odette down.', flag: 'pico.guest.odette' }, { text: 'Put Akira down.', flag: 'pico.guest.akira' },
];

export const PICO_SCENE_FACTORIES: Record<string, SceneFactory> = {
  sleeve: () => new ChoiceScene('sleeve', [{ who: 'Pedro', line: 'The back of the sleeve has tiny credits. One name is spelled two different ways.', options: [{ text: 'Read it carefully.', flag: 'pico.sleeveCredit', outcome: 'read' }, { text: 'Put it back.', outcome: 'skip' }] }]),
  clem: (e) => new FightScene('clem', FIGHT_CLEM, fightHost(e)),
  kyle: (e) => new FightScene('kyle', FIGHT_KYLE, fightHost(e)),
  'date:margo': (e) => new DateScene('date:margo', e.nl.dates.begin(DATE_MARGO, e.host.intimate())),
  'date:remy': (e) => new DateScene('date:remy', e.nl.dates.begin(DATE_REMY, e.host.intimate())),
  'haggle:stall': (e) => new HaggleScene('haggle:stall', 'stall', e.nl.bag, { pay: (n) => e.host.pay(n) }),
  'haggle:friend': (e) => new HaggleScene('haggle:friend', 'friend', e.nl.bag, { pay: (n) => e.host.pay(n) }),
  'haggle:club': (e) => new HaggleScene('haggle:club', 'club', e.nl.bag, { pay: (n) => e.host.pay(n) }),
  // Five names for the guest list: name up to five people; the count of names becomes the night's guest list.
  guestlist: () => new ChoiceScene('guestlist', GUEST_NAMES.map((g, i) => ({ who: 'Pedro', line: `Guest list, name ${i + 1} of 5.`, options: [{ text: g.text, flag: g.flag, outcome: 'listed' }, { text: 'Leave it blank.', outcome: 'listed' }] }))),
  spar: () => new ChoiceScene('spar', [{ who: 'Akira', line: 'Two rounds. Hands up. What do you do with them when it is over?', options: [{ text: 'Put them in my pockets.', flag: 'pico.akira.pockets', outcome: 'sparred' }, { text: 'Keep them up.', outcome: 'sparred' }] }]),
};
