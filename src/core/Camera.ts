import * as THREE from 'three';
import { angleDiff, clamp, forwardFromHeading, wrapAngle, type Vec2 } from './Math2';
import type { Input } from './Input';

export type CameraMode = 'foot' | 'vehicle';

const MOUSE_SENS = 0.0025;
const PITCH_MIN = -0.1;
const PITCH_MAX = 0.9;
const DEFAULT_PITCH = 0.15;
const RECENTRE_DELAY = 1.5;
const RECENTRE_RATE = 2; // rad/s
const SMOOTH = 8;        // exponential smoothing rate, 1/s
const LOOK_UP = 1.2;
const MIN_CAM_Y = 0.4;
const FOOT = { distance: 5, height: 2.2 };
const VEHICLE = { distance: 8, height: 3 };

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Heading (radians, clockwise from north) the camera looks toward. Walk "forward" = this. */
  yaw = 0;
  pitch = DEFAULT_PITCH;

  private idle = 0;
  private distance = FOOT.distance;
  private height = FOOT.height;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private initialised = false;

  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 900);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, targetPos: Vec2, targetHeading: number, mode: CameraMode, input: Input): void {
    // mouse orbit
    if (input.mouseDX !== 0 || input.mouseDY !== 0) {
      this.yaw += input.mouseDX * MOUSE_SENS;
      this.pitch = clamp(this.pitch + input.mouseDY * MOUSE_SENS, PITCH_MIN, PITCH_MAX);
      this.idle = 0;
    } else {
      this.idle += dt;
    }

    // auto-recentre behind the vehicle
    if (mode === 'vehicle' && this.idle > RECENTRE_DELAY) {
      const diff = angleDiff(this.yaw, targetHeading);
      const step = RECENTRE_RATE * dt;
      this.yaw += clamp(diff, -step, step);
    }
    this.yaw = wrapAngle(this.yaw);

    const want = mode === 'vehicle' ? VEHICLE : FOOT;
    const k = this.initialised ? 1 - Math.exp(-SMOOTH * dt) : 1;
    this.distance += (want.distance - this.distance) * k;
    this.height += (want.height - this.height) * k;

    const back = forwardFromHeading(this.yaw);
    const horiz = this.distance * Math.cos(this.pitch);
    const wantPos = new THREE.Vector3(
      targetPos.x - back.x * horiz,
      Math.max(MIN_CAM_Y, this.height + this.distance * Math.sin(this.pitch)),
      targetPos.z - back.z * horiz,
    );
    const wantLook = new THREE.Vector3(targetPos.x, LOOK_UP, targetPos.z);

    this.pos.lerp(wantPos, k);
    this.look.lerp(wantLook, k);
    this.initialised = true;

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
