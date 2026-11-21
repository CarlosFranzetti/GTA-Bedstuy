import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HOUR_KEYS, gradeParamsAt, gradeWith, phoneGrade, PHONE_GRADE, buildLut } from '@/render/lut';
import { uploadPendingCanvasTextures } from '@/render/TierDetail';
import { releaseCanvasAfterUpload, setTextureTier } from '@/textures/texTier';

describe('phone grade', () => {
  it('adds contrast and saturation and lifts the blacks less, for every hour', () => {
    for (const k of HOUR_KEYS) {
      const g = phoneGrade(k.params);
      expect(g.saturation).toBeGreaterThan(k.params.saturation);
      expect(g.curve).toBeGreaterThan(k.params.curve);
      expect(g.curve).toBeLessThan(0.6);                       // the S curve must stay monotonic (slope 1 - curve > 0)
      expect(g.lift!).toBeLessThan(k.params.lift ?? 0.02);
    }
  });
  it('keeps greys monotonic and inside 0..1', () => {
    const p = phoneGrade(gradeParamsAt(12));
    let prev = -1;
    for (let i = 0; i <= 20; i++) { const v = i / 20; const o = gradeWith([v, v, v], p); expect(o[1]).toBeGreaterThanOrEqual(prev - 1e-6); prev = o[1]; expect(o[0]).toBeLessThanOrEqual(1); }
  });
  it('makes a mid-tone colour a little more saturated than the plain grade, and the plain grade is untouched', () => {
    const plain = gradeWith([0.7, 0.4, 0.3], gradeParamsAt(12));
    const ph = gradeWith([0.7, 0.4, 0.3], phoneGrade(gradeParamsAt(12)));
    expect(ph[0] - ph[2]).toBeGreaterThan(plain[0] - plain[2]);
    expect(PHONE_GRADE.saturation).toBeGreaterThan(1);
  });
  it('buildLut takes an optional tune function and bakes the tuned grade', () => {
    const a = buildLut(5).image.data as Uint8Array, b = buildLut(5, phoneGrade).image.data as Uint8Array;
    expect(a.length).toBe(b.length);
    let diff = 0; for (let i = 0; i < a.length; i += 4 * 97) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeGreaterThan(0);
  });
});

describe('uploadPendingCanvasTextures', () => {
  const fakeCanvas = (w: number, h: number) => ({ width: w, height: h, getContext: () => ({}) }) as unknown as HTMLCanvasElement;
  it('uploads textures that wait for a first view and skips the rest, once', () => {
    setTextureTier('phone');
    const waiting = new THREE.Texture(fakeCanvas(256, 256)); releaseCanvasAfterUpload(waiting);
    const plain = new THREE.Texture(fakeCanvas(256, 256));                    // no release hook: left alone
    const emptied = new THREE.Texture(fakeCanvas(1, 1)); releaseCanvasAfterUpload(emptied);
    const scene = new THREE.Group();
    for (const map of [waiting, plain, emptied]) scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map })));
    const renderer = { initTexture: vi.fn((t: THREE.Texture) => { t.onUpdate?.call(t, t); }) };
    expect(uploadPendingCanvasTextures(renderer, scene)).toBe(1);
    expect(renderer.initTexture).toHaveBeenCalledWith(waiting);
    expect((waiting.image as HTMLCanvasElement).width).toBe(1);               // the real upload hook emptied the canvas
    expect(uploadPendingCanvasTextures(renderer, scene)).toBe(0);              // nothing left to do
    setTextureTier(null);
  });
  it('survives a texture the renderer cannot upload yet', () => {
    setTextureTier('phone');
    const t = new THREE.Texture(fakeCanvas(64, 64)); releaseCanvasAfterUpload(t);
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: t })));
    expect(uploadPendingCanvasTextures({ initTexture: () => { throw new Error('no context'); } }, scene)).toBe(0);
    setTextureTier(null);
  });
});
