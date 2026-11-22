/**
 * What the hands look like: tracer lines, the muzzle flash, glass / dust / spark particles, the bottle or brick in flight, the item in
 * the player's hand and the glowing, bobbing pickups. Everything is drawn here from primitives (no textures from files). The
 * simulation (Combat) only calls the `CombatFx` methods, so it runs without three.js in tests.
 */
import * as THREE from 'three';
import { groundAt } from '@/world/Ground';
import type { HandItem } from './items';
import type { PickupDef } from './pickups';
import { PickupInstances } from './pickupView';
import type { Blood } from './blood';
import { BloodView } from './bloodView';
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

/** A small four-point star with a hot core: the muzzle flash. Drawn once on a canvas (no files). */
function starTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(32, 32);
  const ray = (ang: number, len: number, w: number): void => {
    g.save(); g.rotate(ang);
    const lg = g.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.lineTo(-len * 0.25, 0); g.closePath(); g.fill();
    g.restore();
  };
  for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2, 31, 3.2);
  for (let i = 0; i < 4; i++) ray(Math.PI / 4 + (i * Math.PI) / 2, 17, 2.2);
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 9);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.5, 'rgba(255,240,200,0.8)'); core.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The shot's streak: how fast it flies (m/s), how long it is (m) and how thin (m). Thin and quick, not a beam. */
export const TRACER = { speed: 420, length: 3.2, width: 0.011 } as const;
/** The muzzle star's size (m) and how long it shows (s): a frame or two; and the width of the faint warm pool it throws on the ground (m). */
export const MUZZLE = { size: 0.17, life: 0.03, groundGlow: 2.4 } as const;

interface TracerState { m: THREE.Mesh; ax: number; ay: number; az: number; dx: number; dy: number; dz: number; len: number; head: number; on: boolean }

interface Particle { s: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; grow: number; grav: number; size: number }

const GLASS_COLOR = new THREE.Color(0xd6f0ee), DUST_COLOR = new THREE.Color(0xb8a98c), PUFF_COLOR = new THREE.Color(0xcfc7b6), SPARK_COLOR = new THREE.Color(0xffc060);

