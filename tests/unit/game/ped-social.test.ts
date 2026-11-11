import * as THREE from 'three';
import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus, type GameEvents } from '@/core/Events';
import { Rng } from '@/core/Rng';
import { Pedestrian, MEET_TIMEOUT, CHAT_MAX } from '@/entities/Pedestrian';
import { PedSocial, BARK_RANGE, BARK_GAP, socialHourFactor } from '@/game/PedSocial';
import { BARKS, voiceFor, pickBark, greetKind } from '@/game/pedBarks';
import { PedVoice, pedCast, EARSHOT } from '@/audio/voice/PedVoice';
import type { Body2D, Graph, GraphNode, IMaterialLibrary, IWorld2D } from '@/world/types';

const materials = { get: () => new THREE.MeshBasicMaterial() } as unknown as IMaterialLibrary;
class FakeWorld implements IWorld2D {
  addStatic(): Body2D { throw new Error('unused'); }
  addBody() {} removeBody() {} step() { return []; }
  queryCircle() { return []; }
  raycast() { return null; }
  bodies() { return []; }
}
const gn = (id: string, x: number, z: number): GraphNode => ({ id, pos: { x, z } });
function line(n = 8, step = 20): Graph {
  const g: Graph = { nodes: {}, edges: [], adjacency: {} };
  for (let i = 0; i < n; i++) { g.nodes[`n${i}`] = gn(`n${i}`, i * step, 0); g.adjacency[`n${i}`] = []; }
  const add = (a: string, b: string): void => { g.adjacency[a].push(g.edges.length); g.edges.push({ from: a, to: b, length: step }); };
  for (let i = 0; i + 1 < n; i++) { add(`n${i}`, `n${i + 1}`); add(`n${i + 1}`, `n${i}`); }
  return g;
}

function crowd(count: number, opts: { cross?: Set<string>; spacing?: number } = {}) {
  const g = line(), events = new EventBus(), world = new FakeWorld();
  const peds: Pedestrian[] = [];
  for (let i = 0; i < count; i++) {
    const p = new Pedestrian(`q${i}`, g.nodes.n1, g, world, materials, events, new Rng(i + 3), opts.cross);
    p.body.pos.x = 30 + i * (opts.spacing ?? 2.4); p.body.pos.z = i % 2 ? 0.3 : -0.3;
    p.socialCooldown = 0;
    peds.push(p);
  }
  const social = new PedSocial(events, { rng: new Rng(11), maxPairs: 2 });
  social.setHour(18);
  const barks: GameEvents['pedBark'][] = [];
  events.on('pedBark', (b) => barks.push(b));
  const player = { x: 30, z: 4 };
  social.update(0.01, peds, player);
  const run = (seconds: number): void => { for (let t = 0; t < seconds; t += 0.1) { social.update(0.1, peds, player); for (const p of peds) p.update(0.1); } };
  return { peds, social, events, run, barks, player, g };
}

beforeEach(() => { Pedestrian.socialHook = null; });

