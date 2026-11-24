/**
 * FIGHTS: two scripted encounters built on the existing combat system, each with a talk-down path. This module is the
 * encounter's state machine only: it decides when words become blows and who won. The blows themselves are the combat
 * system's (src/game/combat): the host spawns the fighter as a Pedestrian with `temper = 'fight'` when the phase turns
 * 'brawl' and reports back `fighterDown()` or `playerDown()`. Neither fight ever kills anybody: 'out' is the worst.
 *
 * Scripts are placeholders until WRITER's scene files land. Both men are adults with their own reasons.
 */
export type FightPhase = 'idle' | 'tense' | 'brawl' | 'talked' | 'won' | 'lost' | 'walkedAway';

export interface TalkOption {
  id: string; text: string;
  /** Calm gained (0..) and anger gained (0..) when picked. */
  calm: number; anger: number;
  /** Cash it costs (a meal, a round). The host checks the wallet and passes `canPay`. */
  cost?: number;
  /** Story flag the option needs (a thing the player learned earlier). */
  needs?: string;
  reply: string;
}

export interface FightScript {
  id: string; /** speaker tag on subtitles */ who: string; /** where it happens, a VenueId or a street name */ place: string;
  adult: true;
  opening: string[];
  options: TalkOption[];
  /** calm reaches this: he backs down. */
  calmAt: number; /** anger reaches this: it kicks off. */ angerAt: number;
  /** Seconds of silence before it kicks off (0 = never; the street man just waits). */
  patience: number;
  endings: { talked: string; won: string; lost: string; walkedAway: string };
  /** Flags set on each ending. */
  flags: { talked: string; won: string; lost: string; walkedAway: string };
}

export const FIGHT_STREET_MAN: FightScript = {
  id: 'fight-street-man', who: 'Leon', place: 'street', adult: true,
  opening: ['A man on a milk crate blocks the entrance to the lot. He says it is his spot and has been for six winters.', '"You people come with your speakers and your lights and nobody asks whose pavement it is."'],
  options: [
    { id: 'listen', text: 'Ask about his winters here.', calm: 2, anger: 0, reply: '"Six. Boiler in the church broke the fourth one. I knew every night guard by name."' },
    { id: 'meal', text: 'Offer to get him a hot meal.', calm: 3, anger: 0, cost: 12, reply: '"...Chicken, if the place by the corner is open."' },
    { id: 'name', text: 'Say his name back to him.', calm: 2, anger: 0, needs: 'knowsLeonName', reply: '"Who told you that? ...Ha. Go on, then."' },
    { id: 'push', text: 'Tell him to move along.', calm: 0, anger: 3, reply: '"Move? Make me."' },
    { id: 'joke', text: 'Make a joke about the crate.', calm: 0, anger: 2, reply: '"You think this is funny, DJ?"' },
  ],
  calmAt: 4, angerAt: 4, patience: 0,
  endings: {
    talked: 'Leon moves the crate himself. "Tell the door I am not trouble. Tell them I know the guard by name."',
    won: 'Leon is on the pavement holding his side. Somebody hands him a coat. Nobody cheers.',
    lost: 'You wake against the wall with a headache and no wallet worth the name. Leon is gone.',
    walkedAway: 'You step round him and leave. The crate is still there tomorrow.',
  },
  flags: { talked: 'fight.leon.talked', won: 'fight.leon.won', lost: 'fight.leon.lost', walkedAway: 'fight.leon.walked' },
};

