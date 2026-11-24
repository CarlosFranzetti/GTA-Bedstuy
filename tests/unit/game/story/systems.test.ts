import { describe, expect, it } from 'vitest';
import { CrowdMeter, GigBook } from '@/game/story/gigs';
import { Promotion } from '@/game/story/promo';
import { Haggle, MARKETS, ThriftBag, ThriftRack, THRIFT_CATALOG, priceOf, settleSale, BAG_MAX } from '@/game/story/thrift';
import { PackSystem, type Meeting } from '@/game/story/pack';
import { DateBook, DateSession, type DateScript } from '@/game/story/dates';
import { FIGHT_BAR_MAN, FIGHT_STREET_MAN, FightEncounter } from '@/game/story/fights';
import { Nightlife } from '@/game/story/nightlife';
import { StoryState } from '@/game/story/StoryState';
import '@/textures/painters/ped'; // load order: ped first (pedWardrobe is circular with it)
import { BASE_TOPS, BOTTOMS, LAYERS, SHOES } from '@/textures/painters/pedWardrobe';
import { venueOpen } from '@/game/story/venueTable';

describe('gigs', () => {
  it('books a slot, refuses a double booking, and pays by crowd and score', () => {
    const g = new GigBook(); g.advance(17);
    const r = g.request('bar-dive', 'visit');
    expect(r.ok).toBe(true);
    expect(g.request('bar-dive', 'call')).toEqual({ ok: false, reason: 'alreadyBooked' });
    expect(g.active()).not.toBeNull();
    const hi = g.settle('bar-dive', { score: 85, crowd: 0.9 })!;
    expect(hi.tier).toBe('great'); expect(hi.fee).toBeGreaterThan(60); expect(hi.rebook).toBe(true);
    const g2 = new GigBook(); g2.advance(17); g2.request('bar-dive', 'visit');
    const lo = g2.settle('bar-dive', { score: 45, crowd: 0.3 })!;
    expect(lo.fee).toBeLessThan(hi.fee);
  });
  it('a flop pays nothing, loses liking and two flops ban the venue', () => {
    const g = new GigBook(); g.advance(17);
    for (let i = 0; i < 2; i++) { expect(g.request('club', 'call').ok).toBe(true); const o = g.settle('club', { score: 10, crowd: 0.1 })!; expect(o.fee).toBe(0); expect(o.rebook).toBe(false); }
    expect(g.isBanned('club')).toBe(true);
    expect(g.request('club', 'call')).toEqual({ ok: false, reason: 'banned' });
  });
  it('turnout raises the fee; a missed window marks the booking missed; midnight wraps', () => {
    const a = new GigBook(), b = new GigBook(); a.advance(20); b.advance(20); a.request('bar-lounge', 'call'); b.request('bar-lounge', 'call');
    expect(a.settle('bar-lounge', { score: 70, crowd: 0.7 }, 1)!.fee).toBeGreaterThan(b.settle('bar-lounge', { score: 70, crowd: 0.7 }, 0)!.fee);
    const c = new GigBook(); c.advance(10); const r = c.request('club', 'call', { startHour: 22 });
    expect(r.ok && r.booking.from).toBe(22);
    c.advance(23.9); c.advance(0.5); c.advance(5);
    expect(c.bookings[0].state).toBe('missed');
  });
  it('round-trips and rejects junk', () => {
    const g = new GigBook(); g.advance(18); g.request('bar-dance', 'call'); g.settle('bar-dance', { score: 60, crowd: 0.6 });
    const h = new GigBook(); expect(h.restore(JSON.parse(JSON.stringify(g.serialize())))).toBe(true);
    expect(h.serialize()).toEqual(g.serialize());
    expect(h.restore({ v: 1 })).toBe(false); expect(h.restore(null)).toBe(false);
    expect(h.restore({ ...g.serialize(), bookings: [{ id: 1, venue: 'nowhere', from: 0, to: 1, fee: 0, state: 'booked' }] })).toBe(false);
  });
  it('crowd meter rises slowly and averages', () => {
    const m = new CrowdMeter(); m.reset(0.3); for (let i = 0; i < 60; i++) m.feed(0.5, 1);
    expect(m.value).toBeGreaterThan(0.9); expect(m.average).toBeGreaterThan(0.3); expect(m.average).toBeLessThan(m.value);
  });
  it('venue hours wrap midnight', () => { expect(venueOpen('club', 23)).toBe(true); expect(venueOpen('club', 2)).toBe(true); expect(venueOpen('club', 12)).toBe(false); });
});

