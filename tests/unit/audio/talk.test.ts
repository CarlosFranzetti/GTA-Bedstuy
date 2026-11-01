import { describe, it, expect } from 'vitest';
import { TalkPlayer, pickVoices, TALK_UNAVAILABLE_NAME, type SpeechLike, type UtteranceLike, type VoiceLike } from '@/audio/talk/TalkPlayer';
import { chunkText, estimateSeconds, loadBundledScript, openingSting, parseScript, totalSeconds, voiceRole, type TalkSegment } from '@/audio/talk/script';
import { stationJingle, stingDuration, talkSting } from '@/audio/synth';

class FakeSpeech implements SpeechLike {
  voices: VoiceLike[];
  spoken: UtteranceLike[] = [];
  cancels = 0;
  pauses = 0;
  resumes = 0;
  constructor(voices: VoiceLike[] = []) { this.voices = voices; }
  speak(u: UtteranceLike) { this.spoken.push(u); }
  cancel() { this.cancels++; }
  pause() { this.pauses++; }
  resume() { this.resumes++; }
  getVoices() { return this.voices; }
  /** Finishes the utterance that is currently speaking, like the browser would. */
  finish() { const u = this.spoken.at(-1)!; u.onend?.(); }
}

const voices: VoiceLike[] = [
  { name: 'Daniel', lang: 'en-GB', localService: true },
  { name: 'Samantha', lang: 'en-US', localService: true },
  { name: 'Thomas', lang: 'fr-FR', localService: true },
  { name: 'Google US English', lang: 'en-US', localService: false },
  { name: 'Alex', lang: 'en-US', localService: true },
];

function seg(id: string, kind: TalkSegment['kind'], voice: string, text: string, seconds: number): TalkSegment {
  return { id, kind, speaker: voice, voice, text, seconds };
}

const SCRIPT: TalkSegment[] = [
  seg('s1', 'host', 'host', 'Welcome to the show. Today we talk about robots.', 10),
  seg('s2', 'ad', 'announcer', 'Buy Brand X.', 5),
  seg('s3', 'jingle', 'announcer', 'W B S Y.', 3),
  seg('s4', 'caller', 'caller2', 'Long time listener.', 8),
];

function setup(script: TalkSegment[] = SCRIPT, speech: FakeSpeech | null = new FakeSpeech(voices)) {
  const stings: string[] = [];
  const bed: number[] = [];
  const player = new TalkPlayer({
    speech,
    makeUtterance: (text) => ({ text, voice: null, pitch: 1, rate: 1, volume: 1, lang: '', onend: null, onerror: null }),
    audio: { sting: (k) => { stings.push(k); return talkSting(k).length ? 0.5 : 0; }, setBed: (l) => bed.push(l), volume: () => 0.6 },
  }, script);
  return { player, speech, stings, bed };
}

