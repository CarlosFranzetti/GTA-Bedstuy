/**
 * Mission framework contracts. Pure data + plain types (no three.js, no DOM), so the whole mission layer is
 * unit-testable. Coordinates: metres, +x east, +z south (core/Math2.ts).
 */
import type { Vec2 } from '@/core/Math2';

/** Where the player has to be while an objective is satisfied. */
export type Presence = 'onFoot' | 'inVehicle' | 'any';

interface ObjectiveBase {
  /** Short HUD line, e.g. "Grab the bag at KOSCIUSZ-K-O-MAT". */
  text: string;
  /** Seconds allowed for this objective alone (counted from the moment it becomes active). Optional. */
  timeLimit?: number;
  /** Fail if the player stays out of a vehicle for longer than this many seconds (getaway rules). */
  stayInVehicle?: number;
  /** Fire this many "carjack"-equivalent heat points when the objective completes (the system asks the host to raise stars). */
  raiseWantedTo?: number;
  /** Cash-free flavour line shown as a toast when the objective completes. */
  doneMessage?: string;
  /** Banter: one line right after the objective starts, then every `banterEvery` seconds (BIBLE section 4: a line every 10-15 s). */
  banter?: string[];
  banterEvery?: number;
  /** Items the player is handed when the objective completes (a cat, a couch). */
  grant?: string[];
  /** Fail ('copsCalled') if the wanted level reaches this many stars while the objective is active. */
  failIfStars?: number;
  /** Fail ('tooFast') if the player moves faster than this (km/h) for more than half a second, after a 1.5 s lead-in (a couch on the roof). */
  maxKmh?: number;
}

/** Be inside the circle (`radius` m around `at`) with the right presence. */
export interface GoToObjective extends ObjectiveBase { kind: 'goTo'; at: Vec2; radius: number; presence: Presence }
/** Like goTo, and the player now carries `items` (shown on the HUD, consumed by a later deliver). */
export interface PickUpObjective extends ObjectiveBase { kind: 'pickUp'; at: Vec2; radius: number; presence: Presence; items: string[] }
/** Like goTo, requires every item in `items` to be carried; they are handed over (removed). */
export interface DeliverObjective extends ObjectiveBase { kind: 'deliver'; at: Vec2; radius: number; presence: Presence; items: string[] }
/** Accumulates `seconds` of time spent with at least `minStars` stars (default 1): stay on the run that long. */
export interface SurviveWantedObjective extends ObjectiveBase { kind: 'surviveWanted'; seconds: number; minStars?: number }
/** Completes once the wanted level is 0 (the cops lost you). */
export interface LoseWantedObjective extends ObjectiveBase { kind: 'loseWanted' }
/** Idle for `seconds` seconds of mission time (a beat in a conversation, waiting for a drop-off). */
export interface TimerObjective extends ObjectiveBase { kind: 'timer'; seconds: number }
/** Stay below `kmh` for `seconds` in a row (reset by any burst above it); optionally only counts inside a circle. */
export interface HoldSpeedBelowObjective extends ObjectiveBase { kind: 'holdSpeedBelow'; kmh: number; seconds: number; at?: Vec2; radius?: number }
/** Be more than `radius` m away from `from`. */
export interface EscapeRadiusObjective extends ObjectiveBase { kind: 'escapeRadius'; from: Vec2; radius: number }
/** Be in any vehicle. */
export interface EnterVehicleObjective extends ObjectiveBase { kind: 'enterVehicle' }

/**
 * Walk up to a named person (marker at `at`), press F; every press shows the next line. Completes after the last line.
 * Requires being on foot unless `presence` says otherwise.
 */