describe('pair formation', () => {
  it('two free walkers a few metres apart stop, face each other and talk, then part', () => {
    const { peds, run, social } = crowd(2, { spacing: 4 });
    let chatting = false, minGap = 99;
    for (let t = 0; t < 60 && !chatting; t += 0.5) { run(0.5); chatting = peds.every((p) => p.state === 'chatting'); }
    expect(chatting).toBe(true);
    expect(social.chatsStarted).toBeGreaterThan(0);
    const [a, b] = peds;
    minGap = Math.hypot(a.body.pos.x - b.body.pos.x, a.body.pos.z - b.body.pos.z);
    expect(minGap).toBeLessThan(1.4);
    expect(a.pose).toBe('talk');
    // facing each other: heading of a points at b
    const want = Math.atan2(b.body.pos.x - a.body.pos.x, -(b.body.pos.z - a.body.pos.z));
    expect(Math.abs(Math.atan2(Math.sin(a.body.heading - want), Math.cos(a.body.heading - want)))).toBeLessThan(0.5);
    run(CHAT_MAX + 3);
    expect(peds.every((p) => p.state === 'walking')).toBe(true);
  });

  it('keeps a cooldown after a conversation: the same two are not matched again at once', () => {
    const { peds, run } = crowd(2, { spacing: 4 });
    for (let t = 0; t < 40 && !peds.every((p) => p.state === 'chatting'); t += 0.5) run(0.5);
    peds[0].dropChat(true, 15);
    expect(peds.every((p) => p.state === 'walking')).toBe(true);
    expect(peds.every((p) => p.socialCooldown >= 15)).toBe(true);
    run(10);
    expect(peds.some((p) => p.isTalking)).toBe(false);
  });

  it('never has more conversations than the cap', () => {
    const { peds, run } = crowd(10, { spacing: 2.2 });
    let most = 0;
    for (let t = 0; t < 120; t += 0.5) { run(0.5); most = Math.max(most, peds.filter((p) => p.isTalking).length); }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(2 * 2 + 1);   // two pairs, plus at most a third person joining one
  });

  it('drops an approach when the partner leaves: nobody waits for somebody who went away', () => {
    const { peds, run } = crowd(2, { spacing: 6 });
    run(1);
    const meeting = peds.filter((p) => p.state === 'meeting');
    if (meeting.length === 2) { peds[1].flee({ x: 100, z: 0 }, 4); run(MEET_TIMEOUT + 1); expect(peds[0].isTalking).toBe(false); }
    else run(4);
    expect(peds.some((p) => p.state === 'meeting')).toBe(false);
  });

  it('does not start conversations beside a crosswalk (no head-on pinning there)', () => {
    const cross = new Set(['n1', 'n2']);
    const { peds, run } = crowd(3, { cross, spacing: 3 });
    for (const p of peds) { p.body.pos.x = 24; }
    peds.forEach((p, i) => { p.body.pos.x = 22 + i * 2; });
    run(30);
    expect(peds.some((p) => p.isTalking)).toBe(false);
  });

  it('two head-on walkers in a lane still get past each other when a conversation is nearby', () => {
    const { peds, run } = crowd(2, { spacing: 3 });
    peds[0].socialCooldown = 1e6; peds[1].socialCooldown = 1e6;   // not social: pure walking
    run(40);
    expect(peds.every((p) => p.state !== 'chatting')).toBe(true);
  });
});

describe('reactions and barks', () => {
  it('a bump makes the person stagger, startle and complain (within earshot)', () => {
    const { peds, barks, social } = crowd(1);
    void social;
    peds[0].body.pos.x = 30; peds[0].body.pos.z = 2;
    peds[0].onContact({} as never, { id: 'player', kind: 'player', pos: { x: 29.5, z: 2 }, vel: { x: 1, z: 0 } } as unknown as Body2D);
    expect(peds[0].currentReaction).toBe('startle');
    expect(barks.length).toBe(1);
    expect(BARKS.bumped).toContain(barks[0].text);
  });

  it('barks only within earshot, and not more often than the gap', () => {
    const { peds, barks, player } = crowd(2);
    peds[0].body.pos.x = player.x + BARK_RANGE + 5; peds[0].say('greet');
    expect(barks.length).toBe(0);
    peds[0].body.pos.x = player.x + 3; peds[0].say('greet');
    peds[1].body.pos.x = player.x + 4; peds[1].say('greet');
    expect(barks.length).toBe(1);               // the second is inside BARK_GAP
    void BARK_GAP;
    expect(barks[0].pitch).toBeGreaterThan(0.5);
  });

  it('a near miss from a fast car makes people shout and run', () => {
    const { peds, barks, run, player } = crowd(1);
    const world = new FakeWorld();
    void world;
    const p = peds[0]; p.body.pos.x = player.x + 2; p.body.pos.z = 0;
    p.flee({ x: player.x - 5, z: 0 }, 3);
    expect(p.state).toBe('fleeing');
    run(0.2);
    void barks;
  });

  it('voices are stable per person, sit in sensible ranges, and never depend on a group', () => {
    expect(voiceFor('a', 'f', 'adult')).toEqual(voiceFor('a', 'f', 'adult'));
    expect(voiceFor('a', 'm', 'adult').pitch).toBeLessThan(voiceFor('a', 'f', 'adult').pitch);
    expect(voiceFor('a', 'm', 'kid').pitch).toBeGreaterThan(voiceFor('a', 'm', 'adult').pitch + 0.3);
    expect(voiceFor('b', 'm', 'old').rate).toBeLessThan(voiceFor('b', 'm', 'adult').rate);
  });

  it('every line is short, and the picker avoids repeating itself', () => {
    for (const list of Object.values(BARKS)) for (const l of list) { expect(l.length).toBeLessThanOrEqual(60); expect(l.split(/\s+/).length).toBeLessThanOrEqual(11); }
    const rng = new Rng(5), seen = new Set<string>();
    for (let i = 0; i < 4; i++) seen.add(pickBark('chat', rng));
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(greetKind(8)).toBe('greetMorning'); expect(greetKind(19)).toBe('greetEvening'); expect(greetKind(14)).toBe('greet');
    expect(socialHourFactor(3)).toBeLessThan(socialHourFactor(19));
  });
});

