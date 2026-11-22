import { describe, it, expect } from 'vitest';
import raw from '@/audio/talk/script-groupchat.json';
import { estimateSeconds, parseScript, totalSeconds, voiceRole } from '@/audio/talk/script';

const KINDS = ['host', 'caller', 'ad', 'jingle', 'news', 'sting'];
const VOICES = ['host', 'sidekick', 'caller1', 'caller2', 'caller3', 'announcer'];

/** Words and names that must never appear: slurs, real brands, real places and clubs, product names (rules 1 to 4). */
const FORBIDDEN = [
  // slurs
  'nigg', 'fagg', 'retard', 'chink', 'kike', 'tranny', 'spic ', 'wetback',
  // real brands, apps, platforms, coins
  'google', 'apple', 'amazon', 'starbucks', 'uber', 'tesla', 'twitter', 'facebook', 'instagram', 'tiktok', 'tinder', 'hinge',
  'bumble', 'mcdonald', 'walmart', 'netflix', 'spotify', 'openai', 'chatgpt', 'bitcoin', 'ethereum', 'dogecoin', 'coinbase',
  'robinhood', 'fox news', 'cnn', 'msnbc', 'metrocard', 'citi bike',
  // real landmarks and places we parody under invented names
  'central park', 'times square', 'empire state', 'statue of liberty', 'brooklyn bridge', 'coney island', 'wall street',
  // real clubs and DJs
  'berghain', 'output', 'house of yes', 'nowadays', 'boiler room',
  // drug product names (the jokes are about people, never products)
  'cocaine', 'heroin', 'ketamine', 'mdma', 'molly', 'xanax', 'fentanyl', 'meth',
  // transit authority and real station names
  'mta', 'hoyt', 'bedford-nostrand',
];

describe('The Group Chat script (TALK2)', () => {
  const segs = parseScript(raw);

  it('parses every entry', () => {
    expect((raw as { segments: unknown[] }).segments.length).toBe(segs.length);
    expect(segs.length).toBeGreaterThan(200);
  });

  it('has unique ids, valid kinds and valid voices', () => {
    const ids = new Set<string>();
    for (const s of segs) {
      expect(ids.has(s.id), `duplicate id ${s.id}`).toBe(false);
      ids.add(s.id);
      expect(KINDS).toContain(s.kind);
      expect(VOICES, `voice of ${s.id}`).toContain(s.voice);
      expect(['host', 'sidekick', 'caller', 'announcer']).toContain(voiceRole(s));
      expect(s.speaker.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('keeps every segment under 60 words and written for the ear', () => {
    for (const s of segs) {
      const n = s.text.split(/\s+/).length;
      expect(n, `${s.id} has ${n} words`).toBeLessThanOrEqual(60);
      expect(s.text, `${s.id} has a symbol the voice would read out`).not.toMatch(/[0-9$%&@#*\/\\<>=+_^~|[\]{}]/);
    }
    const long = segs.filter((s) => s.text.split(/\s+/).length > 40).length;
    expect(long).toBeLessThan(segs.length * 0.05);
  });

  it('runs between 30 and 50 minutes by the estimate', () => {
    const minutes = totalSeconds(segs) / 60;
    expect(minutes).toBeGreaterThan(30);
    expect(minutes).toBeLessThan(50);
    for (const s of segs) expect(s.seconds).toBeCloseTo(estimateSeconds(s.text), 0);
  });

  it('keeps the words that must not appear out', () => {
    const all = segs.map((s) => `${s.speaker} ${s.text}`).join(' \n ').toLowerCase().replace(/[^a-z0-9\- \n]/g, ' ');
    const padded = ` ${all.replace(/\s+/g, ' ')} `;
    for (const w of FORBIDDEN) {
      const needle = w.endsWith(' ') ? ` ${w}` : w.length <= 5 ? ` ${w} ` : w;
      expect(padded.includes(needle), `forbidden word: ${w.trim()}`).toBe(false);
    }
  });

  it('has the station furniture: jingles, ads, news, time checks and a longer disclaimer each time', () => {
    expect(segs.filter((s) => s.kind === 'jingle').length).toBeGreaterThanOrEqual(10);
    expect(segs.filter((s) => s.kind === 'ad').length).toBeGreaterThanOrEqual(8);
    expect(segs.filter((s) => s.kind === 'news').length).toBeGreaterThanOrEqual(8);
    expect(segs.filter((s) => s.speaker === 'Time Check').length).toBeGreaterThanOrEqual(6);
    // disclaimer readings: consecutive Station Voice lines that start "The Group Chat is a work of parody"
    const readings: number[] = [];
    segs.forEach((s, i) => {
      if (s.speaker === 'Station Voice' && s.text.startsWith('The Group Chat is a work of parody')) {
        let words = s.text.split(/\s+/).length;
        const next = segs[i + 1];
        if (next && next.speaker === 'Station Voice' && !next.text.startsWith('The Group Chat is')) words += next.text.split(/\s+/).length;
        readings.push(words);
      }
    });
    expect(readings.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < readings.length; i++) expect(readings[i], `disclaimer ${i}`).toBeGreaterThan(readings[i - 1]);
  });

  it('has every topic the owner asked for', () => {
    const text = segs.map((s) => s.text).join(' ').toLowerCase();
    for (const k of ['a i', 'trump', 'mamdani', 'coin', 'g train', 'lady verdigris', 'hexham', 'marisol', 'podcast', 'techno', 'black', 'crystal', 'dealer'])
      expect(text, k).toContain(k);
  });
});