export interface TalkToObjective extends ObjectiveBase { kind: 'talkTo'; at: Vec2; radius: number; presence?: Presence; npc: string; lines: string[] }
/** Press F `presses` times (default 1) next to a thing (a generator, a door); `prompt` is the on-screen hint. */
export interface InteractObjective extends ObjectiveBase { kind: 'interact'; at: Vec2; radius: number; presence?: Presence; prompt: string; presses?: number }
/**
 * Follow a scripted moving target (a car, a truck) along `route` at `speed` m/s and stay within `maxDistance` m of it.
 * The target waits until you are close, then moves; leave the range for more than `grace` seconds (default 6) and the
 * mission fails with 'lostTarget'. Completes when the target is at the end of the route and you are still near it.
 */
export interface TailObjective extends ObjectiveBase { kind: 'tail'; route: Vec2[]; speed: number; maxDistance: number; grace?: number; target: string }
/** Visit every point in `points` (any order unless `ordered`); each visit adds `item` to what you carry. */
export interface CollectObjective extends ObjectiveBase { kind: 'collect'; points: Vec2[]; radius: number; presence: Presence; item: string; ordered?: boolean }
/** Wait until the game hour is inside [from, to) (wraps midnight), optionally standing in the circle. */
export interface WaitUntilHourObjective extends ObjectiveBase { kind: 'waitUntilHour'; from: number; to: number; at?: Vec2; radius?: number }
/** Be inside the interior `id` (host signal interior:entered). `at` is the door, for the marker. */
export interface EnterInteriorObjective extends ObjectiveBase { kind: 'enterInterior'; id: string; at?: Vec2; radius?: number }
/** Be outside the interior `id` (host signal interior:exited). `at` is the door, for the marker. */
export interface ExitInteriorObjective extends ObjectiveBase { kind: 'exitInterior'; id: string; at?: Vec2; radius?: number }
/** Play a DJ set at `venue` for at least `minutes`; the host reports dj:setFinished. Below `minScore` the mission fails. */
export interface DjSetObjective extends ObjectiveBase { kind: 'djSet'; venue: string; minutes: number; minScore: number; at?: Vec2; radius?: number }
/** Buy every record id in `items` (any order) at `shop` (host signal shop:bought). `at` is the shop door, for the marker. */
export interface BuyObjective extends ObjectiveBase { kind: 'buy'; shop: string; items: string[]; at?: Vec2; radius?: number }
/**
 * Sell `count` of `item` from your pockets at a stoop: a customer walks up every `every` seconds while you stand in the
 * circle (marker); press F within 3 m of the customer to sell. (A host with real peds can also send {type:'sold'}.)
 */
export interface SellObjective extends ObjectiveBase { kind: 'sell'; item: string; count: number; at: Vec2; radius: number; every?: number }

export type ObjectiveDef =
  | TalkToObjective | InteractObjective | TailObjective | CollectObjective | WaitUntilHourObjective
  | EnterInteriorObjective | ExitInteriorObjective | DjSetObjective | BuyObjective | SellObjective
  | GoToObjective | PickUpObjective | DeliverObjective | SurviveWantedObjective | LoseWantedObjective
  | TimerObjective | HoldSpeedBelowObjective | EscapeRadiusObjective | EnterVehicleObjective;

export type ObjectiveKind = ObjectiveDef['kind'];

export interface MissionReward {
  cash: number;
  /** Toast line on completion. */
  message: string;
}

/** A text/call that reaches the phone. */
export interface PhoneLine { from: string; text: string }

