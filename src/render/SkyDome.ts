import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Rng } from '@/core/Rng';
import { clamp } from '@/core/Math2';
import type { IMaterialLibrary } from '@/world/types';
import { newTimeCycle, timeCycleAt } from '@/render/LightingConfig';

// ---------------------------------------------------------------- tunables

const SKY_SCALE = 2000;
const STAR_COUNT = 1500;
const STAR_RADIUS = 800; // inside the camera far plane (900)
/** Re-capture the PMREM environment after this many game hours (day / night plateaus). */
const ENV_REBUILD_HOURS = 0.25;
/** ...and this often while the sky changes quickly (sun elevation sine in TWILIGHT_RANGE), so glass and paint do not pop. */
const ENV_REBUILD_HOURS_TWILIGHT = 0.05;
const TWILIGHT_RANGE = { lo: -0.3, hi: 0.35 };
/** Cloud drift speed in sky `time` units per game hour. */
const CLOUD_TIME_PER_HOUR = 600;

export interface SkyParams {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** Multiplier applied to the sky radiance inside the shader (the renderer's own exposure is separate). */
  exposure: number;
}

/**
 * Hour keyframes. The sun rises at 06:00 and sets at 19:30 (see DayNight), so dusk haze peaks around
 * 19:00-19:30 and the sky is fully dark by ~21:00. Hour 24 wraps back to hour 0.
 */
const PARAM_KEYS: ReadonlyArray<{ hour: number } & SkyParams> = [
  { hour: 0, turbidity: 2, rayleigh: 0.6, mieCoefficient: 0.003, mieDirectionalG: 0.8, exposure: 0.087 },
  { hour: 5, turbidity: 3, rayleigh: 0.8, mieCoefficient: 0.004, mieDirectionalG: 0.82, exposure: 0.105 },
  { hour: 6.5, turbidity: 9, rayleigh: 1.6, mieCoefficient: 0.012, mieDirectionalG: 0.88, exposure: 0.158 },
  { hour: 9, turbidity: 5, rayleigh: 2.0, mieCoefficient: 0.006, mieDirectionalG: 0.8, exposure: 0.196 },
  { hour: 12, turbidity: 3.5, rayleigh: 2.4, mieCoefficient: 0.004, mieDirectionalG: 0.75, exposure: 0.21 },
  { hour: 16, turbidity: 5, rayleigh: 2.1, mieCoefficient: 0.006, mieDirectionalG: 0.8, exposure: 0.196 },
  { hour: 18.3, turbidity: 8, rayleigh: 1.7, mieCoefficient: 0.011, mieDirectionalG: 0.88, exposure: 0.175 },
  { hour: 19.5, turbidity: 9, rayleigh: 1.3, mieCoefficient: 0.016, mieDirectionalG: 0.92, exposure: 0.147 },
  { hour: 21, turbidity: 4, rayleigh: 0.8, mieCoefficient: 0.006, mieDirectionalG: 0.85, exposure: 0.105 },
  { hour: 24, turbidity: 2, rayleigh: 0.6, mieCoefficient: 0.003, mieDirectionalG: 0.8, exposure: 0.087 },
];

function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  const m = hour % 24;
  return m < 0 ? m + 24 : m;
}

/** Atmosphere parameters for the Preetham sky at a game hour (interpolated, wraps at 24). */
export function skyParamsAt(hour: number): SkyParams {
  const h = wrapHour(hour);
  for (let i = 0; i < PARAM_KEYS.length - 1; i++) {
    const a = PARAM_KEYS[i];
    const b = PARAM_KEYS[i + 1];
    if (h >= a.hour && h < b.hour) {
      const t = (h - a.hour) / (b.hour - a.hour);
      const l = (x: number, y: number): number => x + (y - x) * t;
      return {
        turbidity: l(a.turbidity, b.turbidity),
        rayleigh: l(a.rayleigh, b.rayleigh),
        mieCoefficient: l(a.mieCoefficient, b.mieCoefficient),
        mieDirectionalG: l(a.mieDirectionalG, b.mieDirectionalG),
        exposure: l(a.exposure, b.exposure),
      };
    }
  }
  const { hour: _h, ...first } = PARAM_KEYS[0];
  void _h;
  return first;
}

// ---------------------------------------------------------------- horizon / fog colour

