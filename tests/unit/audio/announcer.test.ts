import { describe, it, expect, vi } from 'vitest';
import { Announcer, ANNOUNCER_MIN_GAP_S, ANNOUNCER_JINGLE_DELAY_S, ANNOUNCER_DUCK, ANNOUNCER_TUNE_COOLDOWN_S, speakable, type AnnouncerEnv, type BroadcastContext } from '@/audio/announcer/Announcer';
import { PERSONAS, personaFor } from '@/audio/announcer/personas';
import { SCRIPTS, fillScript, spokenTime, weatherPhrase, shortStreet } from '@/audio/announcer/scripts';
import { SC_STATIONS, scStationDef } from '@/audio/radio';
import { RadioDirector } from '@/audio/RadioDirector';
import { Library } from '@/audio/library/Library';
import { TalkPlayer, type SpeechLike, type UtteranceLike, type VoiceLike } from '@/audio/talk/TalkPlayer';

const VOICES: VoiceLike[] = [
  { name: 'Daniel', lang: 'en-GB', localService: true }, { name: 'Samantha', lang: 'en-US', localService: true },
  { name: 'Alex', lang: 'en-US', localService: true }, { name: 'Zira', lang: 'en-US', localService: true },
];

class FakeSpeech implements SpeechLike {
  spoken: UtteranceLike[] = [];
  cancels = 0;
  paused = false;
  constructor(public voices: VoiceLike[] = VOICES) {}
  speak(u: UtteranceLike) { this.spoken.push(u); }
  cancel() { this.cancels++; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  getVoices() { return this.voices; }
  /** Finishes the utterance that is queued, like the engine would. */
  finish() { const u = this.spoken[this.spoken.length - 1]; u?.onend?.(); }
}
const mkUtt = (text: string): UtteranceLike => ({ text, voice: null, pitch: 1, rate: 1, volume: 1, lang: '', onend: null, onerror: null });

function rig(over: Partial<AnnouncerEnv> = {}, voices: VoiceLike[] = VOICES) {
  const speech = new FakeSpeech(voices);
  const ducks: number[] = [];
  let talk = false;
  const ctx: BroadcastContext = { hour: 0.1667, weather: 'rain', rain: 0.2, street: 'Throop Ave' };
  const env: AnnouncerEnv = {
    speech, makeUtterance: mkUtt, volume: () => 0.8, setDuck: (l) => ducks.push(l), talkBusy: () => talk,
    context: () => ctx, random: () => 0.5, ...over,
  };
  const a = new Announcer(env);
  return { a, speech, ducks, ctx, setTalk: (v: boolean) => { talk = v; } };
}
const run = (a: Announcer, seconds: number, step = 1) => { for (let t = 0; t < seconds; t += step) a.update(step); };
/** Lets an announcement start and finish: jingle delay, then every queued utterance. */
function speakOut(r: ReturnType<typeof rig>) {
  run(r.a, ANNOUNCER_JINGLE_DELAY_S + 0.5, 0.5);
  for (let i = 0; i < 12 && r.a.speaking; i++) r.speech.finish();
}
const house = scStationDef('bkhouse')!;

describe('scripts', () => {
  it('every station has a persona with 2-3 lines, and 20+ idents plus ID, intro, outro and hour templates', () => {
    expect(PERSONAS.map((p) => p.stationId)).toEqual(SC_STATIONS.map((s) => s.id));
    for (const def of SC_STATIONS) {
      const p = personaFor(def.id)!;
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.personality.length).toBeGreaterThanOrEqual(2);
      expect(p.personality.length).toBeLessThanOrEqual(3);
      const s = SCRIPTS[def.id];
      expect(s.idents.length).toBeGreaterThanOrEqual(20);
      expect(new Set(s.idents).size).toBe(s.idents.length);
      expect(s.ids.length).toBeGreaterThanOrEqual(3);
      expect(s.intros.length).toBeGreaterThanOrEqual(3);
      expect(s.outros.length).toBeGreaterThanOrEqual(2);
      expect(s.hours.length).toBeGreaterThanOrEqual(3);
      for (const t of s.intros) { expect(t).toContain('{dj}'); expect(t).toContain('{title}'); }
      for (const t of s.outros) expect(t).toMatch(/\{prevDj\}|\{prevTitle\}/);
    }
  });

  it('the BK House ID and intro read like the brief', () => {
    expect(fillScript(SCRIPTS.bkhouse.ids[0], { station: 'BK House', freq: 'ninety point nine' })).toBe("You're locked to BK House, ninety point nine Bed-Stuy.");
    expect(fillScript('Up next, a set from {dj}: {title}.', { dj: 'Ana K', title: 'Dawn Chorus' })).toBe('Up next, a set from Ana K: Dawn Chorus.');
  });

  it('names no real station or DJ voice', () => {
    const all = JSON.stringify(SCRIPTS) + JSON.stringify(PERSONAS);
    for (const bad of ['Hot 97', 'WBLS', 'Power 105', 'Z100', 'Kiss FM', 'Boiler Room', 'Resident Advisor', 'Funkmaster']) expect(all).not.toContain(bad);
  });

  it('speaks the time and weather the way the brief shows it', () => {
    expect(spokenTime(0, 10)).toBe('ten past midnight');
    expect(spokenTime(12, 0)).toBe('noon');
    expect(spokenTime(17, 45)).toBe('a quarter to six in the evening');
    expect(spokenTime(2, 30)).toBe('half past two at night');
    expect(spokenTime(23, 58)).toBe('midnight');
    expect(weatherPhrase('rain', 0.1)).toBe('light rain');
    expect(weatherPhrase('rain', 0.9)).toBe('heavy rain');
    expect(weatherPhrase('dry', 0, true)).toBe('a clear night');
    expect(shortStreet('Throop Ave')).toBe('Throop');
    expect(shortStreet('')).toBe('Throop');
    expect(speakable('Deep | Dub & Bass https://x.y/z 🔥')).toBe('Deep , Dub and Bass');
    expect(speakable('x'.repeat(200)).length).toBeLessThanOrEqual(90);
  });
});