export interface MissionDef {
  id: string;
  title: string;
  /** 'story' missions drive the phone's "next mission" pointer; 'side' ones are optional (default 'story'). */
  tag?: 'story' | 'side';
  /** Mission ids that must be complete before this one is offered (the DJ chapters). */
  requires?: string[];
  /** The setup phone call / text delivered to the phone when the mission starts. */
  phoneIntro?: PhoneLine;
  /** The twist: when objective `at` becomes active, this line is shown and `mission:twist` is emitted. */
  twist?: { at: number; text: string };
  /** One-liners per fail reason; funnier than the success line (BIBLE section 4). */
  failJoke?: Partial<Record<FailReason, string>>;
  /** A text that arrives `delay` real seconds after the reward. */
  followUp?: PhoneLine & { delay: number };
  /** Cash handed over once when the mission first starts (the money for the records). */
  stake?: number;
  /** Progress flags set on completion (e.g. 'aftersloth.unlocked'). */
  setFlags?: string[];
  /** One-line pitch, shown when the trigger fires. */
  blurb: string;
  /** POI id of the person who gives the job (for maps/debug; the trigger position is `giver`). */
  giverPoi: string;
  /** Trigger zone centre (on the street in front of the giver) and radius in metres. */
  giver: Vec2;
  triggerRadius: number;
  objectives: ObjectiveDef[];
  /** Seconds for the whole mission, counted from the start. Optional. */
  timeLimit?: number;
  /** Game hour (0..24) by which the mission has to be done; running past it fails with `timeUp`. */
  deadlineHour?: number;
  /** Game hours [from, to) in which the job can be taken. */
  availableHours?: readonly [number, number];
  reward: MissionReward;
  /** Shown on the retry prompt after a failure. */
  retryHint?: string;
}

// ------------------------------------------------------------------ runtime state

export type MissionStatus = 'available' | 'active' | 'complete' | 'failed';

export type FailReason = 'timeUp' | 'clockUp' | 'leftVehicle' | 'lostTarget' | 'lowScore' | 'copsCalled' | 'tooFast';

export interface MissionEvents {
  'mission:started': { id: string; title: string; blurb: string };
  'mission:objective': { id: string; index: number; total: number; text: string };
  'mission:completed': { id: string; title: string; cash: number; message: string; totalCash: number };
  'mission:failed': { id: string; title: string; reason: FailReason; message: string };
  'mission:twist': { id: string; text: string };
}

export type MissionEventName = keyof MissionEvents;

/** Marker the renderer / minimap draws. The array is mutated in place; compare `markersVersion` to detect changes. */
export interface MissionMarker {
  id: string;
  kind: 'giver' | 'objective';
  x: number;
  z: number;
  radius: number;
  /** CSS colour for the cylinder and the minimap blip. */
  color: string;
  label: string;
}

/** What the HUD reads every frame (one object, mutated in place). */
export interface MissionHudState {
  status: 'idle' | 'active' | 'complete' | 'failed';
  title: string;
  objective: string;
  /** 1-based objective number and total. */
  step: number;
  steps: number;
  /** Seconds left on the tightest running clock, or -1 when nothing is counting down. */
  timeLeft: number;
  /** Progress inside the current objective, 0..1 (hold-still bars, wait timers), or -1. */
  progress: number;
  carrying: string;
  cash: number;
  /** Bumps whenever there is a new toast to show. */
  toastSeq: number;
  toast: string;
  toastKind: 'info' | 'good' | 'bad';
  /** Set while failed: the line telling the player how to retry. */
  retryPrompt: string;
  /** "F  Talk to Ms. Odette" while an interaction is in reach, else ''. */
  prompt: string;
}

/** Signals the host forwards from other systems (interiors, shop, DJ game, peds). */
export type MissionSignal =
  | { type: 'interior:entered'; id: string }
  | { type: 'interior:exited'; id: string }
  | { type: 'shop:bought'; recordId: string; shop?: string; price?: number }
  | { type: 'dj:setFinished'; venue: string; score: number; minutes?: number }
  | { type: 'sold'; item: string };

/** What the DJ game should run while a djSet objective is active. */
export interface DjRequest { venue: string; minutes: number; minScore: number; at: Vec2 | null; radius: number }

/** Persisted mission progress. Small JSON; `restore()` validates everything. */
export interface MissionSave {
  v: 1;
  completed: string[];
  cash: number;
  /** Missions whose start-up stake was already paid (no double payout on retry or reload). */
  staked?: string[];
}
