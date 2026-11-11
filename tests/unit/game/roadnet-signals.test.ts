import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@/core/Math2';
import { Rng } from '@/core/Rng';
import { TrafficAgent } from '@/entities/TrafficAgent';
import { SIGNAL_TIMING, TrafficLights } from '@/game/TrafficLights';
import core from '@/world/data/roadnet-core.json';
import controls from '@/world/data/roadnet-controls.json';
import { buildGrid, loadBedstuyData } from '@/world/Grid';
import { clusterId, junctionClusters, outerLegs } from '@/world/roadnet/clusters';
import type { RoadNetJson } from '@/world/roadnet/codec';
import { deriveGeometry } from '@/world/roadnet/derive';
import { buildLaneGraphDetailed } from '@/world/roadnet/lanes';
import { RealTrafficLights } from '@/world/roadnet/lightsReal';
import { RoadNet, roadNetFromGrid } from '@/world/roadnet/RoadNet';
import { approachLegs, nodeControl, signalGroups } from '@/world/roadnet/signalPhases';
import type { Body2D, IVehicle, IWorld2D, VehicleInput } from '@/world/types';

const grid = buildGrid(loadBedstuyData());
const gridNet = roadNetFromGrid(grid);
const gridD = deriveGeometry(gridNet);
const realNet = RoadNet.fromJson(core as unknown as RoadNetJson);
const realD = deriveGeometry(realNet);
const realControl = nodeControl(realNet, controls);
const realClusters = junctionClusters(realNet, realD);

const matched = (controls as unknown as { nodes: Record<string, { control: string }> }).nodes;

describe('nodeControl: data confirms, class infers', () => {
  it('on the grid adapter it agrees with signals.ts (any avenue signalises) for every junction', () => {
    const c = nodeControl(gridNet, {});
    gridNet.nodes.forEach((n, v) => {
      if (gridNet.incident[v].length < 3) return;
      expect(c[v] === 'signal').toBe(n.control === 'signal');
    });
  });

  it('never demotes a matched node: every node the controls file matched stays a signal', () => {
    const ids = Object.keys(matched).filter((k) => matched[k].control === 'signal').map(Number);
    expect(ids.length).toBeGreaterThanOrEqual(93);
    for (const v of ids) expect(realControl[v]).toBe('signal');
  });

  it('adds signals only where an at-grade avenue or arterial meets a real junction; the rest is an all-way stop', () => {
    let inferred = 0;
    let stops = 0;
    realNet.nodes.forEach((_, v) => {
      if (matched[String(v)]?.control === 'signal') return;
      const legs = realNet.incident[v].map((e) => realNet.edges[e]).filter((e) => e.level === 0 && e.cls !== 'ped');
      const ave = legs.some((e) => e.cls === 'avenue' || e.cls === 'arterial');
      const want = legs.length >= 3 && ave;
      expect(realControl[v] === 'signal').toBe(want);
      if (want) inferred++; else stops++;
    });
    expect(inferred).toBeGreaterThan(50);
    expect(stops).toBeGreaterThan(50);
    expect(realControl).toHaveLength(realNet.nodes.length);
  });
});

