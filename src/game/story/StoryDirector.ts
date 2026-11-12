/**
 * StoryDirector: listens to the mission events and turns them into story delivery. Pure (no three.js, no DOM).
 *
 *  - phone texts: branch-dependent `followUps` after a mission, plus a "Mission Log" thread (one line per chapter)
 *  - radio: news bulletins unlocked by finished missions and ads that darken with the act (`broadcast()`)
 *  - subtitles: `onSubtitle` fires for every dialogue line (the host can speak it with the cast voice)
 *  - camera: `onBeat` fires for cutscene-lite letterbox beats
 *  - the mission log as data (`log()`), and the story state for ambient notices (`AmbientNotices`)
 *
 * main.ts only has to construct it (see the FOR FABLE lines in docs/swarm/transcript.md); everything else is events.
 */
import type { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef } from '@/game/missions/types';
import { characterByName, type Voice } from './cast';
import { F } from './flags';
import { adsFor, currentAct, unlockedBulletins } from './news';
import { threadsFor } from './threads';

/** What the director needs from the phone (Phone satisfies it). */
export interface StoryPhone { text(from: string, text: string, opts?: { delay?: number; key?: string; mission?: string }): boolean }

export interface BroadcastStory { bulletins: string[]; ads: string[] }

export interface LogEntry {
  id: string;
  title: string;
  act: number;
  status: 'locked' | 'available' | 'active' | 'complete' | 'failed';
  blurb: string;
  /** What you chose, if the mission had a fork. */
  choice: string;
}

export interface DirectorOptions {
  /** Speak a subtitle line (SpeechSynthesis in the host). Voice shaping comes from the cast. */
  speak?: (who: string, text: string, voice: Voice | null) => void;
  /** Cutscene-lite: letterbox the camera (`cam.setLetterbox(true, seconds)`). */
  onBeat?: (seconds: number) => void;
  /** New bulletins or ads: push them to the radio (`audio.setBroadcast(story.broadcast())`). */
  onBroadcast?: (b: BroadcastStory) => void;
}

const CHAPTER_LINES: Record<string, string> = {
  'notice-of-intent': 'Notice of Intent: four doors, four notices, one LLC with a mailbox rental for a face.',
  'public-comment': 'Public Comment: three minutes, a cab, a rival lanyard, a vote that was always 4-3.',
  'handle-with-care': 'Handle With Care: Odette\'s test pressings made it across Bed-Stuy with their grooves.',
  'back-rent': 'Back Rent: Odette was short. You chose how she got whole.',
  'fleece-vest': 'Follow the Fleece Vest: Hobbs collects from the laundromat. Doña Marisol is not a willing host.',
  'open-house': 'Open House, Closed Door: the leasing office has a sergeant in it. Hallie and Bryce signed the decal.',
  'walk-dee-home': 'Walk Dee Home: the jingle is hers. The sound of the block was for sale.',
  'repo-the-repo': 'Repo the Repo: Tay\'s car is out of the lot. Where it goes next is on you.',
  'crate-expectations': 'Crate Expectations: the shutter came down at six. The crates were not behind it.',
  'night-of-the-narcan': 'Four Minutes: Tay, the club yard, the kit, the siren. He is alive.',
  'smoke-signals': 'Smoke Signals: nine households out, one cat saved, one kid caught, one form signed.',
  'borough-hall-express': 'Borough Hall Express: thirty-one neighbours, one bus, one name that should not have been on the list.',
  'last-call-on-throop': 'Last Call on Throop: the room, the billboard, the check. You chose the ending.',
  'last-stop-north': 'Last Stop, North: the other end of the line has a model unit of your block.',
  // STORY2 side jobs
  'moisture-event': 'A Moisture Event: three doors, one stoop, one woman in a coat indoors. The heat is "under review".',
  'founder-mode': 'Founder Mode: the cards said FOUNDING NEIGHBOUR. Then DOG WELLNESS. Then casserole.',
  'red-tape-relay': 'Red Tape Relay: three stamps for Ms. Odette. The process works. The process does not.',
  'carbon-copy': 'Carbon Copy: one pencil, eleven inspections, one detector with no battery. The family has a new boiler and a spoon.',
  'the-binder': 'The Binder: forty-six years of landlord letters came home. Miss Cordy wrote down who brought it.',
  'gavel-to-gavel': 'Gavel to Gavel: the board kept its quorum for a kick drum. The chair recused herself in pen.',
  'pigeon-post': 'Pigeon Post: forty birds, one billboard, one tagged amenity. Mrs. Abernathy came home.',
  'van-man': 'Van Man: a van scored every stoop. You chose who read the list.',
  'silent-retreat': 'Silent Retreat: Bryce is home and eating toast. The plant is named Gerald.',
  'slow-roll': 'Slow Roll: twelve miles an hour, on purpose. Mrs. Hollis had a procession the block paid for.',
};

