// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { MapScreen, MapView, navPlaces, placesFromPois } from '@/ui/MapScreen';
import { MissionHud } from '@/ui/MissionHud';
import { getWaypoint, setWaypoint } from '@/game/missions/Waypoint';
import { createPointerRouter } from '@/game/missions/PointerRoute';
import { setNavTarget } from '@/game/missions/NavTargets';
import { Phone } from '@/game/Phone';
import { PhoneHud } from '@/ui/PhoneHud';

const data = loadBedstuyData();
const grid = buildGrid(data);
let root: HTMLElement;
const key = (code: string, target: EventTarget = document): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

beforeEach(() => { document.body.className = ''; document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root); setWaypoint(null); setNavTarget(null); });
afterEach(() => setWaypoint(null));

const AREA = grid.bounds;
const fitAt = (w: number, h: number, rt = 56, rb = 64): MapView => { const v = new MapView(); v.w = w; v.h = h; v.fit(AREA, 40, rt, rb); return v; };
const corners = [{ x: AREA.minX, z: AREA.minZ }, { x: AREA.maxX, z: AREA.minZ }, { x: AREA.maxX, z: AREA.maxZ }, { x: AREA.minX, z: AREA.maxZ }];

describe('MapView', () => {
  it.each([[1280, 720], [844, 390], [390, 844]])('fits the whole built area, east expansion included, at %ix%i, north up and centred', (w, h) => {
    const rt = h < 500 ? 40 : 56, rb = h < 500 ? 40 : 64;
    const v = fitAt(w, h, rt, rb);
    for (const p of corners) {
      const s = v.toScreen(p.x, p.z);
      expect(s.x).toBeGreaterThanOrEqual(-0.5); expect(s.x).toBeLessThanOrEqual(w + 0.5);
      expect(s.y).toBeGreaterThanOrEqual(rt - 0.5); expect(s.y).toBeLessThanOrEqual(h - rb + 0.5);
    }
    const c = v.toScreen((AREA.minX + AREA.maxX) / 2, (AREA.minZ + AREA.maxZ) / 2);
    expect(c.x).toBeCloseTo(w / 2); expect(c.y).toBeCloseTo((rt + h - rb) / 2);
    expect(v.scale).toBe(v.fitScale);
    expect(AREA.maxX).toBeGreaterThan(900);
  });

  it('is north up: the grid is turned 8.6 degrees so +x (bearing 81.4) runs right and slightly up', () => {
    const v = fitAt(1280, 720);
    const o = v.toScreen(0, 0), e = v.toScreen(100, 0), so = v.toScreen(0, 100);
    expect(e.x).toBeGreaterThan(o.x); expect(e.y).toBeLessThan(o.y);
    expect(Math.atan2(o.y - e.y, e.x - o.x) * 180 / Math.PI).toBeCloseTo(8.6, 1);
    expect(so.y).toBeGreaterThan(o.y); // south is down
  });

  it('round-trips screen and world and zooms about the cursor', () => {
    const v = fitAt(400, 400); v.scale = 1; v.cx = 100; v.cz = -50;
    const w = v.toWorld(300, 120);
    const s0 = v.toScreen(w.x, w.z);
    expect(s0.x).toBeCloseTo(300); expect(s0.y).toBeCloseTo(120);
    v.zoomAt(300, 120, 2.5);
    const after = v.toScreen(w.x, w.z);
    expect(after.x).toBeCloseTo(300, 3); expect(after.y).toBeCloseTo(120, 3);
    expect(v.scale).toBeCloseTo(2.5);
    v.zoomAt(0, 0, 1e6); expect(v.scale).toBe(6);
    v.zoomAt(0, 0, 1e-9); expect(v.scale).toBe(v.minScale);
  });

  it('clamps panning at normal zoom to the built area plus a small margin, and opens up only when zoomed out', () => {
    const v = fitAt(1280, 720);
    v.scale = v.fitScale * 2;
    v.panPx(1e6, 1e6); // content far right/down: the centre goes north-west
    expect(v.cx).toBeGreaterThanOrEqual(AREA.minX - 61); expect(v.cz).toBeGreaterThanOrEqual(AREA.minZ - 61);
    v.panPx(-1e7, -1e7);
    expect(v.cx).toBeLessThanOrEqual(AREA.maxX + 61); expect(v.cz).toBeLessThanOrEqual(AREA.maxZ + 61);
    // zoomed out with a far region the centre may leave the built area
    const far = { minX: -9000, maxX: 21000, minZ: -20000, maxZ: 16000 };
    const o = fitAt(1280, 720); o.setFar(far);
    o.scale = o.fitScale / 8; o.panPx(-1e7, 1e7);
    expect(Math.abs(o.cx) > AREA.maxX + 500 || Math.abs(o.cz) > 2000).toBe(true);
    // no overview: zoom-out stops just past the fit level
    expect(v.minScale).toBeGreaterThan(v.fitScale * 0.8); expect(v.minScale).toBeLessThan(v.fitScale);
  });

  it('snaps to zoom levels around the fit scale', () => {
    const v = fitAt(1280, 720); v.setFar({ minX: -9000, maxX: 21000, minZ: -20000, maxZ: 16000 });
    const lv = v.levels();
    expect(lv).toContain(v.fitScale);
    expect(lv[0]).toBeLessThan(v.fitScale / 8);
    expect(v.levelIndex(v.fitScale * 1.1)).toBe(lv.indexOf(v.fitScale));
    expect(v.stepScale(1)).toBeCloseTo(v.fitScale * 2); expect(v.stepScale(-1)).toBeCloseTo(v.fitScale / 2);
  });
});

