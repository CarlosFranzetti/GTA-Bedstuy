/**
 * The world pickups drawn as instances: one InstancedMesh per kind (bottle, brick, pistol) and one for all the glows, so any
 * number of pickups in view costs at most four draw calls (it was two to three per pickup: the item's parts and its glow
 * sprite). Pure presentation: the simulation only calls `CombatView.pickups`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PickupDef, PickupKind } from './pickups';

/** Most pickups drawn at once per kind (the view radius holds a handful; this is a safety cap, not a target). */
export const MAX_PICKUP_INSTANCES = 64;
export const PICKUP_KINDS: readonly PickupKind[] = ['bottle', 'brick', 'pistol'];
/** COMBAT2: the new kinds share three instanced meshes (a stick, a box, a long gun), told apart by colour and scale. */
export const SHARED_MESHES = ['club', 'box', 'gun2'] as const;
type MeshKey = PickupKind | (typeof SHARED_MESHES)[number];
const MESH_OF: Record<PickupKind, MeshKey> = { bottle: 'bottle', brick: 'brick', pistol: 'pistol', bat: 'club', pipe: 'club', fish: 'box', ammo: 'box', revolver: 'gun2', shotgun: 'gun2' };
/** colour and size of each shared kind */
const LOOK: Partial<Record<PickupKind, { color: number; sx: number; sy: number; sz: number }>> = {
  bat: { color: 0xb98a55, sx: 1, sy: 1, sz: 1 }, pipe: { color: 0x7d8790, sx: 0.8, sy: 0.9, sz: 0.9 },
  fish: { color: 0x9fb8c9, sx: 1, sy: 1, sz: 1 }, ammo: { color: 0x6b7a45, sx: 0.55, sy: 1.3, sz: 0.65 },
  revolver: { color: 0x3a3d44, sx: 1, sy: 1, sz: 1.15 }, shotgun: { color: 0x4a3a2c, sx: 1, sy: 1, sz: 2.3 },
};
const GLOW_COLOR: Record<PickupKind, number> = { bottle: 0x9fe8c0, brick: 0xffc08a, pistol: 0xfff0a0, bat: 0xffd9a0, pipe: 0xcfe0ee, fish: 0xa8e4ff, revolver: 0xffe58a, shotgun: 0xffcf7a, ammo: 0xd6f09a };
const GLOW_SIZE = 1.15;

export interface PickupParts {
  bottleBody: THREE.BufferGeometry; bottleNeck: THREE.BufferGeometry; brick: THREE.BufferGeometry;
  pistolSlide: THREE.BufferGeometry; pistolGrip: THREE.BufferGeometry;
}
export interface PickupMaterials { glass: THREE.Material; brick: THREE.Material; gun: THREE.Material }

const placed = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number): THREE.BufferGeometry => {
  const c = g.clone();
  c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1)));
  return c;
};

