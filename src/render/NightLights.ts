import * as THREE from 'three';
import type { Vec2 } from '@/core/Math2';

// ---------------------------------------------------------------- tunables

const LAMP_COLOR = 0xffcf8a;
/** Candela (three r155+ physical units). ~E = 45/7.75^2 = 0.75 lux on the sidewalk right under a lamp. */
const LAMP_INTENSITY = 45;
const LAMP_DROP = 0.3;
/** Seconds for a light to fade fully in or out. */
const FADE_SECONDS = 0.5;
/** A lit lamp is kept until it is this many metres farther than the pool's farthest candidate (anti-flicker). */
const HYSTERESIS = 4;

const HEADLIGHT_COLOR = 0xfff1d6;
/**
 * Per spot (candela). The old 320 cd / decay 2 / 0.45 rad spot put a blown, bloomed pool right in front of the bumper
 * (ground irradiance of a low spot falls as h/d^3, so the near field is 100x the far field). A flatter decay, a narrower
 * horizontal cone (its lower edge is feathered by the penumbra, which fades the near field) and a higher output
 * light the road ahead evenly instead.
 */
const HEADLIGHT_INTENSITY = 450;
const HEADLIGHT_DECAY = 1.5;
const HEADLIGHT_ANGLE = 0.3;
const HEADLIGHT_PENUMBRA = 0.65;
const HEADLIGHT_AIM_Y = 0.5;
const HEADLIGHT_DISTANCE = 45;
const HEADLIGHT_AHEAD = 20;
const HEADLIGHT_X = 0.7;
const HEADLIGHT_Y = 0.7;
const DEFAULT_CAR_LENGTH = 4.4;

export interface NightLampSpot { pos: Vec2; height: number; }

export interface NightLightsOptions {
  /** Number of pooled PointLights (default 12). The light count never changes at runtime. */
  poolSize?: number;
  /** PointLight distance in metres (default 26). */
  range?: number;
}

interface Slot {
  light: THREE.PointLight;
  /** Index into the lamp list, or -1 when free. */
  lamp: number;
  /** True while fading out before the slot can be reused. */
  releasing: boolean;
}

/**
 * Night lighting: a pool of PointLights moved onto the lamps nearest the player, plus two vehicle
 * headlight SpotLights. Every light stays in the scene at all times (intensity 0 when off) so the
 * renderer's light count, and therefore shader programs, never change.
 */
export class NightLights {
  readonly lights: THREE.PointLight[];
  readonly headlights: THREE.SpotLight[];

  private readonly scene: THREE.Scene;
  private readonly lamps: NightLampSpot[];
  private readonly slots: Slot[];
  private readonly desired = new Set<number>();
  private readonly held = new Set<number>();
  private readonly targets: THREE.Object3D[];
  private range = 26;
  private headlightsEnabled = true;
  private headlightsAttached = false;
  private headlightIntensity = 0;
  private readonly dist = new Float64Array(0);

