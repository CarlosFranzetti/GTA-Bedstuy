// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ShopUi } from '@/ui/ShopUi';
import { Inventory, START_CASH } from '@/game/Inventory';
import { PROCEDURAL_RECORDS, RecordSource, type BufferContext } from '@/game/records';

const ctx: BufferContext = {
  sampleRate: 4000,
  createBuffer: (c, l, r) => { const ch = Array.from({ length: c }, () => new Float32Array(l)); return { duration: l / r, length: l, getChannelData: (i: number) => ch[i] } as unknown as AudioBuffer; },
  decodeAudioData: async () => ctx.createBuffer(1, 10, 4000),
};

function make() {
  const parent = document.createElement('div'); document.body.appendChild(parent);
  const inventory = new Inventory(PROCEDURAL_RECORDS, null);
  const events: Array<[string, unknown]> = [];
  const preview = { play: vi.fn(), stop: vi.fn() };
  const shop = new ShopUi(parent, {
    inventory, stock: PROCEDURAL_RECORDS, source: new RecordSource(ctx), preview, events: { emit: (t, p) => events.push([t, p]) },
    libraryTracks: () => [{ id: 't1', name: 'Lib Song', path: 'dub/lib.mp3' }],
  });
  return { parent, inventory, events, preview, shop };
}

describe('ShopUi', () => {
  it('opens, renders 12 bins with prices, closes', () => {
    const { shop, parent } = make();
    expect(shop.root.hidden).toBe(true);
    shop.open();
    expect(shop.isOpen).toBe(true);
    expect(parent.querySelectorAll('.shop-card').length).toBe(12);
    expect(parent.querySelector('.shop-cash')?.textContent).toBe(`$${START_CASH}`);
    shop.close();
    expect(shop.root.hidden).toBe(true);
  });
  it('buys with cash, emits shop:bought, refuses when poor or owned', () => {
    const { shop, inventory, events } = make();
    shop.open();
    expect(shop.buy('wax-07')).toBe('ok');
    expect(inventory.cash).toBe(START_CASH - 20);
    expect(events[0]).toEqual(['shop:bought', { recordId: 'wax-07', price: 20, shop: 'wax-deli' }]);
    expect(shop.buy('wax-07')).toBe('owned');
    inventory.add(-inventory.cash);
    expect(shop.buy('wax-12')).toBe('poor');
    expect(inventory.hasRecord('wax-12')).toBe(false);
  });
  it('the Buy button in the DOM buys; sell via the crate tab pays half', () => {
    const { shop, parent, inventory } = make();
    shop.open();
    const buy = [...parent.querySelectorAll<HTMLButtonElement>('.shop-card .shop-primary')].find((b) => b.textContent === 'Buy $12'); // wax-01 is owned so first buyable $12... find any
    const any = buy ?? parent.querySelector<HTMLButtonElement>('.shop-card .shop-primary')!;
    const before = inventory.cash; any.click();
    expect(inventory.cash).toBeLessThan(before);
    (parent.querySelectorAll<HTMLButtonElement>('.shop-tab')[1]).click();
    const sells = [...parent.querySelectorAll<HTMLButtonElement>('.shop-card .shop-btn')].filter((b) => b.textContent?.startsWith('Sell'));
    expect(sells.length).toBe(inventory.records.length);
    const c = inventory.cash; const rec = inventory.records[0];
    sells[0].click();
    expect(inventory.cash).toBe(c + Math.floor(rec.price / 2));
  });
  it('sell returns half the price (rounded down) and -1 for unknown', () => {
    const { shop, inventory } = make();
    expect(shop.sell('nope')).toBe(-1);
    inventory.buy(PROCEDURAL_RECORDS[3]); // $16
    const c = inventory.cash;
    expect(shop.sell('wax-04')).toBe(8);
    expect(inventory.cash).toBe(c + 8);
  });
  it('previews 20 s on the preview deck', async () => {
    const { shop, preview } = make();
    expect(await shop.preview('wax-05')).toBe(true);
    expect(preview.play).toHaveBeenCalledTimes(1);
    shop.stopPreview();
    expect(preview.stop).toHaveBeenCalled();
  });
  it('presses a library file for free, once', () => {
    const { shop, inventory } = make();
    const n = inventory.records.length;
    expect(shop.press({ id: 't1', name: 'Lib Song', path: 'dub/lib.mp3' })).toBe(true);
    expect(inventory.records.length).toBe(n + 1);
    expect(inventory.getRecord('lib:t1')).toMatchObject({ price: 0, genre: 'dub', kind: 'library' });
    expect(shop.press({ id: 't1', name: 'Lib Song' })).toBe(false);
  });
  it('Escape closes the panel', () => {
    const { shop } = make();
    shop.open();
    shop.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shop.isOpen).toBe(false);
  });
});