export const FIGHT_BAR_MAN: FightScript = {
  id: 'fight-bar-man', who: 'Dale', place: 'bar-2', adult: true,
  opening: ['A man in a work jacket is leaning on the decks. He says the last DJ played worse and the one before that played better.', '"You touched my song. I asked you not to touch my song."'],
  options: [
    { id: 'drink', text: 'Buy him a round and play his song next.', calm: 3, anger: 0, cost: 16, reply: '"...Fine. One song. Play it right."' },
    { id: 'tell', text: 'Tell him it is the bar\'s playlist, not yours.', calm: 1, anger: 1, reply: '"Then go tell the bar to say sorry."' },
    { id: 'door', text: 'Wave the doorman over.', calm: 1, anger: 2, reply: '"Oh, now there is a doorman."' },
    { id: 'shove', text: 'Push his hand off the decks.', calm: 0, anger: 4, reply: '"Right."' },
  ],
  calmAt: 4, angerAt: 4, patience: 25,
  endings: {
    talked: 'Dale nods at the booth. When his song comes round, he does not look up from his drink.',
    won: 'Dale slides off the stool and the doorman walks him out. The room goes back to its own business.',
    lost: 'The doorman picks you up off the floor. "Not in the booth," he says, kindly. "Never in the booth."',
    walkedAway: 'You step back from the decks and let somebody else deal with Dale.',
  },
  flags: { talked: 'fight.dale.talked', won: 'fight.dale.won', lost: 'fight.dale.lost', walkedAway: 'fight.dale.walked' },
};

export const FIGHT_SCRIPTS: Readonly<Record<string, FightScript>> = { [FIGHT_STREET_MAN.id]: FIGHT_STREET_MAN, [FIGHT_BAR_MAN.id]: FIGHT_BAR_MAN };

export interface FightEnd { phase: 'talked' | 'won' | 'lost' | 'walkedAway'; text: string; flag: string }

export class FightEncounter {
  phase: FightPhase = 'idle';
  calm = 0;
  anger = 0;
  private quiet = 0;
  private readonly used = new Set<string>();
  ended: FightEnd | null = null;
  constructor(readonly script: FightScript) { if (script.adult !== true) throw new Error('fights are with adults only'); }

  start(): string[] { if (this.phase === 'idle') this.phase = 'tense'; return this.script.opening; }

  /** Options the player can pick now (each once; flag-gated ones hidden without the flag; costly ones shown, `canPay` decides). */
  available(hasFlag: (f: string) => boolean = () => false): TalkOption[] {
    return this.script.options.filter((o) => !this.used.has(o.id) && (!o.needs || hasFlag(o.needs)));
  }

  /** Pick a talking option. Returns the reply, or null when it is not available or unaffordable (nothing changes). */
  talk(id: string, opts: { canPay?: boolean; hasFlag?: (f: string) => boolean } = {}): { reply: string; cost: number } | null {
    if (this.phase !== 'tense') return null;
    const o = this.available(opts.hasFlag).find((x) => x.id === id);
    if (!o || (o.cost && opts.canPay === false)) return null;
    this.used.add(id); this.quiet = 0;
    this.calm += o.calm; this.anger += o.anger;
    if (this.anger >= this.script.angerAt && this.anger > this.calm) this.phase = 'brawl';
    else if (this.calm >= this.script.calmAt) this.end('talked');
    return { reply: o.reply, cost: o.cost ?? 0 };
  }

  /** The player hits first, or walks into him: words are over. */
  swing(): void { if (this.phase === 'tense' || this.phase === 'idle') { this.phase = 'brawl'; this.anger = Math.max(this.anger, this.script.angerAt); } }
  walkAway(): void { if (this.phase === 'tense') this.end('walkedAway'); }
  tick(dt: number): void {
    if (this.phase !== 'tense' || this.script.patience <= 0) return;
    this.quiet += dt;
    if (this.quiet >= this.script.patience) { this.anger = this.script.angerAt; this.phase = 'brawl'; }
  }
  fighterDown(): void { if (this.phase === 'brawl') this.end('won'); }
  playerDown(): void { if (this.phase === 'brawl') this.end('lost'); }

  private end(p: FightEnd['phase']): void {
    this.phase = p;
    this.ended = { phase: p, text: this.script.endings[p], flag: this.script.flags[p] };
  }
}