describe('promotion', () => {
  const ped = (id: number, temperament: 'flee' | 'cower' | 'film' | 'fight', isMinor = false) => ({ id, isMinor, temperament });
  it('never approaches a minor and never records them', () => {
    const p = new Promotion(); p.startNight('n', 'club', 22);
    expect(p.handFlyer('n', ped(1, 'film', true))).toEqual({ kind: 'refusedMinor' });
    expect(p.nights.get('n')!.asked).toHaveLength(0); expect(p.nights.get('n')!.flyersLeft).toBe(30);
  });
  it('is seeded: the same person answers the same way once, then "already asked"', () => {
    const p = new Promotion(); p.startNight('n', 'club', 22);
    const first = p.handFlyer('n', ped(7, 'film')); expect(p.handFlyer('n', ped(7, 'film'))).toEqual({ kind: 'alreadyAsked' });
    const q = new Promotion(); q.startNight('n', 'club', 22); expect(q.handFlyer('n', ped(7, 'film'))).toEqual(first);
  });
  it('filmers take flyers more than fighters; turnout grows with flyers and posters and is capped by the room', () => {
    const p = new Promotion(); p.startNight('n', 'bar-dance', 21, { flyers: 400 });
    let film = 0, fight = 0;
    for (let i = 0; i < 200; i++) { if (p.handFlyer('n', ped(i, 'film')).kind === 'taken') film++; if (p.handFlyer('n', ped(1000 + i, 'fight')).kind === 'taken') fight++; }
    expect(film).toBeGreaterThan(fight * 2);
    const empty = new Promotion(); empty.startNight('e', 'bar-dance', 21);
    const t0 = empty.turnout('e'), t1 = p.turnout('n');
    expect(t1.headcount).toBeGreaterThan(t0.headcount); expect(t1.headcount).toBeLessThanOrEqual(t1.capacity);
    p.hangPoster('n', 'w1'); expect(p.hangPoster('n', 'w1')).toBe(false);
    expect(p.turnout('n').doorMoney).toBeGreaterThanOrEqual(0);
  });
  it('round-trips', () => {
    const p = new Promotion(); p.startNight('n', 'club', 22); p.handFlyer('n', ped(3, 'film')); p.hangPoster('n', 'w');
    const q = new Promotion(); expect(q.restore(JSON.parse(JSON.stringify(p.serialize())))).toBe(true); expect(q.serialize()).toEqual(p.serialize());
    expect(q.restore({ v: 1, nights: [{ id: 'x', venue: 'zzz' }] })).toBe(false);
  });
});

