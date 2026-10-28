import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const FLARE_DISTANCE = 900;
const TEX = 256;

function makeCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  return c;
}

/** 1x1 transparent fallback for non-DOM environments (unit tests). */
function emptyTexture(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

function finish(canvas: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Soft radial gradient disc (the sun glow and the small ghosts). */
export function makeGlowTexture(): THREE.Texture {
  const canvas = makeCanvas();
  if (!canvas) return emptyTexture();
  const ctx = canvas.getContext('2d');
  if (!ctx) return emptyTexture();
  const h = TEX / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.1, 'rgba(255,244,225,0.85)');
  g.addColorStop(0.35, 'rgba(255,214,160,0.28)');
  g.addColorStop(0.7, 'rgba(255,190,120,0.06)');
  g.addColorStop(1.0, 'rgba(255,170,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX, TEX);
  return finish(canvas);
}

/** Soft hexagonal aperture ghost: faint fill plus a blurred bright rim. */
export function makeHexTexture(): THREE.Texture {
  const canvas = makeCanvas();
  if (!canvas) return emptyTexture();
  const ctx = canvas.getContext('2d');
  if (!ctx) return emptyTexture();
  const h = TEX / 2;
  const r = TEX * 0.36;
  ctx.translate(h, h);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,235,205,0.10)';
  ctx.fill();
  ctx.shadowColor = 'rgba(255,225,185,0.9)';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,238,215,0.55)';
  ctx.stroke();
  return finish(canvas);
}

/** Thin rainbow halo ring (red outside, violet inside, like a real prism ghost). */
export function makeRainbowTexture(): THREE.Texture {
  const canvas = makeCanvas();
  if (!canvas) return emptyTexture();
  const ctx = canvas.getContext('2d');
  if (!ctx) return emptyTexture();
  const h = TEX / 2;
  const g = ctx.createRadialGradient(h, h, h * 0.6, h, h, h * 0.98);
  g.addColorStop(0.0, 'rgba(120,80,255,0)');
  g.addColorStop(0.15, 'rgba(120,80,255,0.35)');
  g.addColorStop(0.35, 'rgba(60,170,255,0.35)');
  g.addColorStop(0.55, 'rgba(90,255,140,0.32)');
  g.addColorStop(0.75, 'rgba(255,235,90,0.34)');
  g.addColorStop(0.92, 'rgba(255,90,60,0.3)');
  g.addColorStop(1.0, 'rgba(255,60,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX, TEX);
  return finish(canvas);
}

interface ElementSpec {
  element: LensflareElement;
  base: THREE.Color;
}

/**
 * Procedural sun lens flare. A `Lensflare` is parked ~900 m from the origin (or from `anchor`)
 * along the sun direction; three's Lensflare tests depth occlusion itself, so the flare disappears
 * behind buildings. Intensity follows sun elevation and is 0 at night. No image files.
 */
export class SunFlare {
  readonly object3d: THREE.Group;
  private readonly scratchDir = new THREE.Vector3();
  private readonly flare: Lensflare;
  private readonly specs: ElementSpec[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly scene: THREE.Scene;
  private lastIntensity = -1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.object3d = new THREE.Group();
    this.object3d.name = 'SunFlare';
    this.flare = new Lensflare();
    // Lensflare draws its additive quads from onBeforeRender, so every scene render calls it, including
    // GTAOPass's override-material normal/depth pass: the 520 px glow then lands in the G-buffer (AO halos
    // and a bogus depth/normal disc around the sun, also read by the DoF pass). Skip any override-material render.
    const drawFlare = this.flare.onBeforeRender.bind(this.flare);
    this.flare.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      if (scene.overrideMaterial) return;
      drawFlare(renderer, scene, camera, geometry, material, group);
    };

    const glow = makeGlowTexture();
    const hex = makeHexTexture();
    const rainbow = makeRainbowTexture();
    this.textures.push(glow, hex, rainbow);

    const add = (tex: THREE.Texture, size: number, distance: number, color: string): void => {
      const element = new LensflareElement(tex, size, distance, new THREE.Color(color));
      this.specs.push({ element, base: new THREE.Color(color) });
      this.flare.addElement(element);
    };
    add(glow, 520, 0, '#ffffff');
    add(glow, 70, 0.55, '#ffd9a8');
    add(hex, 80, 0.7, '#ffe6c8');
    add(rainbow, 150, 0.85, '#ffffff');
    add(hex, 55, 1.0, '#cfe0ff');

    this.object3d.add(this.flare);
    this.object3d.visible = false;
    scene.add(this.object3d);
  }

  /**
   * @param sunDir unit vector pointing from the world towards the sun.
   * @param sunVisibleIntensity 0..1 (clouds / overall daylight); multiplied by sun elevation.
   * @param anchor optional world point (e.g. the camera) the flare is placed relative to.
   */
  update(sunDir: THREE.Vector3, sunVisibleIntensity: number, anchor?: THREE.Vector3): void {
    const dir = this.scratchDir.copy(sunDir).normalize();
    const elevation = THREE.MathUtils.smoothstep(dir.y, 0.03, 0.35);
    const k = THREE.MathUtils.clamp(sunVisibleIntensity, 0, 1) * elevation;
    this.object3d.position.copy(dir).multiplyScalar(FLARE_DISTANCE);
    if (anchor) this.object3d.position.add(anchor);
    this.object3d.updateMatrixWorld(true);

    this.object3d.visible = k > 0.005;
    if (Math.abs(k - this.lastIntensity) < 1e-3) return;
    this.lastIntensity = k;
    for (const s of this.specs) s.element.color.copy(s.base).multiplyScalar(k);
  }

  dispose(): void {
    this.scene.remove(this.object3d);
    this.flare.dispose();
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    this.specs.length = 0;
  }
}
