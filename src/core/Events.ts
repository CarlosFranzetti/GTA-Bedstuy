/** Typed pub/sub. Systems that must not import each other talk through this. */
import type { Vec2 } from './Math2';

export type CrimeType = 'hitPed' | 'hitCop' | 'hitVehicle' | 'carjack';

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
  /** Mission framework (src/game/missions). */
  'mission:started': { id: string; title: string; blurb: string };
  'mission:objective': { id: string; index: number; total: number; text: string };
  'mission:completed': { id: string; title: string; cash: number; message: string; totalCash: number };
  'mission:failed': { id: string; title: string; reason: 'timeUp' | 'clockUp' | 'leftVehicle'; message: string };
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
