// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CombatView, MUZZLE, TRACER } from '@/game/combat/view';

beforeAll(() => {
  // jsdom has no 2D canvas: a context that accepts every drawing call is enough for the glow and star textures
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => undefined), set: () => true });
  (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;
});

function setup() {
  const scene = new THREE.Scene();
  const view = new CombatView(scene);
  const tracers = () => view.root.children.filter((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'BoxGeometry' && (c as THREE.Mesh).renderOrder === 6) as THREE.Mesh[];
  const star = view.root.children.find((c) => (c as THREE.Sprite).isSprite && (c as THREE.Sprite).renderOrder === 7) as THREE.Sprite;
  const pool = view.root.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).renderOrder === 3) as THREE.Mesh;
  return { view, tracers, star, pool };
}

describe('the muzzle flash', () => {
  it('is a small star that shows for a frame or two and then is gone', () => {
    const { view, star, pool } = setup();
    view.flash({ x: 1, y: 1.3, z: 2 });
    expect(star.visible).toBe(true);
    expect(star.scale.x).toBeLessThan(0.3);                     // a few centimetres across, not a glow over the player
    expect(star.scale.x).toBeGreaterThan(0.1);
    expect(star.material.depthTest).toBe(true);                 // never drawn through the player's body
    expect(MUZZLE.life).toBeLessThanOrEqual(2 / 60 + 1e-9);
    view.update(1 / 60);
    view.update(1 / 60);
    expect(star.visible).toBe(false);
    expect(pool.visible).toBe(false);
  });
  it('throws a faint warm pool on the ground that fades with it', () => {
    const { view, pool } = setup();
    view.flash({ x: 4, y: 1.3, z: -3 });
    expect(pool.visible).toBe(true);
    expect(pool.position.y).toBeLessThan(0.2);
    const o0 = (pool.material as THREE.MeshBasicMaterial).opacity;
    expect(o0).toBeLessThan(0.4);
    view.update(MUZZLE.life / 2);
    expect((pool.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(o0);
  });
});

describe('the tracer', () => {
  it('is a thin streak that flies from the muzzle to the target and disappears on arrival', () => {
    const { view, tracers } = setup();
    view.tracer({ x: 0, y: 1.3, z: 0 }, { x: 0, y: 1.3, z: -40 });
    const t = tracers().find((m) => m.visible)!;
    expect(t.scale.x).toBeLessThan(0.02);                       // thin
    const start = t.position.z;
    view.update(1 / 60);
    expect(t.position.z).toBeLessThan(start - 1);               // it moves: fast (hundreds of m/s)
    expect(t.scale.z).toBeLessThanOrEqual(TRACER.length + 1e-6); // a short streak, not a beam across the whole shot
    let frames = 1;
    while (t.visible && frames < 120) { view.update(1 / 60); frames++; }
    expect(t.visible).toBe(false);
    expect(frames).toBeLessThan(15);                            // 40 m at 420 m/s plus the streak: a few frames
  });
  it('never reaches past the target', () => {
    const { view, tracers } = setup();
    view.tracer({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 });
    const t = tracers().find((m) => m.visible)!;
    for (let i = 0; i < 6; i++) { view.update(1 / 60); if (!t.visible) break; expect(t.position.x + t.scale.z / 2).toBeLessThanOrEqual(10.001); }
  });
});