  constructor(scene: THREE.Scene, lamps: NightLampSpot[], opts: NightLightsOptions = {}) {
    this.scene = scene;
    this.lamps = lamps;
    const poolSize = Math.max(1, Math.floor(opts.poolSize ?? 12));
    const range = opts.range ?? 26;
    this.range = range;
    this.dist = new Float64Array(lamps.length);

    this.slots = [];
    this.lights = [];
    for (let i = 0; i < poolSize; i++) {
      const light = new THREE.PointLight(LAMP_COLOR, 0, range, 2);
      light.castShadow = false;
      light.name = `night-lamp-${i}`;
      scene.add(light);
      this.lights.push(light);
      this.slots.push({ light, lamp: -1, releasing: false });
    }

    this.headlights = [];
    this.targets = [];
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(HEADLIGHT_COLOR, 0, HEADLIGHT_DISTANCE, HEADLIGHT_ANGLE, HEADLIGHT_PENUMBRA, HEADLIGHT_DECAY);
      spot.castShadow = false;
      spot.name = `headlight-${side < 0 ? 'l' : 'r'}`;
      const target = new THREE.Object3D();
      spot.target = target;
      scene.add(spot, target);
      this.headlights.push(spot);
      this.targets.push(target);
    }
  }

  /**
   * Resizes the lamp pool (quality tier switch). The light count changes, so the renderer recompiles its lit materials once:
   * only call it from a menu / fallback quality change, never per frame.
   */
  setPoolSize(n: number): void {
    const size = Math.max(1, Math.floor(n));
    while (this.slots.length > size) {
      const s = this.slots.pop()!;
      this.lights.pop();
      this.scene.remove(s.light);
      s.light.dispose();
    }
    while (this.slots.length < size) {
      const light = new THREE.PointLight(LAMP_COLOR, 0, this.range, 2);
      light.castShadow = false;
      light.name = `night-lamp-${this.slots.length}`;
      this.scene.add(light);
      this.lights.push(light);
      this.slots.push({ light, lamp: -1, releasing: false });
    }
  }

  /**
   * Call every frame. `dt` (seconds, default 1/60) drives the ~0.5 s fades.
   * By day every light fades to intensity 0.
   */
  update(playerPos: Vec2, isNight: boolean, dt = 1 / 60): void {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const rate = (LAMP_INTENSITY / FADE_SECONDS) * step;

    // 1. Which lamps should be lit: the poolSize nearest (night only).
    const n = this.lamps.length;
    const k = this.slots.length;
    const desired = this.desired;
    desired.clear();
    let cutoff = Infinity;
    if (isNight && n > 0) {
      for (let i = 0; i < n; i++) {
        const l = this.lamps[i].pos;
        this.dist[i] = Math.hypot(l.x - playerPos.x, l.z - playerPos.z);
      }
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.dist[a] - this.dist[b] || a - b);
      const take = Math.min(k, n);
      for (let i = 0; i < take; i++) desired.add(order[i]);
      cutoff = this.dist[order[take - 1]] + HYSTERESIS;
    }

    // 2. Release slots whose lamp fell out of range (with hysteresis) or when it is day.
    const held = this.held;
    held.clear();
    for (const s of this.slots) {
      if (s.lamp < 0) continue;
      if (!s.releasing) {
        const keep = isNight && (desired.has(s.lamp) || this.dist[s.lamp] <= cutoff);
        if (!keep) s.releasing = true;
      }
      if (!s.releasing) held.add(s.lamp);
    }
    // A held lamp that is not in the nearest set only survives while there is no better lamp waiting
    // for its slot; with hysteresis it keeps its place, so the pool simply stays put.

    // 3. Fade intensities toward their targets.
    for (const s of this.slots) {
      const target = s.lamp >= 0 && !s.releasing ? LAMP_INTENSITY : 0;
      const cur = s.light.intensity;
      s.light.intensity = cur < target ? Math.min(target, cur + rate) : Math.max(target, cur - rate);
      if (s.releasing && s.light.intensity <= 0) {
        s.lamp = -1;
        s.releasing = false;
      }
    }

    // 4. Give free slots to the nearest desired lamps that are not already held.
    if (desired.size > 0) {
      const wanted = [...desired].filter((i) => !held.has(i)).sort((a, b) => this.dist[a] - this.dist[b]);
      let w = 0;
      for (const s of this.slots) {
        if (w >= wanted.length) break;
        if (s.lamp >= 0) continue;
        const idx = wanted[w++];
        const lamp = this.lamps[idx];
        s.lamp = idx;
        s.releasing = false;
        s.light.position.set(lamp.pos.x, lamp.height - LAMP_DROP, lamp.pos.z);
        s.light.intensity = 0;
        held.add(idx);
      }
    }

    // 5. Headlights.
    const hlTarget = isNight && this.headlightsEnabled && this.headlightsAttached ? HEADLIGHT_INTENSITY : 0;
    const hlRate = (HEADLIGHT_INTENSITY / FADE_SECONDS) * step;
    this.headlightIntensity = this.headlightIntensity < hlTarget
      ? Math.min(hlTarget, this.headlightIntensity + hlRate)
      : Math.max(hlTarget, this.headlightIntensity - hlRate);
    for (const h of this.headlights) h.intensity = this.headlightIntensity;
  }

  /** Indices (into the lamp list) of lamps whose pooled light is currently emitting. */
  litLampIndices(): number[] {
    return this.slots.filter((s) => s.lamp >= 0 && s.light.intensity > 0).map((s) => s.lamp).sort((a, b) => a - b);
  }

  /**
   * Parent the two headlight spots to a vehicle object (forward = local -z), or pass null to detach
   * (the lights stay in the scene at intensity 0). `length` is the car's length in metres.
   */
  attachHeadlights(vehicleObject: THREE.Object3D | null, length?: number): void {
    for (const h of this.headlights) h.removeFromParent();
    for (const t of this.targets) t.removeFromParent();

    if (!vehicleObject) {
      this.headlightsAttached = false;
      this.headlightIntensity = 0;
      for (const h of this.headlights) { h.intensity = 0; this.scene.add(h); }
      for (const t of this.targets) this.scene.add(t);
      return;
    }

    const L = length ?? (typeof vehicleObject.userData?.length === 'number' ? vehicleObject.userData.length : DEFAULT_CAR_LENGTH);
    this.headlights.forEach((spot, i) => {
      const x = i === 0 ? -HEADLIGHT_X : HEADLIGHT_X;
      spot.position.set(x, HEADLIGHT_Y, -L / 2);
      this.targets[i].position.set(x, HEADLIGHT_AIM_Y, -L / 2 - HEADLIGHT_AHEAD);
      vehicleObject.add(spot, this.targets[i]);
    });
    this.headlightsAttached = true;
  }

  setHeadlightsEnabled(on: boolean): void {
    this.headlightsEnabled = on;
  }
}
