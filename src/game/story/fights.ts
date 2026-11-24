/**
 * FIGHTS: two scripted encounters built on the existing combat system, each with a talk-down path. This module is the
 * encounter's state machine only: it decides when words become blows and who won. The blows themselves are the combat
 * system's (src/game/combat): the host spawns the fighter as a Pedestrian with `temper = 'fight'` when the phase turns
 * 'brawl' and reports back `fighterDown()` or `playerDown()`. Neither fight ever kills anybody: 'out' is the worst.
 *
 * Scripts follow docs/story/BIBLE.md 4.6 and 4.7 (lines are placeholders until the scene files land). Both men are adults with their own reasons.
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

/** ACT1-04, BIBLE 4.6: Clem Ashby, on his corner by Mothhouse's side wall. About his sign, not the flyers. */
export const FIGHT_CLEM: FightScript = {
  id: 'fight-clem', who: 'Clem', place: 'club', adult: true,
  opening: ['The posters are over Clem\'s sign. Security has moved his chair "for the line". He has your flyer bag by the strap.', '"Dolores lettered that sign. Paste your paper on your own wall."'],
  options: [
    { id: 'listen', text: 'Let him talk. Do not interrupt.', calm: 2, anger: 0, reply: '"Two years on this corner. Nobody has ever asked me anything but to move."' },
    { id: 'name', text: '"You are Clem."', calm: 2, anger: 0, reply: '"...Yes. That is the name. Say it again."' },
    { id: 'blame', text: 'Say the posters were your doing, and sorry.', calm: 2, anger: 0, reply: '"Well. It takes a man to say that."' },
    { id: 'credit', text: '"You played on Brooklyn Lights."', calm: 9, anger: 0, needs: 'pico.sleeveCredit', reply: '"Who told... Nobody remembers that record. Sit down. Sit."' },
    { id: 'sign', text: 'Offer to put his corner on the flyer.', calm: 2, anger: 0, reply: '"My corner. On the paper. Huh."' },
    { id: 'move', text: 'Tell him he cannot stand there.', calm: 0, anger: 3, reply: '"Cannot? Two winters I have stood here."' },
    { id: 'laugh', text: 'Laugh at the cardboard sign.', calm: 0, anger: 4, reply: '"Laugh. Go on."' },
  ],
  calmAt: 5, angerAt: 4, patience: 0,
  endings: {
    talked: 'Clem hands the bag back and straightens his chair himself. "Put the corner on the paper, then. Spell it right."',
    won: 'Clem is on the pavement with a hand on his ribs. The line outside watches. Stavros says it would have made a video.',
    lost: 'Clem leaves you sitting against the wall with a ringing head. He picks up his sign and his chair and does not look back.',
    walkedAway: 'You back away and leave the bag where it is. His radio goes on playing jazz behind you.',
  },
  flags: { talked: 'pico.clem.talked', won: 'pico.clem.fought', lost: 'pico.clem.fought', walkedAway: 'pico.clem.walked' },
};

/** ACT2-03, BIBLE 4.7: Kyle Strand at Tincture & Ledger. Leaving, or talking, is the better ending. */
export const FIGHT_KYLE: FightScript = {
  id: 'fight-kyle', who: 'Kyle', place: 'bar-lounge', adult: true,
  opening: ['Kyle has just sent a drink back for the third time. The bartender is smiling the way people smile when they are counting.', '"Your warm-up set was great for a Tuesday. Be grateful for the exposure, my friend."'],
  options: [
    { id: 'price', text: 'Ask, loudly, what the MOTH token closed at today.', calm: 4, anger: 0, reply: 'His investors laugh once. He does not.' },
    { id: 'pockets', text: 'Look at Akira. Hands in pockets.', calm: 3, anger: 0, needs: 'pico.akira.pockets', reply: 'Akira: "Pockets." The room breathes out.' },
    { id: 'tab', text: 'Pay the bartender\'s tab and tip her.', calm: 2, anger: 0, cost: 20, reply: 'Kyle: "Generous." It costs him something to say it.' },
    { id: 'door', text: 'Walk out.', calm: 0, anger: 0, reply: 'You go. The Friday slot goes with you.' },
    { id: 'shove', text: 'Shove him back.', calm: 0, anger: 4, reply: '"There it is."' },
  ],
  calmAt: 4, angerAt: 4, patience: 30,
  endings: {
    talked: 'Kyle laughs a little late. In front of his own investors, he is suddenly very careful about what he says next.',
    won: 'Kyle is on the floor with his vest askew. His lawyer will write soon. The Friday slot is gone.',
    lost: 'Bash walks you out by the elbow. "Not in my building." Kyle straightens his collar.',
    walkedAway: 'You leave the bar and a half-finished drink. Outside, the air is cold and the Friday slot is gone.',
  },
  flags: { talked: 'pico.kyle.talked', won: 'pico.kyle.fought', lost: 'pico.kyle.fought', walkedAway: 'pico.kyle.walked' },
};

export const FIGHT_SCRIPTS: Readonly<Record<string, FightScript>> = { [FIGHT_CLEM.id]: FIGHT_CLEM, [FIGHT_KYLE.id]: FIGHT_KYLE };

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
