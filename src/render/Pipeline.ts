import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import type { Quality } from './Shadows';
import { newTimeCycle, timeCycleAt, hazeAt, grainAmount } from './LightingConfig';
import { EXPOSURE_BY_PRESET, HOUR_KEYS, buildLut, lutKeysForHour } from './lut';
import { FxPass, FX_TIERS, fxPassCosts, type PassCost } from './ssr';
import { signBloomGate } from './QualityTier';

export type { Quality } from './Shadows';

/** Fallback bloom (no hour known yet); once setHour has been called the per-hour time cycle drives bloom and exposure. */
const BLOOM_THRESHOLD_DAY = 2.0;
const BLOOM_THRESHOLD_NIGHT = 0.9;
const BLOOM_RADIUS = 0.4;
const BLOOM_STRENGTH_DAY = 0.1;
const BLOOM_STRENGTH_NIGHT = 0.5;

const DOF_DEFAULT_FOCUS = 7;
const DOF_DEFAULT_STRENGTH = 0.6;
const DOF_DEFAULT_APERTURE = 0.8;
/** Maximum blur radius in pixels at 1080p and dofStrength = 1 (scaled with resolution). */
const DOF_MAX_BLUR_1080 = 6;
/** Focus smoothing rate (1/s). */
const FOCUS_RATE = 4;

/**
 * Depth of field: single-pass 16-tap Vogel-disc bokeh gather driven by a circle of confusion from
 * the scene depth. `aperture` ~ f-stop^-1 (bigger = shallower focus), `maxBlur` is in device pixels.
 * Samples only contribute when their own CoC reaches the centre pixel, so sharp subjects do not
 * bleed into the blurred background. Reads the (nonlinear) depth of the GTAO G-buffer.
 */
