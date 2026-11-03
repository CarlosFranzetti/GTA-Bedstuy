// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// the project has no @types/node and vitest strips CSS imports, so read the stylesheets with a dynamic import
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(p: string, enc: string): string };
const shopCss = readFileSync('src/ui/shop.css', 'utf8');
const djCss = readFileSync('src/ui/dj.css', 'utf8');
import { ShopUi } from '@/ui/ShopUi';
import { DjUi } from '@/ui/DjUi';
import { DjGame } from '@/game/DjGame';
import { Inventory, START_CASH } from '@/game/Inventory';
import { PROCEDURAL_RECORDS, RecordSource, type BufferContext } from '@/game/records';

const ctx: BufferContext = {
  sampleRate: 4000,
  createBuffer: (c, l, r) => { const ch = Array.from({ length: c }, () => new Float32Array(l)); return { duration: l / r, length: l, getChannelData: (i: number) => ch[i] } as unknown as AudioBuffer; },
  decodeAudioData: async () => ctx.createBuffer(1, 10, 4000),
};
const key = (code: string, extra: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true, cancelable: true, ...extra });
  document.body.dispatchEvent(e);
  return e;
};

function makeShop() {
  const parent = document.createElement('div'); document.body.appendChild(parent);
  const inventory = new Inventory(PROCEDURAL_RECORDS, null);
  const preview = { play: vi.fn(), stop: vi.fn() };
  const toggles: boolean[] = [];
  const shop = new ShopUi(parent, { inventory, stock: PROCEDURAL_RECORDS, source: new RecordSource(ctx), preview, onToggle: (o) => toggles.push(o) });
  return { parent, inventory, preview, shop, toggles };
}

afterEach(() => { document.body.textContent = ''; document.body.className = ''; });

describe('panel layout (CSS contract for 640x360 and phones)', () => {
  const rule = (css: string, sel: string): string => { const m = css.match(new RegExp(`(^|\\n)${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`)); return m ? m[2] : ''; };

  it('window size used by the harness is 640x360 and the panel is a column that never exceeds the viewport', () => {
    window.innerWidth = 640; window.innerHeight = 360;
    for (const [css, root, panel, scroll] of [[shopCss, '.shop-root', '.shop-panel', '.shop-body'], [djCss, '.dj-root', '.dj-panel', '.dj-scroll']] as const) {
      expect(rule(css, root)).toMatch(/position:\s*absolute;\s*inset:\s*0/);
      expect(rule(css, panel)).toMatch(/max-height:\s*100%/);
      expect(rule(css, panel)).toMatch(/flex-direction:\s*column/);
      expect(rule(css, panel)).toMatch(/overflow:\s*hidden/);
      expect(rule(css, panel)).toMatch(/width:\s*min\(\d+px,\s*100%\)/);
      expect(rule(css, scroll)).toMatch(/overflow-y:\s*auto/);
      expect(rule(css, scroll)).toMatch(/min-height:\s*0/);
      expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
      expect(css).toMatch(/env\(safe-area-inset-left\)/);
      expect(css).toMatch(/@media \(max-height: 480px\)/);
    }
  });
  it('touch targets are at least 44 px', () => {
    for (const m of shopCss.matchAll(/\.shop-tab, \.shop-btn \{[^}]*min-height:\s*(\d+)px/g)) expect(+m[1]).toBeGreaterThanOrEqual(44);
    expect(shopCss).toMatch(/\.shop-tab, \.shop-btn \{[^}]*min-height: 44px; min-width: 44px/);
    for (const sel of ['.dj-btn', '.dj-select', '.dj-small']) expect(+(rule(djCss, sel).match(/min-height:\s*(\d+)px/)?.[1] ?? 0), sel).toBeGreaterThanOrEqual(44);
    expect(+(rule(djCss, '.dj-pitch, .dj-fader').match(/height:\s*(\d+)px/)?.[1] ?? 0)).toBeGreaterThanOrEqual(44);
    // the compact 360 px layout must not shrink targets under 44 px
    for (const m of djCss.matchAll(/\.dj-btn \{ min-height: (\d+)px; \}/g)) expect(+m[1]).toBeGreaterThanOrEqual(44);
  });
  it('shop: the Close button and status sit in a footer that follows the scrolling body (sticky by layout)', () => {
    const { shop } = makeShop(); shop.open();
    const panel = shop.root.querySelector('.shop-panel')!;
    const kids = [...panel.children].map((c) => c.className);
    expect(kids).toEqual(['shop-head', 'shop-tabs', 'shop-body', 'shop-foot']);
    expect(panel.querySelector('.shop-foot .shop-close')?.textContent).toBe('Close');
    expect(rule(shopCss, '.shop-foot')).toMatch(/flex:\s*none/);
    expect(panel.querySelector('.shop-body .shop-close')).toBeNull();
  });
  it('dj: Finish set and Close sit in the footer after the scrolling area', () => {
    const dj = new DjUi(document.body, { game: new DjGame(null), inventory: new Inventory(PROCEDURAL_RECORDS, null), source: null, raf: () => 0, caf: () => undefined });
    const kids = [...dj.root.querySelector('.dj-panel')!.children].map((c) => c.className);
    expect(kids).toEqual(['dj-head', 'dj-scroll', 'dj-foot']);
    expect(dj.root.querySelector('.dj-foot .dj-finish')).not.toBeNull();
    expect(dj.root.querySelector('.dj-foot .dj-close')?.textContent).toBe('Close');
    expect(rule(djCss, '.dj-foot')).toMatch(/flex:\s*none/);
  });
});

