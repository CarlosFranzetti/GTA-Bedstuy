/**
 * The northern extension and the el train (lane WBURG). Everything here is gated on feature detection: when the world
 * has no el stations, `detectStoryFeatures` returns {} and the mission is simply not built. Nothing else depends on it.
 */
import type { Vec2 } from '@/core/Math2';
import type { BedstuyData, GridModel } from '@/world/types';
import { F } from '@/game/story/flags';
import type { MissionDef } from '../../types';
import { offset, type PlaceCtx } from '../places';

export interface StoryFeatures {
  /** The el is in the world: `home` is the station nearest the block, `north` the northernmost one. */
  el?: { home: Vec2; north: Vec2 };
}

interface StationLike { id?: string; x: number; z: number }

const isStation = (s: unknown): s is StationLike =>
  typeof s === 'object' && s !== null && Number.isFinite((s as StationLike).x) && Number.isFinite((s as StationLike).z);

/**
 * Looks for el stations in the world data. WBURG publishes them as `data.transit.stations` ({id, x, z}); with fewer than
 * two (or none) the north missions are left out. Pass explicit features to `buildMissions` to override (tests do).
 */
export function detectStoryFeatures(grid: GridModel, data: BedstuyData): StoryFeatures {
  void grid;
  const t = (data as unknown as { transit?: { stations?: unknown } }).transit;
  const list = Array.isArray(t?.stations) ? (t!.stations as unknown[]).filter(isStation) : [];
  if (list.length < 2) return {};
  const byHome = [...list].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const byNorth = [...list].sort((a, b) => a.z - b.z);
  const home = byHome[0], north = byNorth[0];
  if (home === north) return {};
  return { el: { home: { x: home.x, z: home.z }, north: { x: north.x, z: north.z } } };
}

export function lastStopNorth(_ctx: PlaceCtx, el: NonNullable<StoryFeatures['el']>): MissionDef {
  const model = [offset(el.north, 22, -12), offset(el.north, 36, -20), offset(el.north, 48, -8)];
  const unit = offset(el.north, 36, -14);
  return {
    id: 'last-stop-north', title: 'Last Stop: Model Unit', act: 2, tag: 'side',
    requires: ['walk-dee-home'], availableHours: [9, 21],
    blurb: 'Yossi says the Parallax "Experience Centre" at the end of the el has a scale model of your block. Ride up and photograph what they have planned for it.',
    giverPoi: 'wax-deli', giver: offset(el.home, 6, 4), triggerRadius: 6, timeLimit: 420,
    phoneIntro: { from: 'Yossi', text: 'At the other end of the el there is a model of your block. It is the size of a ping-pong table. It has tiny trees. I need photographs of the tiny trees.' },
    failJoke: { blownCover: 'You wander off to look at a mural. By the time you look back, the model unit is a different model unit.', copsCalled: 'Security calls it "unauthorised footfall". You are the footfall.' },
    followUps: [{ from: 'Yossi', text: 'The tiny trees are real. They are taking the real trees too. It says so on page eleven of a PDF named FINAL_final_v3.', delay: 70 }],
    setFlags: [F.NORTH_DEED],
    objectives: [
      { kind: 'goTo', at: el.home, radius: 14, presence: 'onFoot', text: 'Walk up to the el station' },
      { kind: 'goTo', at: el.north, radius: 16, presence: 'any', text: 'Ride the el to the last stop', timeLimit: 240, say: [{ who: 'Train', text: 'Next stop: the future. Doors open on the right. Please mind the gentrification.' }] },
      {
        kind: 'spots', points: model, radius: 8, presence: 'onFoot', prompt: 'Photograph the model', item: 'model photo', text: 'Photograph the three panels of the scale model',
        say: [{ who: 'Doorman', text: 'Welcome to the Experience. Please take a branded tote and a sense of belonging.' }],
        banter: ['The model has tiny people. Every tiny person is holding a tiny coffee. None of the tiny people are Black. The tiny dog is.'],
      },
      { kind: 'stakeout', at: unit, radius: 10, seconds: 20, slack: 5, presence: 'onFoot', failIfStars: 1, text: 'Stand quietly while the tour group passes', events: [{ at: 6, text: 'A guide: "And here we have the community-forward ground floor."' }] },
      { kind: 'goTo', at: el.home, radius: 14, presence: 'any', text: 'Ride home with the photographs', say: [{ who: 'Yossi', text: 'Send me the tiny trees. All of them. Slowly, so I can feel it.' }] },
    ],
    reward: { cash: 320, message: 'Yossi: "You photographed a tiny tree for me. I will never be able to repay a tiny tree."' },
    retryHint: 'the model is still on its plinth',
  };
}
