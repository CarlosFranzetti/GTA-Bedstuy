/**
 * Scenes: the reply-picker model (BIBLE/ARC "reply picker": two to four short replies on keys 1 to 4, a 10 s soft timer,
 * no answer = silence). Pure state machines the host's scene UI draws: `frame()` is what to show, `choose(key)` and `tick(dt)`
 * are the inputs, `outcome` is set when it ends and goes to the mission as {type:'scene:done', scene, outcome}.
 * Four kinds: ChoiceScene (a short scripted choice), FightScene (a talk-down, may become a brawl), DateScene, HaggleScene.
 */
import { FightEncounter, type FightScript } from './fights';
import { DateSession, type DateOutcome, type DateScript } from './dates';
import { Haggle, MARKETS, settleSale, type Garment, type HaggleState, type ThriftBag } from './thrift';

export const REPLY_SECONDS = 10;
export interface SceneOption { key: number; text: string; disabled?: boolean }
export interface SceneFrame {
  who: string; line: string; options: SceneOption[]; secondsLeft: number;
  /** 'brawl': the host starts the combat (spawn the fighter, `scene.fighterDown()` / `playerDown()` when it ends). */
  phase: 'talk' | 'brawl' | 'ended';
}
export interface Scene {
  readonly id: string;
  /** Set when the scene is over: the outcome string the mission gets. */
  readonly outcome: string | null;
  frame(): SceneFrame;
  choose(key: number): void;
  tick(dt: number): void;
}

abstract class Timed {
  protected left = REPLY_SECONDS;
  protected resetTimer(): void { this.left = REPLY_SECONDS; }
}

export interface ChoiceBeat { who: string; line: string; options: Array<{ text: string; outcome?: string; flag?: string }> }

/** A short scripted choice. Beats play in order; the LAST picked option with an `outcome` sets the scene's outcome (default 'done'). Flags picked go to `flags`. */
export class ChoiceScene extends Timed implements Scene {
  outcome: string | null = null;
  readonly flags: string[] = [];
  private i = 0;
  private last = 'done';
  constructor(readonly id: string, private readonly beats: readonly ChoiceBeat[]) { super(); }
  frame(): SceneFrame {
    const b = this.beats[Math.min(this.i, this.beats.length - 1)];
    return { who: b.who, line: b.line, options: b.options.map((o, k) => ({ key: k + 1, text: o.text })), secondsLeft: this.left, phase: this.outcome ? 'ended' : 'talk' };
  }
  choose(key: number): void {
    if (this.outcome) return;
    const o = this.beats[this.i].options[key - 1];
    if (!o) return;
    if (o.flag) this.flags.push(o.flag);
    if (o.outcome) this.last = o.outcome;
    this.advance();
  }
  tick(dt: number): void { if (this.outcome) return; this.left -= dt; if (this.left <= 0) this.advance(); /* silence is an answer: nothing is set */ }
  private advance(): void { this.i++; this.resetTimer(); if (this.i >= this.beats.length) this.outcome = this.last; }
}

export interface FightHost { canPay(n: number): boolean; pay(n: number): void; hasFlag(f: string): boolean }

/** A talk-down. The last option is always "Walk away". If it turns into a brawl the frame says so and the host fights it out. */
export class FightScene extends Timed implements Scene {
  readonly enc: FightEncounter;
  private line: string;
  private opening: string[];
  constructor(readonly id: string, script: FightScript, private readonly host: FightHost) {
    super();
    this.enc = new FightEncounter(script);
    this.opening = this.enc.start();
    this.line = this.opening[this.opening.length - 1];
  }
  get outcome(): string | null { return this.enc.ended?.phase ?? null; }
  get flag(): string | null { return this.enc.ended?.flag ?? null; }
  private opts() { return this.enc.available(this.host.hasFlag); }
  frame(): SceneFrame {
    const o = this.opts();
    const options: SceneOption[] = o.map((x, k) => ({ key: k + 1, text: x.text, disabled: x.cost !== undefined && !this.host.canPay(x.cost) }));
    if (this.enc.phase === 'tense') options.push({ key: options.length + 1, text: 'Walk away.' });
    const phase = this.enc.phase === 'brawl' ? 'brawl' : this.enc.ended ? 'ended' : 'talk';
    return { who: this.enc.script.who, line: this.enc.ended ? this.enc.ended.text : this.line, options: phase === 'talk' ? options : [], secondsLeft: this.left, phase };
  }
  choose(key: number): void {
    if (this.enc.phase !== 'tense') return;
    const o = this.opts();
    if (key === o.length + 1) { this.enc.walkAway(); return; }
    const pick = o[key - 1];
    if (!pick) return;
    const r = this.enc.talk(pick.id, { canPay: pick.cost === undefined || this.host.canPay(pick.cost), hasFlag: this.host.hasFlag });
    if (!r) return;
    if (r.cost > 0) this.host.pay(-r.cost);
    this.line = r.reply; this.resetTimer();
  }
  tick(dt: number): void {
    if (this.enc.phase !== 'tense') return;
    this.left -= dt; if (this.left <= 0) { this.enc.tick(REPLY_SECONDS); this.resetTimer(); }
  }
  swing(): void { this.enc.swing(); }
  fighterDown(): void { this.enc.fighterDown(); }
  playerDown(): void { this.enc.playerDown(); }
}