describe('ShopUi keyboard and gamepad', () => {
  it('marks the body, exposes data-ui-modal and reports open state', () => {
    const { shop, toggles } = makeShop();
    expect(shop.root.hasAttribute('data-ui-modal')).toBe(true);
    shop.open();
    expect(document.body.classList.contains('shop-open')).toBe(true);
    expect(document.body.classList.contains('ui-panel-open')).toBe(true);
    expect(document.querySelector('[data-ui-modal]:not([hidden])')).toBe(shop.root);
    shop.close();
    expect(document.body.classList.contains('shop-open')).toBe(false);
    expect(document.body.classList.contains('ui-panel-open')).toBe(false);
    expect(document.querySelector('[data-ui-modal]:not([hidden])')).toBeNull();
    expect(toggles).toEqual([true, false]);
  });
  it('W/S and arrows move the selection, Enter / Space / F buy the selected record', () => {
    const { shop, parent, inventory } = makeShop();
    shop.open();
    const sel = () => [...parent.querySelectorAll('.shop-card')].findIndex((c) => c.classList.contains('sel'));
    expect(sel()).toBe(0);
    key('KeyS'); expect(sel()).toBe(1);
    key('ArrowDown'); expect(sel()).toBe(2);
    key('KeyW'); expect(sel()).toBe(1);
    key('ArrowUp'); key('ArrowUp'); expect(sel()).toBe(0);
    // find a buyable record, select it, buy with each confirm key
    const buyable = PROCEDURAL_RECORDS.filter((r) => !inventory.hasRecord(r.id) && r.price > 0);
    expect(buyable.length).toBeGreaterThanOrEqual(3);
    for (const [i, code] of ['Enter', 'Space', 'KeyF'].entries()) {
      const idx = PROCEDURAL_RECORDS.findIndex((r) => r.id === buyable[i].id);
      while (sel() < idx) key('KeyS');
      const cash = inventory.cash;
      key(code);
      expect(inventory.hasRecord(buyable[i].id), code).toBe(true);
      expect(inventory.cash).toBe(cash - buyable[i].price);
    }
    expect(inventory.cash).toBeLessThan(START_CASH);
  });
  it('A/D switch tabs; the crate tab sells with Enter', () => {
    const { shop, parent, inventory } = makeShop();
    shop.open();
    key('KeyD');
    expect(parent.querySelector('.shop-tab.on')?.textContent).toBe('Your crate');
    const n = inventory.records.length; const cash = inventory.cash;
    key('Enter');
    expect(inventory.records.length).toBe(n - 1);
    expect(inventory.cash).toBeGreaterThan(cash);
    key('ArrowRight'); expect(parent.querySelector('.shop-tab.on')?.textContent).toBe('Press my music');
    key('ArrowLeft'); key('ArrowLeft'); expect(parent.querySelector('.shop-tab.on')?.textContent).toBe('Bins');
  });
  it('E previews the selected record; pressing it again stops', async () => {
    const { shop, preview } = makeShop();
    shop.open();
    key('KeyE');
    await new Promise((r) => setTimeout(r, 0));
    expect(preview.play).toHaveBeenCalledTimes(1);
    key('KeyE');
    expect(preview.stop).toHaveBeenCalled();
  });
  it('Escape, X, B and Backspace each close; the Close button is selectable and closes with Enter', () => {
    for (const code of ['Escape', 'KeyX', 'KeyB', 'Backspace']) {
      const { shop } = makeShop(); shop.open(); key(code); expect(shop.isOpen, code).toBe(false); shop.dispose();
    }
    const { shop, parent } = makeShop(); shop.open();
    for (let i = 0; i < 40; i++) key('KeyS'); // runs to the end of the list: the Close button
    expect(parent.querySelector('.shop-close')?.classList.contains('sel')).toBe(true);
    key('Enter');
    expect(shop.isOpen).toBe(false);
  });
  it('swallows keys before the game input sees them, and ignores them once closed', () => {
    const seen: string[] = [];
    const spy = (e: KeyboardEvent) => seen.push(e.code);
    window.addEventListener('keydown', spy);
    const { shop } = makeShop();
    key('KeyW'); expect(seen).toEqual(['KeyW']); // closed: the game sees it
    seen.length = 0;
    shop.open();
    for (const c of ['KeyW', 'Space', 'KeyF', 'KeyE', 'ArrowLeft', 'Escape']) key(c);
    expect(seen).toEqual([]);
    window.removeEventListener('keydown', spy);
    key('KeyD'); // closed again
  });
  it('gamepad: d-pad, A and B drive the same actions through navigate()', () => {
    const { shop, parent, inventory } = makeShop();
    shop.navigate('down'); // closed: ignored
    shop.open();
    shop.navigate('down'); shop.navigate('down');
    const idx = [...parent.querySelectorAll('.shop-card')].findIndex((c) => c.classList.contains('sel'));
    expect(idx).toBe(2);
    const id = PROCEDURAL_RECORDS[2].id;
    const had = inventory.hasRecord(id);
    shop.navigate('confirm');
    expect(inventory.hasRecord(id)).toBe(true);
    expect(had || inventory.cash < START_CASH).toBe(true);
    shop.navigate('right'); expect(parent.querySelector('.shop-tab.on')?.textContent).toBe('Your crate');
    shop.navigate('back');
    expect(shop.isOpen).toBe(false);
  });
  it('Enter on a focused button does not also fire a native click (no double buy)', () => {
    const { shop, parent, inventory } = makeShop(); shop.open();
    const btn = [...parent.querySelectorAll<HTMLButtonElement>('.shop-primary')][0];
    const clicks = vi.fn(); btn.addEventListener('click', clicks);
    btn.focus();
    const e = key('Enter');
    expect(e.defaultPrevented).toBe(true);
    expect(clicks).not.toHaveBeenCalled();
    expect(inventory.records.length).toBeGreaterThan(0);
  });
});