export const DOF_SHADER = {
  name: 'DofShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    focusDistance: { value: DOF_DEFAULT_FOCUS },
    aperture: { value: DOF_DEFAULT_APERTURE },
    maxBlur: { value: DOF_MAX_BLUR_1080 * DOF_DEFAULT_STRENGTH },
    resolution: { value: new THREE.Vector2(1920, 1080) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float focusDistance;
    uniform float aperture;
    uniform float maxBlur;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    varying vec2 vUv;

    #define DOF_TAPS 16
    const float GOLDEN_ANGLE = 2.39996323;

    // Perspective depth-buffer value (0..1) to view-space distance along the camera axis.
    float viewDist(float d) {
      float z = d * 2.0 - 1.0;
      return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
    }

    // Circle of confusion in pixels: a +-15% in-focus band, then growing with relative distance error.
    float cocPx(float dist) {
      float band = focusDistance * 0.15;
      float off = max(abs(dist - focusDistance) - band, 0.0);
      float coc = aperture * off / max(dist, 0.1);
      if (dist < focusDistance) coc *= 0.7;
      return clamp(coc, 0.0, 1.0) * maxBlur;
    }

    float interleavedGradientNoise(vec2 p) {
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }

    void main() {
      vec4 center = texture2D(tDiffuse, vUv);
      float cocC = cocPx(viewDist(texture2D(tDepth, vUv).x));
      if (cocC < 0.25) {
        gl_FragColor = center;
        return;
      }

      vec2 texel = 1.0 / resolution;
      float rot = 6.2831853 * interleavedGradientNoise(gl_FragCoord.xy);
      vec3 sum = center.rgb;
      float wsum = 1.0;
      for (int i = 0; i < DOF_TAPS; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / float(DOF_TAPS));
        float a = fi * GOLDEN_ANGLE + rot;
        float rpx = r * cocC;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * rpx * texel;
        float cocS = cocPx(viewDist(texture2D(tDepth, uv).x));
        // The sample only spreads onto this pixel if its own blur disc reaches it.
        float w = clamp(cocS - rpx + 1.0, 0.0, 1.0);
        vec3 col = min(texture2D(tDiffuse, uv).rgb, vec3(24.0));
        sum += col * w;
        wsum += w;
      }
      gl_FragColor = vec4(sum / wsum, center.a);
    }`,
};

/** ShaderPass that also forwards the device-pixel size to the `resolution` uniform. */
class DofPass extends ShaderPass {
  constructor() {
    super(DOF_SHADER);
  }
  override setSize(width: number, height: number): void {
    (this.uniforms.resolution.value as THREE.Vector2).set(Math.max(1, width), Math.max(1, height));
  }
}

/**
 * Colour grading + vignette + film grain. Runs on the linear HDR buffer, BEFORE OutputPass
 * (which applies ACES tone mapping and the sRGB transfer). Pure data so tests can assert on it.
 */
export const GRADING_SHADER = {
  name: 'GradingShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    contrast: { value: 1.08 },
    saturation: { value: 1.12 },
    vignette: { value: 0.35 },
    grain: { value: 0.025 },
    splitStrength: { value: 0.08 },
    highlightTint: { value: new THREE.Color('#ffe3b0') },
    shadowTint: { value: new THREE.Color('#1b2740') },
    /** 32^3 grade LUTs (A -> B crossfade by lutMix). Only declared in the shader when USE_LUT is defined. */
    tLut: { value: null as THREE.Data3DTexture | null },
    tLutB: { value: null as THREE.Data3DTexture | null },
    lutMix: { value: 0 },
    /** 1 = grade through the LUT, 0 = analytic fallback grade. */
    useLut: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    #ifdef USE_LUT
    uniform highp sampler3D tLut;
    uniform highp sampler3D tLutB;
    #endif
    uniform float lutMix;
    uniform float useLut;
    uniform float time;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    uniform float grain;
    uniform float splitStrength;
    uniform vec3 highlightTint;
    uniform vec3 shadowTint;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    #ifdef USE_LUT
    const float LUT_N = 32.0;
    // The LUT lives in gamma-encoded [0,1]; HDR energy above 1.0 bypasses it and is added back.
    vec3 lutGrade(vec3 c) {
      vec3 v = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
      vec3 vc = min(v, vec3(1.0));
      vec3 excess = v - vc;
      vec3 uvw = vc * ((LUT_N - 1.0) / LUT_N) + 0.5 / LUT_N;
      vec3 g = mix(texture(tLut, uvw).rgb, texture(tLutB, uvw).rgb, lutMix);
      return pow(g + excess, vec3(2.2));
    }
    #endif

    vec3 mathGrade(vec3 c) {
      // Contrast pivoting on linear mid-grey (works on HDR values).
      c = pow(c / 0.18, vec3(contrast)) * 0.18;

      // Saturation.
      float luma = dot(c, LUMA);
      c = mix(vec3(luma), c, saturation);

      // Split tone: cool shadows, warm highlights (tints normalised to unit luminance so exposure is kept).
      float lp = clamp(pow(max(luma, 0.0), 0.4545), 0.0, 1.0);
      vec3 hi = highlightTint / max(dot(highlightTint, LUMA), 1e-4);
      vec3 sh = shadowTint / max(dot(shadowTint, LUMA), 1e-4);
      vec3 tint = mix(sh, hi, smoothstep(0.25, 0.75, lp));
      return mix(c, c * tint, splitStrength);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = max(tex.rgb, vec3(0.0));

      #ifdef USE_LUT
      if (useLut > 0.5) c = lutGrade(c);
      else c = mathGrade(c);
      #else
      c = mathGrade(c);
      #endif

      // Vignette (smooth radial falloff).
      float d = length(vUv - 0.5);
      float v = 1.0 - smoothstep(0.3, 0.78, d);
      c *= mix(1.0, v, vignette);

      // Film grain, multiplicative so black stays black.
      float n = hash12(gl_FragCoord.xy + fract(time) * 977.0) - 0.5;
      c *= 1.0 + n * 2.0 * grain;

      gl_FragColor = vec4(c, tex.a);
    }`,
};