describe('thrift and flip', () => {
  it('every catalog key exists in the wardrobe data', () => {
    const all = { top: BASE_TOPS, layer: LAYERS, bottom: BOTTOMS, shoes: SHOES } as const;
    for (const [slot, keys] of Object.entries(THRIFT_CATALOG)) for (const k of keys) expect(Object.keys(all[slot as keyof typeof all]), `${slot}:${k}`).toContain(k);
  });
  it('a rack is seeded per day and restocks', () => {
    const a = new ThriftRack('r'), b = new ThriftRack('r');
    expect(a.stock).toEqual(b.stock); expect(a.stock).toHaveLength(10);
    const old = a.stock[0].id; a.restock(1); expect(a.stock[0].id).not.toBe(old);
  });
  it('buying fills a bag of at most four; poor and gone are refused', () => {
    const r = new ThriftRack('r', 10), bag = new ThriftBag(); let cash = 1000;
    const spend = (n: number) => { if (cash < n) return false; cash -= n; return true; };
    for (let i = 0; i < BAG_MAX; i++) expect(bag.buy(r, r.available[0].id, spend)).toBe('ok');
    expect(bag.buy(r, r.available[0].id, spend)).toBe('full');
    expect(bag.buy(r, 'nope', spend)).toBe('full');
    const bag2 = new ThriftBag(); expect(bag2.buy(r, 'nope', spend)).toBe('gone'); expect(bag2.buy(r, r.available[0].id, () => false)).toBe('poor');
  });
  it('where you sell changes the price: a vintage piece beats a pawn counter', () => {
    const g = { id: 'x', slot: 'layer' as const, item: 'cardigan', way: 0, tier: 'vintage' as const, condition: 0.9, buy: 8, label: 'old cardigan' };
    expect(priceOf(g, MARKETS.stall)).toBeGreaterThan(priceOf(g, MARKETS.pawn) * 2);
    expect(priceOf({ ...g, condition: 0.2 }, MARKETS.stall)).toBe(0);
  });
  it('haggle: a modest ask sells at the ask, a greedy ask wears the buyer out, accept takes the offer', () => {
    const g = { id: 'x', slot: 'top' as const, item: 'tee', way: 0, tier: 'basic' as const, condition: 1, buy: 4, label: 'tee' };
    const h = new Haggle(g, MARKETS.friend);
    expect(h.state.phase).toBe('open');
    const open = h.state as { offer: number };
    const h1 = new Haggle(g, MARKETS.friend); h1.push(open.offer + 1); expect(h1.state).toEqual({ phase: 'sold', price: open.offer + 1 });
    const h2 = new Haggle(g, MARKETS.pawn); for (let i = 0; i < 6; i++) h2.push(9999); expect(h2.state.phase).toBe('walked');
    const h3 = new Haggle(g, MARKETS.friend); h3.accept(); expect(h3.state).toEqual({ phase: 'sold', price: open.offer });
    expect(new Haggle(g, MARKETS.friend).state).toEqual(h.state);
  });
  it('a completed sale pays and books profit', () => {
    const g = { id: 'x', slot: 'top' as const, item: 'tee', way: 0, tier: 'label' as const, condition: 1, buy: 4, label: 'tee' };
    const bag = new ThriftBag(); bag.items.push(g); const h = new Haggle(g, MARKETS.club); h.accept();
    let cash = 0; const got = settleSale(bag, h, (n) => { cash += n; });
    expect(got).toBe(cash); expect(got).toBeGreaterThan(4); expect(bag.items).toHaveLength(0); expect(bag.profit).toBe(got - 4);
  });
});

