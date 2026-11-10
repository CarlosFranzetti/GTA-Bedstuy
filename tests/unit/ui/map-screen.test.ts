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

describe('MapView', () => {
  it('fits the whole grid, including the east expansion', () => {
    const v = new MapView(); v.w = 390; v.h = 844;
    v.fit(grid.bounds, 40, 56, 64);
    for (const p of [{ x: grid.bounds.minX, z: grid.bounds.minZ }, { x: grid.bounds.maxX, z: grid.bounds.maxZ }]) {
      const s = v.toScreen(p.x, p.z);
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(390);
      expect(s.y).toBeGreaterThanOrEqual(56); expect(s.y).toBeLessThanOrEqual(844 - 64);
    }
    expect(grid.bounds.maxX).toBeGreaterThan(900); // Malcolm X Blvd at x=1000 is on the map
    expect(grid.streets.some((s) => s.id === 'malcolmx')).toBe(true);
  });

  it('round-trips screen and world and zooms about the cursor', () => {
    const v = new MapView(); v.w = 400; v.h = 400; v.scale = 1; v.minScale = 0.1; v.cx = 100; v.cz = -50;
    const w = v.toWorld(300, 120);
    expect(v.toScreen(w.x, w.z)).toEqual({ x: 300, y: 120 });
    v.zoomAt(300, 120, 2.5);
    const after = v.toScreen(w.x, w.z);
    expect(after.x).toBeCloseTo(300); expect(after.y).toBeCloseTo(120);
    expect(v.scale).toBeCloseTo(2.5);
    v.zoomAt(0, 0, 1e6); expect(v.scale).toBe(6);
    v.zoomAt(0, 0, 1e-9); expect(v.scale).toBe(0.1);
  });
});

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
    map.view.w = 400; map.view.h = 800; map.view.scale = 1; map.view.cx = 0; map.view.cz = 0;
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
    map.view.w = 400; map.view.h = 800; map.view.scale = 1; map.view.cx = 0; map.view.cz = 0;
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
    map.view.w = 400; map.view.h = 800; map.view.scale = 1; map.view.minScale = 0.1;
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
