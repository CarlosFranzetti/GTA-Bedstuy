/**
 * Screen-space effects pass for the medium / high tiers (GFX lane), one pass slot in the post chain, placed right after
 * GTAO so it can reuse the proxy G-buffer (depth + view-space normals) that GTAOPass already rendered:
 *
 *  1. SSR trace (only while the ground is wet): a HALF-RESOLUTION ray march over the depth buffer for ground pixels
 *     (up-facing normal, road height). Hits return the lit HDR colour of what the ray found (buildings, cars, lamps,
 *     which is how lamp glints appear in puddles); misses return nothing, so the existing environment-map reflection
 *     of the wet material stays (the "fallback to the env map where the ray misses"). Strength = Fresnel x wetness x
 *     puddle mask (the same mask Weather paints into the road shader, so the reflection sits in the visible puddles).
 *  2. Composite (full resolution, always): bilinear upsample of the SSR result, contact darkening at the base of cars and
 *     walls (a few world-space taps against the depth buffer) and aerial-perspective haze that takes the sky colour.
 *
 * Cost per tier is a table (`SSR_TIERS`, `FX_TIERS`) so tests, the report and the pipeline read the same numbers.
 * The pass is skipped entirely on low and phone (see Pipeline.ts).
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { Rng } from '@/core/Rng';
import { createCanvas } from '@/textures/canvas';
import { PUDDLE_MASK_METRES, puddleMaskPainter } from '@/textures/painters/ground';
import type { Quality } from './Shadows';

export interface SsrTier {
  /** SSR trace available on this tier */
  enabled: boolean;
  /** trace resolution relative to the frame (0.5 = half width and height) */
  scale: number;
  /** ray-march steps (geometric spacing) */
  steps: number;
  /** longest ray in view-space metres */
  maxDist: number;
  /** extra taps blurring the reflection of rough (damp) ground */
  blurTaps: number;
}

export interface FxTier {
  /** composite pass present at all */
  enabled: boolean;
  /** contact-darkening taps per ground pixel (0 = off) */
  contactTaps: number;
  /** aerial-perspective haze */
  haze: boolean;
}

export const SSR_TIERS: Record<Quality, SsrTier> = {
  phone: { enabled: false, scale: 0.5, steps: 0, maxDist: 0, blurTaps: 0 },
  low: { enabled: false, scale: 0.5, steps: 0, maxDist: 0, blurTaps: 0 },
  medium: { enabled: true, scale: 0.5, steps: 20, maxDist: 70, blurTaps: 4 },
  high: { enabled: true, scale: 0.5, steps: 32, maxDist: 120, blurTaps: 8 },
};

export const FX_TIERS: Record<Quality, FxTier> = {
  phone: { enabled: false, contactTaps: 0, haze: false },
  low: { enabled: false, contactTaps: 0, haze: false },
  medium: { enabled: true, contactTaps: 6, haze: true },
  high: { enabled: true, contactTaps: 10, haze: true },
};

/** Below this combined wet strength the trace pass is skipped (dry streets cost only the composite). */
export const SSR_MIN_WET = 0.02;

/** 0..1 strength of the SSR trace for the weather state: soaked ground, a little extra while it pours. */
export function ssrStrength(wetness: number, rain: number): number {
  const w = Math.min(1, Math.max(0, Number.isFinite(wetness) ? wetness : 0));
  const r = Math.min(1, Math.max(0, Number.isFinite(rain) ? rain : 0));
  return Math.min(1, w * (0.85 + 0.15 * r));
}

/** Schlick Fresnel with a deliberately high base (GTA exaggerates wet-road mirror-ness); cosTheta = dot(-view, normal). */
export function wetFresnel(cosTheta: number, f0 = 0.1): number {
  const c = Math.min(1, Math.max(0, cosTheta));
  return f0 + (1 - f0) * Math.pow(1 - c, 4);
}

/** Pass list description of a tier (used by the cost report and tests). */
export interface PassCost {
  name: string;
  /** resolution relative to the frame */
  scale: number;
  /** full-screen draws the pass issues */
  draws: number;
  /** only while the ground is wet */
  wetOnly?: boolean;
}

export function fxPassCosts(q: Quality): PassCost[] {
  const out: PassCost[] = [];
  const fx = FX_TIERS[q];
  const ssr = SSR_TIERS[q];
  if (!fx.enabled) return out;
  if (ssr.enabled) out.push({ name: 'ssr-trace', scale: ssr.scale, draws: 1, wetOnly: true });
  out.push({ name: 'fx-composite', scale: 1, draws: 1 });
  return out;
}

