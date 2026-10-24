import * as THREE from 'three';

export type Quality = 'low' | 'medium' | 'high';

const MAP_SIZE: Record<Quality, number> = { low: 1024, medium: 2048, high: 4096 };
/** Half-extent (m) of the orthographic shadow box that follows the player (tighter box = sharper texels). */
const HALF_SIZE: Record<Quality, number> = { low: 60, medium: 80, high: 100 };
/** PCF kernel radius per quality: a small radius keeps contact edges crisp, a larger one softens far edges. */
const SHADOW_RADIUS: Record<Quality, number> = { low: 1.5, medium: 2, high: 3 };
const SHADOW_NEAR = 1;
const SHADOW_FAR = 400;
/** Distance (m) of the light from the shadow target. Must be < SHADOW_FAR and > the box half-size. */
const LIGHT_DISTANCE = 180;
/**
 * Minimum elevation (sine of the angle above the horizon) used for the shadow-casting light. The
 * DayNight sun dips below the horizon at night (it then doubles as moonlight); a light under the
 * ground, or grazing it, would give no usable or absurdly long shadows, so the direction is
 * mirrored above the ground and lifted to this minimum.
 */
const MIN_ELEVATION = 0.25;

/**
 * Enables shadow mapping on the renderer and configures `sun` as the (only) shadow caster.
 *
 * three 0.186 removed PCFSoftShadowMap (it falls back to PCFShadowMap with a warning), so
 * PCFShadowMap is used for every quality; softness comes from `shadow.radius`.
 * The caller must add `sun.target` to the scene (`scene.add(sun.target)`), otherwise its
 * matrixWorld is never updated and the light keeps aiming at the origin.
 */
export function setupShadows(renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight, quality: Quality): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.needsUpdate = true;

  sun.castShadow = true;
  const shadow = sun.shadow;
  const size = MAP_SIZE[quality];
  if (shadow.mapSize.x !== size || shadow.mapSize.y !== size) {
    shadow.mapSize.set(size, size);
    // A resized map needs its render target recreated.
    shadow.map?.dispose();
    shadow.map = null;
  }
  const half = HALF_SIZE[quality];
  const cam = shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = SHADOW_NEAR;
  cam.far = SHADOW_FAR;
  cam.updateProjectionMatrix();
  // Tuned so stoops / curbs do not peter-pan (detach from their caster) while avoiding acne.
  shadow.bias = -0.0003;
  shadow.normalBias = 0.5;
  shadow.radius = SHADOW_RADIUS[quality];
}

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _t = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Moves the shadow box to follow `target` (the player, in world x/z). Call once per frame AFTER
 * `dayNight.update()` (which rewrites `sun.position` relative to the origin).
 *
 *  - `sun.target` is placed at (target.x, ~0, target.z), snapped to the shadow-map texel grid in
 *    light space so shadows do not shimmer while moving. Its y is exactly 0 (the snap is solved on the ground plane).
 *  - `sun.position` becomes `sun.target + direction * 180`. The direction is taken from the sun's
 *    current position (origin-relative, as DayNight writes it) or, when this function was the last
 *    writer of the position, from the previous call; it is never changed except that a sun below /
 *    near the horizon is mirrored/lifted to a minimum elevation (see MIN_ELEVATION).
 *  - `sun.target` must be added to the scene by the caller: `scene.add(sun.target)`.
 */
export function updateShadowCamera(sun: THREE.DirectionalLight, target: { x: number; z: number }): void {
  const ud = sun.userData as { _shadowPos?: THREE.Vector3; _shadowDir?: THREE.Vector3 };
  const last = ud._shadowPos;
  if (last && last.distanceToSquared(sun.position) < 1e-10 && ud._shadowDir) {
    _dir.copy(ud._shadowDir);
  } else {
    // First call: position is relative to the (still unmoved) target. Later calls where the position was
    // rewritten by someone else (DayNight writes it relative to the origin): origin-relative.
    _dir.copy(sun.position);
    if (!last) _dir.sub(sun.target.position);
    if (_dir.lengthSq() < 1e-8) _dir.set(0.3, 1, 0.3);
    _dir.normalize();
  }
  if (_dir.y < MIN_ELEVATION) {
    _dir.y = Math.max(Math.abs(_dir.y), MIN_ELEVATION);
    _dir.normalize();
  }

  const shadow = sun.shadow;
  const half = shadow.camera.right;
  const texel = (2 * half) / Math.max(1, shadow.mapSize.x);

  // Light-space basis (z = towards the light).
  _right.crossVectors(WORLD_UP, _dir);
  if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
  _right.normalize();
  _up.crossVectors(_dir, _right).normalize();

  _t.set(target.x, 0, target.z);
  const r = _t.dot(_right);
  const u = _t.dot(_up);
  const sr = Math.round(r / texel) * texel;
  const su = Math.round(u / texel) * texel;
  // Find the ground point (y = 0) whose light-space coordinates are exactly (sr, su):
  //   right.x*x + right.z*z = sr ;  up.x*x + up.z*z = su
  const det = _right.x * _up.z - _right.z * _up.x;
  if (Math.abs(det) > 1e-3) {
    _t.set((sr * _up.z - _right.z * su) / det, 0, (_right.x * su - _up.x * sr) / det);
  } else {
    // Sun (almost) straight overhead: snap in light space and accept a sub-texel y offset.
    _t.addScaledVector(_right, sr - r).addScaledVector(_up, su - u);
  }

  sun.target.position.copy(_t);
  sun.target.updateMatrixWorld();
  sun.position.copy(_t).addScaledVector(_dir, LIGHT_DISTANCE);

  if (!ud._shadowPos) ud._shadowPos = new THREE.Vector3();
  if (!ud._shadowDir) ud._shadowDir = new THREE.Vector3();
  ud._shadowPos.copy(sun.position);
  ud._shadowDir.copy(_dir);
}

/** Sets castShadow / receiveShadow on every Mesh under (and including) `root`. */
export function applyShadowFlags(root: THREE.Object3D, cast: boolean, receive: boolean): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}
