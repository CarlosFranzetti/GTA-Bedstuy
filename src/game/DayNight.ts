import { Color, DirectionalLight, Fog, HemisphereLight, Vector3 } from 'three';
import type { Scene } from 'three';
import { clamp } from '@/core/Math2';
import type { Clock, IMaterialLibrary } from '@/world/types';
import type { SkyDome } from '@/render/SkyDome';
import { LIGHTING, newTimeCycle, timeCycleAt } from '@/render/LightingConfig';

const DEFAULT_START_HOUR = 17.5;
const NIGHT_START = 19.5;
const NIGHT_END = 6;
const SUN_DISTANCE = 200;
const GROUND_COLOR = 0x6b6258;
/** Horizontal south component of the sun path (azimuth swings E -> S -> W, not exactly east-west). */
const SUN_SOUTH_H = 0.5;
const MOON_RGB = new Color(LIGHTING.moonColor);
/** Moon elevation (sine): a little above the horizon right after sunset, capped at ~40 degrees. */
const MOON_ELEV_BASE = 0.25;
const MOON_ELEV_GAIN = 1.2;
const MOON_ELEV_MAX = 0.64;

/** Sky/fog colour keyframes over the 24-hour day. Last key (24) wraps back to the first. */
const SKY_KEYS: ReadonlyArray<{ hour: number; color: number }> = [
  { hour: 0, color: 0x0a1030 }, // deep night
  { hour: 5, color: 0x101c48 }, // pre-dawn
  { hour: 6.5, color: 0xf0907a }, // dawn orange-pink
  { hour: 8, color: 0x9fd3f0 }, // morning pale blue
  { hour: 16.5, color: 0x8fcdf0 }, // afternoon pale blue
  { hour: 18, color: 0xe8703a }, // dusk orange
  { hour: 19.5, color: 0x0a1030 }, // night
  { hour: 24, color: 0x0a1030 }, // wrap
];
const SKY_COLORS = SKY_KEYS.map((k) => new Color(k.color));

function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  const m = hour % 24;
  return m < 0 ? m + 24 : m;
}

/** Writes the interpolated sky colour for `hour` into `out` and returns it. */
function writeSkyColor(hour: number, out: Color): Color {
  const h = wrapHour(hour);
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[i + 1];
    if (h >= a.hour && h < b.hour) {
      const t = (h - a.hour) / (b.hour - a.hour);
      return out.copy(SKY_COLORS[i]).lerp(SKY_COLORS[i + 1], t);
    }
  }
  return out.copy(SKY_COLORS[0]);
}

/** Sky (and fog) colour at a game hour, interpolated between keyframes. */
export function skyColorAt(hour: number): Color {
  return writeSkyColor(hour, new Color());
}

/** Night runs from 19:30 until 06:00. */
export function isNightAt(hour: number): boolean {
  const h = wrapHour(hour);
  return h >= NIGHT_START || h < NIGHT_END;
}

/**
 * Solar angle: 0 at sunrise (06:00), PI at sunset (19:30, when night starts), 2*PI at the next sunrise.
 * The day arc (13.5 h) and the night arc (10.5 h) are each stretched to half a circle so the sun sets
 * exactly when night lighting kicks in. Noon is ~PI/2, midnight ~3*PI/2 (below the horizon).
 */
function sunAngle(hour: number): number {
  const h = wrapHour(hour);
  const dayLen = NIGHT_START - NIGHT_END;
  if (h >= NIGHT_END && h < NIGHT_START) return ((h - NIGHT_END) / dayLen) * Math.PI;
  const sinceSunset = h >= NIGHT_START ? h - NIGHT_START : h + 24 - NIGHT_START;
  return Math.PI + (sinceSunset / (24 - dayLen)) * Math.PI;
}

const _tc = newTimeCycle();
const _moonDir = new Vector3();

/**
 * True sun direction (unit vector towards the sun) at a game hour. Elevation follows
 * asin(sunPeak * sin(theta)): a ~60 degree noon peak instead of a near-zenith sun, so facades still get
 * light at midday. It is negative (below the horizon) at night; the moon is a separate direction.
 */
export function sunDirectionAt(hour: number, out: Vector3 = new Vector3()): Vector3 {
  const theta = sunAngle(hour);
  const sinE = clamp(LIGHTING.sunPeak * Math.sin(theta), -1, 1);
  const cosE = Math.sqrt(1 - sinE * sinE);
  const hx = Math.cos(theta);
  const n = Math.hypot(hx, SUN_SOUTH_H);
  return out.set((hx / n) * cosE, sinE, (SUN_SOUTH_H / n) * cosE);
}

/** Moon direction: opposite the sun's azimuth, ~15-40 degrees up while the sun is below the horizon. */
export function moonDirectionAt(hour: number, out: Vector3 = new Vector3()): Vector3 {
  sunDirectionAt(hour, out);
  const sinM = clamp(MOON_ELEV_BASE + MOON_ELEV_GAIN * Math.max(0, -out.y), MOON_ELEV_BASE, MOON_ELEV_MAX);
  const cosM = Math.sqrt(1 - sinM * sinM);
  const h = Math.hypot(out.x, out.z) || 1;
  return out.set((-out.x / h) * cosM, sinM, (-out.z / h) * cosM);
}

