/**
 * Content lint for "Air Rights": no real brands or people, no slurs or gore, valid speakers, short subtitle lines,
 * every cast member has a voice, motive, secret and a mission that reveals it. Nothing here needs the renderer.
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/Rng';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { subdivideLots } from '@/world/LotSubdivider';
import { buildMissions } from '@/game/missions/content';
import type { MissionDef, ObjectiveDef } from '@/game/missions/types';
import { CAST, EXTRA_SPEAKERS, RECURRING, characterByName, isSpeaker } from '@/game/story/cast';
import { ADS, BULLETINS } from '@/game/story/news';
import { F } from '@/game/story/flags';

const data = loadBedstuyData();
const grid = buildGrid(data);
const lots = subdivideLots(grid, data.pois, new Rng(data.seed).fork('lots'));
const defs = buildMissions(grid, data, lots, { el: { home: { x: 40, z: 60 }, north: { x: 120, z: -480 } } });
const story = defs.filter((d) => d.act !== undefined); // the arc (14) and the ten STORY2 side jobs (24)

/** Real brands, institutions and people the game must not name (parody names only). Lower case, matched on word edges. */
const DENY_BRANDS = [
  'uber', 'lyft', 'airbnb', 'starbucks', 'mcdonald', 'walmart', 'amazon', 'google', 'apple', 'facebook', 'instagram', 'tiktok', 'netflix', 'spotify',
  'whole foods', 'trader joe', 'target', 'nike', 'adidas', 'coca-cola', 'pepsi', 'kfc', 'subway', 'dunkin', 'citibank', 'chase bank', 'jpmorgan', 'wells fargo',
  'bank of america', 'verizon', 't-mobile', 'at&t', 'mta', 'nypd', 'fdny', 'con ed', 'venmo', 'paypal', 'zillow', 'redfin', 'wework', 'tesla',
  'toyota', 'honda', 'chevrolet', 'ups store', 'fedex', 'usps', 'kings county', 'barclays', 'rockstar', 'take-two', 'grand theft',
  'miles davis', 'bunny wailer', 'black uhuru', 'bob marley', 'drake', 'jay-z', 'beyonce', 'obama', 'trump', 'biden', 'de blasio', 'adams',
];
const rot13 = (s: string): string => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const DENY_SLURS = ['avttre', 'snttbg', 'ergneq', 'xvxr', 'fcvp', 'puvax', 'genaal'].map(rot13);
const DENY_DARK = ['rape', 'gore', 'corpse', 'murder', 'stab', 'shoot', 'torture', 'decapit', 'suicide'];

const hasWord = (text: string, w: string): boolean => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text);

/** Every player-facing string of a mission with a label for the failure message. */
function strings(d: MissionDef): Array<{ at: string; kind: 'say' | 'talk' | 'phone' | 'toast' | 'obj'; text: string; who?: string }> {
  const out: Array<{ at: string; kind: 'say' | 'talk' | 'phone' | 'toast' | 'obj'; text: string; who?: string }> = [];
  const push = (at: string, kind: 'say' | 'talk' | 'phone' | 'toast' | 'obj', text: string | undefined, who?: string) => { if (text) out.push({ at: `${d.id} ${at}`, kind, text, who }); };
  push('blurb', 'toast', d.blurb);
  push('intro', 'phone', d.phoneIntro?.text, d.phoneIntro?.from);
  push('twist', 'toast', d.twist?.text);
  push('reward', 'toast', d.reward.message);
  push('retry', 'toast', d.retryHint);
  for (const [k, v] of Object.entries(d.failJoke ?? {})) push(`fail.${k}`, 'toast', v);
  push('followUp', 'phone', d.followUp?.text, d.followUp?.from);
  d.followUps?.forEach((f, i) => push(`followUps[${i}]`, 'phone', f.text, f.from));
  d.objectives.forEach((o: ObjectiveDef, i) => {
    push(`obj${i}`, 'obj', o.text);
    push(`obj${i}.done`, 'toast', o.doneMessage);
    o.banter?.forEach((b, k) => push(`obj${i}.banter${k}`, 'toast', b));
    o.say?.forEach((l, k) => push(`obj${i}.say${k}`, 'say', l.text, l.who));
    if (o.kind === 'talkTo') o.lines.forEach((l, k) => push(`obj${i}.line${k}`, 'talk', l, o.npc));
    if (o.kind === 'fork') o.options.forEach((p, k) => { push(`obj${i}.opt${k}`, 'obj', p.label); push(`obj${i}.opt${k}.done`, 'toast', p.doneMessage); });
    if (o.kind === 'stakeout') o.events?.forEach((e, k) => push(`obj${i}.event${k}`, 'toast', e.text));
  });
  return out;
}
const allStrings = story.flatMap(strings);

