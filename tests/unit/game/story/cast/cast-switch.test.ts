import { describe, expect, it } from 'vitest';
import '@/textures/painters/ped';
import { CastSwitcher, type SwitchHost } from '@/game/story/cast/switch';
import type { PlayerLook } from '@/textures/painters/pedRoster';

function rig() {
  const st = { cash: 500, looks: [] as PlayerLook[], moved: [] as string[] };
  const host: SwitchHost = { getCash: () => st.cash, setCash: (n) => { st.cash = n; }, applyLook: (l) => { st.looks.push(l); }, moveHome: (h) => { st.moved.push(h); } };
  const sw = new CastSwitcher(); sw.bind(host);
  return { st, sw };
}
describe('CAST: changing character', () => {
  it('starts as Pedro; only Lana and Adele are playable besides him', () => {
    const { sw } = rig();
    expect(sw.active).toBe('pedro');
    expect(sw.isPlayable('lana')).toBe(true); expect(sw.isPlayable('stavros')).toBe(false);
    expect(sw.switchTo('stavros')).toEqual({ ok: false, reason: 'notPlayable' });
    expect(sw.switchTo('nobody')).toEqual({ ok: false, reason: 'unknown' });
    expect(sw.switchTo('pedro')).toEqual({ ok: false, reason: 'same' });
    const lone = new CastSwitcher(); expect(lone.switchTo('lana')).toEqual({ ok: false, reason: 'noHost' });
  });
  it('swaps look, wallet and home, and round-trips Pedro -> Lana -> Pedro without losing money', () => {
    const { st, sw } = rig();
    const r = sw.switchTo('lana');
    expect(r).toMatchObject({ ok: true, reload: true, from: 'pedro', to: 'lana' });
    expect(st.looks.at(-1)).toMatchObject({ cast: 'lana', outfit: 'day' });
    expect(st.cash).toBe(240); expect(sw.home).toBe('home-lana'); expect(st.moved).toEqual(['home-lana']);
    st.cash = 1000;                                   // Lana earns
    sw.switchTo('pedro');
    expect(st.cash).toBe(500); expect(sw.home).toBe('home-pedro'); expect(st.looks.at(-1)).toMatchObject({ cast: 'pedro' });
    sw.switchTo('lana', 'night');
    expect(st.cash).toBe(1000); expect(st.looks.at(-1)).toMatchObject({ cast: 'lana', outfit: 'night' });
  });
  it('saves and restores (JSON), and rejects a bad field without touching state', () => {
    const { st, sw } = rig();
    sw.switchTo('adele'); st.cash = 77;
    const json = JSON.parse(JSON.stringify(sw.serialize()));
    const b = rig(); b.sw.restore(json, 77);
    expect(b.sw.active).toBe('adele'); expect(b.sw.home).toBe('home-adele');
    b.sw.switchTo('pedro');
    expect(json.stash.pedro.cash).toBe(500);
    const keep = b.sw.serialize();
    expect(b.sw.restore({ v: 2 })).toBe(false);
    expect(b.sw.restore({ v: 1, active: 'nobody', stash: {} })).toBe(false);
    expect(b.sw.restore({ v: 1, active: 'lana', stash: { pedro: { cash: 'x', home: 'h', outfit: 'day' } } })).toBe(false);
    expect(b.sw.serialize()).toEqual(keep);
  });
  it('a game with no field is Pedro; reset returns to him', () => {
    const { sw } = rig(); sw.switchTo('lana'); sw.reset();
    expect(sw.active).toBe('pedro'); expect(sw.serialize().stash).toEqual({});
  });
  it('fires onSwitch and can change outfit in place', () => {
    const { st, sw } = rig(); const seen: string[] = [];
    sw.onSwitch = (f, t) => seen.push(`${f}>${t}`);
    sw.switchTo('adele'); expect(seen).toEqual(['pedro>adele']);
    sw.setOutfit('gig'); expect(st.looks.at(-1)).toMatchObject({ cast: 'adele', outfit: 'gig' });
  });
});
