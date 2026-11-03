import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarModel, styleFor, PAINT_VARIANTS, type CarStyle } from '@/entities/models/carModel';
import { buildLoft, carHalf, isTaxiYellow, mergeTrim, Acc, bx, STYLES, monotone } from '@/entities/models/carBodies';
import { VEHICLE_SPECS } from '@/entities/Vehicle';
import type { IMaterialLibrary, VehicleType } from '@/world/types';

const painted: string[] = [];
const mat = () => new THREE.MeshBasicMaterial();
const materials: IMaterialLibrary = {
  get: (k: string) => { const m = mat(); m.name = k; return m; },
  awning: () => mat(), sign: () => mat(), setNight: () => {},
  carPaint: (c: string) => { painted.push(c); const m = mat(); m.name = `carPaint:${c}`; return m; },
} as unknown as IMaterialLibrary;

interface Case { style: CarStyle; type: VehicleType; color?: string; variant?: number }
const CASES: Case[] = [
  { style: 'sedan', type: 'sedan' },
  { style: 'coupe', type: 'sedan', variant: 3 },
  { style: 'suv', type: 'suv' },
  { style: 'van', type: 'boxtruck' },
  { style: 'cab', type: 'sedan', color: '#e0b01e' },
  { style: 'cop', type: 'cop' },
];
const build = (c: Case) => buildCarModel(c.type, { ...VEHICLE_SPECS[c.type], color: c.color ?? VEHICLE_SPECS[c.type].color }, materials, c.variant ?? 0);

const triCount = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const meshes = (o: THREE.Object3D): THREE.Mesh[] => { const out: THREE.Mesh[] = []; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh); }); return out; };
const totalTris = (o: THREE.Object3D) => meshes(o).reduce((n, m) => n + triCount(m.geometry), 0);
const bb = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe('carBodies: style selection', () => {
  it('picks the style from type, colour and plate variant', () => {
    expect(styleFor('sedan', '#7f8c8d', 0)).toBe('sedan');
    expect(styleFor('sedan', '#7f8c8d', 3)).toBe('coupe');
    expect(styleFor('sedan', '#e0b01e', 3)).toBe('cab');
    expect(styleFor('suv', '#e0b01e', 3)).toBe('suv');
    expect(styleFor('boxtruck', '#fff')).toBe('van');
    expect(styleFor('cop', '#fff', 3)).toBe('cop');
  });
  it('taxi yellow is yellow, not red or grey', () => {
    expect(isTaxiYellow('#e0b01e')).toBe(true);
    for (const c of ['#c0392b', '#7f8c8d', '#27ae60', '#d35400', '#ecf0f1', '#1f6f8b']) expect(isTaxiYellow(c)).toBe(false);
  });
});