describe('script parsing', () => {
  it('reads the WRITE shape: kind, speaker, voice, text, seconds', () => {
    const segs = parseScript({ title: 't', segments: [
      { id: 'a', kind: 'host', speaker: 'Dre', voice: 'host', text: 'Hello.', seconds: 12 },
      { id: 'b', kind: 'caller', speaker: 'Pat', voice: 'caller3', text: 'Hi.' },
      { id: 'c', kind: 'ad', speaker: 'Ann', voice: 'announcer', text: 'Buy.', seconds: 5 },
      { id: 'd', kind: 'sting', speaker: 'WBSY', voice: 'announcer', text: '', seconds: 3 },
      { id: 'e', kind: 'host', speaker: 'x', voice: 'host', text: '' },
      'junk', null,
    ] });
    expect(segs.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(segs[0].seconds).toBe(12);
    expect(segs[1].seconds).toBe(estimateSeconds('Hi.'));
    expect(segs.map(voiceRole)).toEqual(['host', 'caller', 'announcer', 'announcer']);
  });

  it('also accepts a bare array and the older voice-only enum', () => {
    const segs = parseScript([{ id: 'x', speaker: 'a', voice: 'ad', text: 'Buy.' }, { id: 'y', speaker: 'b', voice: 'caller', text: 'Hi.' }, { speaker: 'c', voice: 'host', text: 'Yo.' }]);
    expect(segs.map((s) => s.kind)).toEqual(['ad', 'caller', 'host']);
    expect(segs[2].id).toBe('seg-2');
    expect(parseScript(null)).toEqual([]);
    expect(parseScript({})).toEqual([]);
  });

  it('chooses stings: ads, jingles and news open with their own, speech after an ad gets a blip', () => {
    expect(openingSting(SCRIPT[1], SCRIPT[0])).toBe('ad');
    expect(openingSting(SCRIPT[2], SCRIPT[1])).toBe('jingle');
    expect(openingSting(SCRIPT[3], SCRIPT[2])).toBe('segment');
    expect(openingSting(SCRIPT[0], SCRIPT[3])).toBeNull();
  });

  it('splits long text at sentence boundaries under the limit', () => {
    const text = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1} of the long monologue.`).join(' ');
    const chunks = chunkText(text, 120);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(120);
    expect(chunks.join(' ')).toBe(text);
    expect(chunkText('One short line.')).toEqual(['One short line.']);
    expect(chunkText('a '.repeat(500), 100).every((c) => c.length <= 100)).toBe(true);
  });

  it('loads the bundled script when present, otherwise an empty one', () => {
    const segs = loadBundledScript();
    expect(Array.isArray(segs)).toBe(true);
    if (segs.length) {
      expect(totalSeconds(segs)).toBeGreaterThan(1200); // about 22 minutes
      expect(totalSeconds(segs)).toBeLessThan(1450);
      expect(new Set(segs.map(voiceRole)).size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('voices', () => {
  it('picks distinct English voices by name heuristics, ignoring other languages', () => {
    const v = pickVoices(voices);
    expect(v.host?.name).toBe('Alex'); // en-US local male voice ranks first
    expect(v.sidekick?.name).toBe('Samantha');
    const picked = [v.host, v.sidekick, v.caller, v.announcer].filter(Boolean);
    expect(new Set(picked).size).toBe(picked.length);
    expect(picked.every((p) => p!.lang.startsWith('en'))).toBe(true);
  });

  it('copes with one voice or none', () => {
    expect(pickVoices([]).host).toBeNull();
    const one = pickVoices([{ name: 'Only', lang: 'en-US' }]);
    expect(one.host?.name).toBe('Only');
    expect(one.sidekick).toBeNull();
  });

  it('uses different pitch and rate per role so one voice still sounds like several people', () => {
    const { player, speech } = setup(SCRIPT, new FakeSpeech([]));
    player.setActive(true);
    const host = speech!.spoken[0];
    speech!.finish();
    player.update(0.3);
    player.update(1); // ad sting
    const ad = speech!.spoken[1];
    expect(host.pitch).not.toBe(ad.pitch);
    expect(host.rate).not.toBe(ad.rate);
    expect(host.pitch).toBeLessThan(1);
  });

  it('speech volume follows the radio volume', () => {
    const { player, speech } = setup();
    player.setActive(true);
    expect(speech!.spoken[0].volume).toBeCloseTo(0.6);
  });
});

describe('sequencing and loop', () => {
  it('speaks the segments in order with stings between, ducking the bed under the host', () => {
    const { player, speech, stings, bed } = setup();
    player.setActive(true);
    expect(speech!.spoken.map((u) => u.text)).toEqual(['Welcome to the show. Today we talk about robots.']);
    expect(bed.at(-1)).toBeLessThan(0.5); // ducked under the host
    speech!.finish();
    player.update(0.3); // gap
    expect(stings).toEqual(['ad']);
    player.update(0.7); // sting
    expect(speech!.spoken.at(-1)!.text).toBe('Buy Brand X.');
    expect(bed.at(-1)).toBeGreaterThan(0.5); // open bed during the ad
    speech!.finish();
    player.update(0.3);
    expect(stings).toEqual(['ad', 'jingle']);
    player.update(0.7);
    expect(speech!.spoken.at(-1)!.text).toBe('W B S Y.');
    speech!.finish();
    player.update(0.3);
    expect(stings.at(-1)).toBe('segment');
    player.update(0.7);
    expect(speech!.spoken.at(-1)!.text).toBe('Long time listener.');
  });

  it('loops back to the first segment after the last', () => {
    const { player, speech } = setup();
    player.setActive(true);
    for (let i = 0; i < SCRIPT.length; i++) {
      speech!.finish();
      player.update(0.3);
      player.update(0.7);
      if (i < SCRIPT.length - 1) expect(player.progress.segment).toBe(i + 1);
    }
    expect(player.progress.segment).toBe(0);
    expect(speech!.spoken.at(-1)!.text).toBe('Welcome to the show. Today we talk about robots.');
    expect(player.progress.total).toBe(4);
  });

  it('long segments are spoken as several utterances in order', () => {
    const long = Array.from({ length: 10 }, (_, i) => `Sentence ${i} is here with some words to pad it out nicely.`).join(' ');
    const { player, speech } = setup([seg('l', 'host', 'host', long, 30)]);
    player.setActive(true);
    const n = Math.ceil(long.length / 180);
    expect(speech!.spoken).toHaveLength(1);
    let guard = 0;
    while (player.progress.segment === 0 && speech!.spoken.length < n + 2 && guard++ < 10) { speech!.finish(); }
    expect(speech!.spoken.length).toBeGreaterThanOrEqual(2);
    expect(speech!.spoken.map((u) => u.text).join(' ')).toContain('Sentence 0');
  });

  it('ignores the end event of an utterance that was cancelled by tuning away', () => {
    const { player, speech } = setup();
    player.setActive(true);
    const stale = speech!.spoken[0];
    player.setActive(false);
    expect(speech!.cancels).toBeGreaterThan(0);
    const before = speech!.spoken.length;
    stale.onend?.();
    player.update(1);
    expect(speech!.spoken.length).toBe(before);
  });

  it('a stalled utterance is abandoned after a timeout so the show never hangs', () => {
    const { player, speech } = setup();
    player.setActive(true);
    for (let i = 0; i < 60; i++) player.update(1);
    expect(player.progress.segment).toBeGreaterThan(0);
    expect(speech!.spoken.length).toBeGreaterThan(1);
  });

  it('pauses and resumes speech with the game and does not advance while paused', () => {
    const { player, speech } = setup();
    player.setActive(true);
    player.setPaused(true);
    expect(speech!.pauses).toBe(1);
    const seg0 = player.progress.segment;
    for (let i = 0; i < 100; i++) player.update(1);
    expect(player.progress.segment).toBe(seg0);
    player.setPaused(false);
    expect(speech!.resumes).toBe(1);
  });

  it('keeps virtual time: tuning back in later joins the segment that would be on air', () => {
    const { player, speech } = setup();
    player.update(1); // inactive: the clock runs
    for (let i = 0; i < 16; i++) player.update(1); // 17 s: inside s3 (15..18)
    player.setActive(true);
    expect(player.progress.segment).toBe(2);
    expect(speech!.spoken.map((u) => u.text)).toEqual([]); // jingle: sting first
    player.update(1);
    expect(speech!.spoken.at(-1)!.text).toBe('W B S Y.');
    player.setActive(false);
    for (let i = 0; i < 20; i++) player.update(1); // 18+20 = 38 -> loop is 26 s -> t = 12 -> s2 (10..15)
    player.setActive(true);
    expect(player.progress.segment).toBe(1);
  });

  it('exposes loop progress for the HUD', () => {
    const { player } = setup();
    expect(player.progress.duration).toBe(26);
    player.setActive(true);
    const f0 = player.progress.fraction;
    player.update(5);
    expect(player.progress.fraction).toBeGreaterThan(f0);
    expect(player.progress.fraction).toBeLessThanOrEqual(1);
    expect(player.caption).not.toBe('');
  });

  it('plays a 22-minute-class script end to end without drifting past the loop', () => {
    const big: TalkSegment[] = Array.from({ length: 44 }, (_, i) => seg(`b${i}`, i % 11 === 10 ? 'ad' : 'host', i % 11 === 10 ? 'announcer' : 'host', `Segment number ${i}.`, 30));
    const { player, speech } = setup(big);
    expect(totalSeconds(big)).toBe(1320);
    player.setActive(true);
    let t = 0;
    while (t < 1320 * 1.5) { player.update(1); t++; if (t % 12 === 0 && speech!.spoken.length) speech!.finish(); }
    expect(player.progress.fraction).toBeLessThanOrEqual(1);
    expect(speech!.spoken.some((u) => u.text === 'Segment number 0.')).toBe(true);
    expect(speech!.spoken.filter((u) => u.text === 'Segment number 0.').length).toBeGreaterThanOrEqual(1);
  });
});

describe('SpeechSynthesis unavailable', () => {
  it('reports the notice name, never throws and plays only the bed while time passes', () => {
    const { player, stings, bed } = setup(SCRIPT, null);
    expect(player.voiceAvailable).toBe(false);
    expect(player.stationName).toBe(TALK_UNAVAILABLE_NAME);
    expect(TALK_UNAVAILABLE_NAME).toBe('WBSY Talk (voice unavailable on this device)');
    expect(() => {
      player.setActive(true);
      for (let i = 0; i < 100; i++) player.update(0.5);
      player.setPaused(true);
      player.setPaused(false);
      player.setActive(false);
    }).not.toThrow();
    expect(bed.some((l) => l === 1)).toBe(true); // bed only, full level
    expect(stings.length).toBeGreaterThan(0); // stings still play
    expect(bed.at(-1)).toBe(0);
  });

  it('still advances through the script on its planned timing', () => {
    const { player } = setup(SCRIPT, null);
    player.setActive(true);
    for (let i = 0; i < 12; i++) player.update(1);
    expect(player.progress.segment).toBeGreaterThanOrEqual(1);
  });

  it('works with an empty script (script.json not written yet)', () => {
    const { player } = setup([], new FakeSpeech(voices));
    expect(() => { player.setActive(true); player.update(1); }).not.toThrow();
    expect(player.progress.total).toBe(0);
    expect(player.stationName).toBe('WBSY Talk');
  });
});

describe('procedural stings', () => {
  it('station jingles are stable, distinct per station and short', () => {
    expect(stationJingle('pop')).toEqual(stationJingle('pop'));
    expect(stationJingle('pop')).not.toEqual(stationJingle('trap'));
    for (const id of ['pop', 'eighties', 'rap', 'house', 'trap', 'psych', 'folky', 'jazzrock']) {
      const d = stingDuration(stationJingle(id));
      expect(d).toBeGreaterThan(0.5);
      expect(d).toBeLessThan(2);
    }
  });

  it('talk stings exist for every kind', () => {
    for (const k of ['jingle', 'ad', 'news', 'segment'] as const) expect(talkSting(k).length).toBeGreaterThan(0);
  });
});
