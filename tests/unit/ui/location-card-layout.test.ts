import { describe, it, expect } from 'vitest';

// @ts-ignore node types are not installed in this repo; vitest runs in node
import { readFileSync } from 'node:fs';
const hud: string = readFileSync('src/ui/hud.css', 'utf8');
const SMALL = /@media \(max-height: 480px\), \(max-width: 700px\) {([\s\S]*?)\n}\n/;

describe('location card on small viewports (640x360)', () => {
  const block = hud.match(SMALL)?.[1] ?? '';

  it('has a small-viewport block', () => expect(block).not.toBe(''));

  it('minimap shrinks and the card moves clear of it (smaller, centred right of the minimap)', () => {
    expect(block).toMatch(/canvas\.minimap\s*{[^}]*width:\s*110px !important/);
    const card = block.match(/\.hud-card\s*{([^}]*)}/)?.[1] ?? '';
    expect(card).toMatch(/left:\s*calc\(50% \+ 40px\)/);
    expect(card).toMatch(/max-width:\s*calc\(100% - 300px\)/);
    expect(block).toMatch(/\.hud-card-title\s*{[^}]*font-size:\s*clamp\(18px, 3\.8vw, 28px\)/);
  });

  it('card left edge geometry: at 640 wide the widest title stays right of the 110px minimap', () => {
    // title ~ 19 glyphs at 0.62em, font = clamp(18, 3.8vw, 28) = 24.3px; card centre = 50% + 40px
    const w = 640, font = Math.min(28, Math.max(18, 0.038 * w));
    const width = Math.min(19 * 0.62 * font, w - 300);
    const left = w / 2 + 40 - width / 2;
    expect(left).toBeGreaterThan(16 + 110 + 8);
    expect(left + width).toBeLessThan(w - 16);
  });

  it('the generic prompt pill no longer jumps to bottom:300px on short screens', () => {
    expect(hud).toMatch(/@media \(max-width: 640px\) and \(min-height: 481px\)/);
    expect(block).toMatch(/\.hud-prompt\s*{[^}]*bottom:\s*20px/);
  });

  it('the card is hidden while any ui-panel-open panel (phone, shop, decks) is open', () => {
    expect(hud).toMatch(/body\.ui-panel-open \.hud-card\s*{[^}]*display:\s*none/);
  });

  it('the street line keeps a bottom margin and line-height so it is never clipped at 640x360', () => {
    expect(block).toMatch(/\.hud-location\s*{[^}]*bottom:\s*18px/);
    expect(block).toMatch(/\.hud-street\s*{[^}]*line-height:\s*1\.15/);
  });
});