export interface DayNightOptions {
  /** Game hour at start, default 17:30. */
  startHour?: number;
  /** Game hours that pass per real minute, default 1. */
  hoursPerRealMinute?: number;
}

/**
 * Drives a sun (DirectionalLight), a hemisphere fill, scene.background and scene.fog
 * from the game clock. Calls materials.setNight() on construction (to sync) and on
 * each day/night transition.
 */
export class DayNight implements Clock {
  timeOfDay: number;
  isNight: boolean;
  /**
   * The key light. By day it is the sun; while the sun is below the horizon it is re-aimed at the moon (so
   * shadows and upward faces keep a readable cool light). Shadows.ts only lifts/snaps its position.
   */
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  /** True (astronomical) sun direction, below the horizon at night. Sky and flare must use this, not `sun.position`. */
  readonly sunDirection = new Vector3(0, 1, 0);
  /**
   * Overcast 0..1, written by Weather (rain gloom): dims the key light, lifts the skylight fill a little, pulls the fog in
   * and greys it, and thickens the SkyDome clouds. 0 = the clear-sky numbers of TIME_CYCLE exactly.
   */
  overcast = 0;

  private readonly scene: Scene;
  private readonly materials: IMaterialLibrary;
  private readonly hoursPerSecond: number;
  private readonly sky = new Color();
  private skyDome: SkyDome | null = null;

  constructor(scene: Scene, materials: IMaterialLibrary, opts: DayNightOptions = {}) {
    this.scene = scene;
    this.materials = materials;
    this.hoursPerSecond = (opts.hoursPerRealMinute ?? 1) / 60;
    this.timeOfDay = wrapHour(opts.startHour ?? DEFAULT_START_HOUR);
    this.isNight = isNightAt(this.timeOfDay);

    this.sun = new DirectionalLight(0xffffff, 1);
    this.hemi = new HemisphereLight(0xffffff, GROUND_COLOR, 0.3);
    scene.add(this.sun, this.hemi);

    scene.background = this.sky;
    if (scene.fog) {
      scene.fog.color.copy(this.sky);
    } else {
      scene.fog = new Fog(this.sky, 150, 1800);
    }

    materials.setNight(this.isNight);
    this.applyLighting();
  }

  /**
   * Hand scene.background over to a SkyDome mesh: background is cleared and fog takes the dome's
   * horizon colour. Call SkyDome.update(...) each frame after DayNight.update.
   */
  attachSky(sky: SkyDome): void {
    this.skyDome = sky;
    this.scene.background = null;
    this.applyLighting();
  }

  update(dt: number): void {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.timeOfDay = wrapHour(this.timeOfDay + step * this.hoursPerSecond);

    const night = isNightAt(this.timeOfDay);
    if (night !== this.isNight) {
      this.isNight = night;
      this.materials.setNight(night);
    }

    this.applyLighting();
  }

  private applyLighting(): void {
    const h = this.timeOfDay;
    const tc = timeCycleAt(h, _tc);
    sunDirectionAt(h, this.sunDirection);
    this.skyDome?.setSunDirection(this.sunDirection);

    writeSkyColor(h, this.sky);
    if (this.skyDome) {
      this.scene.background = null;
    }

    // Key light: the sun while it is up, the moon after sunset (both intensities are 0 at the hand-over).
    const sunUp = this.sunDirection.y >= 0;
    const dir = sunUp ? this.sunDirection : moonDirectionAt(h, _moonDir);
    this.sun.position.copy(dir).multiplyScalar(SUN_DISTANCE);
    const o = clamp(this.overcast, 0, 1);
    const total = tc.sunI * (1 - OVERCAST_SUN_CUT * o) + tc.moonI * (1 - OVERCAST_MOON_CUT * o);
    this.sun.intensity = total;
    this.sun.color.copy(tc.sunColor);
    if (total > 1e-5) this.sun.color.lerp(MOON_RGB, (tc.moonI * (1 - OVERCAST_MOON_CUT * o)) / total);
    this.skyDome?.setOvercast(o);

    // Fog takes the dome's horizon colour (from the TRUE sun elevation), else the plain sky colour.
    if (this.scene.fog) {
      if (this.skyDome) this.scene.fog.color.copy(this.skyDome.horizonColor(this.sunDirection.y));
      else this.scene.fog.color.copy(this.sky);
      const fog = this.scene.fog as Fog;
      if (fog.isFog) { fog.near = tc.fogNear; fog.far = tc.fogFar; }
    }

    // Skylight fill: cool zenith colour (blue even at dusk, so shadows stay cool), sunlit-street bounce below.
    this.hemi.color.copy(tc.hemiSky);
    this.hemi.groundColor.copy(tc.hemiGround);
    this.hemi.intensity = tc.hemiI;
  }
}
