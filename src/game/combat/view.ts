/**
 * What the hands look like: tracer lines, the muzzle flash, glass / dust / spark particles, the bottle or brick in flight, the item in
 * the player's hand and the glowing, bobbing pickups. Everything is drawn here from primitives (no textures from files). The
 * simulation (Combat) only calls the `CombatFx` methods, so it runs without three.js in tests.
 */
import * as THREE from 'three';
import { groundAt } from '@/world/Ground';
import type { HandItem } from './items';
import type { PickupDef, PickupKind } from './pickups';
import type { ThrowKind } from './projectile';

export type Burst = 'glass' | 'dust' | 'spark' | 'puff';
export interface V3 { x: number; y: number; z: number }

export interface CombatFx {
  tracer(a: V3, b: V3): void;
  flash(p: V3): void;
  /** Where the barrel is right now (world), or null when no pistol is drawn in the hand. */
  muzzlePoint?(): V3 | null;
  burst(kind: Burst, p: V3, n: number): void;
  /** Show (or with null hide) the flying item in slot i. */
  flying(i: number, kind: ThrowKind | null, p?: V3, spin?: number): void;
  /** What is in the right hand now (attached to the figure's forearm). */
  setHeld(item: HandItem, anchor: THREE.Object3D | null): void;
  /** Re-draw the pickups: only those near the player are visible. */
  pickups(list: Iterable<PickupDef>, px: number, pz: number, t: number): void;
  update(dt: number): void;
}

const MAX_PARTICLES = 48;
const MAX_TRACERS = 4;
const FLYING_SLOTS = 4;
const SHOW_RADIUS = 75;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particle { s: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; grow: number; grav: number; size: number }

const GLASS_COLOR = new THREE.Color(0xd6f0ee), DUST_COLOR = new THREE.Color(0xb8a98c), PUFF_COLOR = new THREE.Color(0xcfc7b6), SPARK_COLOR = new THREE.Color(0xffc060);

