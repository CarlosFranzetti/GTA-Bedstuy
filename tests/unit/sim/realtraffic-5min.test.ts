/**
 * REALTRAFFIC2: five simulated minutes of the unchanged TrafficSystem on the real street network, on two seeds, headless
 * (runner: realtraffic-run.ts). Same gates as tests/unit/sim/traffic-5min.test.ts, restated for the real map:
 * no gridlock, cars stay on the roadway and out of buildings, nobody runs a red light, pedestrians stay on sidewalks and
 * crosswalks and step off a signalised corner only on WALK, nobody is knocked down. Set RT_SECONDS / RT_OUT=file for a long
 * or diagnostic run.
 */
import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FULL_DENSITY } from '@/game/TrafficSystem';
import { runReal, STILL_MAX, type RealRun } from './realtraffic-run';

const env = (k: string): string | undefined => (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.[k];
const SECONDS = Number(env('RT_SECONDS') ?? 300);
const SEEDS = [7, 4242];

describe.each(SEEDS)('real map traffic, seed %i', (seed) => {
  let R: RealRun;
  beforeAll(() => { R = runReal(seed, SECONDS); if (env('RT_OUT')) writeFileSync(`${env('RT_OUT')}.${seed}.json`, JSON.stringify(R, null, 1)); }, 900_000);

  it('the adapter built real crossings, signals and parked cars', () => {
    expect(R.crossings).toBeGreaterThan(100);
    expect(R.signals).toBeGreaterThan(90);
    expect(R.parked).toBeGreaterThan(40);
  });

  it('population holds: moving cars near the target, pedestrians at the target', () => {
    expect(R.agentsSeen).toBeGreaterThan(60);
    expect(R.maxAgents).toBeGreaterThanOrEqual(25);
    expect(R.maxAgents).toBeLessThanOrEqual(Math.round(FULL_DENSITY.maxMoving * 1.6));
    expect(R.minAgentsAfterWarmup).toBeGreaterThanOrEqual(12);
    expect(R.pedTarget).toBe(FULL_DENSITY.peds);
    expect(R.pedMin).toBeGreaterThanOrEqual(Math.round(R.pedTarget * 0.9));
    expect(R.pedMax).toBeLessThanOrEqual(Math.round(R.pedTarget * 1.1) + 1);
  });

  it(`no gridlock: no moving car stands still for ${STILL_MAX} s outside a red light`, () => {
    expect(R.stuck).toEqual([]);
  });

  it('no red-light running at any signalised stop line', () => {
    expect(R.stopPasses).toBeGreaterThan(30);
    expect(R.redViolations).toEqual([]);
  });

  it('cars stay on the roadway and out of buildings', () => {
    expect(R.nonFinite).toEqual([]);
    expect(R.carSamples).toBeGreaterThan(500);
    expect(R.carInBuilding).toBe(0);
    expect(R.carOnKerb / R.carSamples).toBeLessThan(0.005);
  });

  it('pedestrians stay on sidewalks and crosswalks, out of buildings, and cross only on WALK', () => {
    expect(R.pedSamples).toBeGreaterThan(500);
    expect(R.pedInBuilding / R.pedSamples).toBeLessThan(0.0005);
    expect(R.pedOnRoad / R.pedSamples).toBeLessThan(0.005); // a walker pushed round a parked car that overhangs the sidewalk
    expect(R.pedStarts).toBeGreaterThan(3);
    expect(R.pedBadStarts).toEqual([]);
  });

  it('nobody is knocked down by traffic', () => {
    expect(R.knockedDown).toEqual([]);
  });

  it('reports', () => {
    // eslint-disable-next-line no-console
    console.log('REALTRAFFIC', JSON.stringify({ ...R, stuck: R.stuck.length, redViolations: R.redViolations.length, pedBadStarts: R.pedBadStarts.length, carDetail: undefined, pedDetail: undefined }));
  });
});
