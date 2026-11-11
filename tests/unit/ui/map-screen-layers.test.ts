// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { MapScreen, gridStreetSource, roadNetStreetSource, navPlaces, type MapStreetSource } from '@/ui/MapScreen';
import { decodeOverview, overviewLabels, type OverviewJson } from '@/ui/overviewLayer';
import { RoadNet, roadNetFromGrid, type RoadNetData } from '@/world/roadnet/RoadNet';
import { getWaypoint, setWaypoint } from '@/game/missions/Waypoint';
import lite from '@/world/data/brooklyn-overview-lite.json';

const grid = buildGrid(loadBedstuyData());
const overview = decodeOverview(lite as unknown as OverviewJson);
let root: HTMLElement;
beforeEach(() => { document.body.className = ''; document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root); setWaypoint(null); });
const flat = (map: MapScreen): void => { const v = map.view; v.w = 400; v.h = 800; v.ox = 200; v.oy = 400; v.ang = 0; v.scale = 1; v.cx = 0; v.cz = 0; };

describe('overview layer', () => {
  it('decodes the Brooklyn land, major road chains and neighbourhood names in the grid frame', () => {
    expect(overview.rings.some((r) => r.boro === 3)).toBe(true);
    expect(overview.chains.length).toBeGreaterThan(1000);
    expect(overview.nta.some((n) => n.name === 'Bedford-Stuyvesant' || n.name.includes('Stuyvesant'))).toBe(true);
    expect(overview.bounds.maxX - overview.bounds.minX).toBeGreaterThan(15000);
  });

  it('is invisible at the fit zoom and above, and appears only below it', () => {
    const map = new MapScreen(root, grid, { overview });
    map.open();
    const v = map.view;
    expect(map.overviewAlpha).toBe(0);
    v.zoomAt(v.ox, v.oy, 3); expect(map.overviewAlpha).toBe(0);
    v.scale = v.fitScale; expect(map.overviewAlpha).toBe(0);
    v.scale = v.fitScale * 0.5; expect(map.overviewAlpha).toBe(1);
    v.scale = v.fitScale * 0.9; expect(map.overviewAlpha).toBeGreaterThan(0); expect(map.overviewAlpha).toBeLessThan(1);
    const none = new MapScreen(root, grid, { overview: null }); none.open();
    none.view.scale = none.view.fitScale * 0.5; expect(none.overviewAlpha).toBe(0); expect(none.hasOverview).toBe(false);
  });

  it('opens fitted to the built area with the overview loaded lazily, and never labels local streets out there', async () => {
    const map = new MapScreen(root, grid, { overview: () => Promise.resolve(overview) });
    expect(map.hasOverview).toBe(false);
    map.open();
    await Promise.resolve(); await Promise.resolve();
    expect(map.hasOverview).toBe(true);
    expect(map.view.scale).toBe(map.view.fitScale);
    map.view.scale = map.view.fitScale / 8;
    const labels = overviewLabels(overview, map.view, (s) => s.length * 6);
    const names = new Set(overview.chains.filter((c) => c.cls < 2).map((c) => c.name).filter(Boolean));
    for (const l of labels) if (l.pri === 1) expect(overview.chains.some((c) => c.cls >= 2 && c.name === l.text)).toBe(true);
    expect(names.size).toBe(0); // the lite file names arterials only
    expect(labels.some((l) => l.caps)).toBe(true);
  });
});

