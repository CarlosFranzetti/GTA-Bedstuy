// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Phone, savePhoneData, loadPhoneData, clearPhoneData } from '@/game/Phone';
import { MissionSystem } from '@/game/missions/MissionSystem';
import type { MissionDef } from '@/game/missions/types';
import { Bot } from './missionBot';

const P = (x: number, z = 0) => ({ x, z });

describe('Phone queue', () => {
  it('delivers immediately, or after the delay, newest last, unread until opened', () => {
    const ph = new Phone();
    const got: string[] = [];
    ph.onText = (m) => got.push(m.text);
    ph.text('Auntie', 'now');
    ph.text('Auntie', 'later', { delay: 30 });
    ph.text('Rico', 'sooner', { delay: 10 });
    expect(got).toEqual(['now']);
    expect(ph.unread).toBe(1);
    expect(ph.pending).toBe(2);
    ph.update(9.9, P(0));
    expect(got).toEqual(['now']);
    ph.update(0.2, P(0));
    expect(got).toEqual(['now', 'sooner']);
    ph.update(20, P(0));
    expect(ph.messages.map((m) => m.text)).toEqual(['now', 'sooner', 'later']);
    expect(ph.unread).toBe(3);
    ph.open(); ph.markAllRead();
    expect(ph.unread).toBe(0);
    ph.text('Rico', 'while open');
    expect(ph.unread).toBe(0); // arrives read while the phone is open
  });

  it('keys de-duplicate (a retry must not resend the intro), including queued ones', () => {
    const ph = new Phone();
    expect(ph.text('A', 'x', { key: 'intro:1' })).toBe(true);
    expect(ph.text('A', 'x', { key: 'intro:1' })).toBe(false);
    expect(ph.text('A', 'y', { key: 'f', delay: 5 })).toBe(true);
    expect(ph.text('A', 'y', { key: 'f', delay: 5 })).toBe(false);
    expect(ph.messages).toHaveLength(1);
  });

  it('contacts list the senders, most recent first; threads filter by sender', () => {
    const ph = new Phone();
    ph.text('Auntie', 'a1'); ph.text('Rico', 'r1'); ph.text('Auntie', 'a2');
    expect(ph.contacts.map((c) => c.name)).toEqual(['Auntie', 'Rico']);
    expect(ph.thread('Auntie').map((m) => m.text)).toEqual(['a1', 'a2']);
  });

  it('keeps only the latest 60 messages and bumps version on every visible change', () => {
    const ph = new Phone();
    const v0 = ph.version;
    for (let i = 0; i < 70; i++) ph.text('A', `m${i}`);
    expect(ph.messages).toHaveLength(60);
    expect(ph.messages[0].text).toBe('m10');
    expect(ph.version).toBeGreaterThan(v0);
  });
});

