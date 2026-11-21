/**
 * MAP4: street furniture of the outer rings, streamed. REAL PATH ONLY (imported dynamically by realWorld.ts).
 *
 * The whole R4 map would be 9,100 furniture meshes and 4.1 M triangles at boot, so the first two rings (plus a margin) keep the
 * one-shot build and everything outside it is built per 512 m tile as the player comes near, with the same generator
 * (`buildRealProps` with a `regionFn`: an edge belongs to the tile of its midpoint, a junction to the tile of its node).
 * Measured on the R4 net: a tile is 70..110 ms, about 200 meshes and 75 k triangles.
 *
 * What it does not do (needs src/main.ts or src/render/NightLights.ts, not this lane's): the pooled night lights are fixed at
 * start (`new NightLights(scene, world.lamps)` sizes its arrays once), so lamps of streamed tiles are lit posts only; their
 * spots are in `lamps` for when NightLights takes additions. Meshes are not in main's ChunkCuller (it is filled once), so each
 * tile hides its own meshes beyond `range` and drops itself beyond `drop`.
 */
import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';
import type { StaticCollider } from '@/world/types';
import type { LampSpot } from '@/world/FurnitureGen';
import type { RealProps } from './propsReal';

export interface PropsStreamHost {
  add(colliders: StaticCollider[]): void;
  remove(ids: string[]): void;
}

export interface PropsStreamOptions {
  /** the generator: builds the furniture of the points `inTile` accepts */
  build: (inTile: (p: Vec2) => boolean, key: string) => RealProps;
  /** where the tile groups go (the world group: the tile group sits at sidewalk height itself) */
  parent: THREE.Object3D;
  colliders: PropsStreamHost;
  /** net bounds: tiles outside are never visited */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** points the one-shot build already covers (the first two rings plus margin) */
  covered: (p: Vec2) => boolean;
  /** a tile is built when the player is within `load` m of it and dropped beyond `drop` m (m) */
  load: number;
  drop: number;
  /** meshes farther than this from the player are hidden (m) */
  range: number;
  tileM?: number;
  /** tiles built per update call at most */
  perUpdate?: number;
}

interface Tile {
  key: string;
  props: RealProps | null;
  ids: string[];
  meshes: Array<{ m: THREE.Mesh; c: THREE.Vector3; r: number }>;
  empty: boolean;
}

export class RingPropsStreamer {
  /** lamp heads of every resident tile (the form world.lamps takes) */
  readonly lamps: LampSpot[] = [];
  private readonly tiles = new Map<string, Tile>();
  private readonly tileM: number;
  private cull = 0;
  private built = 0;
  private lastX = NaN;
  private lastZ = NaN;

  constructor(private readonly o: PropsStreamOptions) { this.tileM = o.tileM ?? 512; }

  /** resident tiles with furniture */
  get resident(): number { let n = 0; for (const t of this.tiles.values()) if (t.props) n++; return n; }
  /** tiles built since the start */
  get totalBuilt(): number { return this.built; }
  /** every resident tile's group (the signal controller recolours the lamps under them) */
  groups(): THREE.Object3D[] { const g: THREE.Object3D[] = []; for (const t of this.tiles.values()) if (t.props) g.push(t.props.group); return g; }
  stats(): { resident: number; built: number; meshes: number; triangles: number } {
    let meshes = 0, triangles = 0;
    for (const t of this.tiles.values()) if (t.props) { meshes += t.props.stats.meshes; triangles += t.props.stats.triangles; }
    return { resident: this.resident, built: this.built, meshes, triangles };
  }

