import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BODY_TYPES, bodyTypeId, type BodyTypeId } from '@/entities/models/pedBodyTypes';
import { dressLod, jointFor, parseShape } from '@/entities/models/pedMesh';
import { PED_SPECS } from '@/textures/painters/ped';

describe('body types', () => {
  it('has at least eight clearly different silhouettes and a wide height range', () => {
    const ids = Object.keys(BODY_TYPES) as BodyTypeId[];
    expect(ids.length).toBeGreaterThanOrEqual(10);
    // a silhouette signature: width at the shoulders, belly, hips and limb thickness
    const sig = (t: (typeof BODY_TYPES)[BodyTypeId]): number[] => [t.shoulders, t.chest + t.belly * 3, t.hips, t.arms, t.legs];
    let distinct = 0;
    for (let i = 0; i < ids.length; i++) { let far = true; for (let j = 0; j < i; j++) { const a = sig(BODY_TYPES[ids[i]]), b = sig(BODY_TYPES[ids[j]]); if (Math.max(...a.map((x, k) => Math.abs(x - b[k]))) < 0.08 && Math.abs(BODY_TYPES[ids[i]].h - BODY_TYPES[ids[j]].h) < 0.03) far = false; } if (far) distinct++; }
    expect(distinct).toBeGreaterThanOrEqual(8);
    const hs = ids.map((i) => BODY_TYPES[i].h);
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.25);
  });
  it('the street shows at least eight types among the civilians, picked stably per person', () => {
    const seen = new Set<string>();
    for (const s of PED_SPECS) if (s.role === 'civilian') { const t = bodyTypeId(s); seen.add(t); expect(bodyTypeId(s)).toBe(t); }
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect(bodyTypeId({ id: 'x', build: 'avg', sex: 'm', age: 'old', role: 'civilian' })).toBe('elder');
    expect(bodyTypeId({ id: 'x', build: 'avg', sex: 'm', age: 'kid', role: 'civilian' })).toBe('kid');
  });
  it('joints follow the type: shoulders move out with the shoulder width, legs with the hips, the spine stays put', () => {
    expect(jointFor('shoulderL', [-0.18, 1.4, 0], BODY_TYPES.broad)[0]).toBeLessThan(-0.18);
    expect(jointFor('hipL', [-0.09, 0.95, 0], BODY_TYPES.pear)[0]).toBeLessThan(-0.09);
    expect(jointFor('torso', [0, 1.1, 0], BODY_TYPES.heavy)).toEqual([0, 1.1, 0]);
  });
  it('dressing keeps the head, neck and hands bare and swells the torso of a puffer', async () => {
    const b = readFileSync('src/assets/models/people/ba_m.glb');
    const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const spec = PED_SPECS.find((p) => p.id === 'ba-puffer-braids')!;
    // bare legs (shorts): the trousered legs are rebuilt as tubes (pedLegs.ts, vertices renumbered), so this per-vertex comparison uses the unchanged topology
    const L = s.lods.hi, D = dressLod(s, { ...spec, body: 'avg', bottom: { ...spec.bottom, kind: 'shorts' as const } }, L, true);
    let headMoved = 0, handMoved = 0, torsoOut = 0, torsoN = 0;
    for (let i = 0; i < L.position.length / 3; i++) {
      const y = L.position[i * 3 + 1], dx = D.position[i * 3] - L.position[i * 3], dz = D.position[i * 3 + 2] - L.position[i * 3 + 2], d = Math.hypot(dx, dz);
      const w3 = [0, 1, 2, 3].reduce((a, k) => a + (L.joints[i * 4 + k] === 3 ? L.weights[i * 4 + k] : 0), 0);
      if (w3 > 0.95 && y > s.landmarks.chinY + 0.03 && d > 1e-5) headMoved++;
      if (y < s.rig.wristL[1] - 0.04 && Math.abs(L.position[i * 3]) > 0.3 && d > 1e-5) handMoved++;
      if (y > 1.2 && y < 1.35 && Math.abs(L.position[i * 3]) < 0.1 && L.joints[i * 4] === 2) { torsoN++; torsoOut += d; }
    }
    expect(headMoved).toBe(0); expect(handMoved).toBe(0);
    // round 3: the puffer's geometry baffles are a trace (they read as muscle ridges) and the trunk is flattened under cloth, so the mean swell is the cloth thickness only
    expect(torsoOut / Math.max(1, torsoN)).toBeGreaterThan(0.006);
    expect(D.index).toBe(L.index);
  });
});
