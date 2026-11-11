/**
 * WBSY Talk as a station: shows and commercials in rotation (Scheduler.TalkSchedule), spoken by the cast through the
 * VoiceHub player (HD voices when on, SpeechSynthesis otherwise). Same surface as the old TalkPlayer so the radio
 * director can use either. State lives in the schedule, so tuning away and back resumes at the line that was on.
 */
import { castMember } from './cast';
import { TalkSchedule } from './Scheduler';
import type { PlayHandle } from './SpeechPlayer';
import type { VoiceHub } from './VoiceHub';
import type { VoiceContext } from './types';
import type { TalkProgress } from '../talk/TalkPlayer';

export const TALK_NAME = 'WBSY Talk';
export const TALK_NAME_UNAVAILABLE = 'WBSY Talk (voice unavailable on this device)';

/** What RadioDirector needs from a talk station. */
export interface TalkLike {
  readonly isActive: boolean;
  readonly stationName: string;
  readonly caption: string;
  readonly progress: TalkProgress;
  setActive(on: boolean): void;
  setPaused(p: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

const BED_DUCKED = 0.25;
const BED_OPEN = 0.7;

export interface TalkStationEnv {
  hub: VoiceHub;
  context: () => Partial<VoiceContext>;
  setBed: (level: number) => void;
  random?: () => number;
}

export class TalkStation implements TalkLike {
  readonly schedule: TalkSchedule;
  private active = false;
  private handle: PlayHandle | null = null;
  private who = '';
  private base = 0;
  private lineCount = 0;
  private peeked = false;
  private gen = 0;

  constructor(private readonly env: TalkStationEnv) { this.schedule = new TalkSchedule(env.random ?? Math.random); }

  get isActive(): boolean { return this.active; }
  get stationName(): string { return this.env.hub.canSpeak ? TALK_NAME : TALK_NAME_UNAVAILABLE; }
  get caption(): string {
    if (!this.active) return '';
    const b = this.schedule.current;
    if (b?.ad) return 'Ad break';
    return this.who || (b ? castMember(b.show.host)?.name ?? '' : '');
  }
  get progress(): TalkProgress {
    const b = this.schedule.current;
    const total = b?.lines.length ?? 0;
    return { segment: b?.at ?? 0, total, fraction: this.schedule.fraction, speaker: this.who, kind: b?.show.kind ?? '', elapsed: 0, duration: 0 };
  }

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) { this.env.setBed(BED_OPEN); this.playCurrent(); }
    else { this.gen++; this.handle?.cancel(); this.handle = null; this.env.hub.player.cancel(); this.env.setBed(0); this.who = ''; }
  }

  setPaused(p: boolean): void { this.env.hub.player.setPaused(p); }

  update(dt: number): void { if (this.active) this.env.hub.player.tick(dt); }

  dispose(): void { this.setActive(false); }

  private playCurrent(): void {
    if (!this.active) return;
    const ctx = this.env.context();
    const block = this.schedule.ensure(ctx);
    const my = ++this.gen;
    this.base = Math.min(block.at, Math.max(0, block.lines.length - 1));
    this.lineCount = 0;
    this.peeked = false;
    const lines = block.lines.slice(this.base);
    if (lines.length === 0) { this.next(my); return; }
    this.handle = this.env.hub.player.play(lines, {
      onStart: () => this.env.setBed(BED_DUCKED),
      onLine: (who) => {
        if (my !== this.gen) return;
        this.who = who.name;
        this.schedule.setAt(this.base + this.lineCount);
        this.lineCount++;
        // Pre-render the next block while this one plays out.
        if (!this.peeked && this.lineCount >= Math.ceil(lines.length * 0.6)) {
          this.peeked = true;
          const nxt = this.schedule.peekNext(this.env.context());
          this.env.hub.player.prefetch(nxt.lines);
        }
      },
      onEnd: () => this.next(my),
    });
  }

  private next(my: number): void {
    if (my !== this.gen || !this.active) return;
    this.env.setBed(BED_OPEN);
    this.who = '';
    this.schedule.advance(this.env.context());
    this.playCurrent();
  }
}
