// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RackPanel, resaleGuess } from '@/ui/story/RackPanel';
import { PanelManager } from '@/ui/PanelManager';
import { Nightlife } from '@/game/story/nightlife';
import { BAG_MAX, MARKETS, priceOf, type Garment } from '@/game/story/thrift';

const key = (code: string): KeyboardEvent => { const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }); window.dispatchEvent(e); return e; };
let panels: RackPanel[] = [];
function rig(cash = 200, o: { panels?: PanelManager } = {}) {
  const nl = new Nightlife(); const wallet = { v: cash };
  const onChange = vi.fn();
  const p = new RackPanel(document.body, nl, { canPay: (n) => wallet.v >= n, pay: (n) => { wallet.v += n; }, cash: () => wallet.v }, { onChange, ...o });
  panels.push(p);
  return { nl, wallet, p, onChange };
}
afterEach(() => { panels.forEach((p) => p.dispose()); panels = []; document.body.className = ''; document.body.replaceChildren(); });

describe('RackPanel', () => {
  it('opens a rack, lists what is on it with prices and a resale guess, and refuses an unknown rack', () => {
    const { nl, p } = rig();
    expect(p.openRack('nope')).toBe(false); expect(p.isOpen).toBe(false);
    expect(p.openRack('rack-a', 50)).toBe(true); expect(p.isOpen).toBe(true);
    const rows = p.root.querySelectorAll('.rack-body .rack-item');
    expect(rows.length).toBe(nl.racks.get('rack-a')!.available.length);
    expect(p.root.textContent).toContain('Worth up to $');
    expect(p.root.querySelector('.rack-sub')!.textContent).toContain('Bag 0 of 4');
    expect(p.root.querySelector('.rack-sub')!.textContent).toContain('$50');
  });
  it('buying moves cash, fills the bag, takes the piece off the rack and shows what it fetches by place', () => {
    const { nl, p, wallet, onChange } = rig();
    p.openRack('rack-a');
    const g = nl.racks.get('rack-a')!.available[0];
    expect(p.buy(g.id)).toBe('ok');
    expect(wallet.v).toBe(200 - g.buy);
    expect(nl.bag.items.map((x) => x.id)).toEqual([g.id]);
    expect(nl.racks.get('rack-a')!.available.some((x) => x.id === g.id)).toBe(false);
    expect(onChange).toHaveBeenCalled();
    const bagText = p.root.textContent ?? '';
    expect(bagText).toContain('In your bag');
    expect(bagText).toMatch(/(Vintage stall|Consignment shop|A friend|Pawn counter|club line)/);
  });
  it('keeps to the budget, the bag size and the wallet', () => {
    const a = rig(5); a.p.openRack('rack-a');
    const cheap = a.nl.racks.get('rack-a')!.available.find((g) => g.buy > 5)!;
    expect(a.p.buy(cheap.id)).toBe('poor'); expect(a.wallet.v).toBe(5);
    const b = rig(500); b.p.openRack('rack-a', 1);
    expect(b.p.buy(b.nl.racks.get('rack-a')!.available[0].id)).toBe('budget'); expect(b.nl.bag.items.length).toBe(0);
    const c = rig(5000); c.p.openRack('rack-a');
    for (const g of [...c.nl.racks.get('rack-a')!.available].slice(0, BAG_MAX)) expect(c.p.buy(g.id)).toBe('ok');
    expect(c.p.buy(c.nl.racks.get('rack-a')!.available[0].id)).toBe('full');
    expect(c.nl.bag.items.length).toBe(BAG_MAX);
  });
  it('keys: W and S pick, Enter buys, X closes; the Buy button works by click', () => {
    const { nl, p } = rig(); p.openRack('rack-a');
    const first = nl.racks.get('rack-a')!.available;
    key('KeyS'); key('Enter');
    expect(nl.bag.items[0].id).toBe(first[1].id);
    (p.root.querySelector('.rack-btn') as HTMLButtonElement).click();
    expect(nl.bag.items.length).toBe(2);
    key('KeyX'); expect(p.isOpen).toBe(false);
  });
  it('is a PanelManager panel: Esc goes back (closes) and the input gate follows', () => {
    const input = { blocked: false, requestLock: vi.fn() };
    const pm = new PanelManager(document, { input, canOpenPause: () => false, relockOnClose: false });
    const { p } = rig(200, { panels: pm });
    p.openRack('rack-a');
    expect(pm.isOpen('rack')).toBe(true); expect(input.blocked).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    expect(p.isOpen).toBe(false); expect(pm.isOpen('rack')).toBe(false);
    pm.dispose();
  });
  it('resaleGuess lists every place, best first, zero where the piece is too worn', () => {
    const g: Garment = { id: 'x', slot: 'layer', item: 'cardigan', way: 0, tier: 'vintage', condition: 0.36, buy: 8, label: 'old cardigan' };
    const r = resaleGuess(g);
    expect(r.length).toBe(Object.keys(MARKETS).length);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].price).toBeGreaterThanOrEqual(r[i].price);
    expect(r.find((x) => x.id === 'stall')!.price).toBe(0); // condition under the stall's floor
    expect(r.find((x) => x.id === 'pawn')!.price).toBe(priceOf(g, MARKETS.pawn));
  });
});
