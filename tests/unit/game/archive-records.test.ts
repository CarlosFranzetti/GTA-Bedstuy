import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { ALLOWED_LICENCES, ARCHIVE_RECORDS, ARCHIVE_SPECS, CRATES, PD_LAST_YEAR, archiveStock, archiveUrl, linerFor } from '@/game/archiveRecords';
import { LISTENING_POST, postEmbedSrc } from '@/game/listeningPost';
import { WITHDRAWN_ARCHIVE_REFS, WITHDRAWN_SYNTH_IDS, splitWithdrawn } from '@/game/recordsWithdrawn';
import { applySave } from '@/ui/GameSave';
import { ARCHIVE_KEEP, RecordSource, type BufferContext, type RecordDef } from '@/game/records';
import { Inventory, INVENTORY_KEY } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import { sleeveSvg } from '@/ui/sleeve';
import { linerLines } from '@/ui/LinerNote';

describe('archive crate catalogue', () => {
  it('has 24 to 40 records with unique ids and sane prices', () => {
    expect(ARCHIVE_SPECS.length).toBeGreaterThanOrEqual(24);
    expect(ARCHIVE_SPECS.length).toBeLessThanOrEqual(40);
    expect(ARCHIVE_SPECS.filter((s) => s.genre === 'prewar')).toHaveLength(10);
    expect(new Set(ARCHIVE_SPECS.map((s) => s.id)).size).toBe(ARCHIVE_SPECS.length);
    expect(new Set(ARCHIVE_SPECS.map((s) => `${s.artist}|${s.title}`)).size).toBe(ARCHIVE_SPECS.length);
    for (const s of ARCHIVE_SPECS) { expect(s.price).toBeGreaterThanOrEqual(8); expect(s.price).toBeLessThanOrEqual(40); expect(s.bpm).toBeGreaterThan(90); expect(s.bpm).toBeLessThan(180); }
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
      expect(l.sourceName.length).toBeGreaterThan(3);
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
  it('the dance crate: only CC BY, CC BY-SA or CC0, 1980 to 2025, with attribution, changes and a check tier', () => {
    const dance = ARCHIVE_SPECS.filter((s) => s.genre !== 'prewar');
    expect(dance.length).toBeGreaterThanOrEqual(15);
    for (const s of dance) {
      const l = s.liner;
      expect(l.licence, s.id).toMatch(/^(CC0-1\.0|CC-BY-\d\.\d|CC-BY-SA-\d\.\d)$/);
      expect(l.year).toBeGreaterThanOrEqual(1980); expect(l.year).toBeLessThanOrEqual(2025);
      expect(l.attribution, s.id).toContain(l.performer); expect(l.attribution).toContain(l.sourceUrl);
      expect(l.changes).toMatch(/clipped to 60 seconds/); expect(l.changes).toMatch(/re-encoded/);
      if (l.licence.includes('-SA-')) expect(l.changes).toMatch(/same licence/);
      expect(['A', 'B']).toContain(l.checked);
      expect(l.licenceText).toMatch(/licence field/i);
    }
  });
  it('tempo sits in the genre guide range (house 118 to 128, electro 128 to 140, breaks 128 to 140, disco 112 to 140)', () => {
    const range: Record<string, [number, number]> = { house: [118, 128], electro: [128, 140], breaks: [128, 140], disco: [112, 140] };
    for (const s of ARCHIVE_SPECS) { const r = range[s.genre]; if (r) { expect(s.bpm, s.id).toBeGreaterThanOrEqual(r[0]); expect(s.bpm, s.id).toBeLessThanOrEqual(r[1]); } }
  });
  it('the withdrawn records are gone from the catalogue and from disk', () => {
    const refs = new Set(ARCHIVE_SPECS.map((s) => s.id));
    for (const w of WITHDRAWN_ARCHIVE_REFS) { expect(refs.has(w), w).toBe(false); expect(existsSync(`public/records/${w}.mp3`), w).toBe(false); }
    for (const id of WITHDRAWN_SYNTH_IDS) expect(PROCEDURAL_RECORDS.some((r) => r.id === id)).toBe(false);
    expect(PROCEDURAL_RECORDS.every((r) => ['hiphop', 'house', 'disco', 'techno', 'breaks', 'electro'].includes(r.genre))).toBe(true);
  });
  it('invented artists and titles never copy the real credit', () => {
    for (const s of ARCHIVE_SPECS) {
      expect(s.artist.toLowerCase()).not.toContain(s.liner.performer.toLowerCase());
      expect(s.title.toLowerCase()).not.toBe(s.liner.title.toLowerCase());
      expect(s.artist).not.toMatch(/Armstrong|Bessie|Gershwin|Whiteman|Waller|Oliver|Henderson|Mamie|Kompakt|Daft|Aquatone|Pasquale|Boogie|Redmann|Beat Doctor/i);
      expect(s.label).not.toMatch(/Toucan|TekTek|Kompakt|Blue Oranges|Get Some|USC|United Studios/i);
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
    for (const d of ARCHIVE_RECORDS) { expect(d.kind).toBe('archive'); expect(d.id.startsWith('arc:')).toBe(true); expect(linerFor(d)).toBeDefined(); expect(linerLines(d).join(' ')).toContain('Licence'); expect(linerLines(d).join(' ')).toContain('Source:'); }
  });
  it('is hosted-only: the single-file build falls back to the synthesised records', () => {
    expect(archiveStock(false)).toHaveLength(0);
    expect(archiveStock(true)).toHaveLength(ARCHIVE_SPECS.length);
  });
  it('every clip file exists under public/records, small, and the whole crate is under 15 MB', () => {
    let total = 0;
    for (const s of ARCHIVE_SPECS) { const f = `public/records/${s.id}.mp3`; expect(existsSync(f), f).toBe(true); const n = statSync(f).size; expect(n).toBeLessThan(1_000_000); total += n; }
    expect(total).toBeLessThan(15_000_000);
  });
  it('the builder script lists exactly the same clips', () => {
    const py = readFileSync('scripts/records/crate.py', 'utf8');
    const ids = [...py.matchAll(/^ \('((?:ia|dc)-[a-z0-9-]+)'/gm)].map((m) => m[1]);
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
    expect(styles.size).toBeGreaterThanOrEqual(3);
    expect(/sleeve-sticker/.test(sleeveSvg(PROCEDURAL_RECORDS[0]))).toBe(true);
  });
  it('each era has its own sleeve: 12-inch, promo, picture sleeve and minimal all paint', () => {
    for (const style of ['twelve', 'promo', 'picture', 'minimal'] as const) {
      const svg = sleeveSvg({ ...ARCHIVE_RECORDS[0], sleeve: style });
      expect(svg).toContain(`sleeve-${style}`);
      for (const m of svg.matchAll(/font-family="([^"]+)"/g)) expect(m[1]).toMatch(/^(Anton|'Barlow Condensed')/);
    }
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
    expect(urls[0]).toMatch(new RegExp(`records/${ARCHIVE_RECORDS[0].ref}\\.mp3$`));
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

describe('listening post', () => {
  it('lists only soundcloud.com track pages from a verified, linked, embeddable official account and builds the official player url', () => {
    for (const t of LISTENING_POST) {
      expect(t.url).toMatch(/^https:\/\/soundcloud\.com\/[\w.-]+\/[\w.-]+$/);
      expect(postEmbedSrc(t.url)).toMatch(/^https:\/\/w\.soundcloud\.com\/player\/\?url=/);
      expect(t.real.year).toBeGreaterThanOrEqual(1980); expect(t.real.year).toBeLessThanOrEqual(2025);
      expect(t.checked).toMatch(/verified/); expect(t.account.site).toMatch(/^https:\/\//);
    }
    expect(postEmbedSrc('https://evil.example/a/b')).toBeNull(); expect(postEmbedSrc('http://soundcloud.com/a/b')).toBeNull(); expect(postEmbedSrc('https://soundcloud.com/a')).toBeNull();
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
  it('a save holding withdrawn records drops them and refunds what was paid, in the inventory and in a game save', () => {
    const old = [
      { id: 'arc:ia-gulf', title: 'Gowanus Canal Blues', artist: 'Gowanus Gertie', genre: 'blues', price: 36, bpm: 90, colors: ['#111', '#222'], kind: 'archive', ref: 'ia-gulf' },
      { id: 'arc:ia-castle', title: 'Stoop Step Rag', artist: 'The Brownstone Society Orchestra', genre: 'ragtime', price: 28, bpm: 100, colors: ['#111', '#222'], kind: 'archive', ref: 'ia-castle' },
      { id: 'wax-07', title: 'Brownstone Blues', artist: 'Mr. Fixture', genre: 'jazz', price: 20, bpm: 96, colors: ['#111', '#222'], kind: 'procedural' },
    ];
    const split = splitWithdrawn(old as never);
    expect(split.refund).toBe(56); expect(split.kept.map((r) => r.id)).toEqual(['arc:ia-castle']);
    const st = mem();
    st.setItem(INVENTORY_KEY, JSON.stringify({ v: 1, cash: 10, records: old, items: {}, flags: [] }));
    const inv = new Inventory(PROCEDURAL_RECORDS, st);
    expect(inv.cash).toBe(66); expect(inv.records.map((r) => r.id)).toEqual(['arc:ia-castle']);
    const live = new Inventory(PROCEDURAL_RECORDS, null);
    applySave(new Proxy({ inventory: live } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : k === 'hands' ? undefined : () => {}) }) as never, { v: 1, cash: 10, inventory: { records: old, items: {}, flags: [] } } as never);
    expect(live.cash).toBe(66); expect(live.hasRecord('arc:ia-gulf')).toBe(false); expect(live.hasRecord('arc:ia-castle')).toBe(true);
  });
});