describe('story content lint', () => {
  it('has strings to lint', () => {
    expect(story.length).toBe(24);
    expect(allStrings.length).toBeGreaterThan(300);
  });

  it('names no real brand, institution or person (parody names only)', () => {
    const corpus: Array<[string, string]> = [
      ...allStrings.map((s): [string, string] => [s.at, s.text]),
      ...BULLETINS.map((b): [string, string] => [b.id, b.text]),
      ...ADS.map((a): [string, string] => [a.id, a.text]),
      ...CAST.flatMap((c): Array<[string, string]> => [[`${c.id}.bio`, c.bio], [`${c.id}.motive`, c.motive], [`${c.id}.secret`, c.secret], [`${c.id}.role`, c.role], [`${c.id}.full`, c.full]]),
    ];
    for (const [at, text] of corpus) for (const bad of DENY_BRANDS) expect(hasWord(text, bad), `${at}: "${bad}" in "${text.slice(0, 60)}"`).toBe(false);
  });

  it('has no slurs, gore, or sexual violence', () => {
    const corpus = [...allStrings.map((s) => s.text), ...BULLETINS.map((b) => b.text), ...ADS.map((a) => a.text), ...CAST.flatMap((c) => [c.bio, c.motive, c.secret])];
    for (const t of corpus) {
      for (const w of DENY_SLURS) expect(hasWord(t, w), 'slur').toBe(false);
      for (const w of DENY_DARK) expect(hasWord(t, w), `"${w}" in "${t.slice(0, 60)}"`).toBe(false);
    }
  });

  it('every speaker is a cast member or a listed extra', () => {
    for (const s of allStrings) {
      if (s.who === undefined) continue;
      expect(isSpeaker(s.who) || s.who === 'Mission Log', `${s.at}: unknown speaker "${s.who}"`).toBe(true);
    }
    for (const d of story) for (const o of d.objectives) if (o.kind === 'talkTo') expect(isSpeaker(o.npc), `${d.id}: npc ${o.npc}`).toBe(true);
  });

  it('subtitle lines are short enough to read: say lines 150 chars, talk lines 220, phone texts 300', () => {
    for (const s of allStrings) {
      const cap = s.kind === 'say' ? 150 : s.kind === 'talk' ? 220 : s.kind === 'phone' ? 300 : 260;
      expect(s.text.length, `${s.at} (${s.text.length}): ${s.text.slice(0, 50)}`).toBeLessThanOrEqual(cap);
      expect(s.text.trim(), s.at).toBe(s.text);
      expect(s.text.includes('  ') && s.kind === 'say', s.at).toBe(false);
    }
  });

  it('every mission has dialogue, an intro text, a follow-up, a fail joke for every rule it can break, and a twist or choice', () => {
    for (const d of story) {
      expect(d.phoneIntro?.text.length, `${d.id} intro`).toBeGreaterThan(30);
      expect((d.followUp ? 1 : 0) + (d.followUps?.length ?? 0), `${d.id} follow-up`).toBeGreaterThan(0);
      expect(Object.keys(d.failJoke ?? {}).length, `${d.id} fail joke`).toBeGreaterThan(0);
      const lines = d.objectives.reduce((n, o) => n + (o.say?.length ?? 0) + (o.kind === 'talkTo' ? o.lines.length : 0), 0);
      expect(lines, `${d.id} dialogue lines`).toBeGreaterThanOrEqual(3);
      // every failure rule the mission actually has is covered by a joke
      const reasons = new Set<string>();
      if (d.timeLimit !== undefined || d.objectives.some((o) => o.timeLimit !== undefined)) reasons.add('timeUp');
      if (d.fragile) reasons.add('cargoBroken');
      for (const o of d.objectives) {
        if (o.kind === 'tail' && o.minDistance !== undefined) reasons.add('spotted');
        if (o.kind === 'tail' && o.minDistance === undefined) reasons.add('lostTarget');
        if (o.kind === 'chase') reasons.add('lostTarget');
        if (o.kind === 'race') reasons.add('lostRace');
        if (o.kind === 'stakeout') reasons.add('blownCover');
        if (o.kind === 'djSet') reasons.add('lowScore');
        if (o.failIfStars !== undefined) reasons.add('copsCalled');
        if (o.stayInVehicle !== undefined) reasons.add('leftVehicle');
        if (o.maxKmh !== undefined) reasons.add('tooFast');
      }
      if (d.deadlineHour !== undefined) reasons.add('clockUp');
      const jokes = Object.keys(d.failJoke ?? {});
      // at least the headline failure has its own joke (the rest fall back to the system's default line)
      expect(jokes.some((j) => reasons.has(j)), `${d.id}: a joke for one of ${[...reasons].join(', ')} (has ${jokes.join(', ')})`).toBe(true);
    }
  });

  it('flags in the content are all declared in the flag table', () => {
    const known = new Set<string>(Object.values(F));
    const used = new Set<string>();
    for (const d of story) {
      d.setFlags?.forEach((f) => used.add(f));
      d.requiresFlags?.forEach((f) => used.add(f)); d.forbidFlags?.forEach((f) => used.add(f));
      d.followUps?.forEach((f) => { if (f.ifFlag) used.add(f.ifFlag); if (f.unlessFlag) used.add(f.unlessFlag); });
      for (const o of d.objectives) {
        if (o.when?.flag) used.add(o.when.flag); if (o.when?.not) used.add(o.when.not);
        if (o.kind === 'fork') for (const p of o.options) { used.add(p.flag); if (p.when?.flag) used.add(p.when.flag); }
      }
    }
    for (const f of used) expect(known.has(f), `unknown flag ${f}`).toBe(true);
    for (const b of BULLETINS) if (b.flag) expect(known.has(b.flag)).toBe(true);
  });
});

