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
/**
 * Per-channel cap on the dome radiance (after the exposure multiplier). The Preetham sun/Mie lobe goes far above 1 at
 * dusk, which bloomed into the whole street (blown 19:30 frames). Kept below every bloom threshold in the time cycle.
 */
const SKY_MAX_RADIANCE = 0.9;

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
  { hour: 6.5, turbidity: 5, rayleigh: 2.2, mieCoefficient: 0.008, mieDirectionalG: 0.88, exposure: 0.125 },
  { hour: 9, turbidity: 5, rayleigh: 2.0, mieCoefficient: 0.006, mieDirectionalG: 0.8, exposure: 0.14 },
  { hour: 12, turbidity: 3.5, rayleigh: 2.4, mieCoefficient: 0.004, mieDirectionalG: 0.75, exposure: 0.15 },
  { hour: 16, turbidity: 5, rayleigh: 2.1, mieCoefficient: 0.006, mieDirectionalG: 0.8, exposure: 0.14 },
  { hour: 18.3, turbidity: 5, rayleigh: 2.0, mieCoefficient: 0.008, mieDirectionalG: 0.88, exposure: 0.135 },
  { hour: 19.5, turbidity: 5, rayleigh: 2.2, mieCoefficient: 0.008, mieDirectionalG: 0.9, exposure: 0.12 },
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


// ---------------------------------------------------------------- ART: cloud layer, sun disc, haze band, dusk ramp

export interface CloudParams {
  /** fraction of the dome the cloud noise is carved over (0..1) */
  cover: number;
  /** how opaque the carved cloud gets (0..1) */
  density: number;
  /** sun-lit side colour (linear, dome scale: capped at SKY_MAX_RADIANCE) */
  lit: [number, number, number];
  /** shadowed underside colour */
  shade: [number, number, number];
  /** brightness of the sun disc core (0 below the horizon) */
  sunDisc: number;
  /** strength of the horizon haze band (0..1) */
  haze: number;
  /** strength of the dusk / dawn colour ramp (0..1, peaks with the sun on the horizon) */
  dusk: number;
}

/**
 * Cloud / sun / haze / dusk look for a sun elevation (sine of the elevation angle) and rain gloom, independent of the GPU so
 * tests can bound it. `sunRgb` is the key-light colour (linear 0..1) from the time cycle; clouds catch it, so they go amber
 * and pink at golden hour and grey-blue in the rain.
 */
export function cloudParamsAt(sunElevation: number, overcast: number, sunRgb: readonly [number, number, number] = [1, 0.93, 0.87], out?: CloudParams): CloudParams {
  const e = clamp(sunElevation, -1, 1);
  const o = clamp(overcast, 0, 1);
  const up = smooth(-0.06, 0.28, e);
  const dusk = smooth(-0.2, -0.02, e) * (1 - smooth(0.02, 0.3, e));
  const night = 1 - smooth(-0.2, 0.0, e);
  const r = out ?? { cover: 0, density: 0, lit: [0, 0, 0], shade: [0, 0, 0], sunDisc: 0, haze: 0, dusk: 0 };
  r.cover = clamp(0.4 + 0.1 * (1 - up) + 0.5 * o, 0.25, 0.95);
  r.density = clamp(0.62 + 0.1 * up + 0.28 * o, 0.5, 1);
  const gloom = 1 - 0.32 * o;
  const nl = Math.max(sunRgb[0], sunRgb[1], sunRgb[2], 1e-3);
  const dim = (0.04 + 0.96 * up) * gloom;
  r.lit = [
    clamp((sunRgb[0] / nl) * 0.96 * dim + 0.05 * night + 0.55 * dusk * 0.9, 0, SKY_MAX_RADIANCE),
    clamp((sunRgb[1] / nl) * 0.93 * dim + 0.06 * night + 0.55 * dusk * 0.42, 0, SKY_MAX_RADIANCE),
    clamp((sunRgb[2] / nl) * 0.9 * dim + 0.09 * night + 0.55 * dusk * 0.34, 0, SKY_MAX_RADIANCE),
  ];
  const sh = (0.1 + 0.9 * up) * (1 - 0.3 * o);
  r.shade = [
    clamp(0.4 * sh + 0.025 * night + 0.22 * dusk * 0.5, 0, SKY_MAX_RADIANCE),
    clamp(0.47 * sh + 0.03 * night + 0.22 * dusk * 0.28, 0, SKY_MAX_RADIANCE),
    clamp(0.6 * sh + 0.06 * night + 0.22 * dusk * 0.4, 0, SKY_MAX_RADIANCE),
  ];
  r.sunDisc = smooth(-0.02, 0.05, e) * (1 - 0.85 * o);
  r.haze = clamp(0.55 + 0.25 * dusk + 0.2 * o, 0, 0.9);
  r.dusk = dusk;
  return r;
}