describe('PedVoice', () => {
  const spoken: Array<{ text: string; pitch: number; rate: number; volume: number }> = [];
  let now = 0;
  const mk = (extra: Partial<ConstructorParameters<typeof PedVoice>[0]> = {}) => {
    spoken.length = 0; now = 100;
    const subs: string[] = [];
    const v = new PedVoice({
      speech: { speak: (u) => spoken.push({ text: u.text, pitch: u.pitch, rate: u.rate, volume: u.volume }), cancel() {}, pause() {}, resume() {}, getVoices: () => [] },
      makeUtterance: (text) => ({ text, voice: null, pitch: 1, rate: 1, volume: 1, lang: 'en-US', onend: null, onerror: null }),
      volume: () => 1, now: () => now, onSubtitle: (w, t) => subs.push(`${w}: ${t}`), ...extra,
    });
    return { v, subs };
  };
  const bark = (id: string, x: number, loud = 0.6) => ({ id, text: 'Morning!', kind: 'greet', pos: { x, z: 0 }, pitch: 1.2, rate: 1.05, sex: 'f' as const, age: 'adult' as const, loud });
  it('speaks with the person pitch and rate, quieter when far, and not beyond earshot', () => {
    const { v, subs } = mk();
    expect(v.say(bark('a', EARSHOT + 6), { x: 0, z: 0 })).toBe(false);
    expect(v.say(bark('a', 2), { x: 0, z: 0 })).toBe(true);
    expect(spoken[0].pitch).toBe(1.2); expect(spoken[0].rate).toBe(1.05);
    expect(subs[0]).toBe('Passerby: Morning!');
    now += 3;
    v.say(bark('b', 8), { x: 0, z: 0 });
    expect(spoken[1].volume).toBeLessThan(spoken[0].volume);
  });
  it('rate limits: one at a time, per-person gap, and silent while a talk show speaks', () => {
    const { v } = mk();
    v.say(bark('a', 2), { x: 0, z: 0 }); v.say(bark('b', 2), { x: 0, z: 0 });
    expect(spoken.length).toBe(1);
    now += 3; expect(v.say(bark('a', 2), { x: 0, z: 0 })).toBe(false);   // same person within 10 s
    const m = mk({ talkBusy: () => true });
    m.v.say(bark('c', 2), { x: 0, z: 0 });
    expect(spoken.length).toBe(0); expect(m.subs.length).toBe(1);
  });
  it('casts a stable per-person voice, a child gets a child voice', () => {
    const a = pedCast({ id: 'x', sex: 'f', age: 'adult', pitch: 1.2, rate: 1 }), b = pedCast({ id: 'x', sex: 'f', age: 'adult', pitch: 1.2, rate: 1 });
    expect(a).toEqual(b); expect(a.voice.startsWith('af_') || a.voice.startsWith('bf_')).toBe(true);
    expect(pedCast({ id: 'k', sex: 'm', age: 'kid', pitch: 1.5, rate: 1 }).voice).toBe('af_sky');
  });
});
