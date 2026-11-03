import { describe, expect, it } from 'vitest';
import { PROCEDURAL_RECORDS, dropRecords, estimateBpm, loopSamples, pressLibraryTrack, synthRecord, RecordSource, type BufferContext } from '@/game/records';

describe('procedural records', () => {
  it('ships 12 originals with exact bpm and unique ids', () => {
    expect(PROCEDURAL_RECORDS).toHaveLength(12);
    expect(new Set(PROCEDURAL_RECORDS.map((r) => r.id)).size).toBe(12);
    for (const r of PROCEDURAL_RECORDS) { expect(r.bpm).toBeGreaterThan(60); expect(r.price).toBeGreaterThan(0); expect(r.kind).toBe('procedural'); }
  });
  it('renders a loop of whole bars at the exact tempo, audible and finite', () => {
    for (const r of PROCEDURAL_RECORDS) {
      const out = synthRecord(r, 8000);
      expect(out.left.length).toBe(loopSamples(r.bpm, 8000));
      let peak = 0; let finite = true;
      for (let i = 0; i < out.left.length; i++) { const v = Math.abs(out.left[i]); if (!Number.isFinite(v)) finite = false; if (v > peak) peak = v; }
      expect(finite).toBe(true);
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });
  it('estimateBpm recovers a click train tempo', () => {
    const sr = 8000; const bpm = 128; const secs = 20;
    const s = new Float32Array(sr * secs);
    const period = Math.round((sr * 60) / bpm);
    for (let t = 0; t < s.length; t += period) for (let i = 0; i < 200 && t + i < s.length; i++) s[t + i] = Math.exp(-i / 40);
    expect(Math.abs(estimateBpm(s, sr) - bpm)).toBeLessThan(2.5);
  });
  it('estimateBpm of a procedural record is close to its real tempo', () => {
    const r = PROCEDURAL_RECORDS[1]; // house 122
    const out = synthRecord(r, 8000);
    expect(Math.abs(estimateBpm(out.left, 8000) - r.bpm)).toBeLessThan(4);
  });
  it('estimateBpm falls back on silence', () => { expect(estimateBpm(new Float32Array(80000), 8000, 99)).toBe(99); });
});

describe('pressing and drop folder', () => {
  it('presses a library track for free with a genre tempo', () => {
    const d = pressLibraryTrack({ id: 'a|1|2', name: 'My Song' }, 'hiphop');
    expect(d).toMatchObject({ id: 'lib:a|1|2', price: 0, kind: 'library', bpm: 90, title: 'My Song' });
  });
  it('turns drop-folder files into free records and ignores other files', () => {
    const { defs, urls } = dropRecords({ '/x/records/Night_Drive.mp3': 'blob:1', '/x/records/readme.md': 'x', '/x/records/dub plate.wav': 'blob:2' });
    expect(defs.map((d) => d.title).sort()).toEqual(['Night Drive', 'dub plate']);
    expect(defs.find((d) => d.title === 'dub plate')?.genre).toBe('dub');
    expect(urls.size).toBe(2);
  });
});

describe('RecordSource', () => {
  const ctx: BufferContext = {
    sampleRate: 8000,
    createBuffer: (c, l, r) => { const ch = Array.from({ length: c }, () => new Float32Array(l)); return { numberOfChannels: c, length: l, sampleRate: r, duration: l / r, getChannelData: (i: number) => ch[i] } as unknown as AudioBuffer; },
    decodeAudioData: async () => ctx.createBuffer(1, 8000, 8000),
  };
  it('builds procedural buffers and caches them', async () => {
    const src = new RecordSource(ctx);
    const a = await src.load(PROCEDURAL_RECORDS[0]);
    expect(a?.duration).toBeCloseTo(loopSamples(PROCEDURAL_RECORDS[0].bpm, 8000) / 8000, 3);
    expect(await src.load(PROCEDURAL_RECORDS[0])).toBe(a);
  });
  it('returns null for a library file that is not loaded this session', async () => {
    const def = pressLibraryTrack({ id: 'z', name: 'z' });
    expect(await new RecordSource(ctx).load(def)).toBeNull();
    const ok = new RecordSource(ctx, () => 'blob:z', async () => new ArrayBuffer(4));
    expect(ok.available(def)).toBe(true);
    expect((await ok.load(def))?.duration).toBe(1);
  });
});

describe('drop folder glob', () => {
  it('resolves at build time (empty by default)', async () => {
    const { bundledDropRecords } = await import('@/game/records');
    const r = bundledDropRecords();
    expect(Array.isArray(r.defs)).toBe(true);
    expect(r.urls instanceof Map).toBe(true);
  });
});
