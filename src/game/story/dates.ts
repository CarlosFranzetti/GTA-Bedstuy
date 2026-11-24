/**
 * DATES: an invitation by phone, a meeting at a venue, a short conversation with choices that move a liking meter, an
 * ending that is a fade to the next morning at most. Adults only (the partner must be an adult character; `Date` content
 * declares `adult: true` and the system refuses anything else). Nothing is shown or described past the fade.
 */
export interface DateChoice { id: string; text: string; /** liking change */ delta: number; reply: string; /** flag set when picked */ flag?: string }
export interface DateBeat { id: string; line: string; choices: DateChoice[] }
export interface DateScript {
  id: string; partner: string; adult: true; venue: string;
  /** Phone invitation (from the partner) and the hour window the meeting holds. */
  invite: string; from: number; to: number; beats: DateBeat[];
  /** Liking needed for the warm ending (the fade) and for the friendly one. */
  warmAt: number; friendlyAt: number;
  endings: { warm: string; friendly: string; cold: string; stoodUp: string };
}
export type DateEnding = 'warm' | 'friendly' | 'cold' | 'stoodUp';
/**
 * 'cutaway': the warm ending with the player's setting "Intimate scenes: On": suggestive and non-explicit (flirting, a kiss, a door, the camera stays outside,
 * a comic beat), then the morning after. 'fade': the same with the setting Off: a plain fade. 'none': any other ending. Never nudity, never an act shown.
 */
export type DateScene = 'cutaway' | 'fade' | 'none';
export interface DateOutcome { ending: DateEnding; liking: number; text: string; scene: DateScene; /** true for 'warm': the host moves the clock to about 9:00 the next morning */ fadeToMorning: boolean }

export class DateSession {
  liking = 0;
  index = 0;
  readonly picked: string[] = [];
  private finished: DateOutcome | null = null;
  constructor(readonly script: DateScript, startLiking = 0, private readonly intimate = true) {
    if (script.adult !== true) throw new Error(`date ${script.id}: partner must be an adult`);
    this.liking = startLiking;
  }
  get beat(): DateBeat | null { return this.finished ? null : this.script.beats[this.index] ?? null; }
  get done(): boolean { return this.finished !== null; }
  choose(choiceId: string): { reply: string; outcome: DateOutcome | null } | null {
    const b = this.beat;
    if (!b) return null;
    const c = b.choices.find((x) => x.id === choiceId);
    if (!c) return null;
    this.liking += c.delta; this.picked.push(c.id); this.index++;
    if (this.index >= this.script.beats.length) this.finished = this.finish();
    return { reply: c.reply, outcome: this.finished };
  }
  /** The meeting window passed with the player not there. */
  standUp(): DateOutcome { this.finished = { ending: 'stoodUp', liking: this.liking - 2, text: this.script.endings.stoodUp, scene: 'none', fadeToMorning: false }; return this.finished; }
  private finish(): DateOutcome {
    const s = this.script;
    const ending: DateEnding = this.liking >= s.warmAt ? 'warm' : this.liking >= s.friendlyAt ? 'friendly' : 'cold';
    return { ending, liking: this.liking, text: s.endings[ending], scene: ending === 'warm' ? (this.intimate ? 'cutaway' : 'fade') : 'none', fadeToMorning: ending === 'warm' };
  }
  flags(): string[] { return this.script.beats.flatMap((b) => b.choices.filter((c) => this.picked.includes(c.id) && c.flag).map((c) => c.flag as string)); }
}

export interface DateLog { v: 1; liking: Record<string, number>; seen: string[] }
export class DateBook {
  liking: Record<string, number> = {};
  seen = new Set<string>();
  /** Open a date. `start` is the partner's standing liking from earlier dates. */
  begin(script: DateScript, intimate = true): DateSession { return new DateSession(script, this.liking[script.partner] ?? 0, intimate); }
  record(script: DateScript, o: DateOutcome): void { this.liking[script.partner] = Math.max(-5, Math.min(10, o.liking)); this.seen.add(script.id); }
  serialize(): DateLog { return { v: 1, liking: { ...this.liking }, seen: [...this.seen] }; }
  restore(d: unknown): boolean {
    const o = d as Partial<DateLog> | null;
    if (!o || o.v !== 1 || typeof o.liking !== 'object' || o.liking === null || !Array.isArray(o.seen)) return false;
    const l: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.liking)) if (typeof v === 'number' && Number.isFinite(v)) l[k] = v;
    this.liking = l; this.seen = new Set(o.seen.filter((s): s is string => typeof s === 'string'));
    return true;
  }
}