const ART_GLSL_DECL = /* glsl */ `
		uniform float artTime;
		uniform float artCover;
		uniform float artDensity;
		uniform float artQuality;
		uniform float artSun;
		uniform float artHaze;
		uniform float artDusk;
		uniform vec3 artLit;
		uniform vec3 artShade;
		uniform vec3 artSunCol;
		uniform vec3 artHazeCol;
		float artH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
		float artN( vec2 p ) {
			vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
			return mix( mix( artH( i ), artH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( artH( i + vec2( 0.0, 1.0 ) ), artH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
		}
		float artF( vec2 p, int oct ) {
			float a = 0.5; float s = 0.0;
			for ( int i = 0; i < 5; i ++ ) { if ( i >= oct ) break; s += a * artN( p ); p = p * 2.03 + vec2( 17.1, 9.2 ); a *= 0.5; }
			return s;
		}`;

/** Composes the dusk ramp, horizon haze, cloud layer and sun disc on the exposed dome colour. Runs after the radiance cap. */
const ART_GLSL_BODY = /* glsl */ `
			float artCs = dot( direction, vSunDirection );
			float artAz = dot( normalize( direction.xz + vec2( 1e-5 ) ), sunDirH.xz ) * 0.5 + 0.5;
			float artUp = max( direction.y, 0.0 );
			// dusk / dawn colour ramp: orange-pink at the horizon, magenta, deep blue overhead; strongest toward the sun
			if ( artDusk > 0.001 ) {
				float vv = clamp( artUp / 0.7, 0.0, 1.0 );
				vec3 ramp = mix( vec3( 0.85, 0.36, 0.15 ), vec3( 0.36, 0.17, 0.3 ), smoothstep( 0.0, 0.3, vv ) );
				ramp = mix( ramp, vec3( 0.05, 0.08, 0.22 ), smoothstep( 0.25, 1.0, vv ) );
				texColor = mix( texColor, ramp, artDusk * ( 0.3 + 0.7 * artAz ) * ( 1.0 - 0.45 * vv ) );
			}
			// horizon haze band (matches the fog colour so the skyline dissolves into the sky)
			float artHz = 1.0 - smoothstep( 0.0, 0.34, artUp );
			texColor = mix( texColor, artHazeCol, artHz * artHz * artHaze );
			// clouds
			float artAlpha = 0.0;
			if ( direction.y > 0.015 ) {
				vec2 cuv = direction.xz / ( direction.y + 0.17 ) * 0.9 + vec2( artTime, artTime * 0.4 );
				float base = artF( cuv * 1.1, artQuality > 0.5 ? 4 : 3 );
				float n = base;
				if ( artQuality > 0.5 ) n = base * 0.72 + artF( cuv * 4.3 + base * 1.5, 3 ) * 0.28;
				float thr = 1.0 - artCover;
				float m = smoothstep( thr, thr + 0.2, n );
				float lit = 0.62;
				if ( artQuality > 0.5 ) {
					vec2 cs2 = cuv + sunDirH.xz * 0.07;
					float n2 = artF( cs2 * 1.1, 3 );
					lit = clamp( 0.55 + ( base - n2 ) * 5.0, 0.0, 1.0 );
				}
				float core = smoothstep( thr + 0.05, thr + 0.5, n );
				vec3 ccol = mix( artShade, artLit, lit * ( 1.0 - 0.55 * core ) + 0.12 );
				ccol += artLit * 0.3 * ( m * ( 1.0 - m ) * 4.0 ) * pow( max( artCs, 0.0 ), 5.0 );
				ccol = min( ccol, vec3( SKY_MAX_RADIANCE ) );
				artAlpha = clamp( m * artDensity * smoothstep( 0.015, 0.2, direction.y ), 0.0, 1.0 );
				texColor = mix( texColor, ccol, artAlpha );
			}
			// sun disc + glow, hidden behind cloud and below the horizon
			float artDisc = smoothstep( 0.99935, 0.9998, artCs );
			float artGlow = pow( max( artCs, 0.0 ), 260.0 ) * 0.45 + pow( max( artCs, 0.0 ), 22.0 ) * 0.1;
			texColor += artSunCol * ( artDisc * 1.15 + artGlow ) * artSun * ( 1.0 - 0.9 * artAlpha ) * showSunDisc;`;