describe('DjUi keyboard and gamepad', () => {
  function makeDj() {
    const game = new DjGame(null);
    const inv = new Inventory(PROCEDURAL_RECORDS, null);
    const ui = new DjUi(document.body, { game, inventory: inv, source: null, raf: () => 0, caf: () => undefined });
    return { game, inv, ui };
  }
  it('marks the body and exposes data-ui-modal while open', () => {
    const { ui } = makeDj();
    ui.open('home');
    expect(document.body.classList.contains('dj-open')).toBe(true);
    expect(document.body.classList.contains('ui-panel-open')).toBe(true);
    expect(document.querySelector('[data-ui-modal]:not([hidden])')).toBe(ui.root);
    ui.leave();
    expect(document.body.classList.contains('ui-panel-open')).toBe(false);
  });
  it('W/S select controls, Enter loads a record on the focused deck and plays it', async () => {
    const { ui, game } = makeDj();
    ui.open('home');
    expect(document.activeElement).toBe(ui.root.querySelector('.dj-select'));
    key('Enter'); // cycles the record picker to the first owned record
    await new Promise((r) => setTimeout(r, 0));
    expect(game.deck(0).record).not.toBeNull();
    key('KeyS'); expect(document.activeElement).toBe(ui.root.querySelector('.dj-play'));
    key('Space'); expect(game.deck(0).playing).toBe(true);
    key('KeyW'); expect(document.activeElement).toBe(ui.root.querySelector('.dj-select'));
  });
  it('A/D move the crossfader, or the pitch when a pitch slider is selected', () => {
    const { ui, game } = makeDj();
    ui.open('home');
    const x0 = game.crossfader;
    key('KeyD'); expect(game.crossfader).toBeGreaterThan(x0);
    key('KeyA'); key('KeyA'); expect(game.crossfader).toBeLessThan(x0 + 0.01);
    for (let i = 0; i < 5; i++) key('KeyS'); // select, play, cue, nudge-, nudge+, pitch
    expect(document.activeElement).toBe(ui.root.querySelector('.dj-pitch'));
    key('KeyD'); expect(game.deck(0).pitch).toBeCloseTo(0.005, 3);
    key('ArrowLeft'); key('ArrowLeft'); expect(game.deck(0).pitch).toBeCloseTo(-0.005, 3);
  });
  it('Escape, X, B and Backspace leave the booth; gamepad B too; keys do not reach the game', () => {
    for (const code of ['Escape', 'KeyX', 'KeyB', 'Backspace']) {
      const { ui } = makeDj(); ui.open('home'); key(code); expect(ui.isOpen, code).toBe(false); ui.dispose();
    }
    const { ui } = makeDj(); ui.open('home'); ui.navigate('back'); expect(ui.isOpen).toBe(false);
    const seen: string[] = []; const spy = (e: KeyboardEvent) => seen.push(e.code);
    window.addEventListener('keydown', spy);
    const d2 = makeDj(); d2.ui.open('home'); key('KeyW'); key('Space'); expect(seen).toEqual([]);
    window.removeEventListener('keydown', spy);
  });
  it('the Close button leaves, ending the set', () => {
    const { ui } = makeDj(); ui.open('home');
    ui.root.querySelector<HTMLButtonElement>('.dj-close')!.click();
    expect(ui.isOpen).toBe(false);
  });
});
