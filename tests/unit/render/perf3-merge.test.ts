import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CarLod, HEAD_LAMP_RGB, TAIL_LAMP_RGB, lampLevel, mergeLamps } from '@/render/CarLod';
import { InstanceCuller, ChunkCuller } from '@/render/Culling';
import { TRIM_MESH } from '@/render/TierGeometry';
import { PHONE_BLOOM_MIPS, trimBloomMips } from '@/render/BloomTrim';
import { TREE_THIN } from '@/world/roadnet/propsReal';

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

describe('far-car draw merge (CarLod)', () => {
  const lib = {
    get: (k: string) => new THREE.MeshBasicMaterial({ name: k }),
    carPaint: (c: string) => new THREE.MeshStandardMaterial({ name: `paint:${c}` }),
  } as unknown as import('@/world/types').IMaterialLibrary;
  const model = (withCargo: boolean): import('@/entities/models/carModel').CarModel => {
    const group = new THREE.Group();
    const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0): void => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.x = x; group.add(m); };
    const lamp = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(1, 0.9, 0.7), emissiveIntensity: 0 });
    add('body', box(4, 1, 2, 0, 0.7), new THREE.MeshStandardMaterial());
    if (withCargo) add('cargo', box(2, 1.5, 2, -1, 1.5), new THREE.MeshStandardMaterial());
    add('glass', box(2, 0.5, 1.8, 0, 1.4), new THREE.MeshStandardMaterial());
    add('trim', box(4, 0.1, 2), new THREE.MeshStandardMaterial());
    add('tyre', new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial(), 1.2);
    add('headlight', box(0.2, 0.1, 0.1, 2, 0.6), lamp);
    add('taillight', box(0.2, 0.1, 0.1, -2, 0.6), lamp);
    return { group, wheels: [], steerPivots: [], headlights: [], taillights: [], paintMeshes: [], wheelRadius: 0.3, ownMaterials: [] };
  };
  const car = (type: string, head: number, tail: number) => {
    const root = new THREE.Group();
    const mk = (name: string, i: number): void => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ emissive: new THREE.Color(1, 1, 1), emissiveIntensity: i })); m.name = name; root.add(m); };
    mk('headlight', head); mk('taillight', tail);
    return { object3D: root, spec: { type, color: '#336699' }, damage: 0 };
  };

  it('a type costs at most paint + dark + lamp = 3 draws (was up to 6), a van\'s cargo rides in the paint mesh', () => {
    const lod = new CarLod(lib, { buildModel: () => model(true), nearDist: 30 });
    lod.beginFrame();
    expect(lod.place(car('van', 3, 1), 100, 0, 0, 80)).toBe(true);
    lod.endFrame();
    const meshes = lod.group.children as THREE.InstancedMesh[];
    expect(meshes.length).toBe(3);
    expect(meshes.filter((m) => m.visible).length).toBe(3);
    const paint = meshes.find((m) => m.name.includes('paint'))!;
    const bodyOnly = new CarLod(lib, { buildModel: () => model(false), nearDist: 30 });
    bodyOnly.beginFrame(); bodyOnly.place(car('van', 0, 0), 100, 0, 0, 80); bodyOnly.endFrame();
    const plainPaint = (bodyOnly.group.children as THREE.InstancedMesh[]).find((m) => m.name.includes('paint'))!;
    expect(paint.geometry.getAttribute('position').count).toBeGreaterThan(plainPaint.geometry.getAttribute('position').count);
  });

  it('by day (no lamps lit) the lamp mesh is not drawn at all: 2 draws per type', () => {
    const lod = new CarLod(lib, { buildModel: () => model(false), nearDist: 30 });
    lod.beginFrame();
    lod.place(car('sedan', 0, 0), 100, 0, 0, 80);
    lod.place(car('sedan', 0, 0), 110, 0, 0, 80);
    lod.endFrame();
    expect((lod.group.children as THREE.InstancedMesh[]).filter((m) => m.visible).length).toBe(2);
  });

  it('a lit car gets one lamp instance whose colour is the brighter of head and tail; a tail-only car gets none', () => {
    const lod = new CarLod(lib, { buildModel: () => model(false), nearDist: 30 });
    lod.beginFrame();
    lod.place(car('sedan', 2, 5), 100, 0, 0, 80);
    lod.place(car('sedan', 0, 4), 110, 0, 0, 80);
    lod.endFrame();
    const lamp = (lod.group.children as THREE.InstancedMesh[]).find((m) => m.name.includes('lamp'))!;
    expect(lamp.count).toBe(1);
    const c = new THREE.Color(); lamp.getColorAt(0, c);
    expect(c.r).toBeCloseTo(5, 5); expect(c.g).toBeCloseTo(5, 5);
  });

  it('lampLevel and mergeLamps', () => {
    expect(lampLevel(0, 9)).toBe(0);
    expect(lampLevel(0.05, 9)).toBe(0);
    expect(lampLevel(2, 1)).toBe(2);
    expect(lampLevel(2, 6)).toBe(6);
    const g = mergeLamps(box(0.2, 0.1, 0.1, 2), box(0.2, 0.1, 0.1, -2))!;
    const col = g.getAttribute('color');
    const n = g.getAttribute('position').count;
    expect(col.count).toBe(n);
    // the +x half (head) carries the head colour, the -x half (tail) the tail colour
    let head = 0, tail = 0;
    for (let i = 0; i < n; i++) {
      const isHead = g.getAttribute('position').getX(i) > 0;
      const want = isHead ? HEAD_LAMP_RGB : TAIL_LAMP_RGB;
      expect(col.getX(i)).toBeCloseTo(want.r, 5);
      expect(col.getZ(i)).toBeCloseTo(want.b, 5);
      if (isHead) head++; else tail++;
    }
    expect(head).toBe(tail);
    expect(mergeLamps(null, null)).toBeNull();
    expect(mergeLamps(box(1, 1, 1), null)!.getAttribute('position').count).toBe(36);
  });
});