// ---------------------------------------------------------------- shader patch

/** Adds an exposure multiplier and a faint blue night glow (the stock shader goes almost black at night). */
function patchSkyMaterial(mat: THREE.ShaderMaterial): void {
  mat.uniforms.skyExposure = { value: 0.6 };
  mat.uniforms.nightGlow = { value: new THREE.Color(0x000000) };
  mat.uniforms.nightGlowAway = { value: new THREE.Color(0x000000) };
  mat.uniforms.sunDirH = { value: new THREE.Vector3(1, 0, 0) };
  mat.uniforms.artTime = { value: 0 };
  mat.uniforms.artCover = { value: 0.4 };
  mat.uniforms.artDensity = { value: 0.7 };
  mat.uniforms.artQuality = { value: 1 };
  mat.uniforms.artSun = { value: 1 };
  mat.uniforms.artHaze = { value: 0.55 };
  mat.uniforms.artDusk = { value: 0 };
  mat.uniforms.artLit = { value: new THREE.Color(1, 1, 1) };
  mat.uniforms.artShade = { value: new THREE.Color(0.4, 0.45, 0.55) };
  mat.uniforms.artSunCol = { value: new THREE.Color(1, 0.9, 0.7) };
  mat.uniforms.artHazeCol = { value: new THREE.Color(0.4, 0.6, 0.8) };
  const frag = mat.fragmentShader;
  const withUniforms = frag.replace('uniform float time;', `uniform float time;\n\t\tconst float SKY_MAX_RADIANCE = ${SKY_MAX_RADIANCE.toFixed(3)};\n\t\tuniform float skyExposure;\n\t\tuniform vec3 nightGlow;\n\t\tuniform vec3 nightGlowAway;\n\t\tuniform vec3 sunDirH;${ART_GLSL_DECL}`)
    // the stock 0.5 degree disc is replaced by the soft ART disc; the stock clouds are off (cloudCoverage 0)
    .replace('* showSunDisc;\n', '* 0.0;\n');
  const withGlow = withUniforms.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    `texColor *= skyExposure;\n\t\t\ttexColor = min( texColor, vec3( SKY_MAX_RADIANCE ) );${ART_GLSL_BODY}\n\t\t\tfloat glowAz = dot( normalize( direction.xz + vec2( 1e-5 ) ), sunDirH.xz ) * 0.5 + 0.5;\n\t\t\ttexColor += mix( nightGlowAway, nightGlow, glowAz * glowAz ) * mix( 1.0, 0.45, clamp( direction.y * 1.5, 0.0, 1.0 ) );\n\t\t\tgl_FragColor = vec4( texColor, 1.0 );`,
  );
  if (withGlow !== frag) mat.fragmentShader = withGlow;
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------- SkyDome

