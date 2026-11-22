/** A fake game for the tutorial tests (not a test file): a real Input and Bindings, plain objects for the rest. */
import { Bindings } from '@/core/Bindings';
import { EventBus } from '@/core/Events';
import { Input } from '@/core/Input';
import type { TutorialHost } from '@/ui/tutorial/context';
import { Tutorial, type TutorialOptions } from '@/ui/tutorial/Tutorial';
import { TutorialStore } from '@/ui/tutorial/store';

export function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, String(v)); } };
}

export interface FakeGame {
  host: TutorialHost;
  input: Input;
  bindings: Bindings;
  events: EventBus;
  state: { splash: boolean; panel: string | null; blocked: boolean; mission: boolean; waypoint: boolean; homeDist: number; stars: number; heat: number; raining: boolean; prompt: string; handsSig: string; yaw: number; cars: Array<{ id: string; body: { pos: { x: number; z: number } } }>; pickups: Array<{ x: number; z: number }> };
  player: { inVehicle: boolean; vehicle: { speed: number; id: string; body: { pos: { x: number; z: number } } } | null; body: { pos: { x: number; z: number }; vel: { x: number; z: number } }; sprint: number; jumpHeight: number; isVaulting: boolean; lastVehicleInput: { brake: boolean; handbrake: boolean; throttle: number } };
  views: { serial: number };
}

export function fakeGame(): FakeGame {
  const bindings = new Bindings(false);
  const input = new Input(document.createElement('div'), bindings);
  const events = new EventBus();
  const state: FakeGame['state'] = { splash: false, panel: null, blocked: false, mission: false, waypoint: false, homeDist: 500, stars: 0, heat: 0, raining: false, prompt: '', handsSig: '', yaw: 0, cars: [], pickups: [] };
  const player: FakeGame['player'] = { inVehicle: false, vehicle: null, body: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }, sprint: 0, jumpHeight: 0, isVaulting: false, lastVehicleInput: { brake: false, handbrake: false, throttle: 0 } };
  const views = { serial: 0 };
  const host: TutorialHost = {
    input, player, camera: { get yaw() { return state.yaw; }, views },
    vehicles: () => state.cars, pickups: () => state.pickups, handsSig: () => state.handsSig,
    panelTop: () => state.panel, blocked: () => state.blocked, waypoint: () => state.waypoint, homeDist: () => state.homeDist,
    stars: () => state.stars, heat: () => state.heat, raining: () => state.raining, prompt: () => state.prompt, mission: () => state.mission,
  };
  return { host, input, bindings, events, state, player, views };
}

export interface Made { t: Tutorial; g: FakeGame; storage: ReturnType<typeof memoryStorage>; root: HTMLElement; grace: number[]; store: TutorialStore }

export function makeTutorial(o: Partial<TutorialOptions> & { storage?: ReturnType<typeof memoryStorage>; game?: FakeGame } = {}): Made {
  const g = o.game ?? fakeGame();
  const storage = o.storage ?? memoryStorage();
  const store = o.store ?? new TutorialStore(storage);
  const root = document.createElement('div'); document.body.appendChild(root);
  const grace: number[] = [];
  const t = new Tutorial({ host: g.host, root, police: { setGrace: (s) => grace.push(s) }, events: g.events, loadedSave: false, splashUp: () => g.state.splash, store, padSkipEdge: () => false, ...o });
  return { t, g, storage, root, grace, store };
}

export const frames = (t: Tutorial, seconds: number, dt = 1 / 30): void => { for (let s = 0; s < seconds - 1e-9; s += dt) t.update(dt); };
export const keydown = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })); };
