import { Color, DirectionalLight, Fog, HemisphereLight } from 'three';
import type { Scene } from 'three';
import { clamp, lerp } from '@/core/Math2';
import type { Clock, IMaterialLibrary } from '@/world/types';
import type { SkyDome } from '@/render/SkyDome';

const DEFAULT_START_HOUR = 17.5;
const NIGHT_START = 19.5;
const NIGHT_END = 6;
const SUN_DISTANCE = 200;
/** Sun path tilts a little south (+z) so shadows are not perfectly east-west. */
const SUN_SOUTH = 0.3;
const GROUND_COLOR = 0x2b2620;
/** Night hemisphere: cool moonlit sky, warm sodium-streetlight bounce from the ground. */
const NIGHT_HEMI_SKY = 0x3d5290;
const NIGHT_HEMI_GROUND = 0x5a3c22;
const MOON_COLOR = 0x7f8fd0;
const HORIZON_COLOR = 0xff9a5c;
const NOON_COLOR = 0xfff3dc;
const MOON_INTENSITY = 0.4;
const SUN_INTENSITY = 2.2;
const WHITE = new Color(0xffffff);

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
const MOON_RGB = new Color(MOON_COLOR);
const HORIZON_RGB = new Color(HORIZON_COLOR);
const NOON_RGB = new Color(NOON_COLOR);
const GROUND_RGB = new Color(GROUND_COLOR);
const NIGHT_SKY_RGB = new Color(NIGHT_HEMI_SKY);
const NIGHT_GROUND_RGB = new Color(NIGHT_HEMI_GROUND);

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
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;

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
    this.hemi = new HemisphereLight(0xffffff, GROUND_COLOR, 0.5);
    scene.add(this.sun, this.hemi);

    scene.background = this.sky;
    if (scene.fog) {
      scene.fog.color.copy(this.sky);
    } else {
      scene.fog = new Fog(this.sky, 220, 900);
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
    const theta = sunAngle(h);
    const elevation = Math.sin(theta);

    writeSkyColor(h, this.sky);
    if (this.skyDome) {
      this.scene.background = null;
    }
    this.sun.position.set(
      Math.cos(theta) * SUN_DISTANCE,
      Math.sin(theta) * SUN_DISTANCE,
      SUN_SOUTH * SUN_DISTANCE,
    );
    if (this.skyDome) {
      // Same elevation SkyDome.update derives from the normalised sun position.
      this.scene.fog?.color.copy(this.skyDome.horizonColor(this.sun.position.y / this.sun.position.length()));
    } else if (this.scene.fog) {
      this.scene.fog.color.copy(this.sky);
    }

    // 0 = night, 1 = full day; ~0.3 at the horizon so dawn/dusk are lit.
    const t = clamp(elevation * 3 + 0.3, 0, 1);
    this.sun.intensity = lerp(MOON_INTENSITY, SUN_INTENSITY, t);
    if (t < 0.5) {
      this.sun.color.lerpColors(MOON_RGB, HORIZON_RGB, t * 2);
    } else {
      this.sun.color.lerpColors(HORIZON_RGB, NOON_RGB, (t - 0.5) * 2);
    }

    // Day: sky-coloured fill. Night: cool blue from above, warm sodium bounce from below.
    const night = 1 - t;
    this.hemi.color.copy(this.sky).lerp(NIGHT_SKY_RGB, night);
    if (night < 0.5) this.hemi.color.lerp(WHITE, 0.45 * (1 - night * 2)); // desaturate the daytime sky fill
    this.hemi.groundColor.copy(GROUND_RGB).lerp(NIGHT_GROUND_RGB, night);
    this.hemi.intensity = lerp(0.35, 0.3, t);
  }
}
