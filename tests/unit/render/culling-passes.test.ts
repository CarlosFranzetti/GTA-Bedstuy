import { describe, it, expect } from 'vitest';
import { PassCounter } from '@/render/Perf';

describe('PassCounter', () => {
  it('splits shadow / scene / gbuffer / post and sums to the renderer total', () => {
    const pc = new PassCounter();
    pc.gbufferIndex = 1;
    pc.beginFrame();
    pc.recordShadow(100); pc.record(300);   // main pass: 100 shadow + 200 scene
    pc.record(180);                          // gtao normal pass
    for (let i = 0; i < 5; i++) pc.record(1); // post quads
    expect([pc.shadow, pc.scene, pc.gbuffer, pc.post]).toEqual([100, 200, 180, 5]);
    expect(pc.total).toBe(485);
    pc.beginFrame();
    expect(pc.total).toBe(0);
  });
  it('without a G-buffer pass everything after pass 0 is post', () => {
    const pc = new PassCounter();
    pc.beginFrame(); pc.record(50); pc.record(1); pc.record(1);
    expect([pc.scene, pc.gbuffer, pc.post]).toEqual([50, 0, 2]);
  });
  it('attach wraps render/shadowMap.render and restores them', () => {
    const r = {
      info: { render: { calls: 0, triangles: 0 } },
      shadowMap: { render() { r.info.render.calls += 7; } },
      render() { r.shadowMap.render(); r.info.render.calls += 20; },
    };
    const origRender = r.render, origShadow = r.shadowMap.render;
    const pc = new PassCounter();
    const detach = pc.attach(r as never);
    pc.beginFrame(); r.render();
    expect([pc.shadow, pc.scene]).toEqual([7, 20]);
    detach();
    expect(r.render).toBe(origRender); expect(r.shadowMap.render).toBe(origShadow);
  });
});