const flat = (map: MapScreen): void => { const v = map.view; v.w = 400; v.h = 800; v.ox = 200; v.oy = 400; v.ang = 0; v.scale = 1; v.cx = 0; v.cz = 0; };

describe('MapScreen', () => {
  it('has an always-present MAP button that opens and closes it, plus key M and Escape', () => {
    const map = new MapScreen(root, grid, { places: navPlaces() });
    expect(map.button.textContent).toBe('MAP');
    expect(map.button.hidden).toBe(false);
    expect(map.isOpen).toBe(false);
    map.button.click();
    expect(map.isOpen).toBe(true);
    expect(document.body.classList.contains('map-open')).toBe(true);
    expect(document.body.classList.contains('ui-panel-open')).toBe(true);
    key('KeyM'); expect(map.isOpen).toBe(false);
    expect(document.body.classList.contains('ui-panel-open')).toBe(false);
    key('KeyM'); expect(map.isOpen).toBe(true);
    key('Escape'); expect(map.isOpen).toBe(false);
    map.root.querySelector<HTMLButtonElement>('.map-close')!.click(); // closing a closed map is harmless
    map.open(); map.root.querySelector<HTMLButtonElement>('.map-close')!.click();
    expect(map.isOpen).toBe(false);
  });

  it('M does nothing while typing, in a shop or in the pause menu', () => {
    const map = new MapScreen(root, grid);
    const input = document.createElement('input'); root.appendChild(input);
    key('KeyM', input); expect(map.isOpen).toBe(false);
    document.body.classList.add('shop-open'); key('KeyM'); expect(map.isOpen).toBe(false);
    document.body.classList.remove('shop-open');
    const menu = document.createElement('div'); menu.className = 'menu-root'; root.appendChild(menu);
    key('KeyM'); expect(map.isOpen).toBe(false);
    menu.hidden = true; key('KeyM'); expect(map.isOpen).toBe(true);
  });

  it('swallows P while open so the phone does not open under it, and tells the host to close the phone', () => {
    const phone = new Phone(); const hud = new PhoneHud(root, phone);
    const map = new MapScreen(root, grid);
    map.onOpen = () => { if (hud.isOpen) hud.toggle(); };
    hud.toggle(); expect(hud.isOpen).toBe(true);
    map.open();
    expect(hud.isOpen).toBe(false);
    const reached: string[] = [];
    window.addEventListener('keydown', (e) => reached.push(e.code));
    key('KeyP'); key('KeyW');
    expect(reached).toEqual(['KeyW']); // P swallowed, the game still sees movement keys
  });

  it('a tap sets the waypoint; a drag pans instead', () => {
    const map = new MapScreen(root, grid, { places: navPlaces() });
    map.open();
    flat(map);
    const p = map.tapAt(300, 500); // 100 m east, 100 m south of centre
    expect(p.x).toBeCloseTo(100); expect(p.z).toBeCloseTo(100);
    expect(getWaypoint()).toMatchObject({ x: 100, z: 100 });
    expect(getWaypoint()!.label.length).toBeGreaterThan(0);
    expect(map.root.querySelector('.map-status')!.textContent).toContain('m');
    expect((map.root.querySelector('.map-clear') as HTMLButtonElement).disabled).toBe(false);
    (map.root.querySelector('.map-clear') as HTMLButtonElement).click();
    expect(getWaypoint()).toBeNull();
  });

  it('a tap near HOME snaps to its door and uses its name', () => {
    const map = new MapScreen(root, grid, { places: navPlaces() });
    map.open();
    const home = navPlaces().find((p) => p.kind === 'home')!;
    const s = map.view.toScreen(home.x + 1, home.z + 1);
    map.tapAt(s.x, s.y);
    expect(getWaypoint()).toMatchObject({ x: home.x, z: home.z, label: 'HOME' });
  });

  it('pointer events: a still press-release taps, a moved one pans', () => {
    const map = new MapScreen(root, grid);
    map.open();
    flat(map);
    const canvas = map.root.querySelector('canvas')!;
    const fire = (type: string, id: number, x: number, y: number) => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'pointerId', { value: id });
      canvas.dispatchEvent(e);
    };
    fire('pointerdown', 1, 100, 100); fire('pointerup', 1, 100, 100);
    expect(getWaypoint()).not.toBeNull();
    setWaypoint(null);
    fire('pointerdown', 1, 100, 100); fire('pointermove', 1, 130, 100); fire('pointermove', 1, 160, 100); fire('pointerup', 1, 160, 100);
    expect(getWaypoint()).toBeNull();
    expect(map.view.cx).toBeLessThan(-30); // dragged right, so the centre moved west
  });

  it('two-finger pinch zooms', () => {
    const map = new MapScreen(root, grid);
    map.open();
    flat(map); map.view.minScale = 0.1;
    const canvas = map.root.querySelector('canvas')!;
    const fire = (type: string, id: number, x: number, y: number) => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'pointerId', { value: id });
      canvas.dispatchEvent(e);
    };
    fire('pointerdown', 1, 150, 400); fire('pointerdown', 2, 250, 400);
    fire('pointermove', 2, 350, 400);
    expect(map.view.scale).toBeGreaterThan(1.5);
    fire('pointerup', 2, 350, 400); fire('pointerup', 1, 150, 400);
    expect(getWaypoint()).toBeNull(); // pinching never sets a waypoint
  });

  it('lists shops from the POI data with positions on the street', () => {
    const places = placesFromPois(grid, data.pois);
    expect(places.length).toBeGreaterThanOrEqual(10);
    for (const p of places) { expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true); expect(p.label.length).toBeGreaterThan(0); }
    expect(navPlaces().map((p) => p.label)).toEqual(['HOME', 'WAX DELI']);
  });

  it('dispose removes the button, overlay and key handler', () => {
    const map = new MapScreen(root, grid);
    map.dispose();
    expect(root.querySelector('.map-button')).toBeNull();
    key('KeyM'); expect(document.body.classList.contains('map-open')).toBe(false);
  });
});

describe('waypoint drives the existing pointer', () => {
  const mk = () => {
    const hud = new MissionHud(root);
    hud.setRouter(createPointerRouter(grid));
    return { hud, el: () => root.querySelector<HTMLElement>('.msn-pointer')! };
  };
  const state = { status: 'idle' } as never;

  it('points at the waypoint with distance, via the router, and clears on arrival', () => {
    const { hud, el } = mk();
    hud.update({ status: 'idle', title: '', objective: '', progress: 0, timer: -1, prompt: '', cash: 0, toast: '', toastKind: 'info', carrying: [] } as never, 0.016);
    void state;
    hud.updatePointer([], { x: 0, z: 0 }, 0);
    expect(el().hidden).toBe(true);
    setWaypoint({ x: 0, z: -200 }, 'Greene Ave');
    hud.updatePointer([], { x: 0, z: 0 }, 0);
    expect(el().hidden).toBe(false);
    expect(el().textContent).toContain('Pin: Greene Ave');
    expect(el().textContent).toContain('200 m');
    expect(Number(el().dataset.dist)).toBeCloseTo(200);
    hud.updatePointer([], { x: 0, z: -195 }, 0); // within 8 m: arrived
    expect(getWaypoint()).toBeNull();
  });
});
