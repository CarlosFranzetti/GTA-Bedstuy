import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { createCanvas } from '@/textures/canvas';
import { PUDDLE_MASK_METRES, puddleMaskPainter } from '@/textures/painters/ground';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';

/**
 * Weather: dry -> rain -> wet -> drying -> dry.
 *
 *  - `rain` (0..1) is the rain intensity: drives the GPU rain streaks and the overcast sky/light.
 *  - `wetness` (0..1) is how soaked the ground is. It rises while it rains, stays at 1 for the wet phase and falls
 *    again while drying. It drives the wet ground layer: the shared asphalt / sidewalk materials are patched in
 *    place (onBeforeCompile) so they darken, lose roughness and grow mirror-like puddles from a world-space mask.
 *    No material swap is needed, so every road mesh already in the scene gets the effect.
 *  - `overcast` (0..1) is handed to DayNight (sun dimmer, fog closer, hemisphere up) and SkyDome (more cloud).
 *
 * Wiring (main.ts, owned by P8): construct once after the world and sky exist and BEFORE the first shader warm-up
 * (patched materials recompile once), then call `weather.update(frameDt, camera.position)` every rendered frame.
 */
export type WeatherState = 'dry' | 'rain' | 'wet' | 'drying';

export interface WeatherOptions {
  /** Rain streak count (0 disables the streaks). Default 1200. */
  rainStreaks?: number;
  /** Real seconds of rain, then of the wet phase, then of drying. */
  rainSeconds?: number;
  wetSeconds?: number;
  dryingSeconds?: number;
  /** When true a dry spell of `dryGapSeconds` is followed by rain on its own. Default false (debug / menu driven). */
  autoCycle?: boolean;
  dryGapSeconds?: number;
  canvasFactory?: (w: number, h: number) => HTMLCanvasElement;
}

/** Collaborators that react to the weather; optional and duck-typed so tests can pass stubs. */
export interface WeatherTargets {
  /** DayNight forwards `overcast` to its attached SkyDome, so the sky needs no separate hook. */
  dayNight?: { overcast: number; timeOfDay: number; sunDirection: THREE.Vector3; update(dt: number): void };
}

interface WetSpec {
  key: MaterialKey;
  /** albedo multiplier at full wetness (outside puddles) */
  dark: number;
  /** roughness the surface approaches when wet */
  rough: number;
  /** 1 = puddles allowed (roads), 0 = only the damp darkening (sidewalks, curbs) */
  puddles: number;
  /** envMapIntensity at full wetness (only applies to materials that own an envMap) */
  env: number;
}

const WET_SPECS: readonly WetSpec[] = [
  { key: 'asphalt', dark: 0.55, rough: 0.22, puddles: 1, env: 1.0 },
  { key: 'asphaltWorn', dark: 0.6, rough: 0.24, puddles: 1, env: 1.0 },
  { key: 'crosswalk', dark: 0.7, rough: 0.3, puddles: 1, env: 0.6 },
  { key: 'concrete', dark: 0.68, rough: 0.5, puddles: 0.35, env: 0.6 },
  { key: 'bluestone', dark: 0.66, rough: 0.5, puddles: 0.35, env: 0.6 },
  { key: 'curb', dark: 0.72, rough: 0.55, puddles: 0, env: 0.5 },
  { key: 'graniteCurb', dark: 0.7, rough: 0.5, puddles: 0, env: 0.5 },
];

const RAIN_RAMP_UP = 1 / 5; // rain intensity per second
const RAIN_RAMP_DOWN = 1 / 10;
const SOAK_RATE = 1 / 25; // wetness per second while raining (full soak after ~25 s)
const OVERCAST_RATE = 1 / 12;
const BOX = 60; // rain box edge (m) around the camera
const BOX_H = 30;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- wet shader patch

