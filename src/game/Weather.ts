import * as THREE from 'three';
import { Rng } from '@/core/Rng';
import { createCanvas } from '@/textures/canvas';
import { PUDDLE_MASK_METRES, puddleMaskPainter } from '@/textures/painters/ground';
import type { IMaterialLibrary, MaterialKey } from '@/world/types';
import { EL_X_EAST, EL_X_WEST, EL_Z } from '@/transit/ElLine';
import { Forecast, KIND_PARAMS, fogHourFactor, newKindParams, targetsAt, type WeatherKind } from '@/game/WeatherForecast';
import { newWeatherAudioState, type WeatherAudioSink } from '@/audio/weather/mix';
import type { Quality } from '@/render/Shadows';

export type { WeatherKind } from '@/game/WeatherForecast';
export { WEATHER_KINDS } from '@/game/WeatherForecast';

/**
 * Weather.
 *
 * Two layers live here:
 *
 *  1. The old four-state cycle (`state`: dry -> rain -> wet -> drying -> dry, driven by `setState` / `autoCycle`), kept exactly
 *     as it was for the save game, the announcers and the debug hooks.
 *  2. The weather system: eight kinds (clear, partly cloudy, overcast, light rain, heavy rain, thunderstorm, fog, windy) on a
 *     seeded forecast (`startForecast(seed)`, see WeatherForecast.ts) or forced for a look (`setWeather(kind)`). Cloud, gloom,
 *     rain, wind, fog and storm are smoothed values that ramp (never step) toward what the kind asks, so you see the cloud build
 *     before the first drop.
 *
 *  - `rain` (0..1) rain intensity: streaks, splashes, the wet ground and the rain sound.
 *  - `wetness` (0..1) how soaked the ground is: rises while it rains, dries over minutes. The shared asphalt / sidewalk materials
 *    are patched in place (onBeforeCompile) so they darken, lose roughness and grow mirror-like puddles with rain ripples.
 *  - `overcast` (0..1) gloom, handed to DayNight (sun dimmer, grey grade, fog closer) which forwards it to SkyDome.
 *  - `cloud`, `windNow`, `fog`, `storm`, `flash`: handed to DayNight / SkyDome / the audio sink.
 *  - `roadGrip` (1 dry, about 0.8 light rain, 0.7 heavy), `visibility` (0..1) and `raining`: plain numbers for the game.
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
  /** DayNight forwards `overcast` to its attached SkyDome; the optional fields are the rest of the weather look (DayNight reads them in applyLighting). */
  dayNight?: {
    overcast: number; timeOfDay: number; sunDirection: THREE.Vector3; update(dt: number): void;
    /** sky cloud cover 0..1, or -1 for the old overcast-derived cover */
    cloudCover?: number;
    /** wind 0..1: the clouds drift faster */
    windSpeed?: number;
    /** lightning flash 0..1 and whether the sun (shadow caster) takes part (0 on the phone tier) */
    flash?: number;
    flashKey?: number;
    /** distance fog 0..1 (already thinned with the camera's height) */
    fogAmount?: number;
  };
  /** the weather sounds (see WeatherAudio) */
  audio?: WeatherAudioSink;
  /** true where a roof keeps the rain off the camera (default: under the deck of the grid map's elevated line) */
  covered?: (x: number, y: number, z: number) => boolean;
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

// ---- old cycle
const RAIN_RAMP_UP = 1 / 5; // rain intensity per second
const RAIN_RAMP_DOWN = 1 / 10;
const SOAK_RATE = 1 / 25; // wetness per second while raining (full soak after ~25 s)
const OVERCAST_RATE = 1 / 12;
// ---- weather system ramps (per real second): cloud builds over about 40 s of game, rain in about 20 s
const CLOUD_RATE = 1 / 40;
const GLOOM_RATE = 1 / 40;
const RAIN_UP = 1 / 18;
const RAIN_DOWN = 1 / 22;
const WIND_RATE = 1 / 25;
const FOG_RATE = 1 / 50;
const STORM_RATE = 1 / 12;
/** After the rain stops the street stays soaked this long (s), then dries over `dryingSecondsDirected`. */
const WET_HOLD_SECONDS = 20;
const DRYING_SECONDS_DIRECTED = 240;
const RAIN_SEEN = 0.12;