// ---------------------------------------------------------------- shaders

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const COMMON = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDepth;
  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  vec3 viewPosAt(vec2 uv, float d) {
    vec4 c = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return c.xyz / c.w;
  }
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
  uniform sampler2D tPuddle;
  uniform vec2 uPuddleScale;
  uniform float uWet;
  // Same mask Weather.ts samples in the road shader.
  float puddleAt(vec3 wp) {
    float m1 = texture2D(tPuddle, wp.xz * uPuddleScale.x).r;
    float m2 = texture2D(tPuddle, wp.zx * uPuddleScale.y + 0.37).r;
    float level = mix(1.05, 0.55, uWet);
    return smoothstep(level, level + 0.2, max(m1, m2));
  }
`;

export const SSR_TRACE_SHADER = {
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
  ${COMMON}
  uniform sampler2D tDiffuse;
  uniform sampler2D tNormal;
  uniform mat4 uProj;
  uniform float uMaxDist;
  uniform float uNear;
  uniform float uStrength;
  uniform vec2 uTexel;
  #ifndef SSR_STEPS
  #define SSR_STEPS 20
  #endif
  #ifndef SSR_BLUR
  #define SSR_BLUR 4
  #endif

  bool project(vec3 p, out vec2 uv) {
    vec4 c = uProj * vec4(p, 1.0);
    if (c.w <= 0.0) return false;
    uv = c.xy / c.w * 0.5 + 0.5;
    return uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0;
  }

  void main() {
    gl_FragColor = vec4(0.0);
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99999) return;
    vec3 vp = viewPosAt(vUv, d);
    vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
    vec3 nw = mat3(uCamWorld) * n;
    vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
    // Road-level, up-facing surfaces only (the sidewalk is ~0.15 m higher and stays on the env map).
    float ground = smoothstep(0.85, 0.96, nw.y) * (1.0 - smoothstep(0.07, 0.15, wp.y));
    if (ground <= 0.001) return;
    float pud = puddleAt(wp);
    float refl = uStrength * mix(0.3, 1.0, pud) * ground;
    vec3 V = normalize(vp);
    float cosT = clamp(dot(-V, n), 0.0, 1.0);
    float fres = 0.1 + 0.9 * pow(1.0 - cosT, 4.0);
    vec3 R = reflect(V, n);
    if (R.z > -0.02) return; // reflected ray heads behind the camera plane: env map

    float jitter = ign(gl_FragCoord.xy);
    float t0 = 0.2;
    float k = pow(uMaxDist / t0, 1.0 / float(SSR_STEPS));
    float t = t0 * (0.85 + 0.3 * jitter);
    float tPrev = 0.0;
    bool found = false;
    vec2 huv = vec2(0.0);
    for (int i = 0; i < SSR_STEPS; i++) {
      vec3 p = vp + R * t;
      vec2 uv;
      if (p.z > -uNear || !project(p, uv)) break;
      float sd = texture2D(tDepth, uv).x;
      float sz = viewPosAt(uv, sd).z;
      float delta = sz - p.z; // > 0 : the ray is behind the surface
      if (delta > 0.03 && delta < 0.35 + t * 0.12 && sd < 0.99999) {
        // bisect between the last two samples
        float lo = tPrev, hi = t;
        for (int j = 0; j < 4; j++) {
          float mid = 0.5 * (lo + hi);
          vec3 pm = vp + R * mid;
          vec2 um;
          if (!project(pm, um)) break;
          float dm = texture2D(tDepth, um).x;
          if (viewPosAt(um, dm).z - pm.z > 0.0) hi = mid; else lo = mid;
        }
        vec3 ph = vp + R * hi;
        project(ph, huv);
        found = true;
        break;
      }
      tPrev = t;
      t *= k;
    }
    if (!found) return;

    // reject hits on surfaces that face away from the ray (their back sides)
    vec3 nh = normalize(texture2D(tNormal, huv).xyz * 2.0 - 1.0);
    if (dot(nh, R) > 0.35) return;

    float rough = 1.0 - pud; // damp road = blurry, puddle = sharp
    vec3 col = texture2D(tDiffuse, huv).rgb;
    float wsum = 1.0;
    for (int i = 0; i < SSR_BLUR; i++) {
      float a = float(i) * 2.39996 + jitter * 6.2831;
      float r = (0.5 + 0.5 * float(i + 1) / float(SSR_BLUR)) * rough * 7.0;
      col += texture2D(tDiffuse, huv + vec2(cos(a), sin(a)) * r * uTexel).rgb;
      wsum += 1.0;
    }
    col = min(col / wsum, vec3(10.0));
    vec2 e = min(huv, 1.0 - huv);
    float edge = smoothstep(0.0, 0.08, min(e.x, e.y));
    float dist = 1.0 - smoothstep(0.5, 1.0, t / uMaxDist);
    gl_FragColor = vec4(col, clamp(refl * fres * edge * dist, 0.0, 0.92));
  }`,
};