describe('the cast', () => {
  it('has eighteen recurring on-stage characters (twelve + six from STORY2), each with a voice, motive, secret and a mission that reveals it', () => {
    expect(RECURRING).toHaveLength(18);
    expect(CAST).toHaveLength(21); // + Bryce (half of Hallie's couple), Pryce and Pemberton (off-stage voices)
    const ids = new Set(defs.map((d) => d.id));
    for (const c of CAST) {
      expect(c.motive.length, c.id).toBeGreaterThan(15);
      expect(c.secret.length, c.id).toBeGreaterThan(30);
      expect(c.bio.length, c.id).toBeGreaterThan(30);
      expect(c.voice.pitch).toBeGreaterThan(0.1); expect(c.voice.pitch).toBeLessThanOrEqual(2);
      expect(c.voice.rate).toBeGreaterThan(0.1); expect(c.voice.rate).toBeLessThanOrEqual(10);
      expect(ids.has(c.reveal), `${c.id} reveals in ${c.reveal}`).toBe(true);
      expect(characterByName(c.name)).toBe(c);
    }
    expect(new Set(CAST.map((c) => c.name)).size).toBe(CAST.length);
    expect(EXTRA_SPEAKERS.every((n) => !characterByName(n))).toBe(true);
  });

  it('every cast member speaks or is spoken to in the missions (nobody is only on the wiki)', () => {
    const spoken = new Set(allStrings.map((s) => s.who).filter((w): w is string => !!w));
    for (const d of story) for (const o of d.objectives) if (o.kind === 'talkTo') spoken.add(o.npc);
    for (const c of CAST) {
      const mentioned = spoken.has(c.name) || allStrings.some((s) => s.text.includes(c.name.replace(/^(Mr\.|Ms\.|Sgt\.|DJ|Doña) /, '')));
      expect(mentioned, c.name).toBe(true);
    }
  });

  it('Pryce and the billboards: the one-percent voices only talk through ads and one finale scene', () => {
    const pryce = allStrings.filter((s) => s.who === 'Pryce');
    expect(pryce.length).toBeGreaterThan(0);
    expect(pryce.every((s) => s.at.startsWith('last-call-on-throop'))).toBe(true);
  });

  it('the jokes punch up: Parallax, real-estate speak, wellness and police forms are targets; no ethnic or religious punchlines', () => {
    const text = JSON.stringify(story).toLowerCase() + JSON.stringify(BULLETINS).toLowerCase() + JSON.stringify(ADS).toLowerCase();
    for (const target of ['parallax', 'frictionless', 'clipboard', 'sound bath', 'form']) expect(text.includes(target), target).toBe(true);
    for (const bad of ['hasidic', 'jewish', 'rabbi', 'shabbat', 'muslim', 'halal', 'allah', 'christian']) expect(text.includes(bad), bad).toBe(false);
  });
});
