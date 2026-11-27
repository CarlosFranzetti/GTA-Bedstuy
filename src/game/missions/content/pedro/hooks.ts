/**
 * Per-mission behaviour for the Act 1 missions: what the Nightlife systems do when each mission starts, reaches an
 * objective or ends. Register with `bridge.registerHooks(PICO_HOOKS)`.
 */
import type { MissionHooks } from '@/game/story/StoryBridge';

const GUEST_FLAGS = ['pico.guest.yesenia', 'pico.guest.lana', 'pico.guest.clem', 'pico.guest.odette', 'pico.guest.akira'];

export const PICO_HOOKS: Record<string, MissionHooks> = {
  'pico-lunes-night': {
    // Rafa's booking: tonight at nine, three minutes, $90 base. The DJ game's result settles it (StoryBridge.onSetFinished).
    start: (b) => { b.nl.gigs.request('bar-dance', 'call', { startHour: 21, baseFee: 90, minutes: 3 }); },
    fail: (b) => { const g = b.nl.gigs.open('bar-dance'); if (g) g.state = 'missed'; },
  },
  'pico-paper-the-walls': {
    // The Friday night exists once Stavros hands over the paper (objective 1 is the flyers).
    objective: (b, i) => { if (i === 1) b.nl.promo.startNight('pico-friday', 'club', 22, { flyers: 20, cover: 15 }); },
    complete: (b) => {
      const n = b.nl.promo.nights.get('pico-friday');
      if (!n) return;
      // Simulated customers (no real pedestrians, a phone) count as flyers taken: the mission only finishes at 12.
      if (n.flyersGiven < 12) { n.flyersGiven = 12; n.flyersLeft = Math.max(0, 20 - 12); }
      for (const w of ['board-1', 'board-2', 'board-3', 'board-4', 'board-5', 'club-side-wall']) b.nl.promo.hangPoster('pico-friday', w);
      const t = b.nl.promo.turnout('pico-friday');
      b.setFlag(t.ratio >= 0.5 ? 'pico.friday.line.long' : t.ratio >= 0.25 ? 'pico.friday.line.mid' : 'pico.friday.line.short');
    },
  },
  'pico-clems-corner': {
    complete: (b) => {
      if (b.host.hasFlag('pico.clem.walked')) b.host.pay(-20); // Stavros deducts twenty from the Act 1 pay
    },
  },
  'pico-size-medium': {
    // The rack interaction is objective 3 (index counts objectives skipped by `when`); on the first sale scene buy the pieces.
    objective: (b, i) => { if (i === 4 && b.nl.bag.items.length === 0) { if (b.openRack) b.openRack('rack-a', 50); else b.buyBest('rack-a', 50, 4); } },
  },
  'pico-warm-up-slot': {
    // The guest list is whoever was named; it is read when the set starts (objective 2).
    start: (b) => { b.nl.gigs.request('club', 'call', { startHour: 22, baseFee: 150, minutes: 4 }); },
    objective: (b, i) => {
      if (i !== 2) return;
      const night = b.nl.promo.startNight('pico-warmup', 'club', 22, { flyers: 0, cover: 15 });
      night.list = GUEST_FLAGS.filter((f) => b.host.hasFlag(f)).length;
      // Friday's paper (ACT1-03) carries over: the line is the promotion score.
      const fr = b.nl.promo.nights.get('pico-friday');
      if (fr) { night.flyersGiven = fr.flyersGiven; night.posters = [...fr.posters]; }
    },
    fail: (b) => { const g = b.nl.gigs.open('club'); if (g) g.state = 'missed'; },
  },
};