  private box(ix: number, iz: number): [number, number, number, number] { return [ix * this.tileM, iz * this.tileM, (ix + 1) * this.tileM, (iz + 1) * this.tileM]; }
  private distTo(b: [number, number, number, number], x: number, z: number): number {
    return Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));
  }

  private load(ix: number, iz: number): void {
    const key = `${ix}_${iz}`;
    const b = this.box(ix, iz);
    const tile: Tile = { key, props: null, ids: [], meshes: [], empty: true };
    this.tiles.set(key, tile);
    const inTile = (p: Vec2): boolean => p.x >= b[0] && p.x < b[2] && p.z >= b[1] && p.z < b[3] && !this.o.covered(p);
    let props: RealProps;
    try { props = this.o.build(inTile, key); } catch { return; } // a failed tile stays empty and is not retried
    this.built++;
    if (!props.chunkMeshes.length && !props.colliders.length) return;
    tile.props = props;
    tile.empty = false;
    // collider ids restart at 0 in every build: make them unique per tile
    for (const c of props.colliders) { c.id = `t${key}:${c.id ?? ''}`; tile.ids.push(c.id); }
    this.o.colliders.add(props.colliders);
    this.o.parent.add(props.group);
    for (const m of props.chunkMeshes) {
      const sp = (m as THREE.InstancedMesh).boundingSphere ?? (m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere));
      const c = sp ? sp.center.clone().add(new THREE.Vector3(0, 0, 0)) : new THREE.Vector3();
      tile.meshes.push({ m, c, r: sp ? sp.radius : 0 });
    }
    this.lamps.push(...props.lamps);
  }

  private drop(t: Tile): void {
    this.tiles.delete(t.key);
    if (!t.props) return;
    this.o.colliders.remove(t.ids);
    this.o.parent.remove(t.props.group);
    for (const { m } of t.meshes) {
      const im = m as THREE.InstancedMesh;
      if (im.isInstancedMesh) im.dispose();
      else m.geometry.dispose(); // merged blades, signal poles: owned by the tile; instanced kinds share module geometry
    }
    const gone = new Set(t.props.lamps);
    for (let i = this.lamps.length - 1; i >= 0; i--) if (gone.has(this.lamps[i])) this.lamps.splice(i, 1);
  }

  /** Call every frame with the player position: loads the nearest missing tile(s), drops far ones, hides far meshes. */
  update(px: number, pz: number): void {
    const bd = this.o.bounds;
    const moved = !(Math.abs(px - this.lastX) < 8 && Math.abs(pz - this.lastZ) < 8);
    if (moved) {
      this.lastX = px; this.lastZ = pz;
      for (const t of [...this.tiles.values()]) {
        const [ix, iz] = t.key.split('_').map(Number);
        if (this.distTo(this.box(ix, iz), px, pz) > this.o.drop) this.drop(t);
      }
      let todo = this.o.perUpdate ?? 1;
      const want: Array<{ ix: number; iz: number; d: number }> = [];
      const i0 = Math.floor((px - this.o.load) / this.tileM), i1 = Math.floor((px + this.o.load) / this.tileM);
      const j0 = Math.floor((pz - this.o.load) / this.tileM), j1 = Math.floor((pz + this.o.load) / this.tileM);
      for (let ix = i0; ix <= i1; ix++) for (let iz = j0; iz <= j1; iz++) {
        const b = this.box(ix, iz);
        if (b[2] < bd.minX || b[0] > bd.maxX || b[3] < bd.minZ || b[1] > bd.maxZ || this.tiles.has(`${ix}_${iz}`)) continue;
        const d = this.distTo(b, px, pz);
        if (d <= this.o.load) want.push({ ix, iz, d });
      }
      want.sort((a, b) => a.d - b.d);
      for (const w of want) { if (todo-- <= 0) { this.lastX = NaN; break; } this.load(w.ix, w.iz); } // more to do: look again next frame
    }
    if ((this.cull++ & 7) === 0) this.cullMeshes(px, pz);
  }

  /** Builds everything within `load` of the point now (headless renders, tests). */
  settle(px: number, pz: number): void {
    for (let k = 0; k < 64; k++) {
      const before = this.tiles.size;
      this.lastX = NaN;
      const saved = this.o.perUpdate;
      this.o.perUpdate = 1000;
      this.update(px, pz);
      this.o.perUpdate = saved;
      if (this.tiles.size === before) break;
    }
    this.cullMeshes(px, pz);
  }

  private cullMeshes(px: number, pz: number): void {
    const range = this.o.range;
    for (const t of this.tiles.values()) {
      for (const e of t.meshes) {
        // group sits at sidewalk height only; x and z are world coordinates
        e.m.visible = Math.hypot(e.c.x - px, e.c.z - pz) - e.r < range;
      }
    }
  }
}
