import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { splitMeshesIntoCells, cellOf } from '@/render/Culling';
import { writeYawMatrix, hysteresisFar, lampColor, applyCarShadowFlags } from '@/render/CarLod';
import { RenderProxies, buildStaticProxies, concatIndexed, isProxyable, transformInto } from '@/render/AoProxy';
import { placeMatrix } from '@/world/FurnitureGen';

function boxMesh(x: number, z: number, mat: THREE.Material = new THREE.MeshStandardMaterial()): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2).translate(x, 1, z), mat);
  m.updateMatrixWorld(true);
  return m;
}

describe('cell maths', () => {
  it('bins negative and positive coordinates consistently (floor, not trunc)', () => {
    const k = { ix: 0, iz: 0 };
    expect(cellOf(-0.01, -0.01, 100, 100, k)).toEqual({ ix: -1, iz: -1 });
    expect(cellOf(99.99, 100, 100, 100, k)).toEqual({ ix: 0, iz: 1 });
    expect(cellOf(-250, 200, 250, 200, k)).toEqual({ ix: -1, iz: 1 });
  });
});

describe('splitMeshesIntoCells and instancing', () => {
  it('never re-bins an InstancedMesh (its geometry is a local template)', () => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(2, 2, 2); // straddles the cell boundary at the origin
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 3);
    inst.name = 'inst';
    g.add(inst);
    const out = splitMeshesIntoCells(g, 1, 1);
    expect(out).toHaveLength(0);
    expect(g.children).toEqual([inst]);
    expect(inst.geometry).toBe(geo);
  });
});

describe('splitMeshesIntoCells minTris', () => {
  function twoBoxes(): THREE.Group {
    const g = new THREE.Group();
    const a = new THREE.BoxGeometry(2, 2, 2).translate(-300, 1, 50), b = new THREE.BoxGeometry(2, 2, 2).translate(300, 1, 50);
    const merged = concatIndexed([a, b]);
    g.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial()));
    return g;
  }
  it('splits a sparse mesh by default but keeps it whole below the triangle threshold', () => {
    expect(splitMeshesIntoCells(twoBoxes(), 125, 100)).toHaveLength(2);
    const g = twoBoxes();
    const out = splitMeshesIntoCells(g, 125, 100, undefined, 100);
    expect(out).toHaveLength(1);
    expect(g.children).toHaveLength(1);
    expect(splitMeshesIntoCells(twoBoxes(), 125, 100, undefined, 24)).toHaveLength(2); // exactly 24 tris is not below 24
  });
});

describe('writeYawMatrix', () => {
  it('equals translate * rotateY for any yaw', () => {
    for (const yaw of [0, 0.7, -2.4, Math.PI]) {
      const a = new THREE.Matrix4().makeRotationY(yaw).setPosition(12.5, 0, -7);
      const out = new Float32Array(32);
      writeYawMatrix(out, 16, 12.5, -7, yaw);
      for (let i = 0; i < 16; i++) expect(out[16 + i]).toBeCloseTo(a.elements[i], 6);
    }
  });
});

describe('hysteresisFar', () => {
  it('switches far beyond the radius and back only inside radius - margin', () => {
    expect(hysteresisFar(false, 31, 32, 4)).toBe(false);
    expect(hysteresisFar(false, 33, 32, 4)).toBe(true);
    expect(hysteresisFar(true, 30, 32, 4)).toBe(true);
    expect(hysteresisFar(true, 27.9, 32, 4)).toBe(false);
  });
});

describe('lampColor', () => {
  it('is emissive times intensity (HDR above 1 is allowed)', () => {
    const c = lampColor(new THREE.Color(1, 0.5, 0.25), 4, new THREE.Color());
    expect([c.r, c.g, c.b]).toEqual([4, 2, 1]);
  });
});

describe('applyCarShadowFlags', () => {
  it('casts only the big shapes, or nothing when proxied; never receives', () => {
    const root = new THREE.Group();
    for (const n of ['body', 'glass', 'tyre', 'trim']) { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); m.name = n; root.add(m); }
    applyCarShadowFlags(root);
    expect(root.children.map((c) => c.castShadow)).toEqual([true, false, false, true]);
    applyCarShadowFlags(root, true);
    expect(root.children.map((c) => c.castShadow)).toEqual([false, false, false, false]);
    expect(root.children.every((c) => !c.receiveShadow)).toBe(true);
  });
});