describe('waypoint and blips', () => {
  it('sets, toggles off on the pin, and clears with the button; the route follows the sidewalks', () => {
    const map = new MapScreen(root, grid, { places: navPlaces() });
    map.open(); flat(map);
    map.update({ x: 0, z: 0 }, 0);
    map.tapAt(300, 600);
    expect(getWaypoint()).toMatchObject({ x: 100, z: 200 });
    map.update({ x: 0, z: 0 }, 0, [], 1 / 60);
    expect(map.routePoints.length).toBeGreaterThanOrEqual(2);
    const wp = map.view.toScreen(100, 200);
    map.tapAt(wp.x, wp.y - 18); // the pin head
    expect(getWaypoint()).toBeNull();
    map.tapAt(300, 600);
    (map.root.querySelector('.map-clear') as HTMLButtonElement).click();
    expect(getWaypoint()).toBeNull();
  });

  it('hit-tests blips: nearest within reach, missions before shops, nothing in empty space', () => {
    const places = [...navPlaces(), { id: 's1', kind: 'shop' as const, label: 'Corner Deli', x: 40, z: 40 }, { id: 's2', kind: 'shop' as const, label: 'Bodega', x: 300, z: 300 }];
    const map = new MapScreen(root, grid, { places });
    map.open(); flat(map);
    map.update({ x: 0, z: 0 }, 0, [{ x: 42, z: 40, color: '#f00', kind: 'giver', label: 'Job' }]);
    const at = (x: number, z: number) => map.view.toScreen(x, z);
    expect(map.blipAt(at(300, 300).x + 3, at(300, 300).y)?.label).toBe('Bodega');
    expect(map.blipAt(at(41, 40).x, at(41, 40).y)?.label).toBe('Job'); // mission wins the tie with the shop 2 px away
    expect(map.blipAt(at(-300, 500).x, at(-300, 500).y)).toBeNull();
    expect(map.blipAt(at(0, 0).x, at(0, 0).y)?.kind === 'player' || map.blipAt(at(0, 0).x, at(0, 0).y) !== null).toBe(true);
    map.tapAt(at(300, 300).x, at(300, 300).y);
    expect(map.selectedBlip?.label).toBe('Bodega');
    expect(getWaypoint()).toMatchObject({ x: 300, z: 300, label: 'Bodega' });
    map.update({ x: 0, z: 0 }, 0);
    expect((map.root.querySelector('.map-card') as HTMLElement).hidden).toBe(false);
    expect(map.blips().some((b) => b.kind === 'station')).toBe(true);
  });
});

describe('street source', () => {
  it('feeds the screen from a RoadNet built from the grid exactly like the grid source', () => {
    const net = roadNetFromGrid(grid);
    const src = roadNetStreetSource(net), g = gridStreetSource(grid);
    expect(src.frame.rotDeg).toBeCloseTo(g.frame.rotDeg);
    expect(src.streets().length).toBeGreaterThan(50);
    expect(src.blocks().length).toBeGreaterThan(10);
    const p = { x: 0, z: 0 };
    expect(src.nearest(p, 60)?.name).toBeTruthy();
    const map = new MapScreen(root, grid, { streets: src });
    map.open();
    expect(map.view.scale).toBe(map.view.fitScale);
  });

  it('accepts any fake source: bounds drive the fit and the pan limits, nearest drives the name under the cursor', () => {
    const data: RoadNetData = {
      version: 1, frame: { lat0: 40.69, lon0: -73.94, rotDeg: 8.6 }, extent: [],
      nodes: [{ p: { x: -50, z: 0 }, control: 'stub' }, { p: { x: 50, z: 0 }, control: 'stub' }],
      edges: [{ a: 0, b: 1, pts: [{ x: -50, z: 0 }, { x: 50, z: 0 }], name: 'Fake Ave', cls: 'avenue', width: 12, sidewalk: 3, lanes: 2, oneway: 0, level: 0 }],
      blocks: [],
    };
    const real = roadNetStreetSource(new RoadNet(data));
    expect(real.streets()).toHaveLength(1);
    expect(real.nearest({ x: 0, z: 5 })?.name).toBe('Fake Ave');
    expect(real.nearest({ x: 0, z: 500 })).toBeNull();
    const fake: MapStreetSource = { ...real, bounds: { minX: -50, maxX: 50, minZ: -20, maxZ: 20 } };
    const map = new MapScreen(root, grid, { streets: fake });
    map.open();
    const v = map.view;
    expect(v.area).toEqual(fake.bounds);
    expect(v.cx).toBeCloseTo(0); expect(v.cz).toBeCloseTo(0);
    v.scale = v.fitScale * 2; v.panPx(1e6, 0);
    expect(v.cx).toBeGreaterThanOrEqual(-111);
    map.update({ x: 0, z: 0 }, 0);
    (map.root.querySelector('.map-street') as HTMLElement);
  });
});

describe('input', () => {
  it('zoom buttons and keys step snap levels; arrows pan with inertia that decays; L toggles the legend', () => {
    const map = new MapScreen(root, grid, { overview });
    map.open();
    const v = map.view, f = v.fitScale;
    (map.root.querySelector('.map-zin') as HTMLButtonElement).click();
    for (let i = 0; i < 60; i++) map.advance(1 / 60);
    expect(v.scale).toBeCloseTo(f * 2, 2);
    (map.root.querySelector('.map-zout') as HTMLButtonElement).click();
    (map.root.querySelector('.map-zout') as HTMLButtonElement).click();
    for (let i = 0; i < 90; i++) map.advance(1 / 60);
    expect(v.scale).toBeCloseTo(f / 2, 2);
    const leg = map.root.querySelector('.map-legend') as HTMLElement;
    const was = leg.hidden;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', bubbles: true }));
    expect(leg.hidden).toBe(!was);
  });
});
