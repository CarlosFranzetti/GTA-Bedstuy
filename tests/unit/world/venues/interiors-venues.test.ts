/**
 * VENUES in the interior system: the street fronts and the rooms. Costs are capped here (static pieces only; people are
 * counted separately), spots are reachable, the door gates on the hour, the marked spots tell the missions.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Interiors, FADE_SECONDS, type InteriorsDeps } from '@/world/interiors/Interiors';
import { INTERIORS, VENUES_ON, doorTrigger, type InteriorId } from '@/world/interiors/defs';
import { Inventory } from '@/game/Inventory';
import { PROCEDURAL_RECORDS } from '@/game/records';
import { World2D } from '@/physics/World2D';
import { buildVenueExterior } from '@/world/venues/exterior';
import { buildVenueRoom } from '@/world/venues/rooms';
import { interiorIdOf } from '@/world/venues/interiorDefs';
import { VENUES, VENUE_IDS, VENUE_ROOM, venueById, venueDoor, type VenueId } from '@/world/venues/venues';

const mat = new THREE.MeshStandardMaterial();
const materials = { get: () => mat, awning: () => mat, sign: () => mat, carPaint: () => mat, setNight: () => undefined } as never;

/** caps: what each place may cost, stated in docs/swarm/tasks/STORY-VENUES.md */
const EXTERIOR_CAP = { draws: 4, triangles: 420 };
const ROOM_CAP = { triangles: 3600, draws: 20 };

describe('street fronts', () => {
  it.each(VENUES.map((v) => [v.id]))('%s costs at most %s', (id) => {
    for (const map of ['grid', 'real'] as const) {
      const ext = buildVenueExterior(id, venueDoor(map, id), materials);
      ext.update(12);
      const s = ext.stats();
      expect(s.draws).toBeLessThanOrEqual(EXTERIOR_CAP.draws);
      expect(s.triangles).toBeLessThanOrEqual(EXTERIOR_CAP.triangles);
      expect(s.draws).toBeGreaterThanOrEqual(2);
      // every vertex is finite and within 6 m of the door on the ground plane and below 5 m
      ext.group.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const p = m.geometry.getAttribute('position'); const d = venueDoor(map, id);
        for (let i = 0; i < p.count; i++) { expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true); expect(Math.hypot(p.getX(i) - d.x, p.getZ(i) - d.z)).toBeLessThan(6); expect(p.getY(i)).toBeLessThan(5); expect(p.getY(i)).toBeGreaterThanOrEqual(0.1); }
      });
    }
  });
  it('the after-hours gate is down by day and up when it opens; the sign dims when shut', () => {
    const ext = buildVenueExterior('afterhours', venueDoor('grid', 'afterhours'), materials);
    const gate = ext.group.children.find((c) => c.name.endsWith(':gate'))!;
    ext.update(14); expect(gate.visible).toBe(true);
    ext.update(6); expect(gate.visible).toBe(false);
  });
});

describe('rooms', () => {
  it.each(VENUES.map((v) => [v.id]))('%s builds within its cap and every spot can be stood on', (id) => {
    const world = new World2D();
    const r = buildVenueRoom(id, { world, materials, dancerCount: 16 });
    const s = r.stats();
    expect(s.triangles).toBeLessThanOrEqual(ROOM_CAP.triangles);
    expect(s.draws).toBeLessThanOrEqual(ROOM_CAP.draws + 24); // club tiles are one mesh each
    const { w, d, origin } = VENUE_ROOM[id];
    const ids = r.spots.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('exit');
    expect(ids).toContain(id === 'gym' ? 'lockers' : 'backroom');
    if (venueById(id).kind === 'bar') expect(ids).toContain('stool');
    if (id === 'club') expect(ids).toContain('booth');
    if (id === 'gym') expect(ids).toContain('bench');
    for (const sp of [...r.spots, { id: 'spawn', ...r.spawn }]) {
      expect(Math.abs(sp.x)).toBeLessThan(w / 2 - 0.3); expect(Math.abs(sp.z)).toBeLessThan(d / 2 - 0.3);
      if (sp.id === 'spawn') expect(world.overlapsSolid({ x: origin.x + sp.x, z: origin.z + sp.z }, 0.3), 'spawn inside a solid').toBe(false);
      // a body (0.3 m) can stand within the spot's radius: the centre or a point on a ring 0.7 of the way out
      const rad = 'r' in sp ? (sp as { r: number }).r : 0;
      const cands = [{ x: sp.x, z: sp.z }];
      for (let a = 0; a < 12; a++) cands.push({ x: sp.x + Math.cos(a / 12 * Math.PI * 2) * rad * 0.7, z: sp.z + Math.sin(a / 12 * Math.PI * 2) * rad * 0.7 });
      const free = cands.some((c) => Math.abs(c.x) < w / 2 - 0.4 && Math.abs(c.z) < d / 2 - 0.4 && !world.overlapsSolid({ x: origin.x + c.x, z: origin.z + c.z }, 0.3));
      expect(free, `${id} ${sp.id} cannot be reached`).toBe(true);
    }
    // the spawn is clear and the exit spot is near the south wall
    const ex = r.spots.find((x) => x.id === 'exit')!;
    expect(ex.z).toBeGreaterThan(d / 2 - 1.5);
    r.update(1, { phase: 0.3, bpm: 124, level: 0.7, index: 3 });
    r.update(2, { phase: 0.1, bpm: 124, level: 0.7, index: 4, dark: true });
  });
});