export class StoryDirector {
  /** Bulletins heard so far, newest first (the announcer reads the unheard ones). */
  private bulletins: string[] = [];
  private ads: string[] = [];
  private lastAdKey = '';
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly missions: MissionSystem,
    private readonly phone: StoryPhone | null,
    private readonly opts: DirectorOptions = {},
  ) {
    this.offs.push(
      missions.on('mission:completed', (e) => this.onCompleted(e.id)),
      missions.on('mission:subtitle', (e) => opts.speak?.(e.who, e.text, characterByName(e.who)?.voice ?? null)),
      missions.on('mission:beat', (e) => opts.onBeat?.(e.seconds)),
    );
    this.refresh(false);
  }

  dispose(): void { for (const o of this.offs) o(); this.offs.length = 0; }

  /** What `audio.setBroadcast` takes: unlocked bulletins (newest first) and the ads for the current act. */
  broadcast(): BroadcastStory { return { bulletins: [...this.bulletins], ads: [...this.ads] }; }

  /** The mission log: every story mission with its state and the choice made. */
  log(): LogEntry[] {
    const m = this.missions;
    const story = m.story;
    return m.missions
      .filter((d) => d.act !== undefined)
      .map((d, i) => ({ d, i }))
      .sort((a, b) => (a.d.act ?? 0) - (b.d.act ?? 0) || a.i - b.i) // grouped by act, definition order inside an act (the side jobs follow the core)
      .map(({ d }): LogEntry => {
        const st = m.statusOf(d.id);
        const status: LogEntry['status'] = st === 'complete' ? 'complete' : st === 'active' ? 'active' : st === 'failed' ? 'failed' : m.isOffered(d.id) ? 'available' : 'locked';
        return { id: d.id, title: d.title, act: d.act ?? 0, status, blurb: d.blurb, choice: forkChoice(d, story.choiceOf.bind(story)) };
      });
  }

  /** Call after a save has been loaded (flags and missions restored): rebuilds the radio copy without re-sending texts. */
  resync(): void { this.refresh(false); }

  private onCompleted(id: string): void {
    const def = this.missions.missions.find((d) => d.id === id);
    if (!def) return;
    const story = this.missions.story;
    def.followUps?.forEach((f, i) => {
      if (f.ifFlag !== undefined && !story.has(f.ifFlag)) return;
      if (f.unlessFlag !== undefined && story.has(f.unlessFlag)) return;
      this.phone?.text(f.from, f.text, { delay: f.delay, key: `fu:${id}:${i}` });
    });
    // running threads (landlord notices, the founder's pivots, Auntie's forwards, the board chat, invitations to the side jobs)
    for (const t of threadsFor(id)) {
      if (t.ifFlag !== undefined && !story.has(t.ifFlag)) continue;
      if (t.unlessFlag !== undefined && story.has(t.unlessFlag)) continue;
      this.phone?.text(t.from, t.text, { delay: t.delay, key: `th:${t.id}` });
    }
    const line = CHAPTER_LINES[id];
    if (line) this.phone?.text('Mission Log', line, { delay: 2, key: `log:${id}` });
    this.refresh(true);
  }

  private refresh(announce: boolean): void {
    const done = new Set(this.missions.missions.filter((d) => this.missions.isCompleted(d.id)).map((d) => d.id));
    const fresh = unlockedBulletins(done, this.missions.story).map((b) => b.text).reverse();
    const adKey = String(currentAct(this.missions.story));
    const changed = fresh.length !== this.bulletins.length || adKey !== this.lastAdKey;
    this.bulletins = fresh;
    this.lastAdKey = adKey;
    this.ads = adsFor(this.missions.story);
    if (changed && announce) this.opts.onBroadcast?.(this.broadcast());
    if (!announce) this.opts.onBroadcast?.(this.broadcast());
  }
}

function forkChoice(d: MissionDef, choiceOf: (fork: string) => string | null): string {
  for (const o of d.objectives) if (o.kind === 'fork') { const f = choiceOf(o.id); if (f) return o.options.find((x) => x.flag === f)?.label ?? f; }
  return '';
}

export { F as STORY_FLAGS };