const VERT_DECL = 'varying vec3 vWetWorld;\n';
const VERT_BODY = `
  vec4 wetW = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    wetW = batchingMatrix * wetW;
  #endif
  #ifdef USE_INSTANCING
    wetW = instanceMatrix * wetW;
  #endif
  vWetWorld = ( modelMatrix * wetW ).xyz;
`;
const FRAG_DECL = `
varying vec3 vWetWorld;
uniform float uWet;
uniform float uWetDark;
uniform float uWetRough;
uniform float uWetPuddles;
uniform sampler2D tPuddle;
uniform vec2 uPuddleScale;
float wetPuddle;
`;
const FRAG_ALBEDO = `
wetPuddle = 0.0;
float wetDamp = 0.0;
if ( uWet > 0.001 ) {
  float m1 = texture2D( tPuddle, vWetWorld.xz * uPuddleScale.x ).r;
  float m2 = texture2D( tPuddle, vWetWorld.zx * uPuddleScale.y + 0.37 ).r;
  float m = max( m1, m2 );
  float level = mix( 1.05, 0.55, uWet );
  wetPuddle = smoothstep( level, level + 0.2, m ) * uWetPuddles;
  wetDamp = uWet;
  diffuseColor.rgb *= mix( 1.0, uWetDark, wetDamp );
  diffuseColor.rgb *= mix( 1.0, 0.62, wetPuddle );
}
`;
const FRAG_ROUGH = `
if ( uWet > 0.001 ) {
  roughnessFactor = mix( roughnessFactor, uWetRough, uWet );
  roughnessFactor = mix( roughnessFactor, 0.035, wetPuddle );
}
`;
const FRAG_NORMAL = `
if ( uWet > 0.001 ) {
  normal = normalize( mix( normal, nonPerturbedNormal, clamp( wetPuddle + uWet * 0.3, 0.0, 1.0 ) ) );
}
`;

/**
 * Patches a MeshStandardMaterial's shaders with the wet layer (puddle mask from world xz, darker albedo, lower roughness,
 * flatter normals). Returns false and leaves the shader untouched if any three shader chunk anchor is missing.
 */
export function patchWetShader(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }, uniforms: Record<string, THREE.IUniform>): boolean {
  const swaps: ReadonlyArray<readonly [string, string]> = [
    ['#include <common>', FRAG_DECL],
    ['#include <map_fragment>', FRAG_ALBEDO],
    ['#include <roughnessmap_fragment>', FRAG_ROUGH],
    ['#include <normal_fragment_maps>', FRAG_NORMAL],
  ];
  let fs = shader.fragmentShader;
  for (const [anchor, add] of swaps) {
    if (!fs.includes(anchor)) return false;
    fs = fs.replace(anchor, `${anchor}\n${add}`);
  }
  if (!shader.vertexShader.includes('#include <project_vertex>')) return false;
  shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
  shader.fragmentShader = fs;
  Object.assign(shader.uniforms, uniforms);
  return true;
}

// ---------------------------------------------------------------- rain streaks