export const FX_COMPOSITE_SHADER = {
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
  ${COMMON}
  uniform sampler2D tDiffuse;
  uniform sampler2D tNormal;
  uniform sampler2D tRefl;
  uniform mat4 uViewProj;
  uniform mat4 uInvViewProj;
  uniform float uReflOn;
  uniform float uContact;
  uniform vec3 uHazeColor;
  uniform float uHazeAmount;
  uniform float uHazeK;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunGlow;
  #ifndef CONTACT_TAPS
  #define CONTACT_TAPS 6
  #endif

  vec3 worldAt(vec2 uv, float d) {
    vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return w.xyz / w.w;
  }

  // Tight screen-space occlusion: ground pixels next to a raised object that really touches that spot.
  float contactAt(vec3 wp) {
    float occ = 0.0;
    float rot = ign(gl_FragCoord.xy) * 6.2831853;
    for (int i = 0; i < CONTACT_TAPS; i++) {
      float fi = float(i);
      float a = fi * 2.39996323 + rot;
      float rad = 0.22 + 0.9 * fract(fi * 0.618 + 0.13);
      vec3 q = wp + vec3(cos(a), 0.0, sin(a)) * rad;
      vec4 c = uViewProj * vec4(q, 1.0);
      if (c.w <= 0.0) continue;
      vec2 uv = c.xy / c.w * 0.5 + 0.5;
      if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) continue;
      float sd = texture2D(tDepth, uv).x;
      if (sd >= 0.99999) continue;
      vec3 sw = worldAt(uv, sd);
      float rise = smoothstep(0.12, 0.5, sw.y - wp.y) * (1.0 - smoothstep(1.8, 3.0, sw.y - wp.y));
      float near = 1.0 - smoothstep(0.5, 1.4, length(sw.xz - q.xz));
      occ += rise * near * (1.0 - rad / 1.3);
    }
    return occ / float(CONTACT_TAPS);
  }

  void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 c = tex.rgb;
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99999) { gl_FragColor = tex; return; }
    vec3 vp = viewPosAt(vUv, d);
    float dist = length(vp);
    vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;

    #if CONTACT_TAPS > 0
    if (uContact > 0.0 && dist < 45.0 && wp.y < 0.5) {
      vec3 nw = mat3(uCamWorld) * normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
      if (nw.y > 0.8) {
        float occ = contactAt(wp);
        c *= 1.0 - uContact * clamp(occ * 2.2, 0.0, 1.0) * (1.0 - smoothstep(25.0, 45.0, dist));
      }
    }
    #endif

    if (uReflOn > 0.5) {
      vec4 r = texture2D(tRefl, vUv);
      c = mix(c, r.rgb, r.a);
    }

    #ifdef HAZE
    if (uHazeAmount > 0.001) {
      vec3 vdir = normalize(mat3(uCamWorld) * vp);
      float f = (1.0 - exp(-dist * uHazeK)) * uHazeAmount * exp(-max(wp.y, 0.0) * 0.012);
      float sunAmt = pow(max(dot(vdir, uSunDir), 0.0), 5.0) * uSunGlow;
      vec3 hz = uHazeColor + uSunColor * sunAmt * 0.6;
      c = mix(c, hz, clamp(f * (1.0 + sunAmt), 0.0, 0.85));
    }
    #endif

    gl_FragColor = vec4(c, tex.a);
  }`,
};

// ---------------------------------------------------------------- puddle mask (same painter + seed as Weather)

let puddleMask: THREE.Texture | null = null;

function makePuddleMask(): THREE.Texture {
  if (puddleMask) return puddleMask;
  try {
    const size = 256;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      puddleMaskPainter(ctx, size, size, new Rng('puddle-mask'), 0);
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      puddleMask = t;
      return t;
    }
  } catch { /* no canvas (tests): dry mask */ }
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  puddleMask = t;
  return t;
}

// ---------------------------------------------------------------- the pass

export interface FxFrame {
  /** 0..1 ground wetness (Weather.wetness) */
  wet: number;
  /** 0..1 rain intensity */
  rain: number;
  /** haze colour (the scene fog colour: horizon sky) */
  hazeColor: THREE.Color;
  /** 0..1 haze strength (hour + weather) */
  hazeAmount: number;
  /** 0..1 forward-scatter glow toward the sun */
  sunGlow: number;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  /** contact darkening 0..1 */
  contact: number;
}

/** Per-metre extinction of the aerial haze. */
export const HAZE_K = 0.0028;

export class FxPass extends Pass {
  readonly frame: FxFrame = {
    wet: 0, rain: 0, hazeColor: new THREE.Color(0.6, 0.7, 0.85), hazeAmount: 0, sunGlow: 0,
    sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(1, 0.9, 0.7), contact: 0.5,
  };
  private readonly camera: THREE.PerspectiveCamera;
  private readonly tier: Quality;
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly trace: THREE.ShaderMaterial | null;
  private readonly comp: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private readonly viewProj = new THREE.Matrix4();
  private readonly invViewProj = new THREE.Matrix4();
  /** whether the last render ran the SSR trace (for tests / the cost report) */
  traced = false;

  constructor(camera: THREE.PerspectiveCamera, depth: THREE.Texture, normal: THREE.Texture, tier: Quality) {
    super();
    this.camera = camera;
    this.tier = tier;
    const ssr = SSR_TIERS[tier];
    const fx = FX_TIERS[tier];
    const puddle = makePuddleMask();
    const shared = (): Record<string, THREE.IUniform> => ({
      tDepth: { value: depth },
      tNormal: { value: normal },
      tPuddle: { value: puddle },
      uPuddleScale: { value: new THREE.Vector2(1 / PUDDLE_MASK_METRES, 1 / (PUDDLE_MASK_METRES * 2.37)) },
      uWet: { value: 0 },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
    });
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.magFilter = THREE.LinearFilter;
    this.trace = ssr.enabled
      ? new THREE.ShaderMaterial({
          vertexShader: SSR_TRACE_SHADER.vertexShader,
          fragmentShader: SSR_TRACE_SHADER.fragmentShader,
          defines: { SSR_STEPS: String(ssr.steps), SSR_BLUR: String(ssr.blurTaps) },
          uniforms: {
            ...shared(),
            tDiffuse: { value: null },
            uProj: { value: new THREE.Matrix4() },
            uMaxDist: { value: ssr.maxDist },
            uNear: { value: 0.1 },
            uStrength: { value: 0 },
            uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
          },
          depthTest: false, depthWrite: false,
        })
      : null;
    const defines: Record<string, string> = { CONTACT_TAPS: String(fx.contactTaps) };
    if (fx.haze) defines.HAZE = '';
    this.comp = new THREE.ShaderMaterial({
      vertexShader: FX_COMPOSITE_SHADER.vertexShader,
      fragmentShader: FX_COMPOSITE_SHADER.fragmentShader,
      defines,
      uniforms: {
        ...shared(),
        tDiffuse: { value: null },
        tRefl: { value: this.rt.texture },
        uViewProj: { value: this.viewProj },
        uInvViewProj: { value: this.invViewProj },
        uReflOn: { value: 0 },
        uContact: { value: 0 },
        uHazeColor: { value: new THREE.Color() },
        uHazeAmount: { value: 0 },
        uHazeK: { value: HAZE_K },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uSunGlow: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });
  }

  override setSize(width: number, height: number): void {
    const s = SSR_TIERS[this.tier].scale;
    this.rt.setSize(Math.max(2, Math.round(width * s)), Math.max(2, Math.round(height * s)));
    if (this.trace) (this.trace.uniforms.uTexel.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  /** Size of the half-resolution SSR target in device pixels. */
  get traceSize(): { w: number; h: number } {
    return { w: this.rt.width, h: this.rt.height };
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.invViewProj.copy(this.viewProj).invert();
    const f = this.frame;
    const strength = ssrStrength(f.wet, f.rain);
    this.traced = false;

    const setShared = (u: Record<string, THREE.IUniform>): void => {
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uCamWorld.value.copy(cam.matrixWorld);
      u.uWet.value = f.wet;
    };

    if (this.trace && strength > SSR_MIN_WET) {
      const u = this.trace.uniforms;
      setShared(u);
      u.tDiffuse.value = readBuffer.texture;
      u.uProj.value.copy(cam.projectionMatrix);
      u.uNear.value = cam.near;
      u.uStrength.value = strength;
      this.quad.material = this.trace;
      renderer.setRenderTarget(this.rt);
      this.quad.render(renderer);
      this.traced = true;
    }

    const c = this.comp.uniforms;
    setShared(c);
    c.tDiffuse.value = readBuffer.texture;
    c.uReflOn.value = this.traced ? 1 : 0;
    c.uContact.value = f.contact;
    (c.uHazeColor.value as THREE.Color).copy(f.hazeColor);
    c.uHazeAmount.value = f.hazeAmount;
    (c.uSunDir.value as THREE.Vector3).copy(f.sunDir);
    (c.uSunColor.value as THREE.Color).copy(f.sunColor);
    c.uSunGlow.value = f.sunGlow;
    this.quad.material = this.comp;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.rt.dispose();
    this.trace?.dispose();
    this.comp.dispose();
    this.quad.dispose();
  }
}