describe('selling (abstract pack)', () => {
  const m: Meeting = { id: 'm1', at: { x: 10, z: 10 }, radius: 3, from: 20, to: 24, units: 1, pay: 60 };
  it('needs the pack, the time and the place; refuses minors and does nothing without them', () => {
    const heat: boolean[] = []; let cash = 0;
    const p = new PackSystem({ onHeat: (_p, seen) => heat.push(seen), pay: (n) => { cash += n; } });
    const near = { x: 10, z: 11 };
    expect(p.handoff(m, near, 21, { sees: false, minorNear: false }).kind).toBe('noPack');
    p.receive(2);
    expect(p.handoff(m, near, 12, { sees: false, minorNear: false }).kind).toBe('wrongTime');
    expect(p.handoff(m, { x: 50, z: 50 }, 21, { sees: false, minorNear: false }).kind).toBe('tooFar');
    expect(p.handoff(m, near, 21, { sees: false, minorNear: true }).kind).toBe('refusedMinor');
    expect(p.approach({ isMinor: true })).toBe('refusedMinor'); expect(cash).toBe(0); expect(heat).toHaveLength(0);
    expect(p.handoff(m, near, 21, { sees: false, minorNear: false }).kind).toBe('done');
    expect(cash).toBe(60); expect(p.units).toBe(1); expect(p.handoff(m, near, 21, { sees: false, minorNear: false }).kind).toBe('alreadyDone');
  });
  it('a witness raises heat; a nervous buyer walks; a bust loses the pack', () => {
    const heat: boolean[] = []; const p = new PackSystem({ onHeat: (_p, s) => heat.push(s) });
    p.receive(3);
    const r = p.handoff({ ...m, id: 'm2', nervous: true }, { x: 10, z: 10 }, 21, { sees: true, minorNear: false });
    expect(r).toEqual({ kind: 'seen', walked: true, pay: 0 }); expect(heat).toEqual([true]); expect(p.units).toBe(3);
    expect(p.onBust()).toBe(3); expect(p.hasPack).toBe(false); expect(p.lost).toBe(3);
  });
  it('mirrors an Inventory item and round-trips', () => {
    const items: Record<string, number> = {}; const inv = { itemCount: (id: string) => items[id] ?? 0, giveItem: (id: string, n = 1) => { items[id] = (items[id] ?? 0) + n; }, takeItem: (id: string, n = 1) => { items[id] -= n; return true; } };
    const p = new PackSystem(); p.receive(2); p.syncInventory(inv); expect(items.pack).toBe(2); p.onBust(); p.syncInventory(inv); expect(items.pack).toBe(0);
    p.receive(1); const q = new PackSystem(); expect(q.restore(p.serialize())).toBe(true); expect(q.units).toBe(1); expect(q.restore({ v: 1, units: -1 })).toBe(false);
  });
});

describe('dates', () => {
  const script: DateScript = {
    id: 'd1', partner: 'Lana', adult: true, venue: 'bar-dance', invite: 'Drink?', from: 20, to: 24, warmAt: 3, friendlyAt: 1,
    beats: [
      { id: 'b1', line: 'So.', choices: [{ id: 'a', text: 'Ask about her night', delta: 2, reply: 'Nice.', flag: 'date.asked' }, { id: 'b', text: 'Talk about yourself', delta: -1, reply: 'Hm.' }] },
      { id: 'b2', line: 'Music?', choices: [{ id: 'c', text: 'Play her a track', delta: 2, reply: 'Oh.' }, { id: 'd', text: 'Check your phone', delta: -1, reply: '...' }] },
    ],
    endings: { warm: 'A walk home. Fade. Morning.', friendly: 'A hug at the corner.', cold: 'She leaves early.', stoodUp: 'She waited an hour.' },
  };
  it('liking decides the ending and only the warm one fades to morning', () => {
    const s = new DateSession(script); s.choose('a'); const r = s.choose('c')!;
    expect(r.outcome).toMatchObject({ ending: 'warm', fadeToMorning: true }); expect(s.flags()).toEqual(['date.asked']);
    const t = new DateSession(script); t.choose('b'); const u = t.choose('d')!.outcome!; expect(u.ending).toBe('cold'); expect(u.fadeToMorning).toBe(false);
    const f = new DateSession(script); f.choose('a'); expect(f.choose('d')!.outcome!.ending).toBe('friendly');
    expect(new DateSession(script).standUp().ending).toBe('stoodUp');
  });
  it('refuses a non-adult partner and unknown choices; the book remembers liking', () => {
    expect(() => new DateSession({ ...script, adult: false as unknown as true })).toThrow();
    const s = new DateSession(script); expect(s.choose('zzz')).toBeNull();
    const book = new DateBook(); s.choose('a'); const o = s.choose('c')!.outcome!; book.record(script, o);
    expect(book.begin(script).liking).toBe(o.liking);
    const b2 = new DateBook(); expect(b2.restore(JSON.parse(JSON.stringify(book.serialize())))).toBe(true); expect(b2.liking).toEqual(book.liking); expect(b2.restore({})).toBe(false);
  });
});

