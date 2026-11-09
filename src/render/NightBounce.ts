/**
 * Night light bounce (GFX2): the glow lit signs, shop windows and doorways throw onto the wall around them and the sidewalk
 * in front of them, wet or dry. No lights: ONE additive mesh (one draw call, one material, no depth write) made of two soft
 * quads per source, a vertical wash on the facade and a horizontal pool on the sidewalk. The vertex shader stretches the pool
 * toward the street as the ground gets wet (the neon streak a wet street throws back), fades everything by night factor and
 * by distance, and collapses far quads, so the cost is one cheap fill of the few quads near the camera.
 *
 * Sources are scraped once from the built world (extractBounceSources): every triangle that uses a lit-sign or storefront-glass
 * material gives a position, an outward facade normal and a width; neighbours are binned into one source. The interior doors
 * (the unmarked Aftersloth door, the deli, HOME) come from the interior definitions.
 *
 * Tiers (BOUNCE_TIERS): phone draws nothing (the draw budget is 140); low a short pool and fewer sources; medium / high the full set.
 * The tier and the wetness are module state fed by Pipeline (setQuality / setWeather), the node itself is driven by NightLights.update.
 */
import * as THREE from 'three';
import type { Quality } from './Shadows';
import { INTERIORS, INTERIOR_IDS } from '@/world/interiors/defs';

export type BounceKind = 'sign' | 'glass' | 'door';

export interface BounceSource {
  kind: BounceKind;
  x: number; y: number; z: number;
  /** outward horizontal unit normal of the facade (toward the street) */
  nx: number; nz: number;
  /** width along the facade (m) */
  w: number;
  /** linear rgb of the light */
  r: number; g: number; b: number;
  /** relative strength (1 = a lit sign box) */
  s: number;
}

export interface BounceTier {
  enabled: boolean;
  /** share of sources kept (deterministic thinning by hash), 0..1 */
  keep: number;
  /** sidewalk pool depth, metres, dry */
  pool: number;
  /** overall gain */
  gain: number;
}

export const BOUNCE_TIERS: Record<Quality, BounceTier> = {
  phone: { enabled: false, keep: 0, pool: 0, gain: 0 },
  low: { enabled: true, keep: 0.7, pool: 2.4, gain: 0.5 },
  medium: { enabled: true, keep: 1, pool: 2.8, gain: 0.5 },
  high: { enabled: true, keep: 1, pool: 3.2, gain: 0.5 },
};

/** Distance from the camera (m) at which a quad has faded out completely; full strength inside FADE_NEAR. */
export const BOUNCE_FADE_NEAR = 38;
export const BOUNCE_FADE_FAR = 70;
const MAX_SOURCES = 900;

let tier: Quality = 'low';
let wetness = 0;
export function setBounceTier(q: Quality): void { tier = q; }
export function setBounceWet(w: number): void { wetness = Math.min(1, Math.max(0, Number.isFinite(w) ? w : 0)); }
export function bounceTier(): Quality { return tier; }

// ---------------------------------------------------------------- extraction

const SIGN_PALETTE: readonly [number, number, number][] = [
  [1.0, 0.78, 0.5], [1.0, 0.78, 0.5], [1.0, 0.22, 0.12], [0.2, 0.9, 0.9], [0.25, 0.95, 0.35], [1.0, 0.2, 0.7], [1.0, 0.6, 0.12],
];
const GLASS_COLOR: readonly [number, number, number] = [1.0, 0.8, 0.55];