describe('phone bloom keeps 3 of 5 blur levels', () => {
  it('trims the pass: 4 fewer draws, the dropped levels weigh zero, no sampler reads an undrawn level', () => {
    const b = new UnrealBloomPass(new THREE.Vector2(64, 64), 1, 0.4, 0.8);
    expect(b.nMips).toBe(5);
    expect(trimBloomMips(b as never)).toBe(true);
    expect(b.nMips).toBe(PHONE_BLOOM_MIPS);
    for (let i = 3; i < 5; i++) {
      expect(b.bloomTintColors[i].toArray()).toEqual([0, 0, 0]);
      expect(b.compositeMaterial.uniforms['blurTexture' + (i + 1)].value).toBe(b.renderTargetsVertical[2].texture);
    }
    expect(b.bloomTintColors[2].x).toBeGreaterThan(1);
    b.setSize(128, 128); // must not touch the dropped levels
    expect(trimBloomMips(b as never)).toBe(false); // already trimmed
  });
});

describe('InstanceCuller leaves index-bound instances alone', () => {
  it('a mesh flagged noInstanceCull is not registered and keeps every instance', () => {
    const mk = (flag: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
      for (let i = 0; i < 4; i++) m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 100, 0, 0));
      m.userData.noInstanceCull = flag;
      return m;
    };
    const cull = new InstanceCuller(); const a = mk(true), b = mk(false);
    cull.add(a); cull.add(b);
    expect(cull.count).toBe(1);
    cull.setRange(150); cull.update(0, 0);
    expect(a.count).toBe(4);
    expect(b.count).toBe(2);
  });
});

describe('real-map props: trim class and tree thinning', () => {
  it('street-name blades, stop boards and signal parts are trim meshes; poles, trees and lamps are not', () => {
    for (const n of ['props:sign:Broadway', 'props:stopsigns', 'props:signal-poles', 'props:signal-lamps']) expect(TRIM_MESH.test(n), n).toBe(true);
    for (const n of ['furniture:lamp', 'furniture:treeLeaves', 'props:bags']) expect(TRIM_MESH.test(n), n).toBe(false);
  });
  it('ChunkCuller drops a chunk\'s blades beyond the trim range but keeps its trees', () => {
    const mk = (name: string): THREE.Mesh => { const m = new THREE.Mesh(box(10, 4, 10, 200, 0, 0), new THREE.MeshBasicMaterial()); m.name = name; m.userData.chunk = 'c'; return m; };
    const blade = mk('props:sign:Fulton St'), tree = mk('furniture:treeLeaves');
    const cc = new ChunkCuller(500);
    cc.trimOverride = 150;
    cc.add(blade); cc.add(tree);
    cc.update(0, 0); // chunk edge at 195 m
    expect(blade.visible).toBe(false);
    expect(tree.visible).toBe(true);
    cc.update(100, 0);
    expect(blade.visible).toBe(true);
  });
  it('thinning keeps every tree on medium/high and a share on low/phone', () => {
    expect(TREE_THIN.high).toBe(1); expect(TREE_THIN.medium).toBe(1);
    expect(TREE_THIN.low).toBeGreaterThan(1); expect(TREE_THIN.phone).toBeGreaterThanOrEqual(TREE_THIN.low);
  });
});