describe('fights', () => {
  it('talking him down needs calm to reach the line before anger does; a cost option is refused when unaffordable', () => {
    const f = new FightEncounter(FIGHT_STREET_MAN); expect(f.start().length).toBeGreaterThan(0);
    expect(f.talk('meal', { canPay: false })).toBeNull(); expect(f.phase).toBe('tense');
    expect(f.talk('listen')!.cost).toBe(0); const r = f.talk('meal', { canPay: true })!; expect(r.cost).toBe(12);
    expect(f.phase).toBe('talked'); expect(f.ended!.flag).toBe('fight.leon.talked');
    expect(f.talk('listen')).toBeNull();
  });
  it('flag-gated options are hidden; insults kick it off; the bar man runs out of patience; nobody dies', () => {
    const f = new FightEncounter(FIGHT_STREET_MAN); f.start();
    expect(f.available().map((o) => o.id)).not.toContain('name'); expect(f.available((x) => x === 'knowsLeonName').map((o) => o.id)).toContain('name');
    f.talk('push'); expect(f.phase).toBe('tense'); f.talk('joke'); expect(f.phase).toBe('brawl');
    f.fighterDown(); expect(f.phase).toBe('won');
    const d = new FightEncounter(FIGHT_BAR_MAN); d.start(); d.tick(10); expect(d.phase).toBe('tense'); d.tick(20); expect(d.phase).toBe('brawl'); d.playerDown(); expect(d.ended!.phase).toBe('lost');
    const w = new FightEncounter(FIGHT_BAR_MAN); w.start(); w.walkAway(); expect(w.phase).toBe('walkedAway');
    const s = new FightEncounter(FIGHT_STREET_MAN); s.start(); s.tick(9999); expect(s.phase).toBe('tense'); // the street man never loses patience
  });
});

describe('Nightlife and the save', () => {
  it('rides StoryState.ext as save v2, loads old v1 saves, and survives damaged parts', () => {
    const n = new Nightlife(); n.gigs.advance(18); n.gigs.request('bar-dive', 'call'); n.promo.startNight('x', 'club', 22); n.pack.receive(2);
    n.bag.buy(n.racks.get('rack-a')!, n.racks.get('rack-a')!.available[0].id, () => true);
    const s = new StoryState(); s.set('story.act1'); n.saveTo(s);
    const data = JSON.parse(JSON.stringify(s.serialize())); expect(data.v).toBe(2);
    const s2 = new StoryState(); expect(s2.restore(data)).toBe(true);
    const n2 = new Nightlife(); expect(n2.loadFrom(s2)).toBe(true);
    expect(n2.serialize()).toEqual(n.serialize());
    const old = new StoryState(); expect(old.restore({ v: 1, flags: ['a'], choices: {}, seenNews: [] })).toBe(true); expect(new Nightlife().loadFrom(old)).toBe(false);
    expect(old.serialize().v).toBe(1);
    const dmg = new StoryState(); expect(dmg.restore({ v: 2, flags: [], choices: {}, seenNews: [], ext: { nightlife: { v: 1, gigs: 'junk', promo: null } } })).toBe(true);
    const n3 = new Nightlife(); expect(n3.loadFrom(dmg)).toBe(true); expect(n3.gigs.bookings).toHaveLength(0);
    expect(new StoryState().restore({ v: 3, flags: [], choices: {}, seenNews: [] })).toBe(false);
    const bad = new StoryState(); expect(bad.restore({ v: 2, flags: [], choices: {}, seenNews: [], ext: { nightlife: 5 } })).toBe(true); expect(bad.getExt('nightlife')).toBeUndefined();
  });
});
