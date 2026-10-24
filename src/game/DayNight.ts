import { Color, DirectionalLight, Fog, HemisphereLight } from 'three';
import type { Scene } from 'three';
import { clamp, lerp } from '@/core/Math2';
import type { Clock, IMaterialLibrary } from '@/world/types';

const DEFAULT_START_HOUR = 17.5;
const NIGHT_START = 19.5;
const NIGHT_END = 6;
const SUN_DISTANCE = 200;
/** Sun path tilts a little south (+z) so shadows are not perfectly east-west. */
const SUN_SOUTH = 0.3;
const GROUND_COLOR = 0x2b2620;
const MOON_COLOR = 0x7f8fd0;
const HORIZON_COLOR = 0xff9a5c;
const NOON_COLOR = 0xfff3dc;
const MOON_INTENSITY = 0.4;
const SUN_INTENSITY = 1.1;

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

/** Solar angle: 0 at sunrise (06:00), PI/2 at noon, PI at sunset, -PI/2 at midnight. */
function sunAngle(hour: number): number {
  return ((wrapHour(hour) - 6) / 24) * Math.PI * 2;
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
    writeSkyColor(h, this.sky);
    if (this.scene.fog) this.scene.fog.color.copy(this.sky);

    const theta = sunAngle(h);
    const elevation = Math.sin(theta);
    this.sun.position.set(
      Math.cos(theta) * SUN_DISTANCE,
      Math.sin(theta) * SUN_DISTANCE,
      SUN_SOUTH * SUN_DISTANCE,
    );

    // 0 = night, 1 = full day; ~0.3 at the horizon so dawn/dusk are lit.
    const t = clamp(elevation * 3 + 0.3, 0, 1);
    this.sun.intensity = lerp(MOON_INTENSITY, SUN_INTENSITY, t);
    if (t < 0.5) {
      this.sun.color.lerpColors(MOON_RGB, HORIZON_RGB, t * 2);
    } else {
      this.sun.color.lerpColors(HORIZON_RGB, NOON_RGB, (t - 0.5) * 2);
    }

    this.hemi.color.copy(this.sky);
    this.hemi.intensity = lerp(0.45, 0.7, t);
  }
}