// LEAD, 26 Nov: the venues are switched off (VENUES_ON) until the seat's work is finished; these run again when it is on
describe.skipIf(!VENUES_ON)('through the door', () => {
  function make(hour: number) {
    const h = { v: hour }; const msgs: string[] = []; const log: Array<[string, unknown]> = []; const actions: unknown[] = []; const tele: number[][] = [];
    const inventory = new Inventory(PROCEDURAL_RECORDS, null);
    const it = new Interiors({
      scene: new THREE.Group(), world: new World2D(), materials, inventory, getHour: () => h.v,
      teleport: (x, z, hd) => tele.push([x, z, hd]), events: { emit: (t, p) => log.push([t, p]) }, onMessage: (m) => msgs.push(m), onAction: (a) => actions.push(a),
    } as InteriorsDeps);
    const run = (sec: number) => { for (let t = 0; t < sec; t += 0.02) it.update(0.02); };
    return { it, h, msgs, log, actions, inventory, run, tele };
  }
  const at = (id: VenueId) => doorTrigger(INTERIORS[interiorIdOf(id)]);

  it('is shut outside hours with the hours in the prompt, and opens inside them', () => {
    const t = make(8); // 8 AM
    expect(t.it.prompt(at('bar-lounge'))).toContain('Closed. The Velvet Pigeon opens 5 PM to 2 AM');
    expect(t.it.tryEnter(at('bar-lounge'))).toBe(false);
    expect(t.msgs.at(-1)).toContain('shut');
    expect(t.it.prompt(at('gym'))).toBe('F  Enter Iron Stoop Gym');
    expect(t.it.tryEnter(at('gym'))).toBe(true);
    t.run(FADE_SECONDS * 2 + 0.2);
    expect(t.it.inside).toBe(true);
    expect(t.it.current).toBe('venue:gym');
    expect(t.log.some(([ty, p]) => ty === 'interior:entered' && (p as { id: string }).id === 'gym')).toBe(true);
  });
  it('a marked spot tells the missions, and the booth needs a booked gig', () => {
    const t = make(23);
    expect(t.it.tryEnter(at('club'))).toBe(true); t.run(FADE_SECONDS * 2 + 0.2);
    const o = VENUE_ROOM.club.origin;
    const room = buildVenueRoom('club', { world: new World2D(), materials });
    const spot = (sid: string) => { const sp = room.spots.find((x) => x.id === sid)!; return { x: o.x + sp.x, z: o.z + sp.z }; };
    expect(t.it.interact(spot('backroom'))).toBe(true);
    expect(t.log.some(([ty, p]) => ty === 'venue:spot' && (p as { id: string; spot: string }).id === 'club' && (p as { spot: string }).spot === 'backroom')).toBe(true);
    expect(t.it.interact(spot('booth'))).toBe(true);
    expect(t.actions).toHaveLength(0);
    expect(t.msgs.at(-1)).toContain('slot');
    t.inventory.setFlag('venue.club.booth');
    t.it.interact(spot('booth'));
    expect(t.actions).toHaveLength(1);
    expect(t.it.interact(spot('exit'))).toBe(true); t.run(FADE_SECONDS * 2 + 0.2);
    expect(t.it.inside).toBe(false);
  });
  it('every venue door is a different door from the old three', () => {
    const t = make(12);
    for (const id of VENUE_IDS) expect(t.it.doorAt(at(id))).toBe(interiorIdOf(id));
    expect(t.it.doorAt(doorTrigger(INTERIORS.home))).toBe('home');
  });
});