/** Horizon colour keyed by sun elevation (sine of the elevation angle), matching what the Sky shader paints there. */
const HORIZON_KEYS: ReadonlyArray<{ e: number; color: number }> = [
  { e: -0.3, color: 0x0a1030 }, // night
  { e: -0.12, color: 0x0e1638 },
  { e: -0.05, color: 0x2a2f62 }, // blue hour
  { e: 0.0, color: 0xe08a62 }, // sunset glow
  { e: 0.08, color: 0xe6b08a }, // hazy warm
  { e: 0.25, color: 0xbcd0df },
  { e: 0.6, color: 0xa9d0ec }, // clear blue
  { e: 1.0, color: 0xa4cdee },
];
const HORIZON_COLORS = HORIZON_KEYS.map((k) => new THREE.Color(k.color));

/** Horizon (and fog) colour for a sun elevation sine in [-1, 1]. */
export function horizonColorAt(sunElevation: number, out: THREE.Color = new THREE.Color()): THREE.Color {
  const e = clamp(sunElevation, HORIZON_KEYS[0].e, HORIZON_KEYS[HORIZON_KEYS.length - 1].e);
  for (let i = 0; i < HORIZON_KEYS.length - 1; i++) {
    const a = HORIZON_KEYS[i];
    const b = HORIZON_KEYS[i + 1];
    if (e >= a.e && e <= b.e) {
      return out.copy(HORIZON_COLORS[i]).lerp(HORIZON_COLORS[i + 1], (e - a.e) / (b.e - a.e));
    }
  }
  return out.copy(HORIZON_COLORS[0]);
}

const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- shader patch

/** Adds an exposure multiplier and a faint blue night glow (the stock shader goes almost black at night). */
function patchSkyMaterial(mat: THREE.ShaderMaterial): void {
  mat.uniforms.skyExposure = { value: 0.6 };
  mat.uniforms.nightGlow = { value: new THREE.Color(0x000000) };
  const frag = mat.fragmentShader;
  const withUniforms = frag.replace('uniform float time;', 'uniform float time;\n\t\tuniform float skyExposure;\n\t\tuniform vec3 nightGlow;');
  const withGlow = withUniforms.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    'texColor *= skyExposure;\n\t\t\ttexColor += nightGlow * mix( 1.0, 0.45, clamp( direction.y * 1.5, 0.0, 1.0 ) );\n\t\t\tgl_FragColor = vec4( texColor, 1.0 );',
  );
  if (withGlow !== frag) mat.fragmentShader = withGlow;
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------- SkyDome