describe('placeMatrix', () => {
  it('composes translation, yaw and lean like Object3D', () => {
    const o = new THREE.Object3D();
    o.position.set(3, 1, -4); o.rotation.set(0.04, 1.1, -0.03); o.updateMatrix();
    const m = placeMatrix(new THREE.Matrix4(), 3, 1, -4, 1.1, [0.04, -0.03]);
    for (let i = 0; i < 16; i++) expect(m.elements[i]).toBeCloseTo(o.matrix.elements[i], 6);
  });
});

describe('proxy building', () => {
  it('isProxyable rejects alpha-cut, non-depth-writing and multi-material meshes', () => {
    expect(isProxyable(new THREE.MeshStandardMaterial())).toBe(true);
    expect(isProxyable(new THREE.MeshStandardMaterial({ alphaTest: 0.4 }))).toBe(false);
    expect(isProxyable(new THREE.MeshStandardMaterial({ depthWrite: false }))).toBe(false);
    expect(isProxyable([new THREE.MeshBasicMaterial()])).toBe(false);
  });

  it('transformInto translates points and only rotates normals', () => {
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(10, 0, 0);
    const p = new Float32Array(3), n = new Float32Array(3);
    transformInto([1, 0, 0], p, 0, 1, m.elements, false);
    transformInto([1, 0, 0], n, 0, 1, m.elements, true);
    expect([p[0], p[1], p[2]].map((v) => Math.round(v * 1e5) / 1e5)).toEqual([10, 0, -1]);
    expect([n[0], n[1], n[2]].map((v) => Math.round(v * 1e5) / 1e5)).toEqual([0, 0, -1]);
  });

  it('concatIndexed keeps triangle counts and offsets indices', () => {
    const a = new THREE.BoxGeometry(1, 1, 1), b = new THREE.BoxGeometry(1, 1, 1).translate(5, 0, 0);
    const c = concatIndexed([a, b]);
    expect(c.index!.count).toBe(a.index!.count + b.index!.count);
    expect(c.getAttribute('position').count).toBe(a.getAttribute('position').count * 2);
    let max = 0; for (const i of c.index!.array) max = Math.max(max, i);
    expect(max).toBe(c.getAttribute('position').count - 1);
    expect(c.boundingBox!.max.x).toBeCloseTo(5.5, 5);
  });

  it('bins all materials of a cell into one mesh per side class, keeps every triangle, bounds stay inside the cell', () => {
    const root = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial(), glass = new THREE.MeshStandardMaterial();
    root.add(boxMesh(10, 10, wall), boxMesh(20, 30, glass), boxMesh(150, 10, wall), boxMesh(-120, -130, glass));
    const fence = boxMesh(12, 12, new THREE.MeshStandardMaterial({ alphaTest: 0.5 }));
    root.add(fence);
    const build = buildStaticProxies([root], 100, 100);
    expect(build.covered).toHaveLength(4);
    expect(build.skipped).toEqual([fence]);
    expect(build.triangles).toBe(4 * 12);
    expect(build.proxies.map((p) => p.cell).sort()).toEqual(['-2_-2', '0_0', '1_0']);
    for (const p of build.proxies) {
      const [ix, iz] = p.cell.split('_').map(Number);
      const bb = p.geometry.boundingBox!;
      expect(bb.min.x).toBeGreaterThanOrEqual(ix * 100 - 1.01); expect(bb.max.x).toBeLessThanOrEqual((ix + 1) * 100 + 1.01);
      expect(bb.min.z).toBeGreaterThanOrEqual(iz * 100 - 1.01); expect(bb.max.z).toBeLessThanOrEqual((iz + 1) * 100 + 1.01);
      expect(p.geometry.getAttribute('normal')).toBeDefined();
      expect(p.geometry.getAttribute('uv')).toBeUndefined();
    }
  });

  it('expands instances and switches covered meshes off as shadow casters', () => {
    const root = new THREE.Group();
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 3);
    for (let i = 0; i < 3; i++) inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(50 + i * 100, 0, 50));
    inst.castShadow = true;
    root.add(inst); root.updateMatrixWorld(true);
    const proxies = new RenderProxies();
    const build = proxies.addStatic([root], 100, 100);
    expect(build.triangles).toBe(3 * 12);
    expect(build.proxies).toHaveLength(3); // one per cell: x = 50, 150, 250
    expect(inst.castShadow).toBe(false);
    expect(proxies.ao.children).toHaveLength(3);
    expect(proxies.shadowGroup.children).toHaveLength(3);
    expect(proxies.shadowGroup.visible).toBe(false);
  });

  it('the shadow group is visible only while the shadow map renders', () => {
    const proxies = new RenderProxies();
    let seen: boolean | null = null;
    const renderer = { shadowMap: { render: (() => { seen = proxies.shadowGroup.visible; }) as (...a: never[]) => void } };
    const undo = proxies.wrapShadowRender(renderer);
    renderer.shadowMap.render();
    expect(seen).toBe(true);
    expect(proxies.shadowGroup.visible).toBe(false);
    undo();
  });

  it('hull instances are counted per frame and written in order', () => {
    const proxies = new RenderProxies();
    proxies.addHull('sedan', new THREE.BoxGeometry(1, 1, 1), true);
    proxies.beginFrame();
    proxies.addCar('sedan', 5, 6, 0.5);
    proxies.addCar('sedan', 7, 8, 0);
    proxies.addCar('nope', 1, 1, 0);
    proxies.endFrame();
    const mesh = proxies.ao.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.array[12]).toBe(5);
    expect(mesh.instanceMatrix.array[16 + 14]).toBe(8);
    proxies.beginFrame(); proxies.endFrame();
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
  });
});