describe('signalGroups', () => {
  const groupsOf = (cluster: number[]): number[][] => signalGroups(realNet, realD, cluster);

  it('2 groups normally, 3 for clusters of 5 or more legs; groups partition the approach legs', () => {
    let fiveUp = 0;
    let checked = 0;
    for (const c of realClusters) {
      const legs = approachLegs(realNet, realD, c);
      if (legs.length < 3) continue;
      const g = groupsOf(c);
      expect(g.flat().sort((a, b) => a - b)).toEqual(legs);
      expect(g.length).toBe(legs.length >= 5 ? 3 : 2);
      if (legs.length >= 5) fiveUp++;
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    expect(fiveUp).toBeGreaterThanOrEqual(3);
  });

  it('opposite legs (within 30 deg of 180) share a group on a plain four-way', () => {
    let seen = 0;
    for (const c of realClusters) {
      const legs = approachLegs(realNet, realD, c);
      if (legs.length !== 4) continue;
      const g = groupsOf(c);
      for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
          let dd = Math.abs(realD.legs[legs[i]].angle - realD.legs[legs[j]].angle) % (2 * Math.PI);
          if (dd > Math.PI) dd = 2 * Math.PI - dd;
          if (Math.abs(dd - Math.PI) < 0.3) {
            const gi = g.findIndex((x) => x.includes(legs[i]));
            expect(g[gi]).toContain(legs[j]);
            seen++;
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('Broadway x Myrtle and Broadway x Malcolm X x Lexington are three-phase', () => {
    const named = (a: string, b: string): number[] | undefined => realClusters.find((c) => {
      const names = new Set(approachLegs(realNet, realD, c).map((l) => realNet.edges[realD.legs[l].edge].name));
      return names.has(a) && names.has(b) && approachLegs(realNet, realD, c).length >= 5;
    });
    const bm = named('Broadway', 'Myrtle Ave');
    expect(bm).toBeDefined();
    expect(groupsOf(bm!)).toHaveLength(3);
    const ml = named('Broadway', 'Malcolm X Blvd');
    expect(ml).toBeDefined();
    expect(groupsOf(ml!)).toHaveLength(3);
  });

  it('the main street (avenue or arterial) is group 0 whenever the cluster mixes classes', () => {
    for (const c of realClusters) {
      const g = groupsOf(c);
      if (g.length < 2) continue;
      const ave = g.map((x) => x.some((l) => ['avenue', 'arterial'].includes(realNet.edges[realD.legs[l].edge].cls)));
      if (ave.includes(true)) expect(ave[0]).toBe(true);
    }
  });
});

describe('RealTrafficLights', () => {
  const lights = new RealTrafficLights(realNet, realD, realControl);

  it('signalises the clusters the ruling says (>= 93 matched nodes), one controller per cluster', () => {
    const signalNodes = realControl.filter((c) => c === 'signal').length;
    expect(signalNodes).toBeGreaterThanOrEqual(93);
    expect(lights.intersectionIds.length).toBeGreaterThan(90);
    expect(lights.intersectionIds.length).toBeLessThanOrEqual(signalNodes);
    const all = new Set(realClusters.map(clusterId));
    for (const id of lights.intersectionIds) expect(all.has(id)).toBe(true);
    // a matched node is only left out when it has fewer than two phase groups (a mid-block or two-leg signal)
    for (const c of realClusters) {
      if (!c.some((v) => realControl[v] === 'signal') || lights.hasSignal(clusterId(c))) continue;
      expect(signalGroups(realNet, realD, c).length).toBeLessThan(2);
    }
  });

  it('never two conflicting greens: at most one group is green or yellow at any time, all-red between', () => {
    const l = new RealTrafficLights(realNet, realD, realControl, 0);
    let sawAllRed = 0;
    for (let t = 0; t < 400; t += 0.5) {
      for (const st of l.state()) {
        const live = st.groups.filter((g) => g.phase !== 'red');
        expect(live.length).toBeLessThanOrEqual(1);
        if (live.length === 0) sawAllRed++;
      }
      l.update(0.5);
    }
    expect(sawAllRed).toBeGreaterThan(100);
  });

  it('cycle = sum of (green + yellow + all red); every group gets its green exactly once', () => {
    const T = SIGNAL_TIMING;
    for (const id of lights.intersectionIds) {
      const n = lights.groupCount(id);
      expect(n).toBeGreaterThanOrEqual(2);
      const cycle = lights.cycleLength(id);
      expect(cycle).toBeGreaterThanOrEqual(n * (T.yellow + T.allRed + 25));
      expect(cycle).toBeLessThanOrEqual(n * (T.yellow + T.allRed + 45));
      const l = new RealTrafficLights(realNet, realD, realControl, 0);
      const greens = new Array<number>(n).fill(0);
      const prev = new Array<string>(n).fill('red');
      for (let t = 0; t < cycle * 2; t += 0.25) {
        const st = l.stateOf(id)!;
        st.groups.forEach((g, i) => { if (g.phase === 'green' && prev[i] !== 'green') greens[i]++; prev[i] = g.phase; });
        l.update(0.25);
      }
      // the clock may start mid-green, so each group turns green once or twice in two cycles
      greens.forEach((g) => { expect(g).toBeGreaterThanOrEqual(1); expect(g).toBeLessThanOrEqual(3); });
    }
  });

  it('green wave: offsets differ along the avenue and are coherent with the grid formula', () => {
    const offsets = lights.intersectionIds.map((id) => lights.offsetOf(id));
    expect(new Set(offsets.map((o) => Math.round(o))).size).toBeGreaterThan(20);
    for (const id of lights.intersectionIds) expect(lights.localTime(id)).toBeGreaterThanOrEqual(0);
  });

  it('phaseFor by street id equals the leg answer, and the most restrictive answer when a street spans two groups', () => {
    let ambiguous = 0;
    let total = 0;
    for (const id of lights.intersectionIds) {
      const cluster = realClusters.find((c) => clusterId(c) === id)!;
      const bySt = new Map<string, number[]>();
      for (const leg of approachLegs(realNet, realD, cluster)) {
        const sid = realNet.streetIdOf(realD.legs[leg].edge);
        bySt.set(sid, [...(bySt.get(sid) ?? []), lights.groupOfLeg(id, leg)]);
      }
      for (const [sid, gs] of bySt) {
        total++;
        if (new Set(gs).size > 1) { ambiguous++; continue; }
        const leg = approachLegs(realNet, realD, cluster).find((l) => realNet.streetIdOf(realD.legs[l].edge) === sid)!;
        expect(lights.phaseFor(id, sid)).toBe(lights.phaseForLeg(id, leg));
      }
    }
    // streets that bend or fork inside a junction are rare
    expect(ambiguous / total).toBeLessThan(0.1);
  });

  it('unsignalised clusters are always green and walk; a stop-controlled cluster has no controller', () => {
    expect(lights.phaseFor('n999999', 'x')).toBe('green');
    expect(lights.walkFor('n999999', 'x')).toBe(true);
    const stopOnly = realClusters.find((c) => c.every((v) => realControl[v] === 'stop') && approachLegs(realNet, realD, c).length >= 3)!;
    expect(lights.hasSignal(clusterId(stopOnly))).toBe(false);
  });

  it('pedestrians: WALK only while parallel traffic has green, flash after, never during a crossing car phase', () => {
    for (const id of lights.intersectionIds.slice(0, 40)) {
      const l = new RealTrafficLights(realNet, realD, realControl, 0);
      const n = lights.groupCount(id);
      let walks = 0;
      for (let t = 0; t < lights.cycleLength(id) * 2; t += 0.5) {
        const st = l.stateOf(id)!;
        st.groups.forEach((g, i) => {
          if (g.walk !== 'dont') {
            // the group that owns the walk window is the next one, and it is green then
            expect(st.groups[(i + 1) % n].phase).toBe('green');
            expect(g.phase).toBe('red');
          }
          if (g.walk === 'walk') walks++;
        });
        l.update(0.5);
      }
      expect(walks).toBeGreaterThan(0);
    }
  });

  it('same public surface as the grid controller (phaseFor, walkFor, secondsUntilGreen, phaseTimeLeft, update, clock)', () => {
    const l = new RealTrafficLights(realNet, realD, realControl, 5);
    const id = l.intersectionIds[0];
    const leg = l.groupsOf(id)[0][0];
    const sid = realNet.streetIdOf(realD.legs[leg].edge);
    expect(l.clock).toBe(5);
    l.update(1.5);
    expect(l.clock).toBeCloseTo(6.5, 6);
    for (const f of [l.phaseFor(id, sid)]) expect(['green', 'yellow', 'red']).toContain(f);
    expect(typeof l.walkFor(id, sid)).toBe('boolean');
    expect(l.secondsUntilGreen(id, sid)).toBeGreaterThanOrEqual(0);
    expect(l.phaseTimeLeft(id, sid)).toBeGreaterThan(0);
    // time to the next green is consistent with the phase
    const w = l.secondsUntilGreenLeg(id, leg);
    if (l.phaseForLeg(id, leg) === 'green') expect(w).toBe(0);
    else {
      const l2 = new RealTrafficLights(realNet, realD, realControl, l.clock);
      l2.update(w + 0.01);
      expect(l2.phaseForLeg(id, leg)).toBe('green');
    }
  });

  it('on the grid adapter it signalises the same intersections as TrafficLights', () => {
    const gl = new RealTrafficLights(gridNet, gridD, nodeControl(gridNet, {}));
    const old = new TrafficLights(grid);
    expect(gl.intersectionIds.length).toBe(old.intersectionIds.length);
  });
});

// ---------------------------------------------------------------- headless driving (TrafficAgent on the new graph)

class SimWorld implements IWorld2D {
  readonly list: Body2D[] = [];
  addStatic(): Body2D { throw new Error('unused'); }
  addBody(b: Body2D): void { this.list.push(b); }
  removeBody(id: string): void { const i = this.list.findIndex((b) => b.id === id); if (i >= 0) this.list.splice(i, 1); }
  step() { return []; }
  queryCircle(c: Vec2, r: number): Body2D[] {
    const out: Body2D[] = [];
    for (const b of this.list) if (Math.hypot(b.pos.x - c.x, b.pos.z - c.z) <= r + 2) out.push(b);
    return out;
  }
  raycast(from: Vec2, dir: Vec2, maxDist: number, ignoreId?: string) {
    let best: { body: Body2D; dist: number; point: Vec2 } | null = null;
    for (const b of this.list) {
      if (b.id === ignoreId) continue;
      const rx = b.pos.x - from.x;
      const rz = b.pos.z - from.z;
      const t = rx * dir.x + rz * dir.z;
      if (t < 0 || t > maxDist + 2) continue;
      const off = Math.abs(rx * -dir.z + rz * dir.x);
      if (off > 1.5) continue;
      const dist = Math.max(0, t - 1.2);
      if (dist > maxDist) continue;
      if (!best || dist < best.dist) best = { body: b, dist, point: { x: from.x + dir.x * dist, z: from.z + dir.z * dist } };
    }
    return best;
  }
  bodies() { return this.list; }
}

function simCar(id: string, x: number, z: number, heading: number) {
  let speed = 0;
  const body: Body2D = {
    id, kind: 'vehicle', shape: { kind: 'obb', halfW: 0.9, halfL: 2.2 },
    pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 1400,
  };
  const v = {
    id, object3D: new THREE.Group(), body,
    spec: { type: 'sedan' as const, length: 4.4, width: 1.8, height: 1.5, maxSpeed: 30, accel: 6, brakeDecel: 10, maxSteer: 0.6, color: '#fff' },
    get speed() { return speed; },
    damage: 0, driver: 'traffic' as IVehicle['driver'], siren: false,
    last: null as VehicleInput | null,
    setSpeed(s: number) { speed = s; },
    setInput(i: VehicleInput) { v.last = { ...i }; },
    doorPos() { return { x: body.pos.x, z: body.pos.z }; },
    update() {}, dispose() {},
  };
  body.userData = v;
  return v;
}

/** same integration as trafficsim.test.ts */
function stepCar(v: ReturnType<typeof simCar>, dt: number): void {
  const i = v.last;
  if (!i) return;
  let sp = v.speed;
  if (i.brake) sp = Math.max(0, sp - 10 * dt); else sp = Math.max(0, sp + i.throttle * 6 * dt);
  v.setSpeed(sp);
  const b = v.body;
  b.heading += (sp / 2.6) * Math.tan(i.steer * 0.5) * dt;
  b.pos.x += Math.sin(b.heading) * sp * dt;
  b.pos.z += -Math.cos(b.heading) * sp * dt;
  b.vel.x = Math.sin(b.heading) * sp;
  b.vel.z = -Math.cos(b.heading) * sp;
}

describe('driving on the grid adapter graph (copy of the trafficsim red-light scenario)', () => {
  const build = buildLaneGraphDetailed(gridNet, gridD);
  const lightsFor = (t0: number) => new RealTrafficLights(gridNet, gridD, nodeControl(gridNet, {}), t0);

  it('cars never enter a signalised intersection on a red light (8 drivers, 5 minutes each)', () => {
    let passes = 0;
    const violations: string[] = [];
    const southThroop = build.chains.filter((c) => gridNet.streetIdOf(c.edge) === 'throop' && Math.abs(Math.abs(build.graph.nodes[c.nodeIds[0]].heading) - Math.PI) < 0.1);
    expect(southThroop.length).toBeGreaterThan(0);
    const stops = Object.values(build.graph.nodes).filter((n) => n.stopLine && n.intersectionId);
    for (let seed = 1; seed <= 8; seed++) {
      const lights = lightsFor(seed * 11);
      const startId = southThroop[0].nodeIds[0];
      const sn = build.graph.nodes[startId];
      const v = simCar(`v${seed}`, sn.pos.x, sn.pos.z, sn.heading);
      v.setSpeed(8);
      const agent = new TrafficAgent(v as unknown as IVehicle, build.graph, new SimWorld(), new Rng(seed), {
        startNodeId: startId, lights: lights as unknown as TrafficLights,
        speedForStreet: (sid) => (grid.streetById(sid).class === 'avenue' ? 13 : 11),
      });
      const near = new Set<string>();
      const dt = 1 / 20;
      for (let t = 0; t < 300; t += dt) {
        agent.update(dt);
        stepCar(v, dt);
        lights.update(dt);
        for (const n of stops) {
          const d = Math.hypot(n.pos.x - v.body.pos.x, n.pos.z - v.body.pos.z);
          if (d < 1.5 && v.speed > 1) {
            if (!near.has(n.id)) {
              near.add(n.id);
              passes++;
              if (lights.phaseFor(n.intersectionId!, n.streetId) === 'red') violations.push(`${seed}@${t.toFixed(0)} ${n.id}`);
            }
          } else if (d > 6) near.delete(n.id);
        }
      }
    }
    expect(passes).toBeGreaterThan(8);
    expect(violations).toEqual([]);
  });
});

describe('driving on the real core (120 agents, 10 minutes, headless)', () => {
  it('keeps every car on the road and gets nearly all of them through', () => {
    const build = buildLaneGraphDetailed(realNet, realD);
    const g = build.graph;
    const lights = new RealTrafficLights(realNet, realD, realControl, 0);
    const world = new SimWorld();
    const rng = new Rng(2024);
    const starts = build.chains.filter((c) => c.startKind !== 'stub' && c.endKind !== 'stub');
    const pickStart = (taken: Vec2[]): string => {
      for (let tries = 0; tries < 200; tries++) {
        const c = starts[Math.floor(rng.next() * starts.length)];
        const i = Math.min(c.nodeIds.length - 2, 1 + Math.floor(rng.next() * Math.max(1, c.nodeIds.length - 2)));
        const n = g.nodes[c.nodeIds[Math.max(0, i)]];
        if (taken.every((p) => Math.hypot(p.x - n.pos.x, p.z - n.pos.z) > 12)) return n.id;
      }
      return g.nodes[starts[0].nodeIds[0]].id;
    };
    interface Slot { v: ReturnType<typeof simCar>; agent: TrafficAgent; still: number; stuckFlag: boolean }
    const speedFor = (sid: string): number => {
      const e = realNet.edges[realNet.streetEdges(sid)[0]];
      return e && (e.cls === 'avenue' || e.cls === 'arterial') ? 13 : 11;
    };
    const make = (i: number, startId: string): Slot => {
      const n = g.nodes[startId];
      const v = simCar(`c${i}`, n.pos.x, n.pos.z, n.heading);
      v.setSpeed(6);
      const agent = new TrafficAgent(v as unknown as IVehicle, g, world, new Rng(1000 + i), {
        startNodeId: startId, lights: lights as unknown as TrafficLights, speedForStreet: speedFor,
      });
      return { v, agent, still: 0, stuckFlag: false };
    };
    const slots: Slot[] = [];
    const taken: Vec2[] = [];
    for (let i = 0; i < 120; i++) {
      const id = pickStart(taken);
      taken.push(g.nodes[id].pos);
      const s = make(i, id);
      slots.push(s);
      world.addBody(s.v.body);
    }
    const dt = 0.1;
    const STUCK_AFTER = 120; // s standing still
    let off = 0;
    let offSamples = 0;
    let stuckAgentSeconds = 0;
    const everStuck = new Set<number>();
    let respawns = 0;
    const offAt: string[] = [];
    // lane areas inside paved polygons count as road at junctions (isOnRoad only knows a disc around the node)
    const nodePolys = realD.nodePolys.map((poly) => {
      let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
      for (const p of poly) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); e = Math.max(e, p.z); }
      return { poly, box: [a, b, c, e] as const };
    });
    const inPoly = (p: Vec2): boolean => {
      for (const q of nodePolys) {
        if (q.poly.length < 3 || p.x < q.box[0] || p.x > q.box[2] || p.z < q.box[1] || p.z > q.box[3]) continue;
        let inside = false;
        for (let i = 0, j = q.poly.length - 1; i < q.poly.length; j = i++) {
          const pi = q.poly[i], pj = q.poly[j];
          if ((pi.z > p.z) !== (pj.z > p.z) && p.x < ((pj.x - pi.x) * (p.z - pi.z)) / (pj.z - pi.z) + pi.x) inside = !inside;
        }
        if (inside) return true;
      }
      return false;
    };
    let steps = 0;
    for (let t = 0; t < 600; t += dt, steps++) {
      lights.update(dt);
      slots.forEach((s, i) => {
        s.agent.update(dt);
        stepCar(s.v, dt);
        const b = s.v.body;
        if (s.v.speed < 0.3) s.still += dt; else { s.still = 0; s.stuckFlag = false; }
        if (s.still > STUCK_AFTER) { stuckAgentSeconds += dt; everStuck.add(i); s.stuckFlag = true; }
        // a car that reached a stub (lane end with nowhere to go) is respawned elsewhere, as the traffic system would
        const tgt = s.agent.target;
        if (tgt && g.adjacency[tgt.id].length === 0 && Math.hypot(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z) < 4) {
          world.removeBody(b.id);
          const ns = make(i, pickStart(slots.filter((_, k) => k !== i).map((o) => o.v.body.pos)));
          slots[i] = ns;
          world.addBody(ns.v.body);
          respawns++;
        }
        if (steps % 10 === 0) {
          offSamples++;
          const p = slots[i].v.body.pos;
          if (!realNet.isOnRoad(p) && !inPoly(p)) { off++; if (offAt.length < 8) offAt.push(`c${i}@${t.toFixed(0)} (${p.x.toFixed(0)},${p.z.toFixed(0)}) ${realNet.streetNameAt(p)}`); }
        }
      });
    }
    const agentSeconds = 120 * 600;
    // eslint-disable-next-line no-console
    console.log('WP2 sim', JSON.stringify({ agents: 120, seconds: 600, respawns, offSamples, off, stuckAgentSeconds: +stuckAgentSeconds.toFixed(0), everStuck: everStuck.size, stuckFrac: +(stuckAgentSeconds / agentSeconds).toFixed(4) }));
    expect(offAt).toEqual([]);
    expect(off).toBe(0);
    expect(stuckAgentSeconds / agentSeconds).toBeLessThan(0.01);
  }, 120_000);
});

describe('contract', () => {
  it('every stop-line intersection id is a signalled controller or a stop cluster of the same ids', () => {
    const build = buildLaneGraphDetailed(realNet, realD);
    const lights = new RealTrafficLights(realNet, realD, realControl);
    const ids = new Set(Object.values(build.graph.nodes).filter((n) => n.stopLine).map((n) => n.intersectionId!));
    for (const id of lights.intersectionIds) expect(ids.has(id)).toBe(true);
    const clusters = new Set(realClusters.map(clusterId));
    for (const id of ids) expect(clusters.has(id)).toBe(true);
    expect(outerLegs(realNet, realD, realClusters[0])).toBeInstanceOf(Array);
  });
});