const BOX = 60; // rain box edge (m) around the camera
const BOX_H = 30;
const SPLASH_BOX = 26;
const SPLASH_POOL = 360;
const LITTER_BOX = 44;
const LITTER_POOL = 90;
/** top of the elevated deck above the street and half width of its footprint (m): rain is cut below it, inside the footprint */
const DECK_Y = 9.3;
const DECK_HALF = 4.4;
/** Interiors sit 3 km off the map. */
const INTERIOR_DIST = 1500;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Moves `cur` toward `target` by at most `step` (never overshoots, so a ramp is monotone). */
function slew(cur: number, target: number, step: number): number {
  return cur + Math.max(-step, Math.min(step, target - cur));
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
uniform float uPuddleGloss;
uniform float uRipple;
uniform float uWetTime;
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
  roughnessFactor = mix( roughnessFactor, mix( 0.2, 0.035, uPuddleGloss ), wetPuddle );
}
`;
const FRAG_NORMAL = `
if ( uWet > 0.001 ) {
  normal = normalize( mix( normal, nonPerturbedNormal, clamp( wetPuddle + uWet * 0.3, 0.0, 1.0 ) ) );
  // rain rings spreading on the puddles (one cell grid, one ring per cell, a random start phase each)
  if ( uRipple > 0.02 && wetPuddle > 0.25 ) {
    vec2 rp = vWetWorld.xz * 2.4;
    vec2 rc = floor( rp );
    vec2 rf = fract( rp ) - 0.5;
    float rh = fract( sin( dot( rc, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
    float rph = fract( uWetTime * ( 0.55 + 0.5 * rh ) + rh * 7.0 );
    vec2 rv = rf - ( vec2( fract( rh * 7.3 ), fract( rh * 13.1 ) ) - 0.5 ) * 0.5;
    float rr = length( rv );
    float rw = rr - rph * 0.45;
    float ring = sin( rw * 46.0 ) * exp( -abs( rw ) * 16.0 ) * ( 1.0 - rph ) * ( 1.0 - rph );
    vec2 rg = ( rv / max( rr, 1e-3 ) ) * ring * 0.55 * uRipple * smoothstep( 0.25, 0.6, wetPuddle );
    normal = normalize( normal + mat3( viewMatrix ) * vec3( rg.x, 0.0, rg.y ) );
  }
}
`;

/**
 * Patches a MeshStandardMaterial's shaders with the wet layer (puddle mask from world xz, darker albedo, lower roughness,
 * flatter normals, rain ripples). Returns false and leaves the shader untouched if any three shader chunk anchor is missing.
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

// ---------------------------------------------------------------- tree sway

const SWAY_DECL = 'uniform vec4 uSway;\n';
/** Canopy blobs (instanced) lean with the wind: world-space offset taken back into the instance's own frame. */
const SWAY_BODY = `
#ifdef USE_INSTANCING
{
  vec3 swO = instanceMatrix[3].xyz;
  float swS = max( length( instanceMatrix[0].xyz ), 1e-3 );
  float swPh = swO.x * 0.21 + swO.z * 0.17 + uSway.w * 1.3;
  float swG = 0.55 + 0.45 * ( 0.6 * sin( swPh ) + 0.4 * sin( swPh * 2.3 + 1.7 ) );
  vec3 swW = vec3( uSway.x, 0.0, uSway.y ) * swG * uSway.z;
  float swF = sin( uSway.w * 6.0 + position.x * 8.0 + position.y * 5.0 + swO.x ) * 0.02 * uSway.z * swS;
  transformed += ( transpose( mat3( instanceMatrix ) ) * swW ) / ( swS * swS ) + vec3( swF, 0.0, swF ) / swS;
}
#endif
`;

export function patchSwayShader(shader: { vertexShader: string; uniforms: Record<string, THREE.IUniform> }, uniforms: Record<string, THREE.IUniform>): boolean {
  if (!shader.vertexShader.includes('#include <begin_vertex>') || !shader.vertexShader.includes('#include <common>')) return false;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SWAY_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWAY_BODY}`);
  Object.assign(shader.uniforms, uniforms);
  return true;
}

// ---------------------------------------------------------------- rain streaks

const RAIN_VERT = `
attribute vec3 aSeed;
attribute float aEnd;
uniform vec3 uCam;
uniform vec3 uCamVel;
uniform float uTime;
uniform vec3 uBox;
uniform vec2 uWind;
uniform float uFall;
uniform float uLen;
uniform vec4 uDeck;
uniform vec2 uDeckX;
varying float vA;
void main() {
  vec3 base = aSeed * uBox + vec3( uWind.x * uTime, -uFall * uTime, uWind.y * uTime );
  vec3 d = base - uCam;
  d = d - uBox * floor( d / uBox + 0.5 );
  // the streak is drawn along the rain's velocity relative to the eye: wind slants it, driving or running stretches and tilts it
  vec3 rel = vec3( uWind.x - uCamVel.x, -uFall - uCamVel.y, uWind.y - uCamVel.z );
  float rl = max( length( rel ), 1.0 );
  vec3 dir = rel / rl;
  vec3 p = uCam + d - dir * ( uLen * clamp( rl / uFall, 0.8, 3.0 ) ) * aEnd;
  float dist = length( d );
  vA = mix( 1.0, 0.0, aEnd ) * ( 1.0 - smoothstep( 0.3, 0.5, abs( d.x / uBox.x ) ) ) * ( 1.0 - smoothstep( 0.3, 0.5, abs( d.z / uBox.z ) ) );
  // the curtain thins with distance
  vA *= mix( 1.0, 0.4, smoothstep( 8.0, 40.0, dist ) );
  // no rain under the elevated deck: inside its footprint nothing falls below the deck
  if ( uDeck.w > 0.5 && p.y < uDeck.z && abs( p.z - uDeck.x ) < uDeck.y && p.x > uDeckX.x && p.x < uDeckX.y ) vA = 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;
const RAIN_FRAG = `
uniform float uAlpha;
uniform vec3 uColor;
varying float vA;
void main() { gl_FragColor = vec4( uColor, uAlpha * vA ); }
`;

// ---------------------------------------------------------------- ground splashes

const SPLASH_VERT = `
attribute vec4 aSeed;
uniform vec3 uCam;
uniform float uTime;
uniform float uRain;
uniform float uScale;
uniform float uBox;
uniform vec4 uDeck;
uniform vec2 uDeckX;
varying float vT;
varying float vA;
void main() {
  float cyc = uTime * ( 1.6 + 1.6 * aSeed.w ) + aSeed.x * 19.0;
  float id = floor( cyc );
  vT = fract( cyc );
  vec2 jit = vec2( fract( sin( id * 12.9898 + aSeed.x * 78.233 ) * 43758.5453 ), fract( sin( id * 39.346 + aSeed.y * 11.135 ) * 24634.6345 ) );
  vec2 d = fract( aSeed.xy + jit ) * uBox - 0.5 * uBox;
  vec3 wp = vec3( uCam.x + d.x, 0.12, uCam.z + d.y );
  float dist = length( d );
  float show = step( aSeed.z, uRain );
  vA = show * ( 1.0 - smoothstep( 9.0, 13.0, dist ) );
  if ( uDeck.w > 0.5 && abs( wp.z - uDeck.x ) < uDeck.y && wp.x > uDeckX.x && wp.x < uDeckX.y ) vA = 0.0;
  vec4 mv = viewMatrix * vec4( wp, 1.0 );
  gl_Position = projectionMatrix * mv;
  float diam = 0.08 + 0.34 * vT;
  gl_PointSize = clamp( uScale * diam / max( -mv.z, 0.5 ), 1.0, 48.0 );
}
`;
const SPLASH_FRAG = `
uniform vec3 uColor;
uniform float uAlpha;
varying float vT;
varying float vA;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y *= 2.4;
  float r = length( c );
  float ring = smoothstep( 0.45, 0.75, r ) * ( 1.0 - smoothstep( 0.78, 1.0, r ) );
  float a = ring * vA * ( 1.0 - vT ) * ( 1.0 - vT ) * uAlpha;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( uColor, a );
}
`;

// ---------------------------------------------------------------- windblown litter

const LITTER_VERT = `
attribute vec4 aSeed;
uniform vec3 uCam;
uniform float uTime;
uniform float uWind;
uniform float uGust;
uniform vec2 uDir;
uniform float uScale;
uniform float uBox;
uniform float uBright;
varying vec3 vCol;
varying float vA;
void main() {
  float spd = ( 0.5 + 1.5 * aSeed.w ) * ( 1.0 + 7.0 * uWind );
  vec2 dir = uDir;
  vec2 perp = vec2( -dir.y, dir.x );
  vec2 pos = aSeed.xy * uBox + dir * uTime * spd + perp * sin( uTime * 0.9 + aSeed.z * 40.0 ) * 1.4;
  vec2 d = pos - uCam.xz;
  d -= uBox * floor( d / uBox + 0.5 );
  float hop = abs( sin( uTime * ( 2.0 + 3.0 * aSeed.w ) + aSeed.z * 30.0 ) );
  float y = 0.1 + hop * ( 0.15 + 0.9 * uGust ) * ( 0.4 + 0.6 * aSeed.w );
  vec3 wp = vec3( uCam.x + d.x, y, uCam.z + d.y );
  float dist = length( d );
  float show = step( aSeed.z, clamp( ( uWind - 0.3 ) * 1.6, 0.0, 1.0 ) );
  vA = show * ( 1.0 - smoothstep( 14.0, 22.0, dist ) ) * 0.9;
  float k = fract( aSeed.z * 17.3 );
  vCol = ( k < 0.45 ? vec3( 0.42, 0.34, 0.16 ) : ( k < 0.75 ? vec3( 0.2, 0.3, 0.1 ) : vec3( 0.62, 0.6, 0.55 ) ) ) * uBright;
  vec4 mv = viewMatrix * vec4( wp, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp( uScale * 0.16 / max( -mv.z, 0.5 ), 1.0, 14.0 );
}
`;
const LITTER_FRAG = `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = ( 1.0 - smoothstep( 0.6, 1.0, length( c * vec2( 1.0, 1.6 ) ) ) ) * vA;
  if ( a < 0.02 ) discard;
  gl_FragColor = vec4( vCol, a );
}
`;

/** Preallocated lightning: a strike is a few pulses with a quick rise and an exponential tail. */
const MAX_PULSES = 4;
const MAX_THUNDER = 4;
const FLASH_ATTACK = 0.035;
const FLASH_DECAY = 0.085;
/** Brightest a flash may get (0..1): keeps a close strike under the BlinkProbe jump threshold at night. */
const FLASH_MAX = 0.72;

export class Weather {
  private _state: WeatherState = 'dry';
  /** rain intensity 0..1 */
  rain = 0;
  /** ground wetness 0..1 */
  wetness = 0;
  /** cloud / gloom 0..1 (smoothed) */
  overcast = 0;
  autoCycle: boolean;

  // ---- weather system (all smoothed)
  /** sky cloud cover 0..1 */
  cloud = 0;
  /** wind strength 0..1 (slow) */
  wind = 0.15;
  /** distance fog 0..1 at ground level (gameplay; the look thins it with height) */
  fog = 0;
  /** storm 0..1: lightning while above one half */
  storm = 0;
  /** lightning flash 0..1 (current frame) */
  flash = 0;
  /** gust multiplier 0..1 and the instantaneous wind 0..1 (wind scaled by the gust) */
  gust = 0.5;
  windNow = 0.15;
  /** the camera is inside a room (interiors sit 3 km off the map) or under a roof; rain and its sound adapt */
  indoors = false;
  covered = false;
  /** main.ts sets this each frame from `player.inVehicle`: the rain sounds different in a car */
  inVehicle = false;
  /** forecast clock multiplier (debug: 6 = six forecast hours per game hour) */
  forecastRate = 1;
  /** the elevated line of the grid map shelters the street under it (set false on the real map) */
  gridEl = true;

  private readonly opts: Required<Omit<WeatherOptions, 'canvasFactory'>>;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly puddleTex: THREE.Texture;
  private readonly specs: { mat: THREE.MeshStandardMaterial; spec: WetSpec; baseEnv: number; uniforms: Record<string, THREE.IUniform> }[] = [];
  private readonly swayU: Record<string, THREE.IUniform> = { uSway: { value: new THREE.Vector4(1, 0, 0, 0) } };
  private targets: WeatherTargets = {};
  private readonly scene: THREE.Scene;
  private readonly rainMesh: THREE.LineSegments | null;
  private readonly rainU: Record<string, THREE.IUniform>;
  private readonly splashMesh: THREE.Points;
  private readonly splashU: Record<string, THREE.IUniform>;
  private readonly litterMesh: THREE.Points;
  private readonly litterU: Record<string, THREE.IUniform>;
  private readonly leafMats: THREE.Material[] = [];
  private phaseTime = 0;
  private time = 0;
  private lastOvercast = -1;
  private lastLook = '';

  // forecast / director
  private _forecast: Forecast | null = null;
  private forced: WeatherKind | null = null;
  private directed = false;
  private _kind: WeatherKind = 'clear';
  private fDay = 0;
  private skew = 0;
  private lastHour = Number.NaN;
  private readonly tgt = newKindParams();
  private sinceRain = 1e9;
  private windAngle = 0.35;
  private seedKey: number | string = 0;

  // camera
  private camX = 0; private camY = 0; private camZ = 0;
  private camVX = 0; private camVY = 0; private camVZ = 0;
  private hasCam = false;

  // tiers
  private tier: Quality = 'high';
  private tierExplicit = false;
  private streakCap = 0;
  private streakBuilt = 0;

  // lightning
  private lrng = new Rng('lightning:0');
  private strikeIn = 6;
  private strikeClock = 99;
  private readonly pAt = new Float32Array(MAX_PULSES);
  private readonly pAmp = new Float32Array(MAX_PULSES);
  private nPulses = 0;
  private readonly tqDelay = new Float32Array(MAX_THUNDER).fill(-1);
  private readonly tqDist = new Float32Array(MAX_THUNDER);
  private readonly tqStr = new Float32Array(MAX_THUNDER);
  private readonly audioState = newWeatherAudioState();
  private fogLook = 0;

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
      uPuddleGloss: { value: 1 },
      uRipple: { value: 0 },
      uWetTime: { value: 0 },
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
    // tree canopies sway in the wind
    for (let v = 0; v < 8; v++) {
      let m: THREE.Material;
      try { m = materials.get('treeLeaves', v); } catch { break; }
      if (this.leafMats.includes(m) || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
      this.leafMats.push(m);
      this.patchSway(m as THREE.MeshStandardMaterial);
    }

    const deck = new THREE.Vector4(EL_Z, DECK_HALF, DECK_Y, 1);
    const deckX = new THREE.Vector2(EL_X_WEST, EL_X_EAST);

    // rain streaks
    const n = Math.max(0, Math.floor(this.opts.rainStreaks));
    this.rainU = {
      uCam: { value: new THREE.Vector3() }, uCamVel: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: new THREE.Vector3(BOX, BOX_H, BOX) },
      uWind: { value: new THREE.Vector2(2.2, 0.8) }, uFall: { value: 13 }, uLen: { value: 0.9 },
      uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0.55, 0.6, 0.7) }, uDeck: { value: deck }, uDeckX: { value: deckX },
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
      this.streakBuilt = n;
      this.streakCap = n;
    } else {
      this.rainMesh = null;
    }

    // ground splashes (one draw call): rings that open on the road near the camera
    this.splashU = {
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uRain: { value: 0 }, uScale: { value: 600 }, uBox: { value: SPLASH_BOX },
      uColor: { value: new THREE.Color(0.7, 0.75, 0.82) }, uAlpha: { value: 0.5 }, uDeck: { value: deck }, uDeckX: { value: deckX },
    };
    this.splashMesh = Weather.makePoints('splash', SPLASH_POOL, SPLASH_VERT, SPLASH_FRAG, this.splashU, 21);
    this.splashMesh.onBeforeRender = (renderer, _s, camera) => { this.splashU.uScale.value = Weather.pointScale(renderer, camera); };
    scene.add(this.splashMesh);

    // windblown litter and leaves (one draw call)
    this.litterU = {
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uWind: { value: 0 }, uGust: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) },
      uScale: { value: 600 }, uBox: { value: LITTER_BOX }, uBright: { value: 1 },
    };
    this.litterMesh = Weather.makePoints('litter', LITTER_POOL, LITTER_VERT, LITTER_FRAG, this.litterU, 22);
    this.litterMesh.onBeforeRender = (renderer, _s, camera) => { this.litterU.uScale.value = Weather.pointScale(renderer, camera); };
    scene.add(this.litterMesh);
  }

  private static pointScale(renderer: THREE.WebGLRenderer, camera: THREE.Camera): number {
    const h = renderer.domElement ? renderer.domElement.height : 1080;
    const p = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5] || 1.5;
    return 0.5 * h * p;
  }

  private static makePoints(name: string, n: number, vs: string, fs: string, uniforms: Record<string, THREE.IUniform>, order: number): THREE.Points {
    const rng = new Rng(`weather:${name}`);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seed[i] = rng.next();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, fog: false });
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    p.renderOrder = order;
    p.name = name;
    p.visible = false;
    return p;
  }

  /** Number of rain streaks drawn (<= the number built); quality tiers use fewer. */
  setRainStreaks(n: number): void {
    if (!this.tierExplicit && n <= 250) this.tier = 'phone';
    else if (!this.tierExplicit) this.tier = 'high';
    this.streakCap = Math.max(0, Math.min(this.streakBuilt, Math.floor(n)));
    if (this.rainMesh) this.rainMesh.geometry.setDrawRange(0, this.streakCap * 2);
    this.applyTier();
  }

  /** Quality tier: the phone gets cheap versions (fewer splashes, no puddle mirrors, no rain rings, no litter, no lightning on the shadow-casting sun). */
  setTier(q: Quality): void {
    this.tier = q;
    this.tierExplicit = true;
    this.applyTier();
  }

  private applyTier(): void {
    const phone = this.tier === 'phone';
    this.uniforms.uPuddleGloss.value = phone ? 0 : 1;
  }

  /** Hook up the things that react to weather (DayNight lighting + SkyDome clouds, the audio sink, a roof test). */
  attach(t: WeatherTargets): void {
    this.targets = t;
    this.applyLook(true);
  }

  /** Legacy four-state label for the save game, announcers and debug UI. Derived while the weather system drives. */
  get state(): WeatherState {
    if (!this.directed) return this._state;
    if (this.rain > 0.08) return 'rain';
    if (this.wetness > 0.03) return this.sinceRain < WET_HOLD_SECONDS ? 'wet' : 'drying';
    return 'dry';
  }

  /** The current weather kind (the forced one, the forecast's, or a label for the old state cycle). */
  get kind(): WeatherKind {
    if (this.directed) return this._kind;
    return this._state === 'rain' ? 'heavyRain' : this.overcast > 0.3 ? 'overcast' : 'clear';
  }

  get forecast(): Forecast | null { return this._forecast; }

  /** True while it is raining enough to matter (umbrellas, hurried walkers). */
  get raining(): boolean { return this.rain > RAIN_SEEN; }

  /** Tyre grip multiplier for vehicles: 1 dry, about 0.8 in light rain, 0.7 in heavy rain; recovers as the road dries. */
  get roadGrip(): number { return Math.min(1, Math.max(0.6, 1 - 0.22 * this.wetness - 0.09 * this.rain)); }

  /** How far you can see 0..1: fog and heavy rain pull it down. */
  get visibility(): number { return clamp01((1 - 0.8 * this.fog) * (1 - 0.32 * this.rain) * (1 - 0.08 * this.overcast)); }

  /** Rain intensity for the post-processing haze: fog thickens it too. */
  get hazeRain(): number { return Math.max(this.rain, this.fog * 0.7); }

  /** Lightning flash after the indoor / tier scaling, 0..1: what the lights get. */
  get flashLight(): number { return this.flash * (this.indoors ? 0.3 : 1); }

  /**
   * Debug / menu setter for the old cycle. 'dry' snaps everything dry; 'rain' starts raining now (ground soaks over ~25 s; pass
   * `snap` to jump straight to a soaked street); 'wet' = rain stopped, ground fully wet; 'drying' = evaporating
   * from the current wetness (from fully wet if the ground was dry). While the forecast or a forced kind drives, this only
   * snaps rain and ground wetness (the cloud still follows the forecast), so loading a save does not stop the forecast.
   */
  setState(s: WeatherState, snap = false): void {
    if (this.directed) {
      this.phaseTime = 0;
      if (s === 'dry') { this.rain = 0; this.wetness = 0; }
      if (s === 'rain' && snap) { this.rain = Math.max(this.rain, 0.85); this.wetness = 1; }
      if (s === 'wet') { this.rain = 0; this.wetness = 1; this.sinceRain = 0; }
      if (s === 'drying') { this.rain = 0; if (this.wetness < 0.05) this.wetness = 1; this.sinceRain = WET_HOLD_SECONDS; }
      this.syncUniforms();
      return;
    }
    this._state = s;
    this.phaseTime = 0;
    if (s === 'dry') { this.rain = 0; this.wetness = 0; this.overcast = 0; }
    if (s === 'rain') { if (snap) { this.rain = 1; this.wetness = 1; this.overcast = 1; } }
    if (s === 'wet') { this.rain = 0; this.wetness = 1; this.overcast = Math.max(this.overcast, 0.5); if (snap) this.overcast = 0.5; }
    if (s === 'drying') { if (this.wetness < 0.05) this.wetness = 1; this.rain = 0; }
    this.syncUniforms();
    this.applyLook(true);
  }

  startRain(): void { this.setState('rain'); }
  stopRain(): void { if (this._state === 'rain') { this._state = 'wet'; this.phaseTime = 0; } }

  // ---------------------------------------------------------------- the weather system

  /**
   * Start the seeded forecast: the weather changes by itself every few game hours, the same way for the same seed.
   * `seed` is the game seed (main.ts passes `data.seed`).
   */
  startForecast(seed: number | string = 0, rate = 1): void {
    this.seedKey = seed;
    this._forecast = new Forecast(seed);
    this.lrng = new Rng(`lightning:${seed}`);
    this.forced = null;
    this.directed = true;
    this.forecastRate = rate;
    this.windAngle = 0.2 + 0.7 * new Rng(`wind:${seed}`).next();
    this.lastHour = Number.NaN;
    this.fDay = 0;
    this.skew = 0;
    this.sinceRain = 1e9;
  }

  /**
   * Debug hook: force a weather kind (or 'auto' to hand back to the forecast). `snap` jumps every value there at once (a screenshot
   * setup); without it the sky eases over in about 40 s. `wet` sets the ground wetness at the jump (default: soaked for rain kinds,
   * unchanged otherwise, so a storm clears onto wet streets).
   */
  setWeather(kind: WeatherKind | 'auto', snap = false, wet?: number): void {
    if (kind === 'auto') {
      if (!this._forecast) this.startForecast(this.seedKey);
      this.forced = null;
      this.directed = true;
      return;
    }
    if (!(kind in KIND_PARAMS)) return;
    this.forced = kind;
    this._kind = kind;
    this.directed = true;
    this._state = 'dry';
    if (snap) {
      const p = KIND_PARAMS[kind];
      this.cloud = p.cloud; this.overcast = p.gloom; this.rain = p.rain; this.wind = p.wind; this.storm = p.storm;
      this.fog = p.fog * fogHourFactor(this.targets.dayNight?.timeOfDay ?? 12);
      this.wetness = wet ?? (p.rain > 0 ? Math.min(1, 0.55 + 0.5 * p.rain) : Math.max(this.wetness, p.damp));
      this.sinceRain = p.rain > 0 ? 0 : 1e9;
    } else if (wet !== undefined) this.wetness = wet;
    this.syncUniforms();
    this.applyLook(true);
  }

  /** Debug: jump the forecast clock ahead by game hours (cumulative), or run it faster than the game clock with `forecastRate`. */
  skipForecast(hours: number): void { if (Number.isFinite(hours)) this.skew += hours; }

  /** Absolute forecast hour (days * 24 + hour of day, plus any skipped / sped-up hours). */
  get forecastHour(): number {
    const h = this.targets.dayNight?.timeOfDay;
    return this.fDay * 24 + (Number.isFinite(h as number) ? (h as number) : 0) + this.skew;
  }

  /** Debug: force one lightning strike now (distance in metres decides how long the thunder takes and how bright the flash is). */
  strike(distanceM = 800, strength = 1): void {
    const dist = Math.max(100, distanceM);
    const far = smooth(300, 4500, dist);
    const amp = (0.5 + 0.5 * clamp01(strength)) * (1 - 0.55 * far);
    this.strikeClock = 0;
    this.nPulses = 1 + (this.lrng.chance(0.6) ? 1 : 0) + (this.lrng.chance(0.3) ? 1 : 0);
    let at = 0;
    for (let i = 0; i < this.nPulses; i++) {
      this.pAt[i] = at;
      this.pAmp[i] = amp * (i === 0 ? 1 : 0.55 + 0.3 * this.lrng.next());
      at += 0.12 + 0.16 * this.lrng.next();
    }
    for (let i = 0; i < MAX_THUNDER; i++) {
      if (this.tqDelay[i] < 0) { this.tqDelay[i] = Math.min(14, dist / 343); this.tqDist[i] = dist; this.tqStr[i] = clamp01(strength); break; }
    }
  }

  /** Per rendered frame. `cameraPos` anchors the rain box. */
  update(dt: number, cameraPos?: THREE.Vector3): void {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.time += d;
    this.phaseTime += d;

    this.trackCamera(d, cameraPos);
    this.syncClock();
    if (this.directed) this.stepDirected(d); else this.stepLegacy(d);
    this.stepWind();
    this.stepLightning(d);

    this.syncUniforms();
    this.applyLook(false);
    this.updateVisuals(cameraPos);
    this.updateAudio(d);
  }

  dispose(): void {
    if (this.rainMesh) {
      this.scene.remove(this.rainMesh);
      this.rainMesh.geometry.dispose();
      (this.rainMesh.material as THREE.Material).dispose();
    }
    for (const p of [this.splashMesh, this.litterMesh]) {
      this.scene.remove(p);
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.puddleTex.dispose();
    // un-wet the ground so a disposed Weather leaves the materials as it found them
    this.wetness = 0;
    (this.swayU.uSway.value as THREE.Vector4).z = 0;
    this.syncUniforms();
  }

  // ---------------------------------------------------------------- internals

  private trackCamera(d: number, cameraPos?: THREE.Vector3): void {
    if (!cameraPos || !Number.isFinite(cameraPos.x + cameraPos.y + cameraPos.z)) return;
    if (this.hasCam && d > 0) {
      const k = 1 - Math.exp(-d / 0.12);
      const cl = (v: number): number => Math.max(-45, Math.min(45, v));
      this.camVX += (cl((cameraPos.x - this.camX) / d) - this.camVX) * k;
      this.camVY += (cl((cameraPos.y - this.camY) / d) - this.camVY) * k;
      this.camVZ += (cl((cameraPos.z - this.camZ) / d) - this.camVZ) * k;
    }
    this.camX = cameraPos.x; this.camY = cameraPos.y; this.camZ = cameraPos.z;
    this.hasCam = true;
    this.indoors = Math.abs(cameraPos.x) > INTERIOR_DIST || Math.abs(cameraPos.z) > INTERIOR_DIST;
    const roof = this.targets.covered;
    this.covered = !this.indoors && (roof ? roof(cameraPos.x, cameraPos.y, cameraPos.z) : this.gridEl && Weather.underGridEl(cameraPos.x, cameraPos.y, cameraPos.z));
  }

  /** Under the deck of the grid map's elevated line (x along the line, inside the deck's footprint, below the deck). */
  static underGridEl(x: number, y: number, z: number): boolean {
    return y < DECK_Y && Math.abs(z - EL_Z) < DECK_HALF && x > EL_X_WEST && x < EL_X_EAST;
  }

  /** Follows the day clock to place the forecast: whole days that went by, plus the speed-up skew. */
  private syncClock(): void {
    const h = this.targets.dayNight?.timeOfDay;
    if (h === undefined || !Number.isFinite(h)) return;
    if (Number.isFinite(this.lastHour)) {
      const dh = h - this.lastHour;
      if (dh < -12) this.fDay++; // wrapped past midnight
      else if (dh > 12) this.fDay = Math.max(0, this.fDay - 1); // jumped back over midnight (setHour)
      else if (dh > 0 && dh < 1) this.skew += dh * (this.forecastRate - 1);
    }
    this.lastHour = h;
  }

  private stepLegacy(d: number): void {
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
    this.overcast = slew(this.overcast, target, d * OVERCAST_RATE);
    // the rest of the look follows: cloud = gloom (the old sky), a breeze that freshens in rain, no fog or storm
    this.cloud = this.overcast;
    this.wind = slew(this.wind, 0.15 + 0.35 * this.rain, d * WIND_RATE);
    this.fog = slew(this.fog, 0, d * FOG_RATE);
    this.storm = slew(this.storm, 0, d * STORM_RATE);
    if (raining || this.wetness > 0.01) this.sinceRain = raining ? 0 : this.sinceRain + d; else this.sinceRain = 1e9;
  }

  private stepDirected(d: number): void {
    const t = this.tgt;
    const hour = this.targets.dayNight?.timeOfDay ?? 12;
    if (this.forced) {
      const p = KIND_PARAMS[this.forced];
      t.cloud = p.cloud; t.gloom = p.gloom; t.rain = p.rain; t.wind = p.wind; t.fog = p.fog; t.storm = p.storm; t.damp = p.damp;
      this._kind = this.forced;
    } else if (this._forecast) {
      const abs = this.forecastHour;
      targetsAt(this._forecast, abs, t);
      this._kind = this._forecast.kindAt(abs);
    }
    const fogT = t.fog * fogHourFactor(hour);

    this.cloud = slew(this.cloud, t.cloud, d * CLOUD_RATE);
    this.overcast = slew(this.overcast, t.gloom, d * GLOOM_RATE);
    this.rain = slew(this.rain, t.rain, d * (t.rain > this.rain ? RAIN_UP : RAIN_DOWN));
    this.wind = slew(this.wind, t.wind, d * WIND_RATE);
    this.fog = slew(this.fog, fogT, d * FOG_RATE);
    this.storm = slew(this.storm, t.storm, d * STORM_RATE);

    // ground: soaks while it rains (more rain, wetter), holds a little, then dries over minutes (faster in wind and sun)
    const raining = this.rain > 0.02;
    const cap = Math.max(raining ? Math.min(1, 0.55 + 0.5 * this.rain) : 0, t.damp);
    if (raining) this.sinceRain = 0; else this.sinceRain += d;
    if (this.wetness < cap) {
      this.wetness = Math.min(cap, this.wetness + d * (raining ? SOAK_RATE * (0.5 + this.rain) : 1 / 90));
    } else if (!raining && this.sinceRain > WET_HOLD_SECONDS) {
      const speed = (1 + 0.8 * this.wind) * (1 + 0.5 * (1 - this.overcast));
      this.wetness = Math.max(cap, this.wetness - (d * speed) / DRYING_SECONDS_DIRECTED);
    }
    this._state = this.state; // keep the label current for anything that reads the private field
  }

  private stepWind(): void {
    const t = this.time;
    const g = 0.5 + 0.25 * Math.sin(t * 0.61 + 1.3) + 0.15 * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 4.1 + 0.4);
    this.gust = clamp01(g);
    this.windNow = Math.min(1, this.wind * (0.6 + 0.8 * this.gust));
  }

  private stepLightning(d: number): void {
    // thunder in flight
    for (let i = 0; i < MAX_THUNDER; i++) {
      if (this.tqDelay[i] < 0) continue;
      this.tqDelay[i] -= d;
      if (this.tqDelay[i] <= 0) {
        this.targets.audio?.thunder(this.tqDist[i], this.tqStr[i]);
        this.tqDelay[i] = -1;
      }
    }
    // a storm strikes every so often; stronger storms strike more
    if (this.storm > 0.5) {
      this.strikeIn -= d;
      if (this.strikeIn <= 0) {
        const r = this.lrng.next();
        const dist = 300 + 4200 * r * r;
        this.strike(dist, 0.5 + 0.5 * this.lrng.next());
        this.strikeIn = (9 + 30 * (1 - this.storm) + 16 * this.lrng.next());
      }
    } else if (this.strikeIn > 8) this.strikeIn = 8;
    // flash envelope
    let f = 0;
    if (this.strikeClock < 1.5) {
      this.strikeClock += d;
      for (let i = 0; i < this.nPulses; i++) {
        const x = this.strikeClock - this.pAt[i];
        if (x <= 0) continue;
        f += this.pAmp[i] * (x < FLASH_ATTACK ? x / FLASH_ATTACK : Math.exp(-(x - FLASH_ATTACK) / FLASH_DECAY));
      }
    }
    this.flash = Math.min(FLASH_MAX, f);
  }

  /** Writes the weather look to DayNight (which hands it to SkyDome) when it moved, and re-lights once. */
  private applyLook(force: boolean): void {
    const dn = this.targets.dayNight;
    if (!dn) return;
    const o = this.overcast;
    // thin with the camera's height: aerial views see over the mist
    const fogLook = this.fog * (1 - 0.8 * smooth(8, 70, this.camY));
    const flash = this.flashLight;
    const cloudOut = this.directed ? this.cloud : -1;
    const moved = force || Math.abs(o - this.lastOvercast) >= 0.002 || Math.abs(fogLook - this.fogLook) >= 0.004 || flash > 0 || this.lastLook === 'flash' || Math.abs(this.windNow - (dn.windSpeed ?? 0)) >= 0.05 || (this.directed && Math.abs(this.cloud - (dn.cloudCover ?? -1)) >= 0.004);
    if (!moved) return;
    this.lastOvercast = o;
    this.fogLook = fogLook;
    this.lastLook = flash > 0 ? 'flash' : '';
    dn.overcast = o;
    dn.cloudCover = cloudOut;
    dn.windSpeed = this.windNow;
    dn.fogAmount = fogLook;
    dn.flash = flash;
    dn.flashKey = this.tier === 'phone' ? 0 : 1;
    dn.update(0);
  }

  private syncUniforms(): void {
    for (const s of this.specs) {
      s.uniforms.uWet.value = this.wetness;
      if (s.mat.envMap) s.mat.envMapIntensity = s.baseEnv + (Math.max(s.baseEnv, s.spec.env) - s.baseEnv) * this.wetness;
    }
    this.uniforms.uWetTime.value = this.time % 4000;
    this.uniforms.uRipple.value = this.tier === 'phone' || this.indoors ? 0 : clamp01(this.rain * 1.4);
    const sw = this.swayU.uSway.value as THREE.Vector4;
    sw.set(Math.cos(this.windAngle), Math.sin(this.windAngle), 0.04 + 0.5 * this.windNow, this.time % 3000);
  }

  private updateVisuals(cameraPos?: THREE.Vector3): void {
    const dn = this.targets.dayNight;
    const bright = dn ? 0.3 + 0.7 * smooth(-0.05, 0.3, dn.sunDirection.y) : 1;
    const phone = this.tier === 'phone';
    const outdoors = !this.indoors;
    const deckOn = this.gridEl ? 1 : 0;
    const wx = Math.cos(this.windAngle), wz = Math.sin(this.windAngle);

    if (this.rainMesh) {
      const on = this.rain > 0.01 && outdoors;
      this.rainMesh.visible = on;
      if (on) {
        const u = this.rainU;
        u.uTime.value = this.time;
        if (cameraPos) (u.uCam.value as THREE.Vector3).copy(cameraPos);
        (u.uCamVel.value as THREE.Vector3).set(this.camVX, this.camVY, this.camVZ);
        const drift = this.windNow * 5.5;
        (u.uWind.value as THREE.Vector2).set(wx * drift, wz * drift);
        u.uFall.value = 9 + 5 * this.rain;
        u.uLen.value = 0.7 + 0.5 * this.rain;
        (u.uDeck.value as THREE.Vector4).w = deckOn;
        // light rain draws a third of the streaks, a downpour all of them
        this.rainMesh.geometry.setDrawRange(0, Math.max(2, Math.floor(this.streakCap * (0.3 + 0.7 * clamp01(this.rain / 0.9)))) * 2);
        u.uAlpha.value = 0.24 + 0.5 * this.rain;
        (u.uColor.value as THREE.Color).setRGB(0.55 * bright, 0.6 * bright, 0.7 * bright + 0.05);
      }
    }

    const sOn = this.rain > 0.03 && outdoors;
    this.splashMesh.visible = sOn;
    if (sOn) {
      const u = this.splashU;
      u.uTime.value = this.time;
      if (cameraPos) (u.uCam.value as THREE.Vector3).copy(cameraPos);
      u.uRain.value = this.rain * (phone ? 0.25 : 1);
      u.uAlpha.value = 0.55;
      (u.uColor.value as THREE.Color).setRGB(0.62 * bright + 0.05, 0.68 * bright + 0.05, 0.78 * bright + 0.06);
      (u.uDeck.value as THREE.Vector4).w = deckOn;
    }

    const lOn = !phone && outdoors && this.windNow > 0.32 && this.rain < 0.6;
    this.litterMesh.visible = lOn;
    if (lOn) {
      const u = this.litterU;
      u.uTime.value = this.time;
      if (cameraPos) (u.uCam.value as THREE.Vector3).copy(cameraPos);
      u.uWind.value = this.windNow;
      u.uGust.value = this.gust;
      (u.uDir.value as THREE.Vector2).set(wx, wz);
      u.uBright.value = 0.25 + 0.75 * bright;
    }
  }

  private updateAudio(d: number): void {
    const a = this.targets.audio;
    if (!a) return;
    const s = this.audioState;
    s.rain = this.rain; s.wind = this.windNow; s.gust = this.gust; s.storm = this.storm;
    s.inVehicle = this.inVehicle; s.indoors = this.indoors; s.covered = this.covered;
    a.update(d, s);
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
    m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|wet2`;
    m.needsUpdate = true;
    this.specs.push({ mat: m, spec, baseEnv: m.envMapIntensity, uniforms });
  }

  private patchSway(m: THREE.MeshStandardMaterial): void {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev?.call(m, shader, renderer);
      patchSwayShader(shader as unknown as { vertexShader: string; uniforms: Record<string, THREE.IUniform> }, this.swayU);
    };
    const prevKey = m.customProgramCacheKey;
    m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|sway1`;
    m.needsUpdate = true;
  }

  /** 256 x 256 single-channel mask (64 kB). The painting canvas is read once and dropped: no canvas stays alive. */
  private static makePuddleTexture(factory: (w: number, h: number) => HTMLCanvasElement): THREE.Texture {
    try {
      const size = 256;
      const canvas = factory(size, size);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        puddleMaskPainter(ctx, size, size, new Rng('puddle-mask'), 0);
        const px = ctx.getImageData(0, 0, size, size).data;
        const r = new Uint8Array(size * size);
        for (let i = 0; i < r.length; i++) r[i] = px[i * 4];
        canvas.width = 1; canvas.height = 1; // release the backing store
        const t = new THREE.DataTexture(r, size, size, THREE.RedFormat);
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
