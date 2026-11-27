/**
 * StoryBridge: the glue between MissionSystem (objectives, events) and the Nightlife systems. Missions stay plain MissionDef
 * data; per-mission behaviour lives in `MissionHooks` (see content/pedro/hooks.ts). The host builds one bridge, calls
 * `update(dt, hour)` once per step, forwards DJ results, the F key near a pedestrian, and the scene UI's keys. Nothing here runs
 * unless a hooked mission is active (or a scene is open), so seeded simulations are not affected.
 */
import type { MissionSystem } from '@/game/missions/MissionSystem';
import type { Nightlife } from './nightlife';
import { ChoiceScene, DateScene, FightScene, type Scene } from './scenes';
import { PICO_SCENE_FACTORIES } from './sceneContent';
import type { PromoPed, FlyerResult } from './promo';

export interface BridgeHost {
  /** Positive pays the wallet, negative spends (the host guards the balance with `canPay`). */
  pay(n: number): void;
  canPay(n: number): boolean;
  hour(): number;
  toast(msg: string, kind?: 'info' | 'good' | 'bad'): void;
  text(from: string, text: string, opts?: { delay?: number; key?: string }): void;
  /** Story flag test. */
  hasFlag(f: string): boolean;
  /** Settings: "Intimate scenes: On / Off". */
  intimate(): boolean;
  /** Move the game clock to this hour of the next morning (a warm date). Optional. */
  advanceToMorning?(hour: number): void;
}

export interface MissionHooks {
  start?(b: StoryBridge): void;
  /** objective `index` (0-based) just became active */
  objective?(b: StoryBridge, index: number): void;
  complete?(b: StoryBridge): void;
  fail?(b: StoryBridge): void;
}

export interface SceneEnv { nl: Nightlife; host: BridgeHost }
export type SceneFactory = (env: SceneEnv) => Scene;

export class StoryBridge {
  scene: Scene | null = null;
  /** Called whenever Nightlife state changed in a way worth saving (the host writes the mission save). */
  onPersist?: () => void;
  /** SCENEUI: set by the host when the rack panel exists. Missions call it to open the rack UI (rack id, budget); without it they fall back to `buyBest`. */
  openRack?: (rackId: string, budget: number) => void;
  private readonly hooks = new Map<string, MissionHooks>();
  private readonly factories = new Map<string, SceneFactory>();
  private sceneId = '';
  private offs: Array<() => void> = [];

  constructor(readonly missions: MissionSystem, readonly nl: Nightlife, readonly host: BridgeHost) {
    const on = missions.on.bind(missions);
    this.offs.push(
      on('mission:started', (e) => this.hooks.get(e.id)?.start?.(this)),
      on('mission:objective', (e) => this.hooks.get(e.id)?.objective?.(this, e.index)),
      on('mission:completed', (e) => { this.hooks.get(e.id)?.complete?.(this); this.persist(); }),
      on('mission:failed', (e) => this.hooks.get(e.id)?.fail?.(this)),
    );
    for (const [k, f] of Object.entries(PICO_SCENE_FACTORIES)) this.factories.set(k, f);
  }

  dispose(): void { for (const o of this.offs) o(); this.offs = []; }
  registerHooks(h: Record<string, MissionHooks>): void { for (const [k, v] of Object.entries(h)) this.hooks.set(k, v); }
  registerScene(id: string, f: SceneFactory): void { this.factories.set(id, f); }

  persist(): void { this.nl.saveTo(this.missions.story); this.onPersist?.(); }
  setFlag(f: string): void { this.missions.story.set(f); }

  /** Once per step. Opens a scene when the player pressed F in a scene ring, ticks it, and ends it (answering the mission). */
  update(dt: number, hour: number): void {
    this.nl.advance(hour);
    const req = this.missions.sceneRequest;
    if (!this.scene && req) {
      const f = this.factories.get(req.scene);
      if (f) { this.scene = f({ nl: this.nl, host: this.host }); this.sceneId = req.scene; }
    }
    const s = this.scene;
    if (!s) return;
    s.tick(dt);
    if (s.outcome !== null && s.frame().phase !== 'brawl') this.endScene(s);
  }

  /** The scene UI's key (1 to 5). */
  choose(key: number): void { this.scene?.choose(key); }

  private endScene(s: Scene): void {
    const outcome = s.outcome as string;
    const id = this.sceneId;
    this.scene = null;
    this.sceneId = '';
    const flags: string[] = [];
    if (s instanceof FightScene && s.flag) flags.push(s.flag);
    if (s instanceof ChoiceScene || s instanceof DateScene) flags.push(...s.flags);
    for (const f of flags) this.setFlag(f);
    if (s instanceof DateScene && s.result) {
      this.nl.dates.record(s.session.script, s.result);
      if (s.result.fadeToMorning) { this.setFlag('pico.morningAfter'); this.host.advanceToMorning?.(9); }
    }
    this.persist();
    this.missions.notify({ type: 'scene:done', scene: id, outcome });
  }

  // ------------------------------------------------------------------ actions the host forwards

  /** F near a pedestrian while a flyer night is open. Counts the flyer for the mission (the 'sold' signal) when taken. */
  handFlyer(nightId: string, ped: PromoPed): FlyerResult {
    const r = this.nl.promo.handFlyer(nightId, ped);
    if (r.kind === 'taken') this.missions.notify({ type: 'sold', item: 'flyer' });
    if (r.kind === 'taken' || r.kind === 'ignored' || r.kind === 'rude') this.host.toast(r.line, r.kind === 'taken' ? 'good' : 'info');
    return r;
  }

  /** The DJ game finished a set (call next to the existing dj:setFinished forward). `crowd` is SetResult.crowd when the host has it. */
  onSetFinished(e: { venue: string; score: number; minutes?: number; crowd?: number }): void {
    const book = this.nl.gigs;
    if (!book.open(e.venue)) return;
    const night = [...this.nl.promo.nights.values()].find((n) => n.venue === e.venue);
    const turnout = night ? this.nl.promo.turnout(night.id).ratio : 0.5;
    const o = book.settle(e.venue, { score: e.score, crowd: e.crowd ?? e.score / 100 }, turnout);
    if (!o) return;
    if (o.fee > 0) this.host.pay(o.fee);
    this.host.toast(o.fee > 0 ? `Paid $${o.fee}. ${o.message}` : o.message, o.fee > 0 ? 'good' : 'bad');
    if (o.rebook) this.setFlag(`gig.${e.venue}.rebook`);
    this.persist();
  }

  /** Buy the best resale-value pieces within `budget` and `count` from a rack (a stand-in for the rack UI). Returns how many were bought. */
  buyBest(rackId: string, budget: number, count: number): number {
    const rack = this.nl.racks.get(rackId);
    if (!rack) return 0;
    let spent = 0, n = 0;
    const worth = (g: { tier: string; condition: number; buy: number }): number => (g.tier === 'label' ? 3 : g.tier === 'vintage' ? 2 : 1) * g.condition / Math.max(1, g.buy);
    for (const g of [...rack.available].sort((a, b) => worth(b) - worth(a))) {
      if (n >= count) break;
      if (spent + g.buy > budget || !this.host.canPay(g.buy)) continue;
      const r = this.nl.bag.buy(rack, g.id, (c) => { if (!this.host.canPay(c)) return false; this.host.pay(-c); return true; });
      if (r === 'ok') { spent += g.buy; n++; }
    }
    this.persist();
    return n;
  }
}