const RAIN_VERT = `
attribute vec3 aSeed;
attribute float aEnd;
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uBox;
uniform vec2 uWind;
uniform float uFall;
uniform float uLen;
varying float vA;
void main() {
  vec3 base = aSeed * uBox + vec3( uWind.x * uTime, -uFall * uTime, uWind.y * uTime );
  vec3 d = base - uCam;
  d = d - uBox * floor( d / uBox + 0.5 );
  vec3 dir = normalize( vec3( uWind.x, -uFall, uWind.y ) );
  vec3 p = uCam + d - dir * uLen * aEnd;
  vA = mix( 1.0, 0.0, aEnd ) * ( 1.0 - smoothstep( 0.3, 0.5, abs( d.x / uBox.x ) ) ) * ( 1.0 - smoothstep( 0.3, 0.5, abs( d.z / uBox.z ) ) );
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;
const RAIN_FRAG = `
uniform float uAlpha;
uniform vec3 uColor;
varying float vA;
void main() { gl_FragColor = vec4( uColor, uAlpha * vA ); }
`;

export class Weather {
  private _state: WeatherState = 'dry';
  /** rain intensity 0..1 */
  rain = 0;
  /** ground wetness 0..1 */
  wetness = 0;
  /** cloud / gloom 0..1 (smoothed) */
  overcast = 0;
  autoCycle: boolean;

  private readonly opts: Required<Omit<WeatherOptions, 'canvasFactory'>>;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly puddleTex: THREE.Texture;
  private readonly specs: { mat: THREE.MeshStandardMaterial; spec: WetSpec; baseEnv: number; uniforms: Record<string, THREE.IUniform> }[] = [];
  private targets: WeatherTargets = {};
  private readonly scene: THREE.Scene;
  private readonly rainMesh: THREE.LineSegments | null;
  private readonly rainU: Record<string, THREE.IUniform>;
  private phaseTime = 0;
  private time = 0;
  private lastOvercast = -1;

  constructor(scene: THREE.Scene, materials: IMaterialLibrary, opts: WeatherOptions = {}) {
    this.scene = scene;
    this.opts = {
      rainStreaks: opts.rainStreaks ?? 1200,
      rainSeconds: opts.rainSeconds ?? 100,
      wetSeconds: opts.wetSeconds ?? 120,
      dryingSeconds: opts.dryingSeconds ?? 70,
      autoCycle: opts.autoCycle ?? false,
      dryGapSeconds: opts.dryGapSeconds ?? 240,
    };
    this.autoCycle = this.opts.autoCycle;

    this.puddleTex = Weather.makePuddleTexture(opts.canvasFactory ?? createCanvas);
    this.uniforms = {
      tPuddle: { value: this.puddleTex },
      uPuddleScale: { value: new THREE.Vector2(1 / PUDDLE_MASK_METRES, 1 / (PUDDLE_MASK_METRES * 2.37)) },
    };

    // patch the shared ground materials (every variant), each with its own wet uniforms but the shared mask
    const seen = new Set<THREE.Material>();
    for (const spec of WET_SPECS) {
      for (let v = 0; v < 4; v++) {
        let m: THREE.Material;
        try { m = materials.get(spec.key, v); } catch { break; }
        if (seen.has(m) || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
        seen.add(m);
        this.patch(m as THREE.MeshStandardMaterial, spec);
      }
    }

    // rain streaks
    const n = Math.max(0, Math.floor(this.opts.rainStreaks));
    this.rainU = {
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: new THREE.Vector3(BOX, BOX_H, BOX) },
      uWind: { value: new THREE.Vector2(2.2, 0.8) }, uFall: { value: 13 }, uLen: { value: 0.9 },
      uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0.55, 0.6, 0.7) },
    };
    if (n > 0) {
      const rng = new Rng('rain');
      const seed = new Float32Array(n * 2 * 3);
      const end = new Float32Array(n * 2);
      const pos = new Float32Array(n * 2 * 3); // unused by the shader but required for a valid geometry / bounding data
      for (let i = 0; i < n; i++) {
        const x = rng.next(), y = rng.next(), z = rng.next();
        for (let e = 0; e < 2; e++) { const k = (i * 2 + e) * 3; seed[k] = x; seed[k + 1] = y; seed[k + 2] = z; end[i * 2 + e] = e; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
      g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: this.rainU,
        transparent: true, depthWrite: false, fog: false,
      });
      this.rainMesh = new THREE.LineSegments(g, mat);
      this.rainMesh.frustumCulled = false;
      this.rainMesh.renderOrder = 20;
      this.rainMesh.name = 'rain';
      this.rainMesh.visible = false;
      scene.add(this.rainMesh);
    } else {
      this.rainMesh = null;
    }
  }

  /** Hook up the things that react to overcast (DayNight lighting, SkyDome clouds). */
  attach(t: WeatherTargets): void {
    this.targets = t;
    this.applyOvercast(true);
  }

  get state(): WeatherState { return this._state; }

  /**
   * Debug / menu setter. 'dry' snaps everything dry; 'rain' starts raining now (ground soaks over ~25 s; pass
   * `snap` to jump straight to a soaked street); 'wet' = rain stopped, ground fully wet; 'drying' = evaporating
   * from the current wetness (from fully wet if the ground was dry).
   */
  setState(s: WeatherState, snap = false): void {
    this._state = s;
    this.phaseTime = 0;
    if (s === 'dry') { this.rain = 0; this.wetness = 0; this.overcast = 0; }
    if (s === 'rain') { if (snap) { this.rain = 1; this.wetness = 1; this.overcast = 1; } }
    if (s === 'wet') { this.rain = 0; this.wetness = 1; this.overcast = Math.max(this.overcast, 0.5); if (snap) this.overcast = 0.5; }
    if (s === 'drying') { if (this.wetness < 0.05) this.wetness = 1; this.rain = 0; }
    this.syncUniforms();
    this.applyOvercast(true);
  }

  startRain(): void { this.setState('rain'); }
  stopRain(): void { if (this._state === 'rain') { this._state = 'wet'; this.phaseTime = 0; } }

  /** Per rendered frame. `cameraPos` anchors the rain box. */
  update(dt: number, cameraPos?: THREE.Vector3): void {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.time += d;
    this.phaseTime += d;

    switch (this._state) {
      case 'dry':
        if (this.autoCycle && this.phaseTime > this.opts.dryGapSeconds) this.setState('rain');
        break;
      case 'rain':
        if (this.phaseTime > this.opts.rainSeconds) { this._state = 'wet'; this.phaseTime = 0; }
        break;
      case 'wet':
        if (this.phaseTime > this.opts.wetSeconds) { this._state = 'drying'; this.phaseTime = 0; }
        break;
      case 'drying':
        if (this.wetness <= 0.001) { this.wetness = 0; this._state = 'dry'; this.phaseTime = 0; }
        break;
    }

    const raining = this._state === 'rain';
    this.rain = raining ? Math.min(1, this.rain + d * RAIN_RAMP_UP) : Math.max(0, this.rain - d * RAIN_RAMP_DOWN);
    if (raining) this.wetness = Math.min(1, this.wetness + d * SOAK_RATE);
    else if (this._state === 'drying') this.wetness = Math.max(0, this.wetness - d / Math.max(1, this.opts.dryingSeconds));

    // gloom: full while raining, half while the street is still soaked, fading with the wetness
    const target = raining ? 1 : this._state === 'wet' ? 0.5 : this._state === 'drying' ? 0.5 * this.wetness : 0;
    const step = d * OVERCAST_RATE;
    this.overcast += Math.max(-step, Math.min(step, target - this.overcast));

    this.syncUniforms();
    this.applyOvercast(false);

    if (this.rainMesh) {
      const on = this.rain > 0.01;
      this.rainMesh.visible = on;
      if (on) {
        const u = this.rainU;
        u.uTime.value = this.time;
        if (cameraPos) (u.uCam.value as THREE.Vector3).copy(cameraPos);
        const dn = this.targets.dayNight;
        const bright = dn ? 0.3 + 0.7 * smooth(-0.05, 0.3, dn.sunDirection.y) : 1;
        u.uAlpha.value = 0.5 * this.rain;
        (u.uColor.value as THREE.Color).setRGB(0.55 * bright, 0.6 * bright, 0.7 * bright + 0.05);
      }
    }
  }

  dispose(): void {
    if (this.rainMesh) {
      this.scene.remove(this.rainMesh);
      this.rainMesh.geometry.dispose();
      (this.rainMesh.material as THREE.Material).dispose();
    }
    this.puddleTex.dispose();
    // un-wet the ground so a disposed Weather leaves the materials as it found them
    this.wetness = 0;
    this.syncUniforms();
  }

  // ---------------------------------------------------------------- internals

  private applyOvercast(force: boolean): void {
    const o = this.overcast;
    if (!force && Math.abs(o - this.lastOvercast) < 0.002) return;
    this.lastOvercast = o;
    const t = this.targets;
    if (t.dayNight) { t.dayNight.overcast = o; t.dayNight.update(0); }
  }

  private syncUniforms(): void {
    for (const s of this.specs) {
      s.uniforms.uWet.value = this.wetness;
      if (s.mat.envMap) s.mat.envMapIntensity = s.baseEnv + (Math.max(s.baseEnv, s.spec.env) - s.baseEnv) * this.wetness;
    }
  }

  private patch(m: THREE.MeshStandardMaterial, spec: WetSpec): void {
    const uniforms: Record<string, THREE.IUniform> = {
      ...this.uniforms,
      uWet: { value: 0 },
      uWetDark: { value: spec.dark },
      uWetRough: { value: spec.rough },
      uWetPuddles: { value: spec.puddles },
    };
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev?.call(m, shader, renderer);
      patchWetShader(shader as unknown as { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }, uniforms);
    };
    const prevKey = m.customProgramCacheKey;
    m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|wet1`;
    m.needsUpdate = true;
    this.specs.push({ mat: m, spec, baseEnv: m.envMapIntensity, uniforms });
  }

  private static makePuddleTexture(factory: (w: number, h: number) => HTMLCanvasElement): THREE.Texture {
    try {
      const size = 256;
      const canvas = factory(size, size);
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
        return t;
      }
    } catch { /* no canvas (tests / SSR): fall through to a dry mask */ }
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }
}
