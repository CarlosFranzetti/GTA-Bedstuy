/** Typed pub/sub. Systems that must not import each other talk through this. */
import type { Vec2 } from './Math2';

/**
 * hitParked: repeated ramming of parked / civilian cars. sidewalkDriving: driving on the pavement near pedestrians.
 * (hitVehicle is a single bump: it adds no stars but resets the decay timer.)
 */
export type CrimeType = 'hitPed' | 'hitCop' | 'hitVehicle' | 'carjack' | 'hitParked' | 'sidewalkDriving';

export interface GameEvents {
  /** Something the cops care about. */
  crime: { type: CrimeType; pos: Vec2 };
  /** Physical impact between bodies; `strength` is relative closing speed in m/s. */
  impact: { a: string; b: string; strength: number; pos: Vec2 };
  enterVehicle: { vehicleId: string };
  exitVehicle: { vehicleId: string };
  horn: { pos: Vec2 };
  wantedChanged: { stars: number };
  /** Player asked the radio to change station. */
  radioNext: Record<string, never>;
  /** Fired once when the player first interacts (needed to start WebAudio). */
  userGesture: Record<string, never>;
  pedKnockedDown: { id: string; pos: Vec2 };
  /** A pedestrian says something short out loud (PedSocial). Speak it with PedVoice (src/audio/voice/PedVoice.ts) and show the subtitle. */
  pedBark: { id: string; text: string; kind: string; pos: Vec2; pitch: number; rate: number; sex: 'm' | 'f' | 'x'; age: 'kid' | 'teen' | 'adult' | 'old'; /** 0..1 how loud: shouts are 1, small talk 0.6 */ loud: number };
  /** Mission framework (src/game/missions). */
  'mission:started': { id: string; title: string; blurb: string };
  'mission:objective': { id: string; index: number; total: number; text: string };
  'mission:completed': { id: string; title: string; cash: number; message: string; totalCash: number };
  'mission:failed': { id: string; title: string; reason: string; message: string };
  'mission:twist': { id: string; text: string };
  'mission:abandoned': { id: string };
  /** Story delivery: a dialogue line (speaker + text), a letterbox beat, a fork decision. */
  'mission:subtitle': { id: string; who: string; text: string };
  'mission:beat': { id: string; seconds: number };
  'mission:choice': { id: string; fork: string; flag: string; label: string };
  /** Interiors, record shop and DJ game (src/world/interiors, src/game/DjGame.ts, src/ui/ShopUi.ts). */
  'interior:entered': { id: string };   // 'wax-deli' | 'aftersloth' | 'home'
  'interior:exited': { id: string };
  'shop:bought': { recordId: string; price: number; shop: string };
  'shop:sold': { recordId: string; price: number; shop: string };
  'record:pressed': { recordId: string };
  'dj:setFinished': { venue: string; score: number; minutes: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();
  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(fn as Handler<unknown>);
    return () => { set!.delete(fn as Handler<unknown>); };
  }
  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    this.handlers.get(type)?.forEach((fn) => fn(payload));
  }
}