function hash3(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function bounceKindOfMaterial(name: string): BounceKind | null {
  if (name.startsWith('sf:sign:') || name.startsWith('sign:')) return 'sign';
  if (name.startsWith('storefrontGlass')) return 'glass';
  return null;
}

interface Bin { kind: BounceKind; area: number; cx: number; cy: number; cz: number; nx: number; nz: number; tmin: number; tmax: number; ty: number; tx: number; }

/**
 * Scrapes bounce sources from every static mesh under `root` whose material is a lit sign or storefront glass. Pure data in,
 * data out (no GL), so it runs in unit tests on hand-built meshes.
 */
export function extractBounceSources(root: THREE.Object3D, maxSources = MAX_SOURCES): BounceSource[] {
  root.updateMatrixWorld(true);
  const bins = new Map<string, Bin>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    const pos = geo?.getAttribute('position');
    if (!geo || !pos) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const kinds = mats.map((m) => (m ? bounceKindOfMaterial(m.name ?? '') : null));
    if (!kinds.some((k) => k)) return;
    const index = geo.getIndex();
    const total = index ? index.count : pos.count;
    const groups = Array.isArray(mesh.material) && geo.groups.length ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const mw = mesh.matrixWorld;
    for (const g of groups) {
      const kind = kinds[g.materialIndex ?? 0];
      if (!kind) continue;
      const end = Math.min(total, g.start + g.count);
      for (let i = g.start; i + 2 < end; i += 3) {
        const i0 = index ? index.getX(i) : i, i1 = index ? index.getX(i + 1) : i + 1, i2 = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
        b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
        c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        e1.subVectors(b, a); e2.subVectors(c, a);
        n.crossVectors(e1, e2);
        const area = n.length() * 0.5;
        if (area < 0.02) continue;
        n.multiplyScalar(0.5 / area);
        if (Math.abs(n.y) > 0.35) continue; // vertical faces only
        const hl = Math.hypot(n.x, n.z);
        const nx = n.x / hl, nz = n.z / hl;
        const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
        const dir = Math.round(Math.atan2(nz, nx) / (Math.PI / 2));
        // bin by the triangle's min corner, so both halves of an axis-aligned quad land in the same bin
        const mx = Math.min(a.x, b.x, c.x), my = Math.min(a.y, b.y, c.y), mz = Math.min(a.z, b.z, c.z);
        const key = `${kind}|${dir}|${Math.floor((mx + 0.01) / 2.5)}|${Math.floor((my + 0.01) / 2)}|${Math.floor((mz + 0.01) / 2.5)}`;
        let bin = bins.get(key);
        if (!bin) { bin = { kind, area: 0, cx: 0, cy: 0, cz: 0, nx: 0, nz: 0, tmin: Infinity, tmax: -Infinity, tx: -nz, ty: nx }; bins.set(key, bin); }
        bin.area += area; bin.cx += cx * area; bin.cy += cy * area; bin.cz += cz * area; bin.nx += nx * area; bin.nz += nz * area;
        for (const p of [a, b, c]) { const t = p.x * bin.tx + p.z * bin.ty; if (t < bin.tmin) bin.tmin = t; if (t > bin.tmax) bin.tmax = t; }
      }
    }
  });
  const out: BounceSource[] = [];
  for (const bin of bins.values()) {
    const A = bin.area;
    const hl = Math.hypot(bin.nx, bin.nz) || 1;
    const x = bin.cx / A, y = bin.cy / A, z = bin.cz / A;
    const w = Math.min(8, Math.max(0.8, bin.tmax - bin.tmin));
    const h = hash3(Math.round(x * 2), Math.round(y), Math.round(z * 2));
    const col = bin.kind === 'sign' ? SIGN_PALETTE[Math.floor(h * SIGN_PALETTE.length) % SIGN_PALETTE.length] : GLASS_COLOR;
    out.push({ kind: bin.kind, x, y, z, nx: bin.nx / hl, nz: bin.nz / hl, w, r: col[0], g: col[1], b: col[2], s: bin.kind === 'sign' ? 1 : 0.7 });
  }
  out.sort((p, q) => p.x - q.x || p.z - q.z || p.y - q.y);
  return out.length > maxSources ? out.filter((_, i) => i % Math.ceil(out.length / maxSources) === 0) : out;
}

