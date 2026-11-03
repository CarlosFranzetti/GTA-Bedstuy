import { describe, expect, it } from 'vitest';
import { Inventory, INVENTORY_KEY, START_CASH, type InventoryStorage } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';

function mem(): InventoryStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

describe('Inventory', () => {
  it('starts with cash and the starter records', () => {
    const inv = new Inventory(PROCEDURAL_RECORDS, mem());
    expect(inv.cash).toBe(START_CASH);
    expect(inv.records.map((r) => r.id)).toEqual(['wax-01', 'wax-02']);
  });
  it('add and spend keep the cash maths straight', () => {
    const inv = new Inventory(PROCEDURAL_RECORDS, mem());
    inv.add(80);
    expect(inv.cash).toBe(START_CASH + 80);
    expect(inv.spend(50)).toBe(true);
    expect(inv.cash).toBe(START_CASH + 30);
    expect(inv.spend(10_000)).toBe(false);
    expect(inv.cash).toBe(START_CASH + 30);
    expect(inv.spend(-5)).toBe(false);
    inv.add(-10_000);
    expect(inv.cash).toBe(0);
    inv.add(Number.NaN);
    expect(inv.cash).toBe(0);
  });
  it('buys a record once, refuses when poor, sells at half', () => {
    const inv = new Inventory(PROCEDURAL_RECORDS, mem());
    const r = PROCEDURAL_RECORDS[6]; // $20
    expect(inv.buy(r)).toBe('ok');
    expect(inv.cash).toBe(START_CASH - 20);
    expect(inv.buy(r)).toBe('owned');
    expect(inv.sell(r.id)).toBe(10);
    expect(inv.cash).toBe(START_CASH - 10);
    expect(inv.hasRecord(r.id)).toBe(false);
    expect(inv.sell(r.id)).toBe(-1);
    inv.add(-inv.cash);
    expect(inv.buy(r)).toBe('poor');
  });
  it('persists cash, records, items and flags, and survives garbage', () => {
    const st = mem();
    const a = new Inventory(PROCEDURAL_RECORDS, st);
    a.add(33); a.buy(PROCEDURAL_RECORDS[4]); a.giveItem('keycard', 2); a.setFlag('aftersloth.unlocked');
    const b = new Inventory(PROCEDURAL_RECORDS, st);
    expect(b.cash).toBe(a.cash);
    expect(b.hasRecord('wax-05')).toBe(true);
    expect(b.itemCount('keycard')).toBe(2);
    expect(b.hasFlag('aftersloth.unlocked')).toBe(true);
    st.data.set(INVENTORY_KEY, '{nope');
    expect(new Inventory(PROCEDURAL_RECORDS, st).cash).toBe(START_CASH);
    st.data.set(INVENTORY_KEY, JSON.stringify({ v: 1, cash: 'x' }));
    expect(new Inventory(PROCEDURAL_RECORDS, st).cash).toBe(START_CASH);
  });
  it('works with storage that throws', () => {
    const bad: InventoryStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
    const inv = new Inventory(PROCEDURAL_RECORDS, bad);
    inv.add(5);
    expect(inv.cash).toBe(START_CASH + 5);
  });
  it('items and change listeners', () => {
    const inv = new Inventory([], null);
    let n = 0; const off = inv.onChange(() => { n++; });
    inv.giveItem('x'); expect(inv.takeItem('x', 2)).toBe(false); expect(inv.takeItem('x')).toBe(true);
    expect(n).toBe(2); off(); inv.add(1); expect(n).toBe(2);
  });
});
