/**
 * Camera clip planes and the depth precision they give. The scene is drawn into 24-bit (or Apple's 32-bit float) depth buffers
 * with the standard perspective mapping, whose resolution at view distance z is about z^2 / (near * 2^24) metres. SwiftShader
 * (the headless test renderer) resolves much finer, so z-fighting of thin layers (road paint 4 mm above the asphalt, stoop
 * and cornice reliefs, glass over frames) only shows on real GPUs, as shimmer that moves with the camera. The near plane is
 * the one knob that matters (far barely changes it): 0.2 m halves the step of the old 0.1 m and still sits inside the camera
 * rig's 0.35 m wall margin (the near-plane corner of a 16:9 82 degree lens is 0.2 * 1.55 = 0.31 m off the axis).
 */
export const CAMERA_NEAR = 0.2;
export const CAMERA_FAR = 900;

/** Smallest depth difference (m) a 24-bit standard-mapped depth buffer resolves at view distance `z` (m). */
export function depthStepAt(z: number, near = CAMERA_NEAR, bits = 24): number {
  return (z * z) / (near * 2 ** bits);
}
