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

export type { Quality } from './Shadows';

const BLOOM_THRESHOLD = 0.85;
const BLOOM_RADIUS = 0.4;
const BLOOM_STRENGTH_DAY = 0.35;
const BLOOM_STRENGTH_NIGHT = 0.9;

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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
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

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = max(tex.rgb, vec3(0.0));

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
      c = mix(c, c * tint, splitStrength);

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
 *  - medium / high: RenderPass, GTAOPass, UnrealBloomPass, grading ShaderPass, SMAAPass, OutputPass
 *  - low:           RenderPass, UnrealBloomPass (quarter res), grading ShaderPass, OutputPass
 *
 * The composer renders in linear HDR (half float); OutputPass applies renderer.toneMapping
 * (ACES) + sRGB, so keep `renderer.toneMapping = ACESFilmicToneMapping` and let the pipeline,
 * not `renderer.render`, draw to the screen.
 */
export class RenderPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private q: Quality;
  private night = false;
  private passes: Pass[] = [];
  private bloom: UnrealBloomPass | null = null;
  private grading: ShaderPass | null = null;
  private gtao: GTAOPass | null = null;
  private bloomScale = 1;
  private readonly t0 = performance.now();
  private w: number;
  private h: number;

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

  render(): void {
    if (this.grading) this.grading.uniforms.time.value = (performance.now() - this.t0) / 1000;
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
    if (this.bloom) this.bloom.strength = night ? BLOOM_STRENGTH_NIGHT : BLOOM_STRENGTH_DAY;
  }

  dispose(): void {
    this.disposePasses();
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
  }

  private add<T extends Pass>(pass: T): T {
    this.composer.addPass(pass);
    this.passes.push(pass);
    return pass;
  }

  private build(): void {
    this.disposePasses();
    const full = this.q !== 'low';
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
    }

    this.bloomScale = full ? 1 : 0.5; // UnrealBloomPass already runs at half of what it is given
    this.bloom = this.add(
      new UnrealBloomPass(new THREE.Vector2(ew, eh), this.night ? BLOOM_STRENGTH_NIGHT : BLOOM_STRENGTH_DAY, BLOOM_RADIUS, BLOOM_THRESHOLD),
    );

    this.grading = this.add(new ShaderPass(GRADING_SHADER));

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
