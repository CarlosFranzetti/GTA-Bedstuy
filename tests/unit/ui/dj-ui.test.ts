// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DjUi } from '@/ui/DjUi';
import { DjGame } from '@/game/DjGame';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS, RecordSource, type BufferContext } from '@/game/records';
import { ARCHIVE_RECORDS } from '@/game/archiveRecords';

describe('DjUi', () => {
  it('loads records on decks, plays, scripted frames score, and Finish emits dj:setFinished', async () => {
    const events: Array<[string, unknown]> = [];
    const game = new DjGame(null, { emit: (t, p) => events.push([t, p]) });
    const inv = new Inventory(PROCEDURAL_RECORDS, null);
    let t = 0; const frames: Array<() => void> = [];
    const ui = new DjUi(document.body, { game, inventory: inv, source: null, now: () => t, raf: (fn) => { frames.push(() => fn(t)); return frames.length; }, caf: () => undefined });
    ui.open('aftersloth');
    expect(ui.isOpen).toBe(true);
    expect(document.querySelector('.dj-crowd')?.hasAttribute('hidden')).toBe(false);
    expect(await ui.loadDeck(0, 'wax-01')).toBe(true);
    expect(await ui.loadDeck(1, 'wax-02')).toBe(true);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.dj-play')];
    buttons[0].click();
    for (let i = 0; i < 100; i++) { t += 100; frames.shift()?.(); }
    expect(game.deck(0).playing).toBe(true);
    expect(game.deck(0).pos).toBeGreaterThan(5);
    expect(document.querySelector('.dj-bpm')?.textContent).toContain('88.0');
    document.querySelector<HTMLButtonElement>('.dj-finish')!.click();
    expect(ui.isOpen).toBe(false);
    expect(events.find((e) => e[0] === 'dj:setFinished')?.[1]).toMatchObject({ venue: 'aftersloth' });
  });
  it('home hides the crowd meter; pitch slider is limited to +-8', () => {
    const ui = new DjUi(document.body, { game: new DjGame(null), inventory: new Inventory(PROCEDURAL_RECORDS, null), source: null, raf: () => 0, caf: () => undefined });
    ui.open('home');
    expect(document.querySelectorAll('.dj-crowd')[document.querySelectorAll('.dj-crowd').length - 1].hasAttribute('hidden')).toBe(true);
    const p = document.querySelector<HTMLInputElement>('.dj-pitch')!;
    expect(p.min).toBe('-8'); expect(p.max).toBe('8');
  });
  it('an archive record on a deck shows its true credit, a liner note, and "not beat-matched" when the tempo drifts', async () => {
    const ctx: BufferContext = { sampleRate: 4000, createBuffer: (c, l, r) => { const ch = Array.from({ length: c }, () => new Float32Array(l)); return { duration: l / r, length: l, getChannelData: (i: number) => ch[i] } as unknown as AudioBuffer; }, decodeAudioData: async () => ctx.createBuffer(1, 4000 * 80, 4000) };
    const inv = new Inventory(PROCEDURAL_RECORDS, null); inv.add(500);
    const drifting = ARCHIVE_RECORDS.find((r) => r.beatMatched === false)!; const steady = ARCHIVE_RECORDS.find((r) => r.beatMatched)!;
    inv.buy(drifting); inv.buy(steady);
    const ui = new DjUi(document.body, { game: new DjGame(null), inventory: inv, source: new RecordSource(ctx, () => undefined, async () => new ArrayBuffer(4)), raf: () => 0, caf: () => undefined });
    ui.open('home');
    expect(await ui.loadDeck(0, drifting.id)).toBe(true);
    expect(await ui.loadDeck(1, steady.id)).toBe(true);
    ui.paint();
    const decks = [...document.querySelectorAll('.dj-deck')].slice(-2);
    expect(decks[0].querySelector('.dj-bpm')?.textContent).toContain('not beat-matched');
    expect(decks[1].querySelector('.dj-bpm')?.textContent).not.toContain('not beat-matched');
    expect(decks[0].querySelector('.dj-credit-text')?.textContent).toMatch(/^Really: /);
    expect(decks[0].querySelector('.dj-liner .liner')?.textContent).toContain('Licence: PD-US');
  });
});