describe('CarLod', () => {
  function fakeModel(): import('@/entities/models/carModel').CarModel {
    const group = new THREE.Group();
    const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat); m.name = name; m.position.x = x; group.add(m); return m;
    };
    const lampMat = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(1, 0.9, 0.7), emissiveIntensity: 0 });
    add('body', new THREE.BoxGeometry(4, 1, 2).translate(0, 0.7, 0), new THREE.MeshStandardMaterial());
    add('glass', new THREE.BoxGeometry(2, 0.5, 1.8).translate(0, 1.4, 0), new THREE.MeshStandardMaterial());
    add('trim', new THREE.BoxGeometry(4, 0.1, 2), new THREE.MeshStandardMaterial());
    add('tyre', new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial(), 1.2);
    add('headlight', new THREE.BoxGeometry(0.2, 0.1, 0.1).translate(2, 0.6, 0), lampMat);
    add('taillight', new THREE.BoxGeometry(0.2, 0.1, 0.1).translate(-2, 0.6, 0), lampMat);
    return { group, wheels: [], steerPivots: [], headlights: [], taillights: [], paintMeshes: [], wheelRadius: 0.3, ownMaterials: [] };
  }
  const lib = {
    get: (k: string) => new THREE.MeshBasicMaterial({ name: k }),
    carPaint: (c: string) => new THREE.MeshStandardMaterial({ name: `paint:${c}` }),
    awning: () => new THREE.MeshBasicMaterial(), sign: () => new THREE.MeshBasicMaterial(), setNight: () => {},
  } as unknown as import('@/world/types').IMaterialLibrary;

  function car(type: string, color: string, lamps = false) {
    const root = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ emissive: new THREE.Color(1, 1, 1), emissiveIntensity: lamps ? 4 : 0 }));
    head.name = 'headlight'; root.add(head);
    return { object3D: root, spec: { type, color }, damage: 0 };
  }

  it('keeps near cars as full models and draws far cars as instances with the right pose and colour', async () => {
    const { CarLod } = await import('@/render/CarLod');
    const lod = new CarLod(lib, { buildModel: () => fakeModel(), exclude: ['cop'], nearDist: 30, margin: 4 });
    const near = car('sedan', '#ff0000'), far = car('sedan', '#00ff00'), lit = car('sedan', '#0000ff', true), cop = car('cop', '#ffffff');
    lod.beginFrame();
    expect(lod.place(near, 5, 5, 0, 10)).toBe(false);
    expect(near.object3D.visible).toBe(true);
    expect(lod.place(far, 100, 40, Math.PI / 2, 80)).toBe(true);
    expect(far.object3D.visible).toBe(false);
    expect(lod.place(lit, 120, 40, 0, 90)).toBe(true);
    expect(lod.place(cop, 130, 40, 0, 90)).toBe(false); // excluded type always keeps its model
    lod.endFrame();
    expect(lod.farCount).toBe(2);
    const paint = lod.group.children.find((c) => c.name.includes('paint')) as THREE.InstancedMesh;
    expect(paint.count).toBe(2);
    const e = paint.instanceMatrix.array as Float32Array;
    expect([e[12], e[14]]).toEqual([100, 40]);
    // heading pi/2 -> rotation.y = -pi/2: local +x maps to world +z... (cos, sin) of -pi/2
    expect(e[0]).toBeCloseTo(0, 5); expect(e[2]).toBeCloseTo(1, 5);
    const col = new THREE.Color(); paint.getColorAt(1, col);
    expect(col.getHex()).toBe(new THREE.Color('#0000ff').getHex());
    // only the lit car gets a head-lamp instance
    const head = lod.group.children.find((c) => c.name.includes('lamp') && (c as THREE.InstancedMesh).count === 1);
    expect(head).toBeDefined();
    // hull geometry for shadow / AO proxies exists and has positions + normals only
    const hull = lod.hullFor('sedan')!;
    expect(hull.getAttribute('normal')).toBeDefined();
    expect(hull.getAttribute('uv')).toBeUndefined();
    // low-poly tyre: a 10-gon instead of 24 sides keeps the bounding box
    const dark = lod.group.children.find((c) => c.name.includes('metalDark')) as THREE.InstancedMesh;
    const tris = dark.geometry.getAttribute('position').count / 3;
    expect(tris).toBeLessThan(12 + 12 + 24 * 4); // trim box (12) + 10-gon tyre (40), far below a 24-sided tyre
  });

  it('hysteresis, damage and capacity fall back to the full model', async () => {
    const { CarLod } = await import('@/render/CarLod');
    const lod = new CarLod(lib, { buildModel: () => fakeModel(), nearDist: 30, margin: 4 });
    const c = car('sedan', '#123456');
    lod.beginFrame(); lod.place(c, 0, 0, 0, 35); lod.endFrame();
    expect(c.object3D.visible).toBe(false);
    lod.beginFrame(); expect(lod.place(c, 0, 0, 0, 28)).toBe(true); lod.endFrame(); // still far inside the margin
    lod.beginFrame(); expect(lod.place(c, 0, 0, 0, 25)).toBe(false); lod.endFrame();
    expect(c.object3D.visible).toBe(true);
    const wrecked = car('sedan', '#654321'); wrecked.damage = 0.5;
    lod.beginFrame(); expect(lod.place(wrecked, 0, 0, 0, 90)).toBe(false); lod.endFrame();
    expect(wrecked.object3D.visible).toBe(true);
  });

  it('skips far cars outside the camera frustum', async () => {
    const { CarLod } = await import('@/render/CarLod');
    const lod = new CarLod(lib, { buildModel: () => fakeModel(), nearDist: 10 });
    const cam = new THREE.PerspectiveCamera(60, 1.78, 0.1, 500);
    cam.position.set(0, 2, 0); cam.lookAt(0, 2, -100); cam.updateMatrixWorld(true);
    lod.setView(cam);
    const ahead = car('sedan', '#111111'), behind = car('sedan', '#222222');
    lod.beginFrame();
    lod.place(ahead, 0, -60, 0, 60); lod.place(behind, 0, 60, 0, 60);
    lod.endFrame();
    expect(lod.farCount).toBe(1);
    expect(behind.object3D.visible).toBe(false);
  });
});