export class CombatView implements CombatFx {
  readonly root = new THREE.Group();
  private readonly glow = glowTexture();
  private readonly particles: Particle[] = [];
  private nextParticle = 0;
  private readonly tracers: TracerState[] = [];
  private nextTracer = 0;
  private readonly star = starTexture();
  private readonly flashSprite: THREE.Sprite;
  private readonly flashGlow: THREE.Mesh;
  private flashLife = 0;
  private readonly flyingMeshes: Array<{ bottle: THREE.Object3D; brick: THREE.Object3D }> = [];
  private readonly pickupView: PickupInstances;
  private readonly geo = {
    bottleBody: new THREE.CylinderGeometry(0.036, 0.038, 0.17, 10), bottleNeck: new THREE.CylinderGeometry(0.014, 0.024, 0.1, 8),
    brick: new THREE.BoxGeometry(0.21, 0.065, 0.1), pistolSlide: new THREE.BoxGeometry(0.034, 0.034, 0.19), pistolGrip: new THREE.BoxGeometry(0.03, 0.09, 0.045),
    bar: new THREE.BoxGeometry(1, 1, 1),
    // COMBAT2: held weapons (all primitives)
    bat: new THREE.CylinderGeometry(0.04, 0.016, 0.82, 10), pipe: new THREE.CylinderGeometry(0.026, 0.026, 0.78, 8), fish: new THREE.BoxGeometry(0.1, 0.46, 0.036),
    fishTail: new THREE.ConeGeometry(0.075, 0.12, 4), cyl: new THREE.CylinderGeometry(0.036, 0.036, 0.06, 8), barrel: new THREE.CylinderGeometry(0.014, 0.014, 0.62, 8), stock: new THREE.BoxGeometry(0.04, 0.2, 0.05),
  };
  private readonly mat = {
    glass: new THREE.MeshLambertMaterial({ color: 0x3f8f58, transparent: true, opacity: 0.88 }),
    brick: new THREE.MeshLambertMaterial({ color: 0x9a4b34 }),
    gun: new THREE.MeshLambertMaterial({ color: 0x24272c }),
    tracer: new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.85, depthWrite: false, fog: false }),
    wood: new THREE.MeshLambertMaterial({ color: 0xa8773f }), metal: new THREE.MeshLambertMaterial({ color: 0x7d8790 }), fish: new THREE.MeshLambertMaterial({ color: 0xa9c1d1 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x3a3d44 }), stockWood: new THREE.MeshLambertMaterial({ color: 0x5a4331 }),
  };
  private readonly bloodView: BloodView | null;
  private readonly blood: Blood | null = null;
  private held: THREE.Object3D | null = null;
  private heldItem: HandItem = 'fists';
  private heldAnchor: THREE.Object3D | null = null;

  constructor(scene: THREE.Scene, blood?: Blood) {
    this.root.name = 'combat';
    this.bloodView = blood ? new BloodView(scene, blood) : null;
    this.blood = blood ?? null;
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
      this.tracers.push({ m, ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 1, len: 0, head: 0, on: false });
    }
    // the muzzle flash: a small star, depth-tested so it never glows through the player; and a faint warm pool on the ground under it
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color: 0xffe2a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flashSprite.visible = false; this.flashSprite.renderOrder = 7;
    this.root.add(this.flashSprite);
    this.flashGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.glow, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
    this.flashGlow.rotation.x = -Math.PI / 2; this.flashGlow.visible = false; this.flashGlow.renderOrder = 3;
    this.root.add(this.flashGlow);
    for (let i = 0; i < FLYING_SLOTS; i++) {
      const bottle = this.makeBottle(), brick = new THREE.Mesh(this.geo.brick, this.mat.brick);
      bottle.visible = brick.visible = false;
      this.root.add(bottle, brick);
      this.flyingMeshes.push({ bottle, brick });
    }
    // world pickups: instanced (one draw per kind plus one for every glow), however many are in view
    this.pickupView = new PickupInstances(this.geo, this.mat, this.glow);
    this.root.add(this.pickupView.group);
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

  /** A thin streak that flies from `a` to `b` at TRACER.speed and is gone on arrival. */
  tracer(a: V3, b: V3): void {
    const t = this.tracers[this.nextTracer++ % MAX_TRACERS];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz) || 0.01;
    t.ax = a.x; t.ay = a.y; t.az = a.z; t.dx = dx / len; t.dy = dy / len; t.dz = dz / len; t.len = len; t.head = 0; t.on = true;
    t.m.visible = true;
    this.poseTracer(t);
  }

  private poseTracer(t: TracerState): void {
    const head = Math.min(t.len, t.head), tail = Math.max(0, head - TRACER.length), seg = head - tail;
    const mid = (head + tail) / 2;
    t.m.position.set(t.ax + t.dx * mid, t.ay + t.dy * mid, t.az + t.dz * mid);
    t.m.lookAt(t.ax + t.dx * (mid + 1), t.ay + t.dy * (mid + 1), t.az + t.dz * (mid + 1));
    t.m.scale.set(TRACER.width, TRACER.width, Math.max(0.01, seg));
  }

  /** A small bright star at the muzzle for a frame or two, and a faint warm pool on the ground below it. */
  flash(p: V3): void {
    const s = this.flashSprite;
    s.position.set(p.x, p.y, p.z);
    s.scale.setScalar(MUZZLE.size * (0.85 + Math.random() * 0.4));
    (s.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI;
    s.visible = true;
    this.flashLife = MUZZLE.life;
    const g = this.flashGlow;
    g.position.set(p.x, groundAt(p.x, p.z) + 0.04, p.z);
    g.scale.setScalar(MUZZLE.groundGlow);
    (g.material as THREE.MeshBasicMaterial).opacity = 0.3;
    g.visible = true;
  }

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
    const o = this.makeHeld(item);
    anchor.add(o);
    this.held = o;
  }

  /** COMBAT2: the item as it sits in the hand (the arm points along its -y; the weapon extends outward from the fist). */
  private makeHeld(item: HandItem): THREE.Object3D {
    const g = new THREE.Group();
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
    switch (item) {
      case 'pistol': { const o = this.makePistol(); o.position.set(0, -0.22, 0); return o; }
      case 'bottle': { const o = this.makeBottle(); o.position.set(0, -0.25, 0.02); o.rotation.x = Math.PI / 2; return o; }
      case 'brick': { const o = new THREE.Mesh(this.geo.brick, this.mat.brick); o.position.set(0, -0.25, 0.03); o.rotation.x = Math.PI / 2; return o; }
      case 'bat': part(this.geo.bat, this.mat.wood, 0, -0.36, 0.02, Math.PI); return g;
      case 'pipe': part(this.geo.pipe, this.mat.metal, 0, -0.33, 0.02); return g;
      case 'fish': part(this.geo.fish, this.mat.fish, 0, -0.3, 0.02); part(this.geo.fishTail, this.mat.fish, 0, -0.56, 0.02, Math.PI); return g;
      case 'revolver': {
        part(this.geo.pistolSlide, this.mat.dark, 0, -0.1, 0, Math.PI / 2).scale.set(0.8, 1.5, 0.8);
        part(this.geo.cyl, this.mat.dark, 0, -0.04, 0, 0).scale.set(1.4, 1.2, 1.4);
        part(this.geo.pistolGrip, this.mat.stockWood, 0, 0, 0.055, Math.PI / 2 + 0.3);
        g.position.set(0, -0.22, 0); return g;
      }
      case 'shotgun': {
        part(this.geo.barrel, this.mat.dark, 0, -0.38, 0.0, 0);
        part(this.geo.barrel, this.mat.dark, 0, -0.38, 0.034, 0).scale.set(1.15, 1, 1.15);
        part(this.geo.stock, this.mat.stockWood, 0, 0.0, 0.03, 0).scale.set(1, 1.3, 1.2);
        part(this.geo.cyl, this.mat.stockWood, 0, -0.3, 0.06, 0).scale.set(1.5, 2.2, 1.5); // the pump grip
        g.position.set(0, -0.12, 0); return g;
      }
      default: return g;
    }
  }

  private readonly tmpV = new THREE.Vector3();
  /** World position of the pistol muzzle (for the flash and the tracer), or null when no pistol is in hand. */
  muzzlePoint(): V3 | null {
    const len = this.heldItem === 'pistol' ? -0.19 : this.heldItem === 'revolver' ? -0.21 : this.heldItem === 'shotgun' ? -0.7 : 0;
    if (!len || !this.held) return null;
    this.held.updateWorldMatrix(true, false);
    const v = this.tmpV.set(0, len, 0).applyMatrix4(this.held.matrixWorld);
    return { x: v.x, y: v.y, z: v.z };
  }

  pickups(list: Iterable<PickupDef>, px: number, pz: number, t: number): void {
    this.pickupView.update(list, px, pz, t, SHOW_RADIUS, groundAt);
  }

  update(dt: number): void {
    if (this.blood) { this.blood.update(dt); this.bloodView?.sync(); }
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
      if (!t.on) continue;
      t.head += TRACER.speed * dt;
      if (t.head - TRACER.length >= t.len) { t.on = false; t.m.visible = false; continue; }
      this.poseTracer(t);
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      (this.flashGlow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.flashLife / MUZZLE.life) * 0.3;
      if (this.flashLife <= 0) { this.flashSprite.visible = false; this.flashGlow.visible = false; }
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.pickupView.dispose();
    this.bloodView?.dispose();
    this.held?.removeFromParent();
    this.glow.dispose(); this.star.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
    for (const q of this.particles) (q.s.material as THREE.Material).dispose();
  }
}