describe.each(CASES)('procedural $style', (c) => {
  const m = build(c);
  const spec = VEHICLE_SPECS[c.type];

  it('is the requested style', () => { expect(m.style).toBe(c.style); });

  it('has no NaN in any attribute', () => {
    for (const mesh of meshes(m.group)) {
      for (const a of Object.values(mesh.geometry.attributes)) {
        for (const v of (a as THREE.BufferAttribute).array) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('body bounds are within the spec footprint (+/- 5 cm), wheels on the ground', () => {
    const body = new THREE.Box3();
    for (const mesh of m.paintMeshes) body.union(new THREE.Box3().setFromObject(mesh));
    const all = bb(m.group);
    const s = all.getSize(new THREE.Vector3());
    expect(Math.abs(s.z - spec.length)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(s.x - spec.width)).toBeLessThanOrEqual(0.05);
    // the roof light / light bar / roof rails stand on the roof: the hull itself reaches the spec height
    expect(Math.abs(body.max.y - spec.height)).toBeLessThanOrEqual(c.style === 'cop' || c.style === 'cab' ? 0.2 : 0.05);
    expect(all.min.y).toBeGreaterThanOrEqual(-0.02);
    expect(all.min.y).toBeLessThanOrEqual(0.02);
  });

  it('stays within the triangle budget', () => {
    const budget = c.style === 'suv' ? 2900 : 2600;
    expect(totalTris(m.group)).toBeLessThanOrEqual(budget);
  });

  it('is at most 10 draw calls (one mesh per material, wheels aside)', () => {
    expect(meshes(m.group).length).toBeLessThanOrEqual(c.style === 'cop' ? 12 : 10);
    const nonWheel = meshes(m.group).filter((x) => x.name !== 'tyre');
    expect(nonWheel.length).toBeLessThanOrEqual(c.style === 'cop' ? 9 : 7);
  });

  it('wheels sit at the axles of the spec footprint', () => {
    expect(m.wheels).toHaveLength(4);
    expect(m.steerPivots).toHaveLength(2);
    const pos = m.wheels.map((w) => new THREE.Vector3().setFromMatrixPosition((w.parent!.updateMatrixWorld(true), w.matrixWorld)));
    for (const p of pos) {
      expect(Math.abs(p.y - m.wheelRadius)).toBeLessThan(1e-6);
      expect(Math.abs(p.x)).toBeLessThan(spec.width / 2);
      expect(Math.abs(p.x)).toBeGreaterThan(spec.width / 2 - 0.45);
      expect(Math.abs(p.z)).toBeLessThan(spec.length / 2);
    }
    const front = pos.filter((p) => p.z < 0);
    const rear = pos.filter((p) => p.z > 0);
    expect(front).toHaveLength(2);
    expect(rear).toHaveLength(2);
    expect(Math.abs(front[0].x + front[1].x)).toBeLessThan(1e-6); // symmetric
    const wheelbase = rear[0].z - front[0].z;
    expect(wheelbase).toBeGreaterThan(spec.length * 0.45);
    expect(wheelbase).toBeLessThan(spec.length * 0.75);
    // the wheel geometry (tyre + hubcap) fits the declared radius
    const tyre = meshes(m.wheels[0]).find((x) => x.name === 'tyre')!;
    const box = new THREE.Box3().setFromObject(tyre);
    expect(box.max.y - box.min.y).toBeCloseTo(2 * m.wheelRadius, 1);
  });

  it('keeps lights, plates and a hood (not on the van)', () => {
    expect(m.headlights.length).toBeGreaterThanOrEqual(1);
    expect(m.taillights.length).toBeGreaterThanOrEqual(1);
    expect(m.headlights[0].material).not.toBe(m.taillights[0].material);
    expect(m.group.getObjectByName('plate')).toBeTruthy();
    expect(m.group.getObjectByName('glass')).toBeTruthy();
    expect(m.group.getObjectByName('trim')).toBeTruthy();
    expect(!!m.hood).toBe(c.style !== 'van');
    expect(m.headlights[0].position.z).toBeCloseTo(0); // lamps are baked in car space
    const hb = new THREE.Box3().setFromObject(m.headlights[0]);
    const tb = new THREE.Box3().setFromObject(m.taillights[0]);
    expect(hb.min.z).toBeLessThan(tb.min.z); // head lamps are at the front (-z)
  });

  it('paints with the right material', () => {
    const body = m.group.getObjectByName('body') as THREE.Mesh;
    const name = (body.material as THREE.Material).name;
    if (c.style === 'cop') expect(name).toBe('copLivery');
    else if (c.style === 'cab') expect(name).toBe('taxiLivery');
    else expect(name).toMatch(/^carPaint:/);
  });
});

describe.each(CASES)('procedural $style winding', (c) => {
  it('triangle winding agrees with the vertex normals (no inside-out faces) on body, hood, trim, tyres and lamps', () => {
    const m = build(c);
    for (const mesh of meshes(m.group)) {
      if (['glass', 'plate', 'lightbarA', 'lightbarB'].includes(mesh.name)) continue;
      const g = mesh.geometry;
      const pos = g.attributes.position, nor = g.attributes.normal;
      const idx = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);
      let bad = 0, total = 0;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
      for (let t = 0; t < idx.length; t += 3) {
        a.fromBufferAttribute(pos, idx[t]); b.fromBufferAttribute(pos, idx[t + 1]); d.fromBufferAttribute(pos, idx[t + 2]);
        fn.crossVectors(b.sub(a), d.sub(a));
        if (fn.lengthSq() < 1e-12) continue;
        vn.set(0, 0, 0);
        for (let k = 0; k < 3; k++) vn.add(new THREE.Vector3().fromBufferAttribute(nor, idx[t + k]));
        total++;
        if (fn.dot(vn) < 0) bad++;
      }
      // the dark engine bay / inner shell is deliberately inside-out in places, so allow a small share, but never a wheel
      const limit = mesh.name === 'tyre' || mesh.name === 'headlight' || mesh.name === 'taillight' || mesh.name === 'body' || mesh.name === 'hood' ? 0 : 0.5;
      expect(bad / Math.max(1, total), `${c.style}/${mesh.name}`).toBeLessThanOrEqual(limit);
    }
  });
});

describe('carBodies: livery roles', () => {
  it('the cop has a light bar with two separately lit lenses, the cab has a roof light in the head lamp mesh', () => {
    const cop = build(CASES[5]);
    expect(cop.lightbar!.red.material).not.toBe(cop.lightbar!.blue.material);
    const cab = build(CASES[4]);
    expect(cab.lightbar).toBeUndefined();
    const plain = build(CASES[0]);
    const hb = (x: ReturnType<typeof build>) => new THREE.Box3().setFromObject(x.headlights[0]);
    expect(hb(cab).max.y).toBeGreaterThan(hb(plain).max.y + 0.5); // the roof light is far above the head lamps
  });
  it('cab and cop bodies have livery UVs spanning the car length', () => {
    for (const c of [CASES[4], CASES[5]]) {
      const uv = (build(c).group.getObjectByName('body') as THREE.Mesh).geometry.attributes.uv;
      let min = 1, max = 0;
      for (let i = 0; i < uv.count; i++) { min = Math.min(min, uv.getX(i)); max = Math.max(max, uv.getX(i)); }
      expect(max - min).toBeGreaterThan(0.9);
    }
  });
});

describe('carBodies: paint variants', () => {
  it('2 to 4 variants per type, all valid colours, distinct', () => {
    for (const t of Object.keys(PAINT_VARIANTS) as VehicleType[]) {
      const v = PAINT_VARIANTS[t];
      expect(v.length).toBeGreaterThanOrEqual(2);
      expect(v.length).toBeLessThanOrEqual(4);
      if (t !== 'cop') expect(new Set(v).size).toBe(v.length);
      for (const c of v) expect(/^#[0-9a-f]{6}$/i.test(c)).toBe(true);
    }
  });
  it('each variant goes through the carPaint path and shares one body geometry', () => {
    painted.length = 0;
    const cars = PAINT_VARIANTS.sedan.map((color) => buildCarModel('sedan', { ...VEHICLE_SPECS.sedan, color }, materials, 0));
    for (const color of PAINT_VARIANTS.sedan) expect(painted).toContain(color);
    expect(new Set(cars.map((x) => (x.group.getObjectByName('body') as THREE.Mesh).geometry)).size).toBe(1);
  });
});

describe('carBodies: lofting toolkit', () => {
  const weld = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position;
    const key = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    const ids = new Map<string, number>();
    const id = (i: number) => { const k = key(i); let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
    const edges = new Map<string, number>();
    const idx = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: p.count }, (_, i) => i);
    for (let t = 0; t < idx.length; t += 3) {
      const v = [id(idx[t]), id(idx[t + 1]), id(idx[t + 2])];
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3];
        if (a === b) continue;
        const e = a < b ? `${a}_${b}` : `${b}_${a}`;
        edges.set(e, (edges.get(e) ?? 0) + 1);
      }
    }
    return edges;
  };

  it('a hull lofted from a style profile is a closed, manifold surface', () => {
    const half = (u: number): [number, number][] => carHalf({ yT: 1.3 - 0.0 * u, yBelt: 0.95, yBot: 0.25, wMax: 0.88, wR: 0.65 });
    const us = [-2.2, -1.8, -1.2, -0.4, 0.4, 1.2, 1.8, 2.2];
    const hull = buildLoft({ us, half, creases: [6], cls: () => 'paint' });
    const edges = weld(hull.paint);
    let boundary = 0, bad = 0;
    for (const n of edges.values()) { if (n === 1) boundary++; else if (n > 2) bad++; }
    expect(boundary).toBe(0);
    expect(bad).toBe(0);
  });

  it('every shipped style profile has a monotone side profile, a sane plan profile and its stations ascend', () => {
    for (const [name, st] of Object.entries(STYLES)) {
      const us = st.secs.map((s) => s[0]);
      for (let i = 1; i < us.length; i++) expect(us[i]).toBeGreaterThan(us[i - 1]);
      expect(st.secs.every((s) => s.every(Number.isFinite)), name).toBe(true);
      const f = monotone(st.plan.map((p) => p[0]), st.plan.map((p) => p[1]));
      for (let u = -2.4; u <= 2.4; u += 0.1) { expect(f(u)).toBeGreaterThan(0.8); expect(f(u)).toBeLessThanOrEqual(1.001); }
      // hood line below roof line, deck below roof
      const top = Math.max(...st.secs.map((s) => s[1]));
      expect(st.secs[st.secs.length - 1][1]).toBeLessThan(top - 0.3);
      expect(st.secs[0][1]).toBeLessThan(top - 0.2);
    }
  });

  it('trim and chrome merge into one vertex-coloured geometry', () => {
    const dark = new Acc().add(bx(1, 1, 1, 0, 0, 0));
    const chrome = new Acc().add(bx(1, 1, 1, 2, 0, 0));
    const g = mergeTrim(dark, chrome);
    expect(triCount(g)).toBe(24);
    const col = g.attributes.color;
    expect(col.count).toBe(g.attributes.position.count);
    expect(col.getX(0)).toBeLessThan(0.2);
    expect(col.getX(col.count - 1)).toBeGreaterThan(0.6);
  });
});