export class SkyDome {
  readonly sky: Sky;
  readonly stars: THREE.Points;
  /** false on the phone tier: the star layer is never shown */
  starsEnabled = true;

  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly materials: IMaterialLibrary;
  private readonly skyScene = new THREE.Scene();
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly horizon = new THREE.Color();
  private readonly glowAway = new THREE.Color();
  private pmrem: THREE.PMREMGenerator | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private lastCaptureHour = Number.NaN;
  private lastNight: boolean | null = null;
  private lastHour = Number.NaN;
  private cloudTime = 0;
  private overcast = 0;
  private lastCaptureOvercast = 0;
  private sunElevation = 1;
  private trueSun: THREE.Vector3 | null = null;
  private readonly scratchDir = new THREE.Vector3();
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
  /** Rain gloom 0..1 (Weather via DayNight): more and denser cloud, a duller sky. */
  setOvercast(o: number): void {
    this.overcast = clamp(o, 0, 1);
  }

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
    const dir = src.lengthSq() > 0 ? this.scratchDir.copy(src).normalize() : this.scratchDir.set(0, 1, 0);
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
    u.skyExposure.value = p.exposure * (1 - 0.3 * this.overcast);
    u.cloudCoverage.value = 0; // the stock cloud layer is replaced by the ART layer (see ART_GLSL_BODY)
    this.updateArt(h, dir.y);
    u.sunPosition.value.copy(dir);
    u.time.value = this.cloudTime;

    horizonColorAt(dir.y, this.horizon);
    // Twilight/night glow (the stock shader goes almost black once the sun is at or below the horizon). Full when the
    // sun is well below the horizon, fading out by +0.12 elevation. Near the sun's azimuth it takes the horizon colour
    // (orange at sunset); on the opposite side of the dome it is the cool blue-hour colour, so the dusk sky is a
    // gradient instead of a flat orange wash.
    const glow = 1 - smooth(-0.12, 0.12, dir.y);
    (u.nightGlow.value as THREE.Color).copy(this.horizon).multiplyScalar(glow * 0.9);
    horizonColorAt(Math.min(dir.y, -0.05), this.glowAway);
    (u.nightGlowAway.value as THREE.Color).copy(this.glowAway).multiplyScalar(glow * 0.9);
    const hl = Math.hypot(dir.x, dir.z);
    (u.sunDirH.value as THREE.Vector3).set(hl > 1e-4 ? dir.x / hl : 1, 0, hl > 1e-4 ? dir.z / hl : 0);

    // Stars fade in as the sun drops below the horizon.
    const starAlpha = (isNight || dir.y < 0 ? 1 - smooth(-0.2, -0.02, dir.y) : 0) * 0.95;
    this.stars.visible = this.starsEnabled && starAlpha > 0.01;
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
    const gloomMoved = Math.abs(this.overcast - this.lastCaptureOvercast) > 0.25;
    if (moved || gloomMoved || this.lastNight !== isNight) { this.lastCaptureOvercast = this.overcast; this.captureEnvironment(); }
    this.lastNight = isNight;
  }

  private readonly art: CloudParams = cloudParamsAt(1, 0);
  private wall = 0;

  private updateArt(hour: number, sunElevation: number): void {
    const u = this.uniforms;
    timeCycleAt(hour, this.tc);
    const c = this.tc.sunColor;
    const a = cloudParamsAt(sunElevation, this.overcast, [c.r, c.g, c.b], this.art);
    this.wall = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
    u.artTime.value = (this.cloudTime / CLOUD_TIME_PER_HOUR) * 0.04 + this.wall * 0.0035;
    u.artCover.value = a.cover;
    u.artDensity.value = a.density;
    u.artQuality.value = this.starsEnabled ? 1 : 0; // phone: cheaper cloud noise (no detail octaves, no lit-side lookup)
    u.artSun.value = a.sunDisc;
    u.artHaze.value = a.haze;
    u.artDusk.value = a.dusk;
    (u.artLit.value as THREE.Color).setRGB(a.lit[0], a.lit[1], a.lit[2]);
    (u.artShade.value as THREE.Color).setRGB(a.shade[0], a.shade[1], a.shade[2]);
    // sun disc: the key-light colour pushed toward white-hot (it is the brightest thing in the sky), horizon colour for the haze
    (u.artSunCol.value as THREE.Color).setRGB(0.55 + 0.45 * c.r, 0.5 + 0.4 * c.g, 0.4 + 0.3 * c.b);
    (u.artHazeCol.value as THREE.Color).copy(this.horizon).multiplyScalar(0.85);
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
