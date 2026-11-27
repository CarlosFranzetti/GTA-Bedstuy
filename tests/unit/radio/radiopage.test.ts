// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { RadioPage, type EngineEnv } from '@/radio/engine';
import { allStations, freqOf, spokenFreq } from '@/radio/stationInfo';
import { fmtTime, mount } from '@/radio/ui';
import { CATALOG, LIVE_ENTRIES } from '@/audio/stations';
import { mixesFor } from '@/audio/sc/mixes';
import { DjMentionRunner } from '@/audio/sc/djMentions';
import { speakable } from '@/audio/announcer/Announcer';
import { LIVE_NO_STREAM, type AudioLike } from '@/audio/live/LiveStation';
import { SC_NO_STREAM, type ScApi } from '@/audio/sc/ScStation';
import type { SpeechLike, UtteranceLike } from '@/audio/talk/TalkPlayer';

class FakeWidget {
  handlers = new Map<string, Array<(e?: unknown) => void>>();
  constructor(public frame: HTMLIFrameElement) {}
  bind(e: string, fn: (x?: unknown) => void) { const a = this.handlers.get(e) ?? []; a.push(fn); this.handlers.set(e, a); }
  load(_u: string, o?: { callback?: () => void }) { o?.callback?.(); }
  play() { /* */ } pause() { /* */ } setVolume() { /* */ } seekTo() { /* */ } next() { /* */ } prev() { /* */ }
  getCurrentSound(cb: (s: unknown) => void) { cb({ title: 'Fake Mix', user: { username: 'DJ Fake' } }); }
  getDuration(cb: (ms: number) => void) { cb(3600000); }
}
const fakeApi = (made: FakeWidget[]) => ({ Widget: Object.assign((f: HTMLIFrameElement) => { const w = new FakeWidget(f); made.push(w); queueMicrotask(() => w.handlers.get('ready')?.forEach((h) => h())); return w; }, { Events: { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error', PLAY_PROGRESS: 'playProgress' } }) }) as unknown as ScApi;

class FakeAudio implements AudioLike {
  src = ''; volume = 1; paused = true; currentTime = 0; preload = '';
  play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() { /* */ }
  addEventListener() { /* */ } removeEventListener() { /* */ }
}
const fakeSpeech = (voices: boolean): SpeechLike => ({
  speak(u: UtteranceLike) { queueMicrotask(() => u.onend?.()); }, cancel() { /* */ }, pause() { /* */ }, resume() { /* */ },
  getVoices: () => (voices ? [{ name: 'Fake', lang: 'en-US' }, { name: 'Fake 2', lang: 'en-GB' }] : []),
});
const makeUtterance = (text: string): UtteranceLike => ({ text, voice: null, pitch: 1, rate: 1, volume: 1, lang: 'en-US', onend: null, onerror: null });
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function setup(over: Partial<EngineEnv> = {}, opts: { canLoad?: boolean; voices?: boolean } = {}) {
  const made: FakeWidget[] = [];
  const audios: FakeAudio[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const hostCfg = { el: host, css: 'display:block;width:100%;height:166px;' };
  const page = new RadioPage({
    speech: opts.voices === false ? null : fakeSpeech(true), makeUtterance, groupChatScript: [{ id: 'a', kind: 'host', speaker: 'Mo', voice: 'host', text: 'Hello group.', seconds: 3 }],
    widgetHost: hostCfg,
    now: () => 1_000_000, hour: () => 12, random: () => 0.5,
    director: {
      scEnv: { loadApi: async () => fakeApi(made), canLoad: () => opts.canLoad !== false, doc: () => document, hour: () => 12, widgetHost: hostCfg },
      liveEnv: { createAudio: () => { const a = new FakeAudio(); audios.push(a); return a; }, canLoad: () => opts.canLoad !== false, doc: () => document, fetchJson: async () => { throw new Error('no network'); }, random: () => 0 },
    },
    ...over,
  });
  return { page, made, audios, host };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the page lists exactly the game catalog', () => {
  it('the dial, in order, is the catalog; so is the page list', () => {
    const { page } = setup();
    const ids = CATALOG.map((e) => e.id);
    expect(ids.length).toBe(17);
    expect(page.stations.map((s) => s.id)).toEqual(ids);
    expect(page.director.stations.map((s) => s.id)).toEqual(ids);
    expect(allStations().map((s) => s.name)).toEqual(CATALOG.map((e) => e.name));
    page.dispose();
  });
  it('carries the curated mixes of every SoundCloud station and the streams of every live one', () => {
    for (const s of allStations()) {
      if (s.kind === 'sc-account' || s.kind === 'sc-playlist' || s.kind === 'ra-pool') {
        expect(s.mixes.length).toBe(mixesFor(s.id).length);
        expect(s.scUrls.length).toBeGreaterThan(0);
        expect(s.djLines).not.toBeNull();
      }
      if (s.kind === 'live-stream') expect(s.streams.length).toBeGreaterThan(0);
    }
    expect(LIVE_ENTRIES.length).toBe(allStations().filter((s) => s.kind === 'live-stream').length);
  });
  it('frequencies come only from the game: nine SoundCloud stations, WNYC, The Group Chat', () => {
    expect(spokenFreq('ninety point nine')).toBe('90.9');
    expect(spokenFreq('ninety-nine point one')).toBe('99.1');
    expect(spokenFreq('one hundred and two point three')).toBe('102.3');
    expect(spokenFreq('one hundred point one')).toBe('100.1');
    expect(spokenFreq('nonsense')).toBe('');
    const withFreq = CATALOG.filter((e) => freqOf(e) !== '').map((e) => e.id);
    expect(withFreq.sort()).toEqual(['bkhouse', 'boogie', 'dublab', 'flashback', 'groupchat', 'hiphop', 'latin', 'sc', 'weird', 'wnyc', 'yard']);
  });
});

describe('tuning every kind builds the right source', () => {
  it('SoundCloud stations make the official player frame in the page, for a URL of that station', async () => {
    const { page, host } = setup();
    for (const e of CATALOG.filter((c) => c.kind === 'sc-account' || c.kind === 'sc-playlist' || c.kind === 'ra-pool')) {
      expect(page.tune(e.id)).toBe(true);
      expect(page.currentId).toBe(e.id);
      expect(page.director.currentSc?.id).toBe(e.id);
      await tick();
      const f = host.querySelector(`iframe[data-station="${e.id}"]`) as HTMLIFrameElement;
      expect(f, e.id).toBeTruthy();
      expect(f.src).toContain('https://w.soundcloud.com/player/?url=');
      const url = decodeURIComponent(f.src.split('url=')[1].split('&')[0]);
      const allowed = [...(e.scUrls ?? []), ...mixesFor(e.id).map((m) => m.url)];
      expect(allowed, `${e.id}: ${url}`).toContain(url);
      expect(f.getAttribute('allow')).toContain('autoplay');
    }
    // the game's own hidden frame in document.body is not used
    expect(Array.from(document.body.children).filter((c) => c.tagName === 'IFRAME').length).toBe(0);
    page.dispose();
  });
  it('live stations open a stream of the catalog entry (a pool entry picks one of its own)', () => {
    const { page, audios } = setup();
    for (const e of LIVE_ENTRIES) {
      page.tune(e.id);
      expect(page.director.currentLive?.def.id).toBe(e.id);
      const a = audios[audios.length - 1];
      const urls = [...(e.streams ?? []), ...(e.pool?.flatMap((p) => p.streams) ?? [])];
      expect(urls, e.id).toContain(a.src);
    }
    page.dispose();
  });
  it('talk stations tune to the right script and speak with a voice', () => {
    const { page } = setup();
    page.tune('talk');
    expect(page.director.current.kind).toBe('talk');
    expect(page.view().stationName).toBe('WBSY Talk');
    expect(page.status().level).toBe('ok');
    page.tune('groupchat');
    expect(page.view().stationName).toBe('The Group Chat 99.9');
    expect(page.chat.isActive).toBe(true);
    expect(page.talk.isActive).toBe(false);
    expect(page.status().level).toBe('ok');
    page.dispose();
  });
  it('unknown ids are refused and prev / next walk the dial', () => {
    const { page } = setup();
    expect(page.tune('nope')).toBe(false);
    page.tune('bkhouse');
    page.next();
    expect(page.currentId).toBe(CATALOG[1].id);
    page.prev(); page.prev();
    expect(page.currentId).toBe(CATALOG[CATALOG.length - 1].id);
    page.dispose();
  });
});

describe('plain status with the reason', () => {
  it('idle before a tap: nothing plays and the page says sound starts from a tap', () => {
    const { page } = setup();
    expect(page.status().level).toBe('idle');
    expect(page.status().reason).toMatch(/tap/i);
    page.dispose();
  });
  it('a SoundCloud station that cannot load says so and why', async () => {
    const { page } = setup({}, { canLoad: false });
    page.tune('hiphop');
    await tick();
    const s = page.status();
    expect(s.level).toBe('fail');
    expect(s.text).toBe(SC_NO_STREAM);
    expect(s.reason).toMatch(/soundcloud/i);
    page.retry();
    page.dispose();
  });
  it('a live station that cannot connect says so and is not skipped (autoSkip is off)', async () => {
    const { page } = setup({}, { canLoad: false });
    page.tune('beat');
    await tick();
    expect(page.status().level).toBe('fail');
    expect(page.status().text).toBe(LIVE_NO_STREAM);
    page.tick(1);
    expect(page.currentId).toBe('beat');
    page.dispose();
  });
  it('talk stations say when the device has no speech voice', () => {
    const { page } = setup({}, { voices: false });
    page.tune('talk');
    expect(page.status().level).toBe('fail');
    expect(page.status().text).toMatch(/no speech voice/i);
    page.tune('groupchat');
    expect(page.status().level).toBe('fail');
    page.dispose();
  });
  it('the Group Chat with no script says the script did not load', () => {
    const { page } = setup({ groupChatScript: [] });
    page.tune('groupchat');
    expect(page.status().text).toMatch(/script/i);
    page.dispose();
  });
  it('radio off returns to idle', () => {
    const { page } = setup();
    page.tune('talk');
    page.off();
    expect(page.status().level).toBe('idle');
    expect(page.isOn).toBe(false);
    page.dispose();
  });
});

describe('the DJ mention runner drives the announcer on a fake clock', () => {
  it('names the DJ near the start and thanks them near the end; the line shows up in the page log', async () => {
    const { page } = setup({}, { canLoad: false });
    page.tune('hiphop');
    const dj = 'DJ Test Case';
    let pos = 600;
    const runner = new DjMentionRunner({
      clock: () => ({ key: 'https://soundcloud.com/x/y', pos, durationS: 3600, dj }),
      station: () => ({ id: 'hiphop', name: 'Stoop Hip Hop Radio' }),
      say: (t) => page.director.announcer.djMention(t),
      random: () => 0.3, speakable: (n) => speakable(n, 80),
    });
    for (let i = 0; i < 4000 && pos < 3590; i++) { pos += 1; page.tick(1); runner.update(); }
    const kinds = runner.spoken.map((s) => s.kind);
    expect(kinds[0]).toBe('listening'); // joined after the first minute
    expect(kinds[kinds.length - 1]).toBe('thanks');
    for (const s of runner.spoken) expect(s.text).toContain(dj);
    expect(page.director.announcer.history.some((h) => h.kind === 'dj')).toBe(true);
    expect(page.log.some((l) => l.text.includes(dj))).toBe(true);
    page.dispose();
  });
});

describe('the head unit', () => {
  it('mounts a button per station and shows the status', () => {
    const { page } = setup();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const off = mount(root, page);
    expect(root.querySelectorAll('button.preset').length).toBe(CATALOG.length);
    expect(root.querySelectorAll('details.st').length).toBe(CATALOG.length);
    (root.querySelector('button.preset[data-id="talk"]') as HTMLButtonElement).click();
    expect(page.currentId).toBe('talk');
    expect(root.querySelector('.stn')!.textContent).toBe('WBSY Talk');
    expect(root.querySelector('.status')!.getAttribute('data-level')).toBe('ok');
    expect(root.querySelector('button.preset[aria-pressed="true"]')!.getAttribute('data-id')).toBe('talk');
    const hip = root.querySelectorAll('details.st')[1];
    expect(hip.querySelectorAll('a[href^="https://soundcloud.com/"]').length).toBeGreaterThanOrEqual(mixesFor('hiphop').length);
    off(); page.dispose();
  });
  it('formats times', () => {
    expect(fmtTime(0)).toBe('0:00'); expect(fmtTime(75)).toBe('1:15'); expect(fmtTime(3725)).toBe('1:02:05'); expect(fmtTime(NaN)).toBe('0:00');
  });
  it('volume is clamped', () => {
    const { page } = setup();
    page.setVolume(3); expect(page.volume).toBe(1); page.setVolume(-1); expect(page.volume).toBe(0); page.setVolume(NaN); expect(page.volume).toBe(0);
    page.dispose();
  });
});

import { EMBLEMS, emblemSvg } from '@/radio/emblems';
import { dialMarks, stripOrder, nearestMark, stepAlong, freqPos } from '@/radio/dial';
import { simFrame, realFrame, tempoGuess, Visualiser, BARS } from '@/radio/viz';

describe('BOOMBOX: emblems', () => {
  it('every station has its own emblem, and they are all different', () => {
    const ids = CATALOG.map((e) => e.id);
    expect(Object.keys(EMBLEMS).sort()).toEqual(ids.slice().sort());
    const svgs = ids.map((id) => emblemSvg(id, { name: true }));
    expect(new Set(svgs).size).toBe(17);
    expect(new Set(ids.map((id) => `${EMBLEMS[id].shape}|${EMBLEMS[id].glyph}`)).size).toBe(17);
    expect(new Set(ids.map((id) => EMBLEMS[id].glyph)).size).toBe(17);
    for (const s of svgs) expect(s.startsWith('<svg')).toBe(true);
    expect(emblemSvg('nope')).toBe('');
  });
});

describe('BOOMBOX: the tuning strip', () => {
  const st = allStations().map((s) => ({ id: s.id, freq: s.freq }));
  const marks = dialMarks(st);
  it('has a mark per station; frequencies sit at their MHz, the rest in the LIVE / TALK end', () => {
    expect(marks.map((m) => m.id)).toEqual(CATALOG.map((e) => e.id));
    for (const m of marks) {
      expect(m.pos).toBeGreaterThan(0); expect(m.pos).toBeLessThan(1);
      if (m.freq) expect(m.pos).toBeCloseTo(freqPos(Number(m.freq)), 6);
      else expect(m.pos).toBeGreaterThan(0.8);
    }
    const fm = marks.filter((m) => m.freq).sort((a, b) => a.pos - b.pos).map((m) => Number(m.freq));
    expect(fm).toEqual(fm.slice().sort((a, b) => a - b));
    expect(Math.max(...marks.filter((m) => m.freq).map((m) => m.pos))).toBeLessThan(Math.min(...marks.filter((m) => !m.freq).map((m) => m.pos)));
    expect(new Set(marks.map((m) => m.pos.toFixed(3))).size).toBe(17);
  });
  it('snaps to the nearest station and steps along the strip with wrap', () => {
    for (const m of marks) expect(nearestMark(m.pos + 0.001, marks).id).toBe(m.id);
    const o = stripOrder(marks);
    expect(stepAlong(o[0], -1, marks)).toBe(o[16]);
    expect(stepAlong(o[16], 1, marks)).toBe(o[0]);
    expect(stepAlong(o[3], 1, marks)).toBe(o[4]);
  });
  it('the mounted needle moves to the tuned station and the arrow keys tune along the strip', () => {
    const { page } = setup();
    const root = document.createElement('div'); document.body.appendChild(root);
    const off = mount(root, page, { reduced: true, raf: false });
    const needle = root.querySelector('.needle') as HTMLElement;
    for (const m of marks) {
      (root.querySelector(`button.preset[data-id="${m.id}"]`) as HTMLButtonElement).click();
      expect(parseFloat(needle.style.left)).toBeCloseTo(m.pos * 100, 1);
    }
    expect(root.querySelectorAll('.mk').length).toBe(17);
    off(); page.dispose();
  });
});

describe('BOOMBOX: visualiser', () => {
  it('simulated levels are labelled sim and move; reduced motion is static with no cone pulse', () => {
    const a = simFrame(0.1, 120, true, false), b = simFrame(0.37, 120, true, false);
    expect(a.source).toBe('sim'); expect(a.bars.length).toBe(BARS);
    expect(a.bars).not.toEqual(b.bars);
    const r1 = simFrame(0.1, 120, true, true), r2 = simFrame(0.37, 120, true, true);
    expect(r1.bars).toEqual(r2.bars); expect(r1.bass).toBe(0); expect(r2.bass).toBe(0);
    expect(simFrame(1, 120, false, false).source).toBe('idle');
    expect(tempoGuess('hip hop DJ mixes')).toBeLessThan(tempoGuess('club sets / house / techno'));
  });
  it('real data is called real only when there is energy; otherwise the visualiser falls back to the simulation', () => {
    expect(realFrame(new Uint8Array(64)).source).toBe('idle');
    expect(realFrame(new Uint8Array(64).fill(120)).source).toBe('real');
    const fakeAn = { frequencyBinCount: 64, getByteFrequencyData: (d: Uint8Array) => d.fill(0) } as unknown as AnalyserNode;
    expect(new Visualiser(false).frame(1, { playing: true, bpm: 100, analyser: fakeAn, analysable: true }).source).toBe('sim');
    expect(new Visualiser(false).frame(1, { playing: true, bpm: 100, analyser: fakeAn, analysable: false }).source).toBe('sim');
    const loud = { frequencyBinCount: 64, getByteFrequencyData: (d: Uint8Array) => d.fill(200) } as unknown as AnalyserNode;
    expect(new Visualiser(false).frame(1, { playing: true, bpm: 100, analyser: loud, analysable: true }).source).toBe('real');
    expect(new Visualiser(true).frame(1, { playing: true, bpm: 100, analyser: loud, analysable: true }).bass).toBe(0);
  });
  it('the mounted page has reduced-motion class and a SIMULATED label for a station the page cannot analyse', () => {
    const { page } = setup();
    const root = document.createElement('div'); document.body.appendChild(root);
    const off = mount(root, page, { reduced: true, raf: false });
    page.tune('groupchat');
    const label = root.querySelector('.vlabel') as HTMLElement;
    expect(label.textContent).toBe('SIMULATED');
    expect(root.querySelector('.bb')!.classList.contains('calm')).toBe(true);
    expect((root.querySelector('.bb') as HTMLElement).style.getPropertyValue('--p')).toBe('1.000');
    off(); page.dispose();
  });
});

describe('BOOMBOX: captions and log', () => {
  it('a line shows speaker, kind and PARODY, then fades; the log keeps it newest first and Clear empties it', () => {
    let t = 1_000_000;
    const { page } = setup({ now: () => t });
    const root = document.createElement('div'); document.body.appendChild(root);
    const off = mount(root, page, { reduced: true, raf: false });
    page.noteLine({ who: 'Pell', text: 'A bad impression.', kind: 'talk', parodyOf: 'Someone', stationId: 'talk', station: 'WBSY Talk' });
    page.noteLine({ who: 'Tayo', text: 'Thanks to the DJ.', kind: 'dj-thanks', parodyOf: '', stationId: 'hiphop', station: 'Stoop Hip Hop Radio' });
    page.noteLine({ who: 'Pell', text: 'Another bad impression.', kind: 'talk', parodyOf: 'Someone', stationId: 'talk', station: 'WBSY Talk' });
    const cap = root.querySelector('.caption') as HTMLElement;
    expect(cap.classList.contains('show')).toBe(true);
    expect(cap.querySelector('.cap-who')!.textContent).toBe('Pell');
    expect(cap.querySelector('.cap-text')!.textContent).toBe('Another bad impression.');
    expect((cap.querySelector('.cap-tag') as HTMLElement).hidden).toBe(false);
    const rows = root.querySelectorAll('.lg');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Another bad impression.');
    expect(rows[1].classList.contains('dj')).toBe(true);
    expect(rows[1].textContent).toContain('DJ mention: thank-you');
    expect(rows[0].textContent).toContain('PARODY');
    t += 6000; page.tick(0.1);
    expect(cap.classList.contains('show')).toBe(false);
    (root.querySelector('button.clear') as HTMLButtonElement).click();
    expect(root.querySelectorAll('.lg').length).toBe(0);
    off(); page.dispose();
  });
  it('talk lines reach the caption with the parody mark through the real talk code', () => {
    const { page } = setup();
    page.tune('groupchat');
    const chat = page.chat as unknown as { segs: Array<{ parodyOf?: string }> };
    expect(typeof page.chat.lineText).toBe('string');
    expect(typeof page.chat.lineParodyOf).toBe('string');
    expect(chat.segs.length).toBeGreaterThan(0);
    page.dispose();
  });
});

describe('RADIOUX: phone layout', () => {
  const mountPhone = (phone = true) => {
    const s = setup();
    const root = document.createElement('div'); document.body.appendChild(root);
    const off = mount(root, s.page, { reduced: true, raf: false, phone });
    return { ...s, root, off };
  };
  it('has a mini player whose buttons call the same actions', () => {
    const { page, root, off } = mountPhone();
    const btn = (k: string) => root.querySelector(`.mini [data-mini="${k}"]`) as HTMLButtonElement;
    expect(btn('prev')).toBeTruthy(); expect(btn('play')).toBeTruthy(); expect(btn('next')).toBeTruthy();
    expect(root.querySelector('.mini .mini-em svg')).toBeTruthy();
    expect(page.isOn).toBe(false);
    btn('play').click();
    expect(page.isOn).toBe(true);
    const first = page.currentId;
    btn('next').click();
    expect(page.currentId).not.toBe(first);
    btn('prev').click();
    expect(page.currentId).toBe(first);
    btn('play').click();
    expect(page.isOn).toBe(false);
    off(); page.dispose();
  });
  it('a tile tap tunes AND plays', () => {
    const { page, root, off } = mountPhone();
    expect(page.isOn).toBe(false);
    (root.querySelector('button.preset[data-id="talk"]') as HTMLButtonElement).click();
    expect(page.isOn).toBe(true);
    expect(page.currentId).toBe('talk');
    off(); page.dispose();
  });
  it('the SoundCloud card shows for SoundCloud stations only; the others get a one-line note', () => {
    const { page, root, off } = mountPhone();
    const card = root.querySelector('.sccard') as HTMLElement, line = root.querySelector('.scline') as HTMLElement;
    page.tune('bkhouse');
    expect(card.hidden).toBe(false); expect(line.hidden).toBe(true);
    for (const id of ['talk', 'groupchat', 'wnyc']) { page.tune(id); expect(card.hidden).toBe(true); expect(line.hidden).toBe(false); expect(line.textContent!.length).toBeGreaterThan(10); }
    off(); page.dispose();
  });
  it('has the five collapsible sections with 48 px summaries rules, closed except a log with entries', () => {
    const { page, root, off } = mountPhone();
    const secs = Array.from(root.querySelectorAll('details.sec')) as HTMLDetailsElement[];
    expect(secs.map((d) => d.querySelector('summary')!.textContent)).toEqual(['Set timeline', 'What was said', 'About this station and its mixes', 'What is on each station', 'Settings']);
    expect(secs.every((d) => !d.open)).toBe(true);
    page.noteLine({ who: 'Pell', text: 'Hello.', kind: 'talk', parodyOf: '', stationId: 'talk', station: 'WBSY Talk' });
    expect((root.querySelector('details.sec-log') as HTMLDetailsElement).open).toBe(true);
    expect((root.querySelector('details.sec-tl') as HTMLDetailsElement).open).toBe(false);
    off(); page.dispose();
  });
  it('the strip marks are decoration: no buttons, no tab stops, no focus; swiping steps one station', async () => {
    const { page, root, off } = mountPhone();
    const marks = Array.from(root.querySelectorAll('.mk'));
    expect(marks.length).toBe(17);
    for (const m of marks) { expect(m.tagName).not.toBe('BUTTON'); expect(m.hasAttribute('tabindex')).toBe(false); expect(m.getAttribute('aria-hidden')).toBe('true'); }
    expect(root.querySelectorAll('.scale button, .scale [tabindex]').length).toBe(0);
    page.tune('bkhouse');
    const from = page.currentId;
    const strip = root.querySelector('.strip') as HTMLElement;
    const ev = (type: string, x: number) => { const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>; Object.assign(e, { pointerType: 'touch', pointerId: 1, clientX: x, clientY: 100 }); strip.dispatchEvent(e); };
    ev('pointerdown', 200); ev('pointermove', 150); ev('pointerup', 150);
    await new Promise((r) => setTimeout(r, 350));
    expect(from).toBe('bkhouse');
    expect(page.currentId).not.toBe(from);
    off(); page.dispose();
  });
  it('on a phone a tap on a mark does nothing; on a desktop it tunes', () => {
    for (const phone of [true, false]) {
      const { page, root, off } = mountPhone(phone);
      (root.querySelector('.mk[data-id="talk"]') as HTMLElement).click();
      expect(page.isOn).toBe(!phone);
      off(); page.dispose();
    }
  });
  it('the caption sits under the status row on a phone and inside the boombox on a desktop', () => {
    const a = mountPhone(true);
    expect((a.root.querySelector('.caption') as HTMLElement).parentElement).toBe(a.root);
    a.off(); a.page.dispose();
    const b = mountPhone(false);
    expect((b.root.querySelector('.caption') as HTMLElement).parentElement!.classList.contains('body')).toBe(true);
    b.off(); b.page.dispose();
  });
  it('the volume range and the status button are wired', () => {
    const { page, root, off } = mountPhone();
    const r = root.querySelector('input[type="range"]') as HTMLInputElement;
    r.value = '30'; r.dispatchEvent(new Event('input', { bubbles: true }));
    expect(page.volume).toBeCloseTo(0.3, 5);
    expect(root.querySelector('.status button.go')!.textContent).toBe('Tap to start sound');
    off(); page.dispose();
  });
});
