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

export type ObjectiveDef =
  | GoToObjective | PickUpObjective | DeliverObjective | SurviveWantedObjective | LoseWantedObjective
  | TimerObjective | HoldSpeedBelowObjective | EscapeRadiusObjective | EnterVehicleObjective;

export type ObjectiveKind = ObjectiveDef['kind'];

export interface MissionReward {
  cash: number;
  /** Toast line on completion. */
  message: string;
}

export interface MissionDef {
  id: string;
  title: string;
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

export type FailReason = 'timeUp' | 'clockUp' | 'leftVehicle';

export interface MissionEvents {
  'mission:started': { id: string; title: string; blurb: string };
  'mission:objective': { id: string; index: number; total: number; text: string };
  'mission:completed': { id: string; title: string; cash: number; message: string; totalCash: number };
  'mission:failed': { id: string; title: string; reason: FailReason; message: string };
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
}

/** Persisted mission progress. Small JSON; `restore()` validates everything. */
export interface MissionSave {
  v: 1;
  completed: string[];
  cash: number;
}
