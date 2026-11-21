// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ShopUi } from '@/ui/ShopUi';
import { Inventory } from '@/game/Inventory';
import { ARCHIVE_RECORDS, ARCHIVE_SPECS } from '@/game/archiveRecords';
import { PROCEDURAL_RECORDS, RecordSource, type BufferContext } from '@/game/records';

const ctx: BufferContext = {
  sampleRate: 4000,
  createBuffer: (c, l, r) => { const ch = Array.from({ length: c }, () => new Float32Array(l)); return { duration: l / r, length: l, getChannelData: (i: number) => ch[i] } as unknown as AudioBuffer; },
  decodeAudioData: async () => ctx.createBuffer(1, 10, 4000),
};
function make() {
  const parent = document.createElement('div'); document.body.appendChild(parent);
  const inventory = new Inventory(PROCEDURAL_RECORDS, null); inventory.add(500);
  const events: Array<[string, unknown]> = [];
  const preview = { play: vi.fn(), stop: vi.fn() };
  const fetched: string[] = [];
  const source = new RecordSource(ctx, () => undefined, async (u) => { fetched.push(u); return new ArrayBuffer(4); });
  const shop = new ShopUi(parent, { inventory, stock: PROCEDURAL_RECORDS, source, preview, events: { emit: (t, p) => events.push([t, p]) }, archive: ARCHIVE_RECORDS });
  return { parent, inventory, events, preview, shop, fetched };
}

describe('ShopUi archive crate', () => {
  it('lists synth and archive bins with crate chips, sleeves and the own-files line', () => {
    const { shop, parent } = make(); shop.open();
    expect(parent.querySelectorAll('.shop-card').length).toBe(PROCEDURAL_RECORDS.length + ARCHIVE_SPECS.length);
    expect(parent.querySelectorAll('.shop-chip').length).toBe(2 + 5 + 1); // all, synth, five crates, listening post
    expect(parent.querySelectorAll('.shop-cover svg').length).toBe(PROCEDURAL_RECORDS.length + ARCHIVE_SPECS.length);
    expect(parent.querySelector('.shop-note')?.textContent).toMatch(/src\/assets\/records/);
  });
  it('a crate chip and the C key filter the bins', () => {
    const { shop, parent } = make(); shop.open();
    const chip = [...parent.querySelectorAll<HTMLButtonElement>('.shop-chip')].find((b) => b.textContent === 'Pre-war dance floor')!; chip.click();
    expect(parent.querySelectorAll('.shop-card').length).toBe(ARCHIVE_SPECS.filter((s) => s.genre === 'prewar').length);
    shop.cycleCrate(); // prewar -> listening post
    expect(shop.crateFilter).toBe('post');
  });
  it('buys an archive record, previews it by fetching the clip, and sells it back', async () => {
    const { shop, inventory, events, fetched, preview } = make(); shop.open();
    const def = ARCHIVE_RECORDS[0]; const second = ARCHIVE_RECORDS[1];
    expect(shop.buy(def.id)).toBe('ok');
    expect(inventory.hasRecord(def.id)).toBe(true); expect(events[0][0]).toBe('shop:bought');
    expect(await shop.preview(ARCHIVE_RECORDS[1].id)).toBe(true);
    expect(fetched[0]).toMatch(new RegExp(`records/${second.ref}\\.mp3$`)); expect(preview.play).toHaveBeenCalled();
    expect(shop.sell(def.id)).toBe(Math.floor(def.price / 2));
  });
  it('the liner note opens with the true credits and the licence, and Esc closes the note first', () => {
    const { shop, parent } = make(); shop.open();
    const idx = PROCEDURAL_RECORDS.length + 1; // second archive record
    (parent.querySelectorAll('.shop-card')[idx].querySelector('.shop-btn') as HTMLButtonElement).click();
    expect(shop.linerOpen).toBe(true);
    const text = parent.querySelector('.liner')!.textContent!;
    const l = ARCHIVE_SPECS[1].liner;
    expect(text).toContain(l.performer); expect(text).toContain(l.title); expect(text).toContain(l.licence); expect(text).toContain('archive.org'); expect(text).toContain('Credit:');
    expect(parent.querySelector('.liner a')?.getAttribute('rel')).toContain('noopener');
    shop.navigate('back');
    expect(shop.linerOpen).toBe(false); expect(shop.isOpen).toBe(true);
  });
  it('offline: a failed clip fetch says so instead of crashing', async () => {
    const parent = document.createElement('div'); document.body.appendChild(parent);
    const inventory = new Inventory(PROCEDURAL_RECORDS, null);
    const shop = new ShopUi(parent, { inventory, stock: PROCEDURAL_RECORDS, source: new RecordSource(ctx, () => undefined, async () => { throw new Error('offline'); }), preview: { play: vi.fn(), stop: vi.fn() }, archive: ARCHIVE_RECORDS });
    shop.open();
    expect(await shop.preview(ARCHIVE_RECORDS[0].id)).toBe(false);
    expect(parent.querySelector('.shop-status')?.textContent).toMatch(/offline/);
  });
});
