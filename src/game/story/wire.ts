/**
 * wire.ts (SCENEUI): builds everything the Pedro Martinez story needs in the running game from one small host object, so the lead's edit to
 * `src/main.ts` is a handful of lines. It makes Nightlife, StoryBridge (with the Act 1 hooks and scenes), the scene card, the flyer prompt and the
 * thrift rack panel, and gives the frame loop two calls: `update` once per step and `interact` for the F key.
 *
 * Nothing here runs unless `wireStory` is called, and main.ts calls it only while `PEDRO_STORY_ON` is true (dynamic import, so the code is a
 * separate chunk on the hosted build and is left out of the single-file build when the switch is off).
 */
import type { MissionSystem } from '@/game/missions/MissionSystem';
import type { PanelManager } from '@/ui/PanelManager';
import { StoryBridge, type BridgeHost } from './StoryBridge';
import { Nightlife } from './nightlife';
import type { PackHost } from './pack';
import { PICO_HOOKS } from '@/game/missions/content/pedro/hooks';
import { SceneCard } from '@/ui/story/SceneCard';
import { FlyerPrompt, type FlyerPed } from '@/ui/story/FlyerPrompt';
import { RackPanel } from '@/ui/story/RackPanel';
import { intimateOn } from '@/ui/story/storySettings';
import type { FightScene } from './scenes';

/** Which promotion night is open while a mission runs: the flyer prompt is offered only then. */
export const PROMO_NIGHT_OF_MISSION: Readonly<Record<string, string>> = { 'pico-paper-the-walls': 'pico-friday' };

export interface StoryWireHost {
  missions: MissionSystem;
  /** The overlay element the cards are appended to. */
  parent: HTMLElement;
  panels: Pick<PanelManager, 'register' | 'sync'>;
  /** Wallet: positive pays the player, negative spends (the same sign as BridgeHost.pay). */
  pay(n: number): void;
  canPay(n: number): boolean;
  cash(): number;
  toast(msg: string, kind?: 'info' | 'good' | 'bad'): void;
  /** Phone text from a named person (Phone.text). */
  text(from: string, text: string, opts?: { delay?: number; key?: string }): void;
  /** Story flag test (the inventory's flags, where missions put them). */
  hasFlag(f: string): boolean;
  /** Game clock, hours 0..24. */
  hour(): number;
  /** Set the clock to this hour of the next morning (a warm date). Optional. */
  advanceToMorning?(hour: number): void;
  /** The player's ground position. */
  playerPos(): { x: number; z: number };
  /** The pedestrians around the player (TrafficSystem.peds). */
  pedestrians(): readonly FlyerPed[];
  /** The selling system's witness callback (police heat for a seen hand-off). */
  packHost?: PackHost;
  /** A scene entered its brawl phase (the host spawns the fighter and calls `wire.fighterDown()` / `wire.playerDown()` at the end). Called once per scene. */
  onBrawl?: (sceneId: string, who: string) => void;
  /** Called whenever a panel of the story opens or closes (the host may pause things). */
  onPanel?: (open: boolean) => void;
  /** Save hook: the host writes the mission save (`saveMissionData`) when the story state changed. */
  onPersist?: () => void;
  /** Settings switch override (default: the stored "Intimate scenes" setting). */
  intimate?: () => boolean;
}

export interface StoryWire {
  readonly nightlife: Nightlife;
  readonly bridge: StoryBridge;
  readonly card: SceneCard;
  readonly flyer: FlyerPrompt;
  readonly rack: RackPanel;
  /** Once per simulation step. */
  update(dt: number, blocked?: boolean): void;
  /** The F key: true when it was used (a flyer handed out). Call after the interiors and missions had their turn. */
  interact(): boolean;
  /** The DJ game finished a set (forward next to the existing `dj:setFinished` mission notify). */
  onSetFinished(e: { venue: string; score: number; minutes?: number; crowd?: number }): void;
  /** Re-read Nightlife from the story state (after `missions.restore`, a save load, or a reset). */
  reload(): void;
  /** The brawl ended: the fighter went down or the player did. */
  fighterDown(): void;
  playerDown(): void;
  /** Any story panel is open (the host's `uiOpen`). */
  readonly anyOpen: boolean;
  dispose(): void;
}

export function wireStory(host: StoryWireHost): StoryWire {
  const nl = new Nightlife(host.packHost ?? { pay: (n) => host.pay(n) });
  const bridgeHost: BridgeHost = {
    pay: (n) => host.pay(n), canPay: (n) => host.canPay(n), hour: () => host.hour(), toast: (m, k) => host.toast(m, k),
    text: (f, t, o) => host.text(f, t, o), hasFlag: (f) => host.hasFlag(f), intimate: host.intimate ?? intimateOn,
    advanceToMorning: host.advanceToMorning,
  };
  const bridge = new StoryBridge(host.missions, nl, bridgeHost);
  bridge.registerHooks(PICO_HOOKS);
  bridge.onPersist = host.onPersist;
  nl.loadFrom(host.missions.story);

  const card = new SceneCard(host.parent, bridge, { panels: host.panels });
  const rack = new RackPanel(host.parent, nl, { canPay: (n) => host.canPay(n), pay: (n) => host.pay(n), cash: () => host.cash() }, { panels: host.panels, onChange: () => bridge.persist(), onToggle: (o) => host.onPanel?.(o) });
  const flyer = new FlyerPrompt(host.parent, bridge, (id) => nl.promo.nights.get(id) ?? null);
  bridge.openRack = (id, budget) => { rack.openRack(id, budget); };
  let brawlFor = '';

  const wire: StoryWire = {
    nightlife: nl, bridge, card, flyer, rack,
    get anyOpen(): boolean { return card.isOpen || rack.isOpen; },
    update(dt, blocked = false): void {
      const before = bridge.scene;
      const wasOpen = card.isOpen;
      bridge.update(dt, host.hour());
      if (before && !bridge.scene) card.showEnding(before.frame());
      card.update(dt);
      if (card.isOpen !== wasOpen) host.onPanel?.(card.isOpen);
      const s = bridge.scene;
      if (s && s.frame().phase === 'brawl') { if (brawlFor !== s.id) { brawlFor = s.id; host.onBrawl?.(s.id, s.frame().who); } } else brawlFor = '';
      const m = host.missions;
      const night = m.isActive && m.activeId ? (PROMO_NIGHT_OF_MISSION[m.activeId] ?? null) : null;
      flyer.update(host.playerPos(), host.pedestrians(), night, blocked || card.isOpen || rack.isOpen);
    },
    interact(): boolean { return flyer.press() !== null; },
    onSetFinished: (e) => bridge.onSetFinished(e),
    reload(): void { if (!nl.loadFrom(host.missions.story)) nl.restore(new Nightlife().serialize()); /* a reset or a save without the story block: new-game state */ },
    fighterDown(): void { (bridge.scene as FightScene | null)?.fighterDown?.(); },
    playerDown(): void { (bridge.scene as FightScene | null)?.playerDown?.(); },
    dispose(): void { card.dispose(); rack.dispose(); flyer.dispose(); bridge.dispose(); },
  };
  return wire;
}
