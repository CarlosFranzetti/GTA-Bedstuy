import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { memLines, sceneMemory } from '@/ui/MemOverlay';

describe('?debug=mem numbers', () => {
  it('totals the geometry arrays and the textures of a scene once each', () => {
    const scene = new THREE.Scene();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 100), 3)); // 300 vertices = 100 triangles, 3600 bytes
    const tex = new THREE.Texture({ width: 512, height: 512, getContext: () => null } as unknown as HTMLCanvasElement);
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const m = new THREE.MeshStandardMaterial({ map: tex });
    scene.add(new THREE.Mesh(g, m), new THREE.Mesh(g, m)); // shared geometry and material count once
    const r = sceneMemory(scene);
    expect(r.geometries).toBe(1);
    expect(r.geometryBytes).toBe(3600);
    expect(r.triangles).toBe(100);
    expect(r.textures).toBe(1);
    expect(r.textureBytes).toBeCloseTo(512 * 512 * 4 * (4 / 3), -2);
    expect(r.canvasBytes).toBe(512 * 512 * 4);
  });
  it('a freed canvas no longer counts as a live canvas but still as GPU memory', () => {
    const scene = new THREE.Scene();
    const canvas = { width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement;
    const tex = new THREE.Texture(canvas);
    tex.userData.gpuW = 1024; tex.userData.gpuH = 512; tex.generateMipmaps = false;
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex })));
    const r = sceneMemory(scene);
    expect(r.canvasBytes).toBe(0);
    expect(r.textureBytes).toBe(1024 * 512 * 4);
  });
  it('formats the overlay lines with tier, canvas, pixel ratio, texture count, geometry, canvas and heap', () => {
    const lines = memLines({ tier: 'phone', canvas: '390x664', pixelRatio: 1, rendererTextures: 90, heapMB: null, releasedCanvases: 40,
      scene: { textures: 120, textureBytes: 80 * 1048576, canvasBytes: 12 * 1048576, geometries: 800, geometryBytes: 64 * 1048576, triangles: 250_000 } });
    const t = lines.join('\n');
    expect(t).toContain('tier phone');
    expect(t).toContain('390x664');
    expect(t).toContain('pr 1.00');
    expect(t).toContain('tex 120 (gpu 90) ~80 MB');
    expect(t).toContain('geo 64 MB');
    expect(t).toContain('canvas alive 12 MB');
    expect(t).toContain('heap n/a');
  });
});
