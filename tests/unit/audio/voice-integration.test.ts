import { describe, expect, it } from 'vitest';
import { Announcer, DEFAULT_BROADCAST } from '@/audio/announcer/Announcer';
import { DjScheduler } from '@/audio/voice/Scheduler';
import { VoiceHub } from '@/audio/voice/VoiceHub';
import { TalkStation } from '@/audio/voice/TalkStation';
import { SC_STATIONS } from '@/audio/radio';
import type { SpeechLike, UtteranceLike } from '@/audio/talk/TalkPlayer';

class FakeSpeech implements SpeechLike {
  spoken: string[] = [];
  speak(u: UtteranceLike): void { this.spoken.push(u.text); queueMicrotask(() => u.onend?.()); }
  cancel(): void { /* none */ }
  pause(): void { /* none */ }
  resume(): void { /* none */ }
  getVoices() { return [{ name: 'A', lang: 'en-US' }]; }
}
const utter = (text: string): UtteranceLike => ({ text, voice: null, pitch: 1, rate: 1, volume: 1, lang: '', onend: null, onerror: null });
const hubWith = (speech: SpeechLike | null) => new VoiceHub({ ctx: () => null, dest: () => null, speech, makeUtterance: utter, volume: () => 1, persist: null });
const until = async (f: () => boolean, ms = 4000) => { for (let i = 0; i < ms / 20 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };

describe('Announcer with the voice hub', () => {
  it('back-announces and introduces with the real artist and set names, ducking the music while it talks', async () => {
    const speech = new FakeSpeech();
    const ducks: number[] = [];
    const a = new Announcer({
      speech, makeUtterance: utter, volume: () => 1, setDuck: (d) => ducks.push(d), talkBusy: () => false, context: () => ({ ...DEFAULT_BROADCAST, hour: 22 }), random: () => 0.5,
      dj: new DjScheduler(() => 0.4), hub: hubWith(speech),
    });
    const stoop = SC_STATIONS.find((s) => s.id === 'stoop')!;
    a.tuneIn(stoop);
    a.update(2);
    await until(() => !a.speaking);
    expect(speech.spoken.join(' ')).toMatch(/Universal Hip Hop Radio/);
    speech.spoken.length = 0;
    a.betweenSets({ title: 'Cypher Season 4', dj: 'MC Lowtide' }, { title: 'Block Party Tape', dj: 'DJ Marcy Flats' });
    a.update(2);
    await until(() => !a.speaking && speech.spoken.length > 0);
    const heard = speech.spoken.join(' ');
    expect(heard).toContain('MC Lowtide');
    expect(heard).toContain('Cypher Season 4');
    expect(heard).toContain('DJ Marcy Flats');
    expect(heard).toContain('Block Party Tape');
    expect(ducks).toContain(0.22);
    expect(a.history.at(-1)?.text).toContain('Block Party Tape');
  });

  it('cancels its speech when the listener changes station', async () => {
    const speech = new FakeSpeech();
    const hub = hubWith(speech);
    const a = new Announcer({ speech, makeUtterance: utter, volume: () => 1, setDuck: () => undefined, talkBusy: () => false, context: () => DEFAULT_BROADCAST, random: () => 0.1, dj: new DjScheduler(() => 0.1), hub });
    a.tuneIn(SC_STATIONS[0]);
    a.update(2);
    expect(a.speaking).toBe(true);
    a.tuneAway();
    expect(a.speaking).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(a.speaking).toBe(false);
  });
});

describe('TalkStation', () => {
  it('speaks the cast, shows a speaker caption, and resumes on the interrupted line after tuning away', async () => {
    const speech = new FakeSpeech();
    const bed: number[] = [];
    const t = new TalkStation({ hub: hubWith(speech), context: () => ({ ...DEFAULT_BROADCAST, hour: 9 }), setBed: (l) => bed.push(l), random: () => 0.2 });
    expect(t.stationName).toBe('WBSY Talk');
    t.setActive(true);
    await until(() => speech.spoken.length >= 4);
    expect(t.isActive).toBe(true);
    expect(t.caption).not.toBe('');
    const block = t.schedule.current!;
    t.setActive(false);
    const at = block.at;
    expect(at).toBeGreaterThan(0);
    expect(t.caption).toBe('');
    const stopped = speech.spoken.length;
    t.setActive(true);
    await until(() => speech.spoken.length > stopped + 1);
    expect(t.schedule.current).toBe(block);
    expect(block.at).toBeGreaterThanOrEqual(at);
    t.dispose();
  });

  it('reports the unavailable name and still advances on a timer when nothing can speak', () => {
    const t = new TalkStation({ hub: hubWith(null), context: () => DEFAULT_BROADCAST, setBed: () => undefined, random: () => 0.3 });
    expect(t.stationName).toBe('WBSY Talk (voice unavailable on this device)');
    t.setActive(true);
    const first = t.schedule.current!;
    for (let i = 0; i < 4000 && t.schedule.current === first; i++) t.update(0.5);
    expect(t.schedule.current).not.toBe(first);
  });
});