/** Door-side sources from the interior definitions: AFTERSLOTH (violet, unmarked, only a crack of light), WAX DELI (gold), HOME (green). */
export function interiorDoorSources(): BounceSource[] {
  const tint: Record<string, [number, number, number, number]> = {
    club: [0.75, 0.25, 1.0, 0.9], deli: [1.0, 0.75, 0.3, 0.8], home: [0.4, 1.0, 0.55, 0.7],
  };
  return INTERIOR_IDS.map((id) => {
    const d = INTERIORS[id].door;
    const t = tint[id] ?? [1, 0.8, 0.5, 0.7];
    return { kind: 'door' as const, x: d.x, y: 1.4, z: d.z, nx: d.outX, nz: d.outZ, w: 1.6, r: t[0], g: t[1], b: t[2], s: t[3] };
  });
}

// ---------------------------------------------------------------- geometry

const VERTS_PER_QUAD = 4;
const QUADS_PER_SOURCE = 2;

export interface BounceBuffers {
  count: number;
  aC: Float32Array; aP: Float32Array; aUV: Float32Array; aCol: Float32Array; aKind: Float32Array; index: Uint32Array;
}

/** Packs sources into vertex attributes: wall wash (kind 0) and sidewalk pool (kind 1) per source. Exported for tests. */
export function buildBounceBuffers(sources: readonly BounceSource[], t: BounceTier): BounceBuffers {
  const kept = sources.filter((s) => t.keep >= 1 || hash3(Math.round(s.x * 4), Math.round(s.y * 4), Math.round(s.z * 4)) < t.keep);
  const n = kept.length * QUADS_PER_SOURCE * VERTS_PER_QUAD;
  const aC = new Float32Array(n * 3), aP = new Float32Array(n * 4), aUV = new Float32Array(n * 2), aCol = new Float32Array(n * 4), aKind = new Float32Array(n);
  const index = new Uint32Array(kept.length * QUADS_PER_SOURCE * 6);
  const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  let v = 0, ii = 0;
  for (const s of kept) {
    for (let q = 0; q < QUADS_PER_SOURCE; q++) {
      const wall = q === 0;
      const halfT = wall ? s.w * 0.5 + 1.1 : s.w * 0.5 + 1.4;
      const ext = wall ? (s.kind === 'glass' ? 1.5 : 1.3) : t.pool; // wall: half height; pool: depth
      const cy = wall ? s.y : 0.165;
      for (let k = 0; k < 4; k++) {
        const o = v + k;
        aC[o * 3] = s.x; aC[o * 3 + 1] = cy; aC[o * 3 + 2] = s.z;
        aP[o * 4] = s.nx; aP[o * 4 + 1] = s.nz; aP[o * 4 + 2] = halfT; aP[o * 4 + 3] = ext;
        const [cu, cv] = corners[k];
        aUV[o * 2] = cu; aUV[o * 2 + 1] = wall ? cv * 2 - 1 : cv;
        aCol[o * 4] = s.r; aCol[o * 4 + 1] = s.g; aCol[o * 4 + 2] = s.b; aCol[o * 4 + 3] = s.s;
        aKind[o] = wall ? 0 : 1;
      }
      index.set([v, v + 1, v + 2, v, v + 2, v + 3], ii); ii += 6;
      v += 4;
    }
  }
  return { count: kept.length, aC, aP, aUV, aCol, aKind, index };
}

