// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BustCard, CARD_MS, FADE_OUT_MS, BLACK_HOLD_MS, RELEASE_LINE_MS } from '@/ui/BustCard';
import { Hud } from '@/ui/Hud';
import type { HudState } from '@/world/types';

describe('BustCard', () => {
  it('dims with BUSTED, applies the bust while black, says what it cost, then goes away', async () => {
    const seen: number[] = [];
    let state = '';
    const card = new BustCard(document.body, { set: (fn, ms) => { seen.push(ms); state += `${card.el.className}|${card.el.textContent}\n`; fn(); } });
    let applied = 0;
    const res = await card.play(() => { applied++; return { fine: 50, hours: 4, precinct: 'Ironside Station House' }; }, () => '7:40am');
    expect(applied).toBe(1);
    expect(res.fine).toBe(50);
    expect(seen).toEqual([CARD_MS, FADE_OUT_MS, BLACK_HOLD_MS, RELEASE_LINE_MS]);
    expect(state).toContain('bust-card dim|BUSTED');
    expect(state).toContain('bust-card black|BUSTED');
    expect(state).toContain('RELEASEDFined $50. Released at Ironside Station House, 7:40am.');
    expect(card.el.hidden).toBe(true);
    expect(card.isPlaying).toBe(false);
  });
});

describe('HUD heat bar', () => {
  const base: HudState = { stars: 0, speedKmh: 0, inVehicle: false, radioStation: '', prompt: '', timeOfDay: 12, streetName: '', fps: 60 } as HudState;
  it('is hidden when calm, fills with heat and shows the police line', () => {
    const root = document.createElement('div'); document.body.appendChild(root);
    const hud = new Hud(root);
    hud.update({ ...base });
    const el = root.querySelector('.hud-heat') as HTMLElement;
    expect(el.hidden).toBe(true);
    hud.update({ ...base, heat: 0.6, policeLine: 'Police are watching' });
    expect(el.hidden).toBe(false);
    expect((root.querySelector('.hud-heat-fill') as HTMLElement).style.width).toBe('60%');
    expect(el.classList.contains('warn')).toBe(true);
    expect(el.textContent).toContain('Police are watching');
    hud.update({ ...base, heat: 0.1, policeLine: '' });
    expect(el.classList.contains('warn')).toBe(false);
  });
});