export class PickupInstances {
  readonly group = new THREE.Group();
  readonly items = {} as Record<MeshKey, THREE.InstancedMesh>;
  readonly glow: THREE.InstancedMesh;
  private readonly own: THREE.BufferGeometry[] = [];
  private readonly ownMats: THREE.Material[] = [];
  private readonly base = {} as Record<PickupKind, THREE.Matrix4>;
  private readonly lookM = new THREE.Matrix4();
  private readonly pos: number[] = [];
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly spin = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(parts: PickupParts, mats: PickupMaterials, glowMap: THREE.Texture) {
    this.group.name = 'pickups';
    const bottle = mergeGeometries([parts.bottleBody.clone(), placed(parts.bottleNeck, 0, 0.135, 0, 0)])!;
    const pistol = mergeGeometries([placed(parts.pistolSlide, 0, -0.075, 0, Math.PI / 2), placed(parts.pistolGrip, 0, 0, 0.05, Math.PI / 2 + 0.2)])!;
    this.own.push(bottle, pistol);
    const make = (kind: MeshKey, geo: THREE.BufferGeometry, mat: THREE.Material): void => {
      const m = new THREE.InstancedMesh(geo, mat, MAX_PICKUP_INSTANCES);
      m.name = `pickup:${kind}`; m.count = 0; m.visible = false; m.frustumCulled = false; // the bounding sphere of an InstancedMesh is taken once: never trust it for moving instances
      this.items[kind] = m; this.group.add(m);
    };
    make('bottle', bottle, mats.glass); make('brick', parts.brick, mats.brick); make('pistol', pistol, mats.gun);
    // COMBAT2: a tapered stick (bat, pipe), a flat box (fish, ammo) and the pistol again, lengthened (revolver, shotgun)
    const club = new THREE.CylinderGeometry(0.045, 0.02, 0.8, 8); club.rotateZ(Math.PI / 2); const box = new THREE.BoxGeometry(0.34, 0.07, 0.12);
    this.own.push(club, box);
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff }); this.ownMats.push(white);
    make('club', club, white); make('box', box, white); make('gun2', pistol, white);
    for (const m of SHARED_MESHES) this.items[m].setColorAt(0, this.tmpC.set(0xffffff));
    // the item's own pose inside its spinning holder (what the per-pickup groups used to carry)
    const T = (x: number, rz: number, s: number): THREE.Matrix4 => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(s, s, s));
    this.base.pistol = T(0.17, Math.PI / 2, 1.7); this.base.bottle = T(0, 0.5, 1.6); this.base.brick = T(0, 0, 1.8);
    this.base.bat = T(0, 0.35, 1.1); this.base.pipe = T(0, 0.35, 1.0); this.base.fish = T(0, 0.2, 1.3); this.base.ammo = T(0, 0, 1.2); this.base.revolver = T(0.17, Math.PI / 2, 1.8); this.base.shotgun = T(0.3, Math.PI / 2, 1.6);
    const quad = new THREE.PlaneGeometry(1, 1); this.own.push(quad);
    this.glow = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ map: glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), MAX_PICKUP_INSTANCES * PICKUP_KINDS.length);
    this.glow.name = 'pickup:glow'; this.glow.count = 0; this.glow.visible = false; this.glow.frustumCulled = false; this.glow.renderOrder = 4;
    this.glow.setColorAt(0, this.tmpC.set(0xffffff));
    // billboards: the quads face whichever camera draws them
    this.glow.onBeforeRender = (_r, _s, camera): void => {
      camera.getWorldQuaternion(this.tmpQ); this.tmpS.set(GLOW_SIZE, GLOW_SIZE, 1);
      for (let i = 0; i < this.glow.count; i++) { this.tmpP.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]); this.glow.setMatrixAt(i, this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS)); }
      this.glow.instanceMatrix.needsUpdate = true;
    };
    this.group.add(this.glow);
  }

  /** Shows the pickups of `list` within `radius` of (px, pz); `groundY(x, z)` is the ground height; `t` drives the spin, bob and pulse. */
  update(list: Iterable<PickupDef>, px: number, pz: number, t: number, radius: number, groundY: (x: number, z: number) => number): void {
    const n = {} as Record<MeshKey, number>;
    for (const k of [...PICKUP_KINDS, ...SHARED_MESHES]) n[k] = 0;
    let g = 0; this.pos.length = 0;
    for (const d of list) {
      const key = MESH_OF[d.kind];
      const dx = d.x - px, dz = d.z - pz;
      if (dx * dx + dz * dz > radius * radius || n[key] >= MAX_PICKUP_INSTANCES) continue;
      let h = 0; for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) >>> 0;
      const phase = (h % 628) / 100;
      const y = groundY(d.x, d.z) + 0.62 + Math.sin(t * 2.2 + phase) * 0.07;
      this.spin.setFromAxisAngle(this.up, t * 1.3 + phase);
      this.tmpM.compose(this.tmpP.set(d.x, y, d.z), this.spin, this.tmpS.set(1, 1, 1)).multiply(this.base[d.kind]);
      const look = LOOK[d.kind];
      if (look) this.tmpM.multiply(this.lookM.makeScale(look.sx, look.sy, look.sz));
      this.items[key].setMatrixAt(n[key], this.tmpM);
      if (look) this.items[key].setColorAt(n[key], this.tmpC.set(look.color));
      n[key]++;
      this.pos.push(d.x, y, d.z);
      this.glow.setColorAt(g, this.tmpC.set(GLOW_COLOR[d.kind]).multiplyScalar(0.5 + 0.2 * Math.sin(t * 3 + phase)));
      g++;
    }
    for (const k of [...PICKUP_KINDS, ...SHARED_MESHES]) { const m = this.items[k]; m.count = n[k]; m.visible = n[k] > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.glow.count = g; this.glow.visible = g > 0;
    if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }

  /** Pickups drawn right now (tests). */
  get shown(): number { return this.glow.count; }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.own) g.dispose();
    (this.glow.material as THREE.Material).dispose();
    for (const k of [...PICKUP_KINDS, ...SHARED_MESHES]) this.items[k].dispose();
    for (const m of this.ownMats) m.dispose();
    this.glow.dispose();
  }
}