/**
 * Post-processing chain. Pass order:
 *  - high / medium: RenderPass, GTAOPass, FxPass (SSR trace at half res while wet + composite: contact, haze), DoF,
 *                   UnrealBloomPass, grading ShaderPass (per-hour 3D LUT), SMAAPass, OutputPass
 *  - low:           RenderPass, UnrealBloomPass (quarter res), grading ShaderPass (per-hour 3D LUT), OutputPass
 *  - phone:         RenderPass, UnrealBloomPass (quarter res, ENABLED ONLY at night on a device that holds >= 45 fps, see
 *                   `setMeasuredFps`), grading ShaderPass (the same per-hour 3D LUT as low/medium/high), OutputPass.
 *                   No GTAO, no DoF, no SMAA (the phone budget is 140 draw calls in total; a skipped pass costs nothing).
 *
 * The composer renders in linear HDR (half float); OutputPass applies renderer.toneMapping
 * (ACES) + sRGB, so keep `renderer.toneMapping = ACESFilmicToneMapping` and let the pipeline,
 * not `renderer.render`, draw to the screen.
 *
 * DoF reads the depth texture of the GTAO G-buffer (a separate target), because the composer's own
 * ping-pong targets cannot be sampled while one of them is the DoF write target (feedback loop).
 */
