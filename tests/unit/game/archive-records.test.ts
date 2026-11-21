import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { ALLOWED_LICENCES, ARCHIVE_RECORDS, ARCHIVE_SPECS, CRATES, PD_LAST_YEAR, archiveStock, archiveUrl, linerFor } from '@/game/archiveRecords';
import { ARCHIVE_KEEP, RecordSource, type BufferContext, type RecordDef } from '@/game/records';
import { Inventory, INVENTORY_KEY } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import { sleeveSvg } from '@/ui/sleeve';
import { linerLines } from '@/ui/LinerNote';

describe('archive crate catalogue', () => {
  it('has 24 to 40 records with unique ids and sane prices', () => {
    expect(ARCHIVE_SPECS.length).toBeGreaterThanOrEqual(24);
    expect(ARCHIVE_SPECS.length).toBeLessThanOrEqual(40);
    expect(new Set(ARCHIVE_SPECS.map((s) => s.id)).size).toBe(ARCHIVE_SPECS.length);
    expect(new Set(ARCHIVE_SPECS.map((s) => `${s.artist}|${s.title}`)).size).toBe(ARCHIVE_SPECS.length);
    for (const s of ARCHIVE_SPECS) { expect(s.price).toBeGreaterThanOrEqual(8); expect(s.price).toBeLessThanOrEqual(40); expect(s.bpm).toBeGreaterThan(60); expect(s.bpm).toBeLessThan(180); }
  });
  it('rarity sets price: grails cost more than commons', () => {
    const avg = (r: string) => { const l = ARCHIVE_SPECS.filter((s) => s.rarity === r); return l.reduce((a, s) => a + s.price, 0) / Math.max(1, l.length); };
    expect(avg('grail')).toBeGreaterThan(avg('rare')); expect(avg('rare')).toBeGreaterThan(avg('uncommon')); expect(avg('uncommon')).toBeGreaterThan(avg('common'));
  });
  it('every record has a full liner note with source, licence and licence text', () => {
    for (const s of ARCHIVE_SPECS) {
      const l = s.liner;
      expect(l.performer.length).toBeGreaterThan(3); expect(l.title.length).toBeGreaterThan(2); expect(l.recorded.length).toBeGreaterThan(5);
      expect(l.sourceUrl).toMatch(/^https:\/\/archive\.org\/details\/[\w.\-]+$/);
      expect(ALLOWED_LICENCES).toContain(l.licence);
      expect(l.licenceText.length).toBeGreaterThan(40);
    }
  });
  it('no licence outside the allowed set, no NC or ND, and public-domain records are 1925 or earlier', () => {
    for (const s of ARCHIVE_SPECS) {
      expect(s.liner.licence).not.toMatch(/NC|ND/);
      if (s.liner.licence === 'PD-US') expect(s.liner.year).toBeLessThanOrEqual(PD_LAST_YEAR);
    }
  });
  it('invented artists and titles never copy the real credit', () => {
    for (const s of ARCHIVE_SPECS) {
      expect(s.artist.toLowerCase()).not.toContain(s.liner.performer.toLowerCase());
      expect(s.title.toLowerCase()).not.toBe(s.liner.title.toLowerCase());
      expect(s.artist).not.toMatch(/Armstrong|Bessie|Gershwin|Whiteman|Waller|Oliver|Henderson|Mamie/i);
    }
  });
  it('crates cover every record and the beat-matched flag is explicit', () => {
    const ids = new Set(CRATES.map((c) => c.id));
    for (const s of ARCHIVE_SPECS) { expect(ids.has(s.genre)).toBe(true); expect(typeof s.beatMatched).toBe('boolean'); }
    expect(ARCHIVE_SPECS.some((s) => s.beatMatched)).toBe(true);
    expect(ARCHIVE_SPECS.some((s) => !s.beatMatched)).toBe(true);
  });
  it('records map to defs the shop, the decks and the save can use', () => {
    expect(ARCHIVE_RECORDS).toHaveLength(ARCHIVE_SPECS.length);
    for (const d of ARCHIVE_RECORDS) { expect(d.kind).toBe('archive'); expect(d.id.startsWith('arc:')).toBe(true); expect(linerFor(d)).toBeDefined(); expect(linerLines(d).join(' ')).toContain('Licence'); }
  });
  it('is hosted-only: the single-file build falls back to the synthesised records', () => {
    expect(archiveStock(false)).toHaveLength(0);
    expect(archiveStock(true)).toHaveLength(ARCHIVE_SPECS.length);
  });
  it('every clip file exists under public/records, small, and the whole crate is under 20 MB', () => {
    let total = 0;
    for (const s of ARCHIVE_SPECS) { const f = `public/records/${s.id}.mp3`; expect(existsSync(f), f).toBe(true); const n = statSync(f).size; expect(n).toBeLessThan(1_000_000); total += n; }
    expect(total).toBeLessThan(20_000_000);
  });
  it('the builder script lists exactly the same clips', () => {
    const py = readFileSync('scripts/records/crate.py', 'utf8');
    const ids = [...py.matchAll(/^ \('(ia-[a-z0-9-]+)'/gm)].map((m) => m[1]);
    expect(new Set(ids)).toEqual(new Set(ARCHIVE_SPECS.map((s) => s.id)));
  });
  it('clip urls are relative to the page', () => { expect(archiveUrl('ia-castle')).toMatch(/records\/ia-castle\.mp3$/); });
});

describe('sleeves', () => {
  it('are deterministic and use only the two project fonts', () => {
    for (const d of [...ARCHIVE_RECORDS, ...PROCEDURAL_RECORDS]) {
      const a = sleeveSvg(d); expect(sleeveSvg(d)).toBe(a);
      expect(a.startsWith('<svg')).toBe(true); expect(a.endsWith('</svg>')).toBe(true);
      for (const m of a.matchAll(/font-family="([^"]+)"/g)) expect(m[1]).toMatch(/^(Anton|'Barlow Condensed')/);
    }
  });
  it('differ between records and between styles', () => {
    const set = new Set(ARCHIVE_RECORDS.map((d) => sleeveSvg(d)));
    expect(set.size).toBe(ARCHIVE_RECORDS.length);
    const styles = new Set(ARCHIVE_RECORDS.map((d) => /sleeve-(\w+)/.exec(sleeveSvg(d))![1]));
    expect(styles.size).toBeGreaterThanOrEqual(2);
    expect(/sleeve-sticker/.test(sleeveSvg(PROCEDURAL_RECORDS[0]))).toBe(true);
  });
  it('escape text so a title cannot break the markup', () => {
    const d: RecordDef = { ...ARCHIVE_RECORDS[0], title: '<b>"x" & y</b>' };
    expect(sleeveSvg(d)).not.toContain('<b>');
  });
});

const ctx = (log: string[]): BufferContext => ({
  sampleRate: 4000,
  createBuffer: (c, l, r) => { const ch = Array.from({ length: c }, () => new Float32Array(l)); return { duration: l / r, length: l, numberOfChannels: c, sampleRate: r, getChannelData: (i: number) => ch[i] } as unknown as AudioBuffer; },
  decodeAudioData: async () => { log.push('decode'); return { duration: 80, length: 10, numberOfChannels: 1, sampleRate: 4000, getChannelData: () => new Float32Array(10) } as unknown as AudioBuffer; },
});

describe('RecordSource with archive records', () => {
  it('fetches the clip by url, decodes it, caches it, and keeps only a few decoded', async () => {
    const urls: string[] = []; const log: string[] = [];
    const src = new RecordSource(ctx(log), () => undefined, async (u) => { urls.push(u); return new ArrayBuffer(8); });
    expect(src.available(ARCHIVE_RECORDS[0])).toBe(true);
    for (let i = 0; i < ARCHIVE_KEEP + 3; i++) expect(await src.load(ARCHIVE_RECORDS[i])).not.toBeNull();
    expect(urls[0]).toMatch(/records\/ia-castle\.mp3$/);
    expect(src.archiveHeld).toBe(ARCHIVE_KEEP);
    await src.load(ARCHIVE_RECORDS[ARCHIVE_KEEP + 2]); // still cached: no new fetch
    expect(urls).toHaveLength(ARCHIVE_KEEP + 3);
    await src.load(ARCHIVE_RECORDS[0]); // released earlier: fetched again
    expect(urls).toHaveLength(ARCHIVE_KEEP + 4);
  });
  it('a failed fetch is not remembered: the next try fetches again', async () => {
    let n = 0;
    const src = new RecordSource(ctx([]), () => undefined, async () => { n++; if (n === 1) throw new Error('offline'); return new ArrayBuffer(8); });
    expect(await src.load(ARCHIVE_RECORDS[1])).toBeNull();
    await Promise.resolve();
    expect(await src.load(ARCHIVE_RECORDS[1])).not.toBeNull();
    expect(n).toBe(2);
  });
  it('measure returns the catalogue tempo without decoding', async () => {
    const log: string[] = [];
    const src = new RecordSource(ctx(log), () => undefined, async () => new ArrayBuffer(8));
    expect(await src.measure(ARCHIVE_RECORDS[0])).toBe(ARCHIVE_RECORDS[0].bpm);
    expect(log).toHaveLength(0);
  });
});

describe('save compatibility', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };
  it('an old save (records without archive fields) still loads', () => {
    const st = mem();
    st.setItem(INVENTORY_KEY, JSON.stringify({ v: 1, cash: 77, records: [PROCEDURAL_RECORDS[0], { id: 'lib:x', title: 'T', artist: 'Your collection', genre: 'house', price: 0, bpm: 124, colors: ['#111', '#222'], kind: 'library', ref: 'x' }], items: {}, flags: ['a'] }));
    const inv = new Inventory(PROCEDURAL_RECORDS, st);
    expect(inv.cash).toBe(77); expect(inv.records.map((r) => r.id)).toEqual(['wax-01', 'lib:x']);
  });
  it('an archive record bought, saved and reloaded keeps its liner note and tempo flag', () => {
    const st = mem();
    const a = new Inventory(PROCEDURAL_RECORDS, st);
    a.add(200);
    expect(a.buy(ARCHIVE_RECORDS[5])).toBe('ok');
    const b = new Inventory(PROCEDURAL_RECORDS, st);
    const back = b.getRecord(ARCHIVE_RECORDS[5].id)!;
    expect(back.kind).toBe('archive'); expect(back.beatMatched).toBe(ARCHIVE_RECORDS[5].beatMatched); expect(linerFor(back)).toBeDefined();
  });
});