export class SkyDome {
  readonly sky: Sky;
  readonly stars: THREE.Points;

  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly materials: IMaterialLibrary;
  private readonly skyScene = new THREE.Scene();
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly horizon = new THREE.Color();
  private pmrem: THREE.PMREMGenerator | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private lastCaptureHour = Number.NaN;
  private lastNight: boolean | null = null;
  private lastHour = Number.NaN;
  private cloudTime = 0;
  private sunElevation = 1;
  private trueSun: THREE.Vector3 | null = null;
  private readonly tc = newTimeCycle();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, materials: IMaterialLibrary) {
    this.scene = scene;
    this.renderer = renderer;
    this.materials = materials;

    this.sky = new Sky();
    this.sky.scale.setScalar(SKY_SCALE);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.sky.name = 'sky';
    const mat = this.sky.material as THREE.ShaderMaterial;
    patchSkyMaterial(mat);
    this.uniforms = mat.uniforms;
    this.uniforms.cloudCoverage.value = 0.35;
    this.uniforms.cloudDensity.value = 0.35;
    scene.add(this.sky);

    // A second mesh sharing geometry + material lives in the capture scene (an object has one parent).
    const envSky = new THREE.Mesh(this.sky.geometry, mat);
    envSky.scale.setScalar(SKY_SCALE);
    envSky.frustumCulled = false;
    this.skyScene.add(envSky);

    this.stars = SkyDome.buildStars();
    scene.add(this.stars);

    horizonColorAt(1, this.horizon);
  }

  /**
   * DayNight hands over the true (astronomical) sun direction here. `update()` uses it instead of its `sunDir`
   * argument, because the shadow code re-aims the key light (mirrors it above the ground at night, lifts it near
   * the horizon) and main.ts derives `sunDir` from that light, which made the dome show a lifted/mirrored sun.
   */
  setSunDirection(dir: THREE.Vector3): void {
    this.trueSun = dir;
  }

  /**
   * Call once per frame after DayNight.update.
   * `sunDir` is the direction toward the sun (dayNight.sun.position.clone().normalize()).
   * `cameraPos` (optional) re-centres the dome and stars on the camera so the sky never parallaxes.
   */
  update(hour: number, sunDir: THREE.Vector3, isNight: boolean, cameraPos?: THREE.Vector3): void {
    const h = wrapHour(hour);
    const src = this.trueSun ?? sunDir;
    const dir = src.lengthSq() > 0 ? src.clone().normalize() : new THREE.Vector3(0, 1, 0);
    this.sunElevation = dir.y;

    if (Number.isFinite(this.lastHour)) {
      let d = h - this.lastHour;
      if (d < -12) d += 24;
      if (d > 12) d -= 24;
      this.cloudTime += Math.max(0, d) * CLOUD_TIME_PER_HOUR;
    }
    this.lastHour = h;

    const p = skyParamsAt(h);
    const u = this.uniforms;
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh;
    u.mieCoefficient.value = p.mieCoefficient;
    u.mieDirectionalG.value = p.mieDirectionalG;
    u.skyExposure.value = p.exposure;
    u.sunPosition.value.copy(dir);
    u.time.value = this.cloudTime;

    horizonColorAt(dir.y, this.horizon);
    // Blue night glow: full when the sun is well below the horizon, gone by day.
    const glow = 1 - smooth(-0.12, 0.12, dir.y);
    (u.nightGlow.value as THREE.Color).copy(this.horizon).multiplyScalar(glow * 0.9);

    // Stars fade in as the sun drops below the horizon.
    const starAlpha = (isNight || dir.y < 0 ? 1 - smooth(-0.2, -0.02, dir.y) : 0) * 0.95;
    this.stars.visible = starAlpha > 0.01;
    (this.stars.material as THREE.PointsMaterial).opacity = starAlpha;

    if (cameraPos) {
      this.sky.position.copy(cameraPos);
      this.stars.position.copy(cameraPos);
    }

    // Materials without their own envMap follow scene.environmentIntensity (main.ts only sets it on day/night flips).
    this.scene.environmentIntensity = timeCycleAt(h, this.tc).env;

    const dh = Math.abs(h - this.lastCaptureHour);
    const twilight = dir.y > TWILIGHT_RANGE.lo && dir.y < TWILIGHT_RANGE.hi;
    const step = twilight ? ENV_REBUILD_HOURS_TWILIGHT : ENV_REBUILD_HOURS;
    const moved = Number.isNaN(this.lastCaptureHour) || Math.min(dh, 24 - dh) > step;
    if (moved || this.lastNight !== isNight) this.captureEnvironment();
    this.lastNight = isNight;
  }

  /** Sky colour at the horizon for fog. Pass the sun elevation sine for an exact value; omit for the last update. */
  horizonColor(sunElevation?: number): THREE.Color {
    if (sunElevation === undefined) return this.horizon.clone();
    return horizonColorAt(sunElevation);
  }

  dispose(): void {
    this.scene.remove(this.sky, this.stars);
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    (this.sky.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.envTarget = null;
    this.pmrem = null;
  }

  // ---------------------------------------------------------------- internals

  private captureEnvironment(): void {
    this.lastCaptureHour = this.lastHour;
    try {
      this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
      // Hide the sun disc so the cube map has no blown-out hot spot.
      const prevDisc = this.uniforms.showSunDisc.value;
      this.uniforms.showSunDisc.value = 0;
      const target = this.pmrem.fromScene(this.skyScene, 0, 0.1, 100);
      this.uniforms.showSunDisc.value = prevDisc;
      const old = this.envTarget;
      this.envTarget = target;
      this.scene.environment = target.texture;
      this.materials.setEnvironment?.(target.texture);
      old?.dispose();
    } catch (err) {
      this.uniforms.showSunDisc.value = 1;
      console.warn('SkyDome: environment capture failed', err);
    }
  }

  private static buildStars(): THREE.Points {
    const rng = new Rng('sky-stars');
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform on the upper hemisphere, kept slightly above the horizon.
      const y = rng.range(0.03, 1);
      const phi = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(phi) * r * STAR_RADIUS;
      pos[i * 3 + 1] = y * STAR_RADIUS;
      pos[i * 3 + 2] = Math.sin(phi) * r * STAR_RADIUS;
      const b = 0.35 + 0.65 * rng.next() ** 2;
      const tint = rng.next();
      col[i * 3] = b * (tint < 0.2 ? 1 : 0.85 + 0.15 * tint);
      col[i * 3 + 1] = b * 0.92;
      col[i * 3 + 2] = b * (tint > 0.7 ? 1 : 0.9);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.2,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'stars';
    pts.frustumCulled = false;
    pts.renderOrder = -900;
    pts.visible = false;
    return pts;
  }
}