export class RenderPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private q: Quality;
  private night = false;
  private hour: number | null = null;
  private passes: Pass[] = [];
  private bloom: UnrealBloomPass | null = null;
  private grading: ShaderPass | null = null;
  private gtao: GTAOPass | null = null;
  private dof: DofPass | null = null;
  private fx: FxPass | null = null;
  private sunLight: THREE.DirectionalLight | null | undefined;
  private wet = 0;
  private rain = 0;
  private bloomScale = 1;
  private measuredFps = 0;
  private readonly t0 = performance.now();
  private lastT = performance.now();
  private w: number;
  private h: number;

  // depth of field
  private dofStrengthV = DOF_DEFAULT_STRENGTH;
  private dofAperture = DOF_DEFAULT_APERTURE;
  private focusTarget = DOF_DEFAULT_FOCUS;
  private focusCurrent = DOF_DEFAULT_FOCUS;

  // grading / exposure
  private readonly lutSupported: boolean;
  private lutTextures: (THREE.Data3DTexture | null)[] = HOUR_KEYS.map(() => null);
  private exposureBias = 1;
  private exposureFactor = EXPOSURE_BY_PRESET.day;
  private readonly tc = newTimeCycle();

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    opts: { quality?: Quality } = {},
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.q = opts.quality ?? 'high';
    const caps = renderer.capabilities as { isWebGL2?: boolean } | undefined;
    this.lutSupported = caps?.isWebGL2 !== false;
    const size = renderer.getSize(new THREE.Vector2());
    this.w = size.x;
    this.h = size.y;
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.build();
  }

  get quality(): Quality {
    return this.q;
  }

  /** Depth-of-field strength 0..1 (0 disables the pass). Default 0.6. */
  get dofStrength(): number {
    return this.dofStrengthV;
  }
  set dofStrength(v: number) {
    this.dofStrengthV = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  }

  /** Current (smoothed) focus distance in metres. */
  get focusDistance(): number {
    return this.focusCurrent;
  }

  /** Whether the grading pass uses the per-hour 3D LUT (WebGL2, every tier incl. phone) or the analytic fallback. */
  get usesLut(): boolean {
    return this.lutSupported;
  }

  /**
   * Frame rate the device is really reaching (call about once a second with the smoothed fps). Gates the phone tier's
   * night sign bloom: on at >= 45 fps, off again under 38 fps, never before a rate was reported.
   */
  setMeasuredFps(fps: number): void {
    this.measuredFps = Number.isFinite(fps) ? fps : 0;
    this.updateSignBloom();
  }

  /** Whether the phone tier's night sign bloom is currently switched on (always false on other tiers). */
  get signBloomOn(): boolean {
    return this.q === 'phone' && !!this.bloom?.enabled;
  }

  private isNightNow(): boolean {
    return this.night || timeCycleAt(this.hour ?? 12, this.tc).sunI <= 0.05;
  }

  private updateSignBloom(): void {
    if (this.q !== 'phone' || !this.bloom) return;
    this.bloom.enabled = signBloomGate(this.q, this.isNightNow(), this.measuredFps, this.bloom.enabled);
  }

  /** Ground wetness and rain intensity (0..1) from Weather; drives the SSR trace, the haze and the rain bloom. */
  setWeather(wetness: number, rain: number): void {
    this.wet = Math.min(1, Math.max(0, Number.isFinite(wetness) ? wetness : 0));
    this.rain = Math.min(1, Math.max(0, Number.isFinite(rain) ? rain : 0));
  }

  /** Extra passes this tier adds on top of the stock chain (name, resolution relative to the frame, draws, wet-only). */
  get fxCosts(): PassCost[] {
    return this.q === 'phone' ? [] : fxPassCosts(this.q);
  }

  /** Whether the half-resolution SSR trace ran on the last frame. */
  get ssrActive(): boolean {
    return this.fx?.traced ?? false;
  }

  /** Pass names in render order (tests / the cost report). */
  get passNames(): string[] {
    return this.passes.map((p) => p.constructor.name);
  }

  render(): void {
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    this.updateDof(dt);
    this.updateGrade();
    this.updateExposure();
    this.updateSignBloom();
    this.updateFx();
    if (this.grading) this.grading.uniforms.time.value = (now - this.t0) / 1000;
    this.composer.render();
  }

  /** CSS-pixel size (same numbers you pass to renderer.setSize). Also call after changing the pixel ratio. */
  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h); // forwards the device-pixel size to every pass (GTAO, SMAA, bloom, ...)
    this.applyBloomSize();
  }

  setQuality(q: Quality): void {
    if (q === this.q) return;
    this.q = q;
    this.build();
  }

  setNight(night: boolean): void {
    this.night = night;
    this.updateExposure();
  }

  /**
   * Hour of day (0..24). Picks the grade preset (dusk 17:00-19:30 and 05:30-07:00, night otherwise
   * outside 07:00-17:00) and the auto-exposure target. `setNight(true)` always forces night.
   */
  setHour(hour: number): void {
    if (!Number.isFinite(hour)) return;
    this.hour = hour;
    this.updateExposure();
  }

  /** Re-applies the per-hour grade and auto-exposure immediately (time jumps, debug/audit hooks). The grade is a pure function of the hour, so there is nothing to ease. */
  snapGrade(): void {
    this.updateGrade();
    this.updateExposure();
  }

  /** Distance (m) camera -> player; the focus plane eases towards it. Clamped to 0.5..300 m. */
  setFocus(distanceMetres: number): void {
    if (!Number.isFinite(distanceMetres)) return;
    this.focusTarget = Math.min(300, Math.max(0.5, distanceMetres));
  }

  /** Lens aperture factor (default 0.8; larger = shallower depth of field). */
  setAperture(aperture: number): void {
    if (Number.isFinite(aperture)) this.dofAperture = Math.min(4, Math.max(0, aperture));
  }

  /**
   * Sets the day-reference exposure (default 1). The hour-based auto-exposure multiplies it by
   * per-hour factor of the time cycle (about 1.0 by day, 0.95 at night); the new value is applied to the renderer immediately.
   */
  setExposure(v: number): void {
    if (!Number.isFinite(v) || v <= 0) return;
    this.exposureBias = v;
    this.updateExposure();
  }

  dispose(): void {
    this.disposePasses();
    for (let i = 0; i < this.lutTextures.length; i++) {
      this.lutTextures[i]?.dispose();
      this.lutTextures[i] = null;
    }
    this.composer.dispose();
  }

  private disposePasses(): void {
    for (const p of this.passes) {
      this.composer.removePass(p);
      p.dispose();
    }
    this.passes = [];
    this.bloom = null;
    this.grading = null;
    this.gtao = null;
    this.dof = null;
    this.fx = null;
  }

  private add<T extends Pass>(pass: T): T {
    this.composer.addPass(pass);
    this.passes.push(pass);
    return pass;
  }

  private lut(i: number): THREE.Data3DTexture {
    return (this.lutTextures[i] ??= buildLut(i));
  }

  private updateDof(dt: number): void {
    this.focusCurrent += (this.focusTarget - this.focusCurrent) * (1 - Math.exp(-dt * FOCUS_RATE));
    const dof = this.dof;
    if (!dof) return;
    const strength = this.dofStrengthV;
    dof.enabled = strength > 0.001;
    if (!dof.enabled) return;
    const pr = this.renderer.getPixelRatio();
    const u = dof.uniforms;
    u.focusDistance.value = this.focusCurrent;
    u.aperture.value = this.dofAperture;
    u.maxBlur.value = DOF_MAX_BLUR_1080 * ((this.h * pr) / 1080) * strength;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
  }

  /** Two baked hour-key LUTs crossfaded by the smoothed hour position (dawn cool -> golden -> flat noon -> amber dusk -> sodium night). */
  private updateGrade(): void {
    const g = this.grading;
    if (!g || !this.usesLut) return;
    const k = lutKeysForHour(this.hour ?? (this.night ? 0 : 12));
    g.uniforms.tLut.value = this.lut(k.a);
    g.uniforms.tLutB.value = this.lut(k.b);
    g.uniforms.lutMix.value = k.mix;
    g.uniforms.useLut.value = 1;
  }

  private findSun(): THREE.DirectionalLight | null {
    if (this.sunLight === undefined) {
      this.sunLight = null;
      this.scene.traverse((o) => { if (!this.sunLight && (o as THREE.DirectionalLight).isDirectionalLight && (o as THREE.DirectionalLight).castShadow) this.sunLight = o as THREE.DirectionalLight; });
    }
    return this.sunLight;
  }

  private updateFx(): void {
    const fx = this.fx;
    if (!fx) return;
    const f = fx.frame;
    const hour = this.hour ?? (this.night ? 0 : 12);
    const tc = timeCycleAt(hour, this.tc);
    f.wet = this.wet;
    f.rain = this.rain;
    const fog = this.scene.fog;
    if (fog) f.hazeColor.copy(fog.color);
    const hz = hazeAt(hour, this.rain);
    f.hazeAmount = hz.amount;
    f.sunGlow = tc.sunI > 0.3 ? hz.glow : 0;
    f.sunColor.copy(tc.sunColor);
    const sun = this.findSun();
    if (sun) f.sunDir.copy(sun.position).sub(sun.target.position).normalize();
    f.contact = this.q === 'high' ? 0.55 : 0.5;
  }

  /**
   * Exposure and bloom follow the continuous per-hour time cycle (no preset steps, so dusk never pops); the
   * night flag alone stands in for the hour until the first setHour.
   */
  private updateExposure(): void {
    const tc = timeCycleAt(this.hour ?? (this.night ? 0 : 12), this.tc);
    this.exposureFactor = tc.exposure;
    this.renderer.toneMappingExposure = this.exposureBias * tc.exposure;
    if (this.bloom) {
      // Rain and wet streets bloom lamps and headlights more (soft halos in the wet air). Phone: a lighter, higher-threshold
      // bloom so only emissive signs and lamps glow (night only, see updateSignBloom).
      const ph = this.q === 'phone';
      this.bloom.strength = ph ? Math.min(tc.bloomStrength, 0.4) : tc.bloomStrength * (1 + 0.7 * this.rain) + 0.05 * this.wet;
      this.bloom.threshold = ph ? Math.max(tc.bloomThreshold, 1.0) : tc.bloomThreshold;
      this.bloom.radius = BLOOM_RADIUS + (ph ? 0 : 0.25 * this.rain);
    }
    if (this.grading && this.q !== 'phone') this.grading.uniforms.grain.value = grainAmount(tc.moonI);
  }

  private build(): void {
    this.disposePasses();
    const full = this.q !== 'low' && this.q !== 'phone';
    const pr = this.renderer.getPixelRatio();
    const ew = Math.max(1, Math.round(this.w * pr));
    const eh = Math.max(1, Math.round(this.h * pr));

    this.add(new RenderPass(this.scene, this.camera));

    if (full) {
      const gtao = new GTAOPass(this.scene, this.camera, ew, eh);
      gtao.output = GTAOPass.OUTPUT.Default;
      // City scale: ~1.2 m radius darkens building bases, door recesses and the ground under cars.
      gtao.blendIntensity = 0.8;
      gtao.updateGtaoMaterial({
        radius: 1.2,
        distanceExponent: 1.5,
        thickness: 1.2,
        scale: 1.1,
        samples: this.q === 'high' ? 16 : 8,
        distanceFallOff: 1,
        screenSpaceRadius: false,
      });
      // Strong denoise keeps AO smooth instead of noisy/"dirty".
      gtao.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 6,
        radiusExponent: 1,
        rings: 2,
        samples: this.q === 'high' ? 16 : 8,
      });
      this.gtao = this.add(gtao);

      // Screen-space reflections (wet ground), contact darkening and aerial haze: reuses the GTAO depth + normal G-buffer.
      if (FX_TIERS[this.q].enabled) {
        const fx = new FxPass(this.camera, gtao.depthTexture, gtao.normalTexture, this.q);
        this.fx = this.add(fx);
      }

      // Depth of field right after AO, reading the G-buffer depth GTAO just rendered.
      const dof = new DofPass();
      dof.uniforms.tDepth.value = gtao.depthTexture;
      dof.enabled = this.dofStrengthV > 0.001;
      this.dof = this.add(dof);
    }

    this.bloomScale = full ? 1 : 0.5; // UnrealBloomPass already runs at half of what it is given
    this.bloom = this.add(
      new UnrealBloomPass(new THREE.Vector2(ew, eh), this.night ? BLOOM_STRENGTH_NIGHT : BLOOM_STRENGTH_DAY, BLOOM_RADIUS, this.night ? BLOOM_THRESHOLD_NIGHT : BLOOM_THRESHOLD_DAY),
    );
    if (this.q === 'phone') this.bloom.enabled = false; // switched on by updateSignBloom (night + >= 45 fps)

    // Grading: per-hour 3D LUT on WebGL2 (every tier incl. phone); analytic grade (no sampler3D in the shader) otherwise.
    const useLut = this.lutSupported;
    this.grading = this.add(
      new ShaderPass(useLut ? { ...GRADING_SHADER, defines: { USE_LUT: '' } } : GRADING_SHADER),
    );
    this.grading.uniforms.useLut.value = 0;

    if (full) this.add(new SMAAPass());
    this.add(new OutputPass()); // last: tone mapping + sRGB

    // Sync every pass to the current size (addPass already did; this also fixes the bloom scale).
    this.composer.setSize(this.w, this.h);
    this.applyBloomSize();
  }

  private applyBloomSize(): void {
    if (!this.bloom) return;
    const pr = this.renderer.getPixelRatio();
    this.bloom.setSize(
      Math.max(2, Math.round(this.w * pr * this.bloomScale)),
      Math.max(2, Math.round(this.h * pr * this.bloomScale)),
    );
  }
}