/** A date: beats with replies; the ending (and whether it is a cutaway or a plain fade) comes from the liking meter. */
export class DateScene extends Timed implements Scene {
  result: DateOutcome | null = null;
  private line = '';
  constructor(readonly id: string, readonly session: DateSession) { super(); this.line = session.beat?.line ?? ''; }
  get outcome(): string | null { return this.result?.ending ?? null; }
  frame(): SceneFrame {
    const b = this.session.beat;
    if (!b || this.result) return { who: this.session.script.partner, line: this.result?.text ?? this.line, options: [], secondsLeft: 0, phase: 'ended' };
    return { who: this.session.script.partner, line: this.line || b.line, options: b.choices.map((c, k) => ({ key: k + 1, text: c.text })), secondsLeft: this.left, phase: 'talk' };
  }
  choose(key: number): void {
    const b = this.session.beat;
    const c = b?.choices[key - 1];
    if (!b || !c) return;
    const r = this.session.choose(c.id);
    if (!r) return;
    this.resetTimer();
    this.result = r.outcome; this.line = r.reply;
    if (!r.outcome) this.line = `${r.reply}  ${this.session.beat?.line ?? ''}`.trim();
  }
  tick(dt: number): void { if (this.result) return; this.left -= dt; if (this.left <= 0) { this.resetTimer(); this.line = '...'; this.session.liking -= 1; } }
  get flags(): string[] { return this.session.flags(); }
}

export interface HaggleHost { pay(n: number): void }
/** Selling carried pieces to one market: accept the offer, ask a bit more, ask a lot more, or walk. Each piece is one haggle; the scene ends after the last. */
export class HaggleScene extends Timed implements Scene {
  outcome: string | null = null;
  total = 0;
  sold = 0;
  private queue: Garment[];
  private h: Haggle | null = null;
  private line = '';
  constructor(readonly id: string, private readonly marketId: string, private readonly bag: ThriftBag, private readonly host: HaggleHost, maxPieces = 2) {
    super();
    this.queue = bag.items.slice(0, maxPieces);
    this.next();
  }
  private next(): void {
    this.resetTimer();
    const g = this.queue.shift();
    if (!g) { this.h = null; this.outcome = this.sold > 0 ? 'sold' : 'walked'; return; }
    this.h = new Haggle(g, MARKETS[this.marketId]);
    this.line = this.h.state.phase === 'open' ? `"${g.label}? I can do $${this.h.state.offer}."` : `"${g.label}? Not at this stall."`;
    if (this.h.state.phase !== 'open') this.next();
  }
  frame(): SceneFrame {
    const s = this.h?.state;
    const o = s && s.phase === 'open' ? s.offer : 0;
    return {
      who: MARKETS[this.marketId].label, line: this.outcome ? `Total $${this.total}.` : this.line,
      options: this.outcome ? [] : [{ key: 1, text: `Take $${o}.` }, { key: 2, text: `Ask $${Math.round(o * 1.15)}.` }, { key: 3, text: `Ask $${Math.round(o * 1.4)}.` }, { key: 4, text: 'Keep it.' }],
      secondsLeft: this.left, phase: this.outcome ? 'ended' : 'talk',
    };
  }
  choose(key: number): void {
    const h = this.h;
    if (this.outcome || !h || h.state.phase !== 'open') return;
    const o = h.state.offer;
    if (key === 1) h.accept(); else if (key === 2) h.push(Math.round(o * 1.15)); else if (key === 3) h.push(Math.round(o * 1.4)); else if (key === 4) { this.next(); return; } else return;
    const st = h.state as HaggleState;
    if (st.phase === 'sold') { this.total += settleSale(this.bag, h, this.host.pay); this.sold++; this.next(); }
    else if (st.phase === 'walked') { this.line = '"No. Not at that price. Goodbye."'; this.next(); }
    else { this.line = `"Closer. $${st.offer}."`; this.resetTimer(); }
  }
  tick(dt: number): void { if (this.outcome) return; this.left -= dt; if (this.left <= 0) { this.resetTimer(); } }
}