const VERT = /* glsl */ `
attribute vec3 aC;
attribute vec4 aP;
attribute vec2 aUV;
attribute vec4 aCol;
attribute float aKind;
uniform float uWet;
uniform float uNight;
uniform float uGain;
uniform float uNear;
uniform float uFar;
varying vec2 vUV;
varying vec4 vCol;
varying float vKind;
varying float vFade;
void main() {
  vec2 n = aP.xy;
  vec2 tg = vec2( -n.y, n.x );
  float d = distance( cameraPosition, aC );
  vFade = uNight * uGain * ( 1.0 - smoothstep( uNear, uFar, d ) );
  vec3 p = aC;
  if ( aKind < 0.5 ) {
    // facade wash: vertical, centred on the source, a hair off the wall
    p.xz += tg * aUV.x * aP.z + n * 0.06;
    p.y += aUV.y * aP.w;
  } else {
    // sidewalk pool: from the wall out toward the street, stretched when wet
    float L = aP.w * ( 1.0 + uWet * 1.5 );
    p.xz += tg * aUV.x * aP.z * ( 1.0 + uWet * 0.15 ) + n * ( aUV.y * L + 0.05 );
  }
  vUV = aUV; vCol = aCol; vKind = aKind;
  if ( vFade <= 0.001 ) p = vec3( 0.0, -1000.0, 0.0 ); // collapse: no raster work for faded quads
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;

const FRAG = /* glsl */ `
uniform float uWet;
varying vec2 vUV;
varying vec4 vCol;
varying float vKind;
varying float vFade;
void main() {
  float a;
  if ( vKind < 0.5 ) {
    // wall: soft ellipse around the sign
    a = exp( -( vUV.x * vUV.x * 2.4 + vUV.y * vUV.y * 3.6 ) ) * 0.8;
  } else {
    // pool: brightest at the wall, falls off outward and sideways; wet ground keeps the streak longer
    float along = 1.0 - vUV.y;
    float reach = mix( 3.2, 2.0, uWet );
    a = pow( max( along, 0.0 ), reach ) * exp( -vUV.x * vUV.x * 3.5 ) * ( 0.9 + 0.3 * uWet );
  }
  gl_FragColor = vec4( vCol.rgb * ( a * vCol.a * vFade ), 1.0 );
}
`;

// ---------------------------------------------------------------- the node

const _tmp = new THREE.Color();

export class NightBounce {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private sources: BounceSource[] = [];
  private builtFor: Quality | null = null;
  private amount = 0;
  private scraped = false;
  /** sources scraped so far (tests, report) */
  get sourceCount(): number { return this.sources.length; }
  get drawn(): boolean { return !!this.mesh && this.mesh.visible; }

  constructor(private readonly scene: THREE.Object3D) {
    this.group.name = 'night-bounce';
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Provide sources directly (tests); otherwise they are scraped from the scene on the first night frame. */
  setSources(s: BounceSource[]): void { this.sources = s; this.scraped = true; this.builtFor = null; }

  /** Call every frame from NightLights.update: `night` is the day/night flag, `dt` seconds. */
  update(night: boolean, dt: number): void {
    const t = BOUNCE_TIERS[tier] ?? BOUNCE_TIERS.low;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const target = night && t.enabled ? 1 : 0;
    this.amount = this.amount < target ? Math.min(target, this.amount + step / 0.8) : Math.max(target, this.amount - step / 0.8);
    if (this.amount <= 0.001 && !night) { this.group.visible = false; return; }
    if (!t.enabled) { this.group.visible = false; return; }
    if (!this.scraped) {
      this.scraped = true;
      this.sources = [...extractBounceSources(this.scene), ...interiorDoorSources()];
    }
    if (this.builtFor !== tier) this.rebuild(t);
    if (!this.material || !this.mesh) return;
    this.group.visible = true;
    const u = this.material.uniforms;
    u.uNight.value = this.amount;
    u.uWet.value = wetness;
    u.uGain.value = t.gain;
  }

  private rebuild(t: BounceTier): void {
    this.dispose(false);
    const buf = buildBounceBuffers(this.sources, t);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf.aC, 3));
    geo.setAttribute('aC', new THREE.BufferAttribute(buf.aC, 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(buf.aP, 4));
    geo.setAttribute('aUV', new THREE.BufferAttribute(buf.aUV, 2));
    geo.setAttribute('aCol', new THREE.BufferAttribute(buf.aCol, 4));
    geo.setAttribute('aKind', new THREE.BufferAttribute(buf.aKind, 1));
    geo.setIndex(new THREE.BufferAttribute(buf.index, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uWet: { value: 0 }, uNight: { value: 0 }, uGain: { value: 1 }, uNear: { value: BOUNCE_FADE_NEAR }, uFar: { value: BOUNCE_FADE_FAR } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    });
    this.material.name = 'night-bounce';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'night-bounce-mesh';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.group.add(this.mesh);
    this.builtFor = tier;
    void _tmp;
  }

  dispose(removeGroup = true): void {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.material?.dispose();
    this.mesh = null; this.material = null;
    if (removeGroup) this.scene.remove(this.group);
  }
}
