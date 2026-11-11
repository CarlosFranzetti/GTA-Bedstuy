import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarModel, styleFor, PAINT_VARIANTS, type CarStyle } from '@/entities/models/carModel';
import { CARGO_PLAIN_STRIP } from '@/textures/painters/vehicle';
import { CARGO_STRIP, boxLiveryUV, buildLoft, carHalf, isTaxiYellow, mergeTrim, Acc, bx, STYLES, monotone } from '@/entities/models/carBodies';
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
  { style: 'cargo', type: 'cargovan' },
  { style: 'hatch', type: 'hatch' },
  { style: 'beater', type: 'beater' },
  { style: 'bus', type: 'bus' },
  { style: 'pickup', type: 'pickup' },
  { style: 'crossover', type: 'crossover' },
  { style: 'minivan', type: 'minivan' },
  { style: 'luxury', type: 'luxury' },
  { style: 'towncar', type: 'towncar' },
  { style: 'pony', type: 'pony' },
  { style: 'garbage', type: 'garbage' },
  { style: 'ambulance', type: 'ambulance' },
  { style: 'dollar', type: 'dollarvan' },
];
const SIX = (c: Case): boolean => c.style === 'garbage';
const BARRED = (c: Case): boolean => c.style === 'cop' || c.style === 'ambulance';
const build = (c: Case) => buildCarModel(c.type, { ...VEHICLE_SPECS[c.type], color: c.color ?? VEHICLE_SPECS[c.type].color }, materials, c.variant ?? 0, undefined, true);
/** the shipped near car: merged details + instanced wheels */
const buildNear = (c: Case) => buildCarModel(c.type, { ...VEHICLE_SPECS[c.type], color: c.color ?? VEHICLE_SPECS[c.type].color }, materials, c.variant ?? 0);

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
    expect(styleFor('cargovan', '#fff')).toBe('cargo');
    expect(styleFor('hatch', '#e0b01e')).toBe('hatch');
    expect(styleFor('beater', '#fff', 3)).toBe('beater');
    expect(styleFor('bus', '#fff')).toBe('bus');
    expect(styleFor('cop', '#fff', 0, true)).toBe('unmarked');
    for (const t of ['pickup', 'crossover', 'minivan', 'luxury', 'towncar', 'pony', 'garbage', 'ambulance'] as const) expect(styleFor(t, '#fff')).toBe(t);
    expect(styleFor('dollarvan', '#fff')).toBe('dollar');
    expect(styleFor('cab', '#e0b01e', 0)).toBe('cab'); // the taxi is its own vehicle type
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
    // roster bodies (cab, cruiser) carry their own spec-sheet size
    const dims = c.style === 'cab' ? STYLES.crown.dims! : c.style === 'cop' ? STYLES.charger.dims! : { L: spec.length, W: spec.width, H: spec.height };
    expect(Math.abs(s.z - dims.L)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(s.x - dims.W)).toBeLessThanOrEqual(0.05);
    // the roof light / light bar / roof rails stand on the roof: the hull itself reaches the spec height
    expect(Math.abs(body.max.y - dims.H)).toBeLessThanOrEqual(c.style === 'cop' || c.style === 'cab' ? 0.2 : 0.05);
    expect(all.min.y).toBeGreaterThanOrEqual(-0.02);
    expect(all.min.y).toBeLessThanOrEqual(0.02);
  });

  it('stays within the triangle budget', () => {
    const budget = 9000; // roster bodies: GTA4 near budget 6-8 k
    expect(totalTris(m.group)).toBeLessThanOrEqual(budget);
  });

  it('is at most 10 draw calls (one mesh per material, wheels aside)', () => {
    expect(meshes(m.group).length).toBeLessThanOrEqual(BARRED(c) ? 12 : 10);
    const nonWheel = meshes(m.group).filter((x) => x.name !== 'tyre');
    expect(nonWheel.length).toBeLessThanOrEqual(BARRED(c) ? 9 : 7);
  });

  it('wheels sit at the axles of the spec footprint', () => {
    expect(m.wheels).toHaveLength(SIX(c) ? 6 : 4);
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
    expect(rear).toHaveLength(SIX(c) ? 4 : 2);
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
    expect(!!m.hood).toBe(c.style !== 'van' && c.style !== 'bus' && c.style !== 'garbage');
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
      const limit = mesh.name === 'tyre' || mesh.name === 'headlight' || mesh.name === 'taillight' ? 0 : mesh.name === 'body' || mesh.name === 'hood' || mesh.name === 'cargo' ? 0.01 : 0.5;
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

describe.each(CASES)('merged near $style', (c) => {
  const m = buildNear(c);
  const drawn = (): THREE.Mesh[] => meshes(m.group).filter((x) => x.visible);
  it('draws in at most 6 meshes (cargo vans, cabs and cops included)', () => {
    expect(drawn().length).toBeLessThanOrEqual(6);
    expect(drawn().filter((x) => x.name === 'tyre')).toHaveLength(1);
    expect((drawn().find((x) => x.name === 'tyre') as THREE.InstancedMesh).count).toBe(c.style === 'van' || c.style === 'bus' || c.style === 'garbage' ? 6 : 4); // dual rear tyres on the truck and the bus
  });
  it('keeps the lamp and light-bar API as invisible handles with their own materials', () => {
    expect(m.headlights[0].visible).toBe(false);
    expect(m.headlights[0].material).not.toBe(m.taillights[0].material);
    expect(m.headlights[0].name).toBe('headlight');
    expect(m.taillights[0].name).toBe('taillight');
    if (BARRED(c)) { expect(m.lightbar!.red.material).not.toBe(m.lightbar!.blue.material); expect(m.lightbar!.red.visible).toBe(false); }
    else expect(m.lightbar).toBeUndefined();
  });
  it('the trim mesh carries lamp kinds and lights them from the handle materials', () => {
    const trim = m.group.getObjectByName('trim') as THREE.Mesh;
    const kind = trim.geometry.getAttribute('carKind');
    const kinds = new Set<number>();
    for (let i = 0; i < kind.count; i++) kinds.add(kind.getX(i));
    expect([...kinds].sort()).toEqual(BARRED(c) ? [0, 1, 2, 3, 4] : [0, 1, 2]);
    const hm = m.headlights[0].material as THREE.MeshStandardMaterial;
    hm.emissiveIntensity = 2;
    const mat = trim.material as THREE.Material & { onBeforeCompile: (s: { uniforms: Record<string, { value: THREE.Color }>; vertexShader: string; fragmentShader: string }) => void };
    const sh = { uniforms: {} as Record<string, { value: THREE.Color }>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>' };
    mat.onBeforeCompile(sh);
    trim.onBeforeRender({} as never, {} as never, {} as never, trim.geometry, mat, {} as never);
    expect(sh.uniforms.uHead.value.r).toBeGreaterThan(1.5);
    expect(sh.uniforms.uTail.value.r).toBe(0);
    expect(sh.fragmentShader).toContain('uHead');
    expect(sh.vertexShader).toContain('carKind');
    hm.emissiveIntensity = 0;
  });
  it('wheel instances follow the roll and steer pivots, left hubcaps flipped outward', () => {
    const set = m.group.getObjectByName('tyre') as THREE.InstancedMesh;
    m.steerPivots[0].rotation.y = 0.4;
    m.wheels[1].rotation.x = 1.1;
    m.group.updateMatrixWorld(true);
    const mt = new THREE.Matrix4();
    set.getMatrixAt(0, mt);
    const steer = m.wheels[0].parent!;
    const want = new THREE.Matrix4().multiplyMatrices(steer.matrix, m.wheels[0].matrix);
    if (steer.position.x < 0) want.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    expect(mt.elements.every((v, i) => Math.abs(v - want.elements[i]) < 1e-5)).toBe(true);
    m.group.updateMatrixWorld(true);
    set.getMatrixAt(1, mt);
    const roll1 = new THREE.Matrix4().multiplyMatrices(m.wheels[1].parent!.matrix, m.wheels[1].matrix);
    if (m.wheels[1].parent!.position.x < 0) roll1.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    expect(mt.elements.every((v, i) => Math.abs(v - roll1.elements[i]) < 1e-5)).toBe(true);
    expect(new THREE.Vector3().setFromMatrixPosition(mt).y).toBeCloseTo(m.wheelRadius, 6);
    expect(set.boundingSphere).toBeTruthy();
    set.getMatrixAt(3, mt);
    expect(new THREE.Vector3().setFromMatrixPosition(mt).z).toBeGreaterThan(0);
  });
  it('farSource rebuilds the split structure CarLod cuts the far proxies from', () => {
    const far = m.farSource!();
    expect(far.farSource).toBeUndefined();
    expect(far.group.getObjectByName('headlight')!.visible).toBe(true);
    expect(meshes(far.group).length).toBeGreaterThan(drawn().length);
  });
});

describe('carBodies: paint variants', () => {
  it('2 to 4 variants per type, all valid colours, distinct', () => {
    for (const t of Object.keys(PAINT_VARIANTS) as VehicleType[]) {
      const v = PAINT_VARIANTS[t];
      expect(v.length).toBeGreaterThanOrEqual(2);
      expect(v.length).toBeLessThanOrEqual(4);
      if (t !== 'cop' && t !== 'cab' && t !== 'garbage' && t !== 'ambulance') expect(new Set(v).size).toBe(v.length);
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

describe('cargo box livery UVs', () => {
  const van = () => meshes(build({ style: 'van', type: 'boxtruck' }).group).find((m) => m.name === 'cargo')!;
  it('the plain-strip constant matches the painter', () => { expect(CARGO_STRIP).toBe(CARGO_PLAIN_STRIP); });
  it('side faces lay the livery out once along the box, mirrored so the text reads on both flanks', () => {
    const g = van().geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    let left = 0, right = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nor.getX(i)) < 0.95) continue;
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0); expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 - 2 * CARGO_STRIP + 1e-6);
      const t = (pos.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z);
      if (nor.getX(i) < 0) { expect(uv.getX(i)).toBeCloseTo(t, 4); left++; } else { expect(uv.getX(i)).toBeCloseTo(1 - t, 4); right++; }
    }
    expect(left).toBeGreaterThan(0); expect(right).toBeGreaterThan(0);
  });
  it('the roof samples the plain strip', () => {
    const g = van().geometry, nor = g.attributes.normal, uv = g.attributes.uv;
    let roof = 0;
    for (let i = 0; i < nor.count; i++) if (nor.getY(i) > 0.99) { expect(uv.getY(i)).toBeGreaterThan(1 - CARGO_STRIP); roof++; }
    expect(roof).toBeGreaterThan(0);
  });
  it('boxLiveryUV is safe on a geometry without uv', () => {
    const g = new THREE.BoxGeometry(2, 2, 4); g.deleteAttribute('uv');
    boxLiveryUV(g);
    expect(g.attributes.uv.count).toBe(g.attributes.position.count);
  });
});
