// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopUi, CONFIRM_MS } from '@/ui/ShopUi';
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

describe('ShopUi H7 fixes', () => {
  afterEach(() => { vi.useRealTimers(); });
  const key = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Enter' ? 'Enter' : code, bubbles: true, cancelable: true }));
  const statusOf = (parent: HTMLElement) => parent.querySelector('.shop-status')!.textContent!;

  it('selling by Enter needs a second Enter within 3 s', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const { shop, inventory, parent } = make();
    shop.open();
    const n = inventory.records.length; const c = inventory.cash;
    shop.navigate('right'); // Your crate
    shop.navigate('confirm');
    expect(inventory.records.length).toBe(n);
    expect(statusOf(parent)).toMatch(/Sell ".+" for \$\d+\? Enter again \/ Esc/);
    vi.setSystemTime(1000 + CONFIRM_MS - 100);
    shop.navigate('confirm');
    expect(inventory.records.length).toBe(n - 1);
    expect(inventory.cash).toBeGreaterThan(c);
  });
  it('the sell confirm expires after 3 s and Esc cancels without closing', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const { shop, inventory } = make();
    shop.open(); shop.navigate('right');
    const n = inventory.records.length;
    shop.navigate('confirm');
    vi.setSystemTime(1000 + CONFIRM_MS + 50);
    shop.navigate('confirm'); // too late: re-arms, no sale
    expect(inventory.records.length).toBe(n);
    key('Escape');
    expect(shop.isOpen).toBe(true);
    expect(shop.pendingConfirm).toBe(false);
    shop.navigate('confirm'); shop.navigate('down'); shop.navigate('up'); shop.navigate('confirm'); // moving cancels the arm
    expect(inventory.records.length).toBe(n);
    key('Escape'); expect(shop.isOpen).toBe(false);
  });
  it('mouse click on Sell stays instant', () => {
    const { shop, parent, inventory } = make();
    shop.open(); shop.navigate('right');
    const n = inventory.records.length;
    [...parent.querySelectorAll<HTMLButtonElement>('.shop-card .shop-btn')].find((b) => b.textContent?.startsWith('Sell'))!.click();
    expect(inventory.records.length).toBe(n - 1);
  });
  it('buying is one Enter while cash stays comfortable, two when it would leave under $10', () => {
    const { shop, inventory } = make();
    shop.open();
    const first = PROCEDURAL_RECORDS.find((r) => !inventory.hasRecord(r.id))!;
    shop.navigate('confirm');
    expect(inventory.hasRecord(first.id)).toBe(true);
    // now nearly broke: price > cash - 10
    const next = PROCEDURAL_RECORDS.find((r) => !inventory.hasRecord(r.id))!;
    inventory.add(-inventory.cash + next.price + 5);
    shop.navigate('down'); // may land elsewhere; select the next unowned row explicitly
    shop.close(); shop.open();
    expect(inventory.cash).toBe(next.price + 5);
    shop.navigate('confirm');
    expect(inventory.hasRecord(next.id)).toBe(false);
    shop.navigate('confirm');
    expect(inventory.hasRecord(next.id)).toBe(true);
  });
  it('the highlight starts on the first purchasable row and Enter on an owned row does not eat the next Enter', () => {
    const { shop, inventory, parent } = make();
    shop.open();
    const firstOwned = PROCEDURAL_RECORDS.findIndex((r) => inventory.hasRecord(r.id));
    const firstFree = PROCEDURAL_RECORDS.findIndex((r) => !inventory.hasRecord(r.id));
    expect(firstOwned).toBeGreaterThanOrEqual(0);
    const cards = [...parent.querySelectorAll('.shop-card')];
    expect(cards[firstFree].classList.contains('sel')).toBe(true);
    // go up to an owned row: the line shows, and one Enter later we still act on the highlighted row
    while (!cards.some((c, i) => c.classList.contains('sel') && inventory.hasRecord(PROCEDURAL_RECORDS[i].id))) shop.navigate('up');
    shop.navigate('confirm');
    expect(statusOf(parent)).toBe('You already own that one.');
    expect(shop.pendingConfirm).toBe(false);
  });
  it('shows "n of N" and arrows, and keeps it in step with the highlight', () => {
    const { shop, parent } = make();
    shop.open();
    const count = () => parent.querySelector('.shop-count')!.textContent!;
    const total = parent.querySelectorAll('.shop-card').length;
    expect(count()).toContain(`of ${total}`);
    while (!count().startsWith(`${total} of`) && !count().includes(`${total} of`)) shop.navigate('down');
    expect(count()).toContain('\u25B2');
    expect(count()).not.toContain('\u25BC');
    for (let i = 0; i < total; i++) shop.navigate('up');
    expect(count()).toMatch(/^1 of \d+ \u25BC$/);
  });
  it('scrolls the highlighted row into view', () => {
    const { shop, parent } = make();
    shop.open();
    const cards = [...parent.querySelectorAll<HTMLElement>('.shop-card')];
    const spy = vi.fn(); cards[cards.length - 1].scrollIntoView = spy;
    for (let i = 0; i < cards.length; i++) shop.navigate('down');
    expect(spy).toHaveBeenCalled();
  });
  it('Q / E switch tabs, V previews, E no longer previews, hint says so', async () => {
    const { shop, parent, preview } = make();
    shop.open();
    const tab = () => parent.querySelector('.shop-tab.on')!.textContent;
    expect(tab()).toBe('Bins');
    key('KeyE'); expect(tab()).toBe('Your crate');
    expect(preview.play).not.toHaveBeenCalled();
    key('KeyQ'); expect(tab()).toBe('Bins');
    key('KeyV'); await Promise.resolve(); await Promise.resolve();
    expect(parent.querySelector('.shop-hint')!.textContent).toMatch(/Q \/ E tabs/);
    expect(parent.querySelector('.shop-hint')!.textContent).toMatch(/V preview/);
    expect(parent.querySelector('.shop-hint')!.textContent).not.toMatch(/E preview/);
  });
});