describe('cadence', () => {
  it('says the station ID on tune-in, after the jingle delay', () => {
    const r = rig();
    r.a.tuneIn(house);
    r.a.update(ANNOUNCER_JINGLE_DELAY_S - 0.5);
    expect(r.speech.spoken).toHaveLength(0);
    r.a.update(0.6);
    expect(r.speech.spoken).toHaveLength(1);
    expect(r.speech.spoken[0].text).toContain('BK House');
    expect(r.speech.spoken[0].text).toContain('ninety point nine');
    expect(r.a.speaking).toBe(true);
    expect(r.a.name).toBe('Deja Fontaine');
  });

  it('speaks at most once every 8 minutes otherwise', () => {
    const r = rig();
    r.a.tuneIn(house);
    speakOut(r);
    const after = r.speech.spoken.length;
    run(r.a, ANNOUNCER_MIN_GAP_S - 10); // 7 min 50 s later
    expect(r.speech.spoken).toHaveLength(after);
    run(r.a, 10.5);
    expect(r.speech.spoken.length).toBe(after + 1);
    speakOut(r);
    const n2 = r.speech.spoken.length;
    run(r.a, ANNOUNCER_MIN_GAP_S - 5);
    expect(r.speech.spoken).toHaveLength(n2);
    // Over an hour: never more than one every 8 minutes.
    const r2 = rig();
    r2.a.tuneIn(house);
    speakOut(r2);
    const starts: number[] = [];
    let seen = r2.a.history.length;
    for (let t = 0; t < 3600; t++) {
      r2.a.update(1);
      if (r2.a.history.length > seen) { starts.push(t); seen = r2.a.history.length; r2.speech.finish(); }
    }
    expect(starts.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(ANNOUNCER_MIN_GAP_S - 1);
  });

  it('always announces between sets, even a few seconds after the last announcement, outro before intro', () => {
    const r = rig();
    r.a.tuneIn(house);
    speakOut(r);
    r.a.update(5);
    expect(r.a.betweenSets({ title: 'Old Mix', user: 'DJ Old' }, { title: 'Dawn Chorus', user: 'Ana K' })).toBe(true);
    run(r.a, ANNOUNCER_JINGLE_DELAY_S + 0.5, 0.5);
    const texts = r.speech.spoken.map((u) => u.text);
    const last = texts.at(-1)!;
    expect(texts.join(' ')).toMatch(/Old Mix|DJ Old/);
    r.speech.finish();
    expect(r.speech.spoken.map((u) => u.text).join(' ')).toMatch(/Ana K/);
    expect(r.speech.spoken.map((u) => u.text).join(' ')).toMatch(/Dawn Chorus/);
    expect(last).toMatch(/Old Mix|DJ Old/);
  });

  it('uses a generic intro when the next set is unknown', () => {
    const r = rig();
    r.a.tuneIn(house);
    speakOut(r);
    r.a.betweenSets(null, null);
    speakOut(r);
    expect(r.a.history.at(-1)!.kind).toBe('set');
    expect(r.a.history.at(-1)!.text).not.toContain('{');
  });

  it('flipping through stations stays quiet: a new tune-in ID waits for the cooldown', () => {
    const r = rig();
    r.a.tuneIn(house);
    speakOut(r);
    const n = r.speech.spoken.length;
    r.a.tuneIn(scStationDef('dublab')!);
    run(r.a, 3);
    expect(r.speech.spoken).toHaveLength(n);
    run(r.a, ANNOUNCER_TUNE_COOLDOWN_S);
    r.a.tuneIn(scStationDef('stoop')!);
    run(r.a, 3);
    expect(r.speech.spoken.length).toBe(n + 1);
    expect(r.a.name).toBe('Big Tayo');
  });

  it('time and weather lines fill in the clock, street and weather', () => {
    const r = rig({ random: () => 0.1 }); // < 0.3 picks the hour line
    r.a.tuneIn(house);
    speakOut(r);
    run(r.a, ANNOUNCER_MIN_GAP_S + 1);
    const line = r.a.history.at(-1)!;
    expect(line.kind).toBe('hour');
    expect(line.text).toMatch(/ten past midnight/);
    expect(line.text).toMatch(/Throop/);
    expect(line.text).toMatch(/light rain/);
  });

  it('does not advance while paused, and pauses the speech', () => {
    const r = rig();
    r.a.tuneIn(house);
    r.a.setPaused(true);
    run(r.a, 60);
    expect(r.speech.spoken).toHaveLength(0);
    r.a.setPaused(false);
    run(r.a, 3);
    expect(r.speech.spoken).toHaveLength(1);
    r.a.setPaused(true);
    expect(r.speech.paused).toBe(true);
  });
});

describe('never over the talk show', () => {
  it('stays silent while WBSY Talk is on, drops what was pending, and never cancels the talk speech', () => {
    const r = rig();
    r.a.tuneIn(house);
    r.setTalk(true);
    run(r.a, 30);
    expect(r.speech.spoken).toHaveLength(0);
    expect(r.a.hasPending).toBe(false);
    expect(r.a.betweenSets(null, { title: 'x', user: 'y' })).toBe(false);
    run(r.a, ANNOUNCER_MIN_GAP_S + 30);
    expect(r.speech.spoken).toHaveLength(0);
    expect(r.speech.cancels).toBe(0);
  });

  it('a line in progress is dropped when the talk show takes over, without cancelling the talk queue', () => {
    const r = rig();
    r.a.tuneIn(house);
    run(r.a, 2);
    expect(r.a.speaking).toBe(true);
    r.setTalk(true);
    r.a.update(0.1);
    expect(r.a.speaking).toBe(false);
    expect(r.speech.cancels).toBe(0);
  });

  it('through the director: tuning to WBSY Talk stops the announcer first; tuning back speaks again', () => {
    const speech = new FakeSpeech();
    const talk = new TalkPlayer({ speech: null, makeUtterance: mkUtt, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    const dir = new RadioDirector(new Library(), talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => false }, voice: { speech, makeUtterance: mkUtt, volume: () => 1, random: () => 0.5 } });
    dir.setOn(true);
    dir.update(2.5);
    expect(dir.announcer.speaking).toBe(true);
    dir.select(dir.stations.findIndex((s) => s.kind === 'talk'));
    expect(dir.announcer.speaking).toBe(false);
    const spoken = speech.spoken.length;
    dir.update(5);
    expect(speech.spoken.length).toBe(spoken);
    expect(dir.announcerLine).toBe('');
  });
});

describe('ducking', () => {
  it('ducks the music while speaking and brings it back after', () => {
    const r = rig();
    r.a.tuneIn(house);
    run(r.a, 2);
    expect(r.a.duckLevel).toBe(ANNOUNCER_DUCK);
    expect(r.ducks).toContain(ANNOUNCER_DUCK);
    for (let i = 0; i < 6; i++) r.speech.finish();
    expect(r.a.speaking).toBe(false);
    run(r.a, 1, 0.1);
    expect(r.a.duckLevel).toBe(1);
    expect(r.ducks.at(-1)).toBe(1);
    // ramps back up rather than jumping
    expect(r.ducks.filter((d) => d > ANNOUNCER_DUCK && d < 1).length).toBeGreaterThan(0);
  });

  it('releases the duck at once when the listener tunes away', () => {
    const r = rig();
    r.a.tuneIn(house);
    run(r.a, 2);
    r.a.tuneAway();
    expect(r.a.duckLevel).toBe(1);
    expect(r.speech.cancels).toBe(1);
  });

  it('through the director the duck reaches every SoundCloud widget', () => {
    const speech = new FakeSpeech();
    const talk = new TalkPlayer({ speech: null, makeUtterance: mkUtt, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    const dir = new RadioDirector(new Library(), talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => false }, voice: { speech, makeUtterance: mkUtt, volume: () => 1 } });
    dir.setOn(true);
    dir.update(2.5);
    expect(dir.scStations.every((s) => s.duckLevel === ANNOUNCER_DUCK)).toBe(true);
  });
});

describe('voices', () => {
  it('uses the persona pitch and rate and a voice picked like WBSY Talk, all eight told apart', () => {
    const seen = new Set<string>();
    for (const def of SC_STATIONS) {
      const r = rig();
      r.a.tuneIn(def);
      run(r.a, 2);
      const u = r.speech.spoken[0];
      const p = personaFor(def.id)!;
      expect(u.pitch).toBeCloseTo(p.pitch, 5);
      expect(u.rate).toBeCloseTo(p.rate, 5);
      expect(u.volume).toBeCloseTo(0.8, 5);
      expect(u.voice).not.toBeNull();
      seen.add(`${u.voice!.name}|${u.pitch}|${u.rate}`);
    }
    expect(seen.size).toBe(8);
  });

  it('with a single voice every announcer still shares it, told apart by pitch and rate', () => {
    const r = rig({}, [VOICES[0]]);
    r.a.tuneIn(scStationDef('weird')!);
    run(r.a, 2);
    expect(r.speech.spoken[0].voice).toBe(VOICES[0]);
  });

  it('is silent with no voices and offers a text line for the HUD instead', () => {
    const r = rig({}, []);
    expect(r.a.voiceAvailable).toBe(false);
    r.a.tuneIn(house);
    run(r.a, 2);
    expect(r.speech.spoken).toHaveLength(0);
    expect(r.a.speaking).toBe(true);
    expect(r.a.name).toBe('Deja Fontaine');
    expect(r.a.line).toContain('BK House');
    expect(r.ducks.every((d) => d === 1)).toBe(true);
    run(r.a, 12);
    expect(r.a.speaking).toBe(false);
  });

  it('is silent with no SpeechSynthesis at all', () => {
    const r = rig({ speech: null });
    r.a.tuneIn(house);
    run(r.a, 2);
    expect(r.a.voiceAvailable).toBe(false);
    expect(r.a.line).toContain('BK House');
    expect(r.speech.spoken).toHaveLength(0);
  });

  it('survives a throwing synthesizer', () => {
    const r = rig();
    r.speech.speak = () => { throw new Error('boom'); };
    r.a.tuneIn(house);
    expect(() => run(r.a, 3)).not.toThrow();
    expect(r.a.speaking).toBe(false);
  });
});

describe('HUD strings', () => {
  function dirWith(speech: FakeSpeech | null) {
    const talk = new TalkPlayer({ speech: null, makeUtterance: mkUtt, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    return new RadioDirector(new Library(), talk, undefined, undefined, {
      feed: null, scEnv: { canLoad: () => false }, voice: { speech, makeUtterance: mkUtt, volume: () => 1, random: () => 0.5 },
    });
  }

  it('shows "{station} — {announcer name}" while the announcer speaks', () => {
    const dir = dirWith(new FakeSpeech());
    dir.setOn(true);
    expect(dir.stationName).toBe('BK House');
    dir.update(2.5);
    expect(dir.trackName).toBe('Deja Fontaine');
    expect(`${dir.stationName} — ${dir.trackName}`).toBe('BK House — Deja Fontaine');
  });

  it('shows "{station} — {set title} — {dj}" while a set plays', async () => {
    const speech = new FakeSpeech();
    const talk = new TalkPlayer({ speech: null, makeUtterance: mkUtt, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    const dir = new RadioDirector(new Library(), talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => false }, voice: { speech, makeUtterance: mkUtt, volume: () => 1 } });
    const sc = dir.scStation('bkhouse')!;
    Object.defineProperty(sc, 'trackName', { get: () => 'Dawn Chorus — Ana K' });
    Object.defineProperty(sc, 'notice', { get: () => '' });
    dir.setOn(true);
    dir.announcer.stop();
    expect(`${dir.stationName} — ${dir.trackName}`).toBe('BK House — Dawn Chorus — Ana K');
  });

  it('with no voices the HUD still names the announcer while the line is up, and the text is available', () => {
    const dir = dirWith(null);
    dir.setOn(true);
    dir.update(2.5);
    expect(dir.trackName).toBe('Deja Fontaine');
    expect(dir.announcerLine).toContain('BK House');
  });

  it('shows no announcer name once the line is over', () => {
    const speech = new FakeSpeech();
    const dir = dirWith(speech);
    dir.setOn(true);
    dir.update(2.5);
    for (let i = 0; i < 6; i++) speech.finish();
    dir.update(0.1);
    expect(dir.trackName).not.toBe('Deja Fontaine');
  });
});

describe('director wiring', () => {
  it('announces a set change on the tuned station with outro then intro', () => {
    const speech = new FakeSpeech();
    const talk = new TalkPlayer({ speech: null, makeUtterance: mkUtt, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    const sweeps: string[] = [];
    const dir = new RadioDirector(new Library(), talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => false, storage: { load: () => [{ url: 'https://soundcloud.com/a/one' }, { url: 'https://soundcloud.com/b/two' }], save: () => undefined } }, voice: { speech, makeUtterance: mkUtt, volume: () => 1 } });
    dir.onSweeper = (e) => sweeps.push(e.id);
    dir.setOn(true);
    dir.update(2.5);
    for (let i = 0; i < 6; i++) speech.finish();
    dir.update(0.5);
    const n = speech.spoken.length;
    dir.currentSc!.next();
    expect(sweeps).toEqual(['bkhouse']);
    dir.update(2.5);
    expect(speech.spoken.length).toBeGreaterThan(n);
  });

  it('sets the broadcast context from setBroadcast and the Radio SC game hour', () => {
    const talk = new TalkPlayer({ speech: null, makeUtterance: mkUtt, audio: { sting: () => 0, setBed: () => undefined, volume: () => 1 } }, []);
    const speech = new FakeSpeech();
    const dir = new RadioDirector(new Library(), talk, undefined, undefined, { feed: null, scEnv: { canLoad: () => false }, voice: { speech, makeUtterance: mkUtt, volume: () => 1, random: () => 0.1 } });
    dir.setBroadcast({ weather: 'rain', rain: 0.9, street: 'Marcy Ave' });
    dir.sc.setGameHour(14.5);
    dir.setOn(true);
    dir.update(2.5);
    for (let i = 0; i < 6; i++) speech.finish();
    for (let t = 0; t < ANNOUNCER_MIN_GAP_S + 2; t++) dir.update(1);
    const last = dir.announcer.history.at(-1)!;
    expect(last.kind).toBe('hour');
    expect(last.text).toMatch(/half past two in the afternoon/);
    expect(last.text).toMatch(/Marcy/);
    expect(last.text).toMatch(/heavy rain/);
  });
});

void vi;