export class CombatView implements CombatFx {
  readonly root = new THREE.Group();
  private readonly glow = glowTexture();
  private readonly particles: Particle[] = [];
  private nextParticle = 0;
  private readonly tracers: Array<{ m: THREE.Mesh; life: number }> = [];
  private nextTracer = 0;
  private readonly flashSprite: THREE.Sprite;
  private flashLife = 0;
  private readonly flyingMeshes: Array<{ bottle: THREE.Object3D; brick: THREE.Object3D }> = [];
  private readonly pickupMeshes = new Map<string, { g: THREE.Group; glow: THREE.Sprite; phase: number }>();
  private readonly geo = {
    bottleBody: new THREE.CylinderGeometry(0.036, 0.038, 0.17, 10), bottleNeck: new THREE.CylinderGeometry(0.014, 0.024, 0.1, 8),
    brick: new THREE.BoxGeometry(0.21, 0.065, 0.1), pistolSlide: new THREE.BoxGeometry(0.034, 0.034, 0.19), pistolGrip: new THREE.BoxGeometry(0.03, 0.09, 0.045),
    bar: new THREE.BoxGeometry(1, 1, 1),
  };
  private readonly mat = {
    glass: new THREE.MeshLambertMaterial({ color: 0x3f8f58, transparent: true, opacity: 0.88 }),
    brick: new THREE.MeshLambertMaterial({ color: 0x9a4b34 }),
    gun: new THREE.MeshLambertMaterial({ color: 0x24272c }),
    tracer: new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, depthWrite: false, fog: false }),
  };
  private held: THREE.Object3D | null = null;
  private heldItem: HandItem = 'fists';
  private heldAnchor: THREE.Object3D | null = null;

  constructor(scene: THREE.Scene) {
    this.root.name = 'combat';
    scene.add(this.root);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, depthWrite: false, fog: true }));
      s.visible = false; s.renderOrder = 5;
      this.root.add(s);
      this.particles.push({ s, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grow: 0, grav: 0, size: 0.1 });
    }
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(this.geo.bar, this.mat.tracer.clone());
      m.visible = false; m.frustumCulled = false; m.renderOrder = 6;
      this.root.add(m);
      this.tracers.push({ m, life: 0 });
    }
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd890, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flashSprite.visible = false; this.flashSprite.renderOrder = 7;
    this.root.add(this.flashSprite);
    for (let i = 0; i < FLYING_SLOTS; i++) {
      const bottle = this.makeBottle(), brick = new THREE.Mesh(this.geo.brick, this.mat.brick);
      bottle.visible = brick.visible = false;
      this.root.add(bottle, brick);
      this.flyingMeshes.push({ bottle, brick });
    }
  }

  private makeBottle(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo.bottleBody, this.mat.glass);
    const neck = new THREE.Mesh(this.geo.bottleNeck, this.mat.glass); neck.position.y = 0.135;
    g.add(body, neck);
    return g;
  }

  private makePistol(): THREE.Group {
    // the barrel runs along the forearm's -y (out from the hand); the grip hangs on +z, which is "down" once the arm is levelled
    const g = new THREE.Group();
    const slide = new THREE.Mesh(this.geo.pistolSlide, this.mat.gun); slide.rotation.x = Math.PI / 2; slide.position.set(0, -0.075, 0);
    const grip = new THREE.Mesh(this.geo.pistolGrip, this.mat.gun); grip.rotation.x = Math.PI / 2; grip.position.set(0, 0.0, 0.05); grip.rotation.x = Math.PI / 2 + 0.2;
    g.add(slide, grip);
    return g;
  }

  tracer(a: V3, b: V3): void {
    const t = this.tracers[this.nextTracer++ % MAX_TRACERS];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz) || 0.01;
    t.m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    t.m.lookAt(b.x, b.y, b.z);
    t.m.scale.set(0.025, 0.025, len);
    t.m.visible = true; t.life = 0.07;
    (t.m.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  flash(p: V3): void { this.flashSprite.position.set(p.x, p.y, p.z); this.flashSprite.scale.setScalar(0.5); this.flashSprite.visible = true; this.flashLife = 0.055; }

  burst(kind: Burst, p: V3, n: number): void {
    for (let i = 0; i < n; i++) {
      const q = this.particles[this.nextParticle++ % MAX_PARTICLES];
      const a = Math.random() * Math.PI * 2, sp = kind === 'spark' ? 2.5 + Math.random() * 3 : kind === 'glass' ? 1.2 + Math.random() * 2.4 : 0.4 + Math.random() * 1.1;
      q.vx = Math.cos(a) * sp; q.vz = Math.sin(a) * sp;
      q.vy = kind === 'glass' ? 1.5 + Math.random() * 2 : kind === 'spark' ? 0.5 + Math.random() * 2 : 0.3 + Math.random() * 0.8;
      q.grav = kind === 'glass' ? 9 : kind === 'spark' ? 6 : -0.2;
      q.size = kind === 'glass' ? 0.07 + Math.random() * 0.05 : kind === 'spark' ? 0.06 : 0.18 + Math.random() * 0.1;
      q.grow = kind === 'dust' || kind === 'puff' ? 0.5 : 0;
      q.max = q.life = kind === 'glass' ? 0.7 + Math.random() * 0.4 : kind === 'spark' ? 0.18 : 0.6 + Math.random() * 0.3;
      q.s.position.set(p.x, p.y, p.z);
      q.s.scale.setScalar(q.size);
      const m = q.s.material as THREE.SpriteMaterial;
      m.color.copy(kind === 'glass' ? GLASS_COLOR : kind === 'spark' ? SPARK_COLOR : kind === 'puff' ? PUFF_COLOR : DUST_COLOR);
      m.blending = kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.opacity = kind === 'dust' || kind === 'puff' ? 0.55 : 1;
      q.s.visible = true;
    }
  }

  flying(i: number, kind: ThrowKind | null, p?: V3, spin = 0): void {
    const f = this.flyingMeshes[i]; if (!f) return;
    f.bottle.visible = kind === 'bottle'; f.brick.visible = kind === 'brick';
    const o = kind === 'bottle' ? f.bottle : kind === 'brick' ? f.brick : null;
    if (o && p) { o.position.set(p.x, p.y, p.z); o.rotation.set(spin * 0.9, spin * 0.3, spin); }
  }

  setHeld(item: HandItem, anchor: THREE.Object3D | null): void {
    if (item === this.heldItem && anchor === this.heldAnchor && (this.held !== null) === (item !== 'fists' && anchor !== null)) return;
    this.held?.removeFromParent();
    this.held = null; this.heldItem = item; this.heldAnchor = anchor;
    if (item === 'fists' || !anchor) return;
    const o = item === 'pistol' ? this.makePistol() : item === 'bottle' ? this.makeBottle() : new THREE.Mesh(this.geo.brick, this.mat.brick);
    if (item === 'pistol') o.position.set(0, -0.22, 0);
    else if (item === 'bottle') { o.position.set(0, -0.25, 0.02); o.rotation.x = Math.PI / 2; }
    else { o.position.set(0, -0.25, 0.03); o.rotation.x = Math.PI / 2; }
    anchor.add(o);
    this.held = o;
  }

  private readonly tmpV = new THREE.Vector3();
  /** World position of the pistol muzzle (for the flash and the tracer), or null when no pistol is in hand. */
  muzzlePoint(): V3 | null {
    if (this.heldItem !== 'pistol' || !this.held) return null;
    this.held.updateWorldMatrix(true, false);
    const v = this.tmpV.set(0, -0.19, 0).applyMatrix4(this.held.matrixWorld);
    return { x: v.x, y: v.y, z: v.z };
  }

  pickups(list: Iterable<PickupDef>, px: number, pz: number, t: number): void {
    const seen = new Set<string>();
    for (const d of list) {
      const dx = d.x - px, dz = d.z - pz;
      if (dx * dx + dz * dz > SHOW_RADIUS * SHOW_RADIUS) continue;
      seen.add(d.id);
      let e = this.pickupMeshes.get(d.id);
      if (!e) { e = this.makePickup(d.kind, d.id); this.pickupMeshes.set(d.id, e); this.root.add(e.g); }
      const base = groundAt(d.x, d.z) + 0.62;
      e.g.position.set(d.x, base + Math.sin(t * 2.2 + e.phase) * 0.07, d.z);
      e.g.children[0].rotation.y = t * 1.3 + e.phase;
      e.glow.material.opacity = 0.5 + 0.2 * Math.sin(t * 3 + e.phase);
    }
    for (const [id, e] of this.pickupMeshes) {
      if (!seen.has(id)) { e.g.removeFromParent(); e.glow.material.dispose(); this.pickupMeshes.delete(id); }
    }
  }

  private makePickup(kind: PickupKind, id: string): { g: THREE.Group; glow: THREE.Sprite; phase: number } {
    const g = new THREE.Group();
    const item = kind === 'pistol' ? this.makePistol() : kind === 'bottle' ? this.makeBottle() : new THREE.Mesh(this.geo.brick, this.mat.brick);
    const holder = new THREE.Group();
    if (kind === 'pistol') { item.rotation.set(0, 0, Math.PI / 2); item.scale.setScalar(1.7); item.position.set(0.17, 0, 0); }
    else if (kind === 'bottle') { item.scale.setScalar(1.6); item.rotation.z = 0.5; }
    else { item.scale.setScalar(1.8); }
    holder.add(item);
    g.add(holder);
    const color = kind === 'bottle' ? 0x9fe8c0 : kind === 'brick' ? 0xffc08a : 0xfff0a0;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(1.15); glow.renderOrder = 4;
    g.add(glow);
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return { g, glow, phase: (h % 628) / 100 };
  }

  update(dt: number): void {
    for (const q of this.particles) {
      if (!q.s.visible) continue;
      q.life -= dt;
      if (q.life <= 0) { q.s.visible = false; continue; }
      q.vy -= q.grav * dt;
      const p = q.s.position;
      p.x += q.vx * dt; p.y += q.vy * dt; p.z += q.vz * dt;
      if (q.grav > 0 && p.y < 0.17) { p.y = 0.17; q.vy = Math.abs(q.vy) * 0.25; q.vx *= 0.6; q.vz *= 0.6; }
      q.vx *= 1 - Math.min(1, dt * 1.5); q.vz *= 1 - Math.min(1, dt * 1.5);
      const k = q.life / q.max;
      q.s.scale.setScalar(q.size * (1 + q.grow * (1 - k)));
      (q.s.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 1.6) * ((q.s.material as THREE.SpriteMaterial).blending === THREE.AdditiveBlending ? 1 : 0.6);
    }
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.m.visible = false; else (t.m.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, t.life * 14);
    }
    if (this.flashLife > 0) { this.flashLife -= dt; if (this.flashLife <= 0) this.flashSprite.visible = false; }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.held?.removeFromParent();
    this.glow.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
    for (const q of this.particles) (q.s.material as THREE.Material).dispose();
  }
}