describe('Phone + missions', () => {
  const def = (over: Partial<MissionDef> = {}): MissionDef => ({
    id: 'a', title: 'Alpha', blurb: 'go', giverPoi: 'x', giver: P(100), triggerRadius: 3,
    objectives: [{ kind: 'timer', seconds: 1, text: 'wait' }], reward: { cash: 5, message: 'ok' },
    phoneIntro: { from: 'Boss', text: 'intro text' }, followUp: { from: 'Boss', text: 'thanks text', delay: 60 }, ...over,
  });

  it('intro on start (once, even after a retry), follow-up after the delay', () => {
    const d = def({ timeLimit: 0.5 });
    const m = new MissionSystem([d]);
    const ph = new Phone();
    ph.bind(m);
    const bot = new Bot(m, P(0));
    bot.startMission(d);
    expect(ph.messages.map((x) => x.text)).toEqual(['intro text']);
    bot.wait(1); // fails on the time limit
    expect(m.isFailed).toBe(true);
    m.retry();
    expect(ph.messages).toHaveLength(1);
  });

  it('a scoped text is never delivered once its mission ended (completed, failed or abandoned)', () => {
    const ph = new Phone();
    const m = new MissionSystem([def()]);
    ph.bind(m);
    ph.text('Boss', 'late briefing', { delay: 5, mission: 'a' }); // refused: 'a' is not running
    expect(ph.pending).toBe(0);
    const bot = new Bot(m, P(0));
    bot.startMission(m.missions[0]);
    ph.text('Boss', 'queued briefing', { delay: 30, mission: 'a' });
    expect(ph.pending).toBe(1);
    bot.wait(1.3); // completes
    expect(m.isCompleted('a')).toBe(true);
    ph.update(40, P(0));
    expect(ph.messages.map((x) => x.text)).toEqual(['intro text']);
  });

  it('abandoning drops a still-queued scoped text', () => {
    const d = def({ timeLimit: 0.5 });
    const m = new MissionSystem([d]);
    const ph = new Phone();
    ph.bind(m);
    const bot = new Bot(m, P(0));
    bot.startMission(d);
    ph.text('Boss', 'queued', { delay: 20, mission: 'a' });
    m.abandon();
    ph.update(30, P(0));
    expect(ph.messages.map((x) => x.text)).toEqual(['intro text']);
  });

  it('follow-up arrives 60 s after the reward', () => {
    const d = def();
    const m = new MissionSystem([d]);
    const ph = new Phone();
    ph.bind(m);
    const bot = new Bot(m, P(0));
    bot.startMission(d);
    bot.wait(1.3);
    expect(m.isCompleted('a')).toBe(true);
    expect(ph.messages).toHaveLength(1);
    ph.update(59, P(0)); expect(ph.messages).toHaveLength(1);
    ph.update(2, P(0));
    expect(ph.messages.map((x) => x.text)).toEqual(['intro text', 'thanks text']);
  });

  it('the next-mission pointer names the first story mission on offer, with a live distance', () => {
    const a = def({ id: 'a', title: 'Alpha', giver: P(100) });
    const b = def({ id: 'b', title: 'Beta', giver: P(300), requires: ['a'], availableHours: [22, 3] });
    const side = def({ id: 's', title: 'Side', tag: 'side', giver: P(50) });
    const m = new MissionSystem([side, a, b]);
    const ph = new Phone();
    ph.bind(m);
    ph.update(1, P(0), 12);
    expect(ph.pointer.title).toBe('Alpha');
    expect(ph.pointer.distance).toBeCloseTo(100);
    expect(ph.pointer.hint).toBe('Offered all day');
    m.start('a'); new Bot(m, P(500)).wait(1.3);
    ph.update(1, P(0), 12);
    expect(ph.pointer.title).toBe('Side'); // story chapter B is a night job; only the side job is on offer at noon
    ph.update(1, P(0), 23);
    expect(ph.pointer.title).toBe('Beta');
    expect(ph.pointer.hint).toBe('Offered 10pm to 3am');
  });
});

describe('Phone save round trip', () => {
  beforeEach(() => { clearPhoneData(); });

  it('messages, read flags, pending texts and dedupe keys survive JSON', () => {
    const ph = new Phone();
    ph.text('Auntie', 'hello', { key: 'intro:1' });
    ph.text('Auntie', 'later', { delay: 40, key: 'follow:1' });
    ph.update(10, P(0));
    ph.open(); ph.markAllRead();
    const json = JSON.stringify(ph.serialize());
    const ph2 = new Phone();
    expect(ph2.restore(JSON.parse(json))).toBe(true);
    expect(ph2.messages.map((m) => [m.text, m.read])).toEqual([['hello', true]]);
    expect(ph2.pending).toBe(1);
    expect(ph2.text('Auntie', 'hello', { key: 'intro:1' })).toBe(false);
    ph2.update(29, P(0)); expect(ph2.messages).toHaveLength(1);
    ph2.update(2, P(0)); expect(ph2.messages.map((m) => m.text)).toEqual(['hello', 'later']);
    expect(JSON.parse(JSON.stringify(new Phone().serialize()))).toEqual({ v: 1, messages: [], queued: [], keys: [], seq: 0 });
  });

  it('rejects garbage without touching state; storage helpers never throw', () => {
    const ph = new Phone();
    ph.text('A', 'keep');
    for (const bad of [null, 3, {}, { v: 2 }, { v: 1, messages: [{ id: 1 }], queued: [], keys: [], seq: 0 }, { v: 1, messages: [], queued: [{ dueIn: 'x' }], keys: [], seq: 0 }]) expect(ph.restore(bad)).toBe(false);
    expect(ph.messages).toHaveLength(1);
    savePhoneData(ph.serialize());
    expect(loadPhoneData()).toMatchObject({ v: 1 });
    const p3 = new Phone(); p3.persist = (s) => savePhoneData(s); p3.text('B', 'saved');
    expect((loadPhoneData() as { messages: unknown[] }).messages).toHaveLength(1);
    clearPhoneData();
    expect(loadPhoneData()).toBeNull();
  });
});
