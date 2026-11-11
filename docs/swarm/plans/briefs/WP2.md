# WP2: lane graph and signal phases for the real map

Model: **sonnet**. Suggested worker: **Theo** (CARFIX, traffic AI root-causing). Parallel with WP3, WP4, WP5, WP10.
Read first: `_realmap-rules.md` (binding), realmap.md sections 3-4 (rows "Lane graph" and "Signals").

## Files owned (new)
- `src/world/roadnet/lanes.ts`, `src/world/roadnet/signalPhases.ts`, `src/world/roadnet/clusters.ts`, `src/world/roadnet/lightsReal.ts`
- `tests/unit/world/roadnet-lanes.test.ts`, `tests/unit/game/roadnet-signals.test.ts`

## Interfaces
```ts
// clusters.ts: nodes joined by ribbonless edges (rules section 6); singleton for every other node
export function junctionClusters(net: RoadNet, d: Derived): number[][];
// lanes.ts: the SAME LaneGraph type Grid.ts produces, so TrafficAgent / Cop / TrafficSystem need no change
export interface LaneOptions { laneOffset?: number /* 2.0 */; laneWidth?: number /* 3.0 */; maxSpacing?: number /* 15 */; turnStep?: number /* 3 */ }
export function buildLaneGraph(net: RoadNet, d: Derived, opts?: LaneOptions): LaneGraph;
// signalPhases.ts
export type ControlTruth = 'signal' | 'stop';
export function nodeControl(net: RoadNet, controlsJson: unknown): ControlTruth[];        // ruling below
export function signalGroups(net: RoadNet, d: Derived, cluster: number[]): number[][];  // approach legs per phase
// lightsReal.ts: same public surface as game/TrafficLights (phaseFor / walk state / update) keyed by cluster id `n{minNode}`
export class RealTrafficLights { constructor(net: RoadNet, d: Derived, control: ControlTruth[], startTime?: number); /* ... */ }
```
Lane rules: per edge and travel direction, lanes offset right of the centreline (two-way: `laneOffset`; one-way: spread
across `edge.lanes` at `laneWidth`); nodes every <= 15 m along the polyline (follow curves); `heading` from the local
tangent; `streetId = net.streetIdOf(e)`; stop-line node at `STOP_LINE` (contract) with `stopLine: true` and
`intersectionId = cluster id`; turn connectors from every entering lane to every legal exiting lane of the same cluster as
cubic Beziers sampled every 3 m (no U-turns; lane i maps to lane i on multi-lane one-ways; right turns from the rightmost lane
only). Stubs: lanes end (despawn point) / begin (spawn point). Respect `oneway`; `level != 0` edges (BQE) get lanes but no
connections to grade edges.

Signal ruling (Imani): **data confirms, class infers.** A node is `signal` if `roadnet-controls.json` matched it OR any at-grade
leg is avenue/arterial; otherwise (street x street) it is an **all-way stop**. Never demote a matched node. Phases: cluster
approach legs into groups by direction (opposite legs within 30 deg of 180 deg share a group); 2 groups normally, 3 for
5/6-leg clusters (Broadway x Myrtle, Broadway x Malcolm X x Lexington); timing from `SIGNAL_TIMING`.

## Tests / done
- On the grid adapter: lane node count within 5 % of `buildGrid(...).lanes`; every lane node reachable; the existing traffic
  sim tests' scenario (copy, don't edit theirs) passes with your graph injected.
- On the real core: every directed legal edge has lanes; strongly connected apart from stub sources/sinks; no connector
  crosses a block ring (`net.blockAt` on samples = -1 except within nodePolys); 5-leg clusters get 3 phases; >= 93 matched
  nodes stay signal; headless 10-minute sim of 120 agents: zero off-road samples (`net.isOnRoad`), < 1 % stuck.
- Rules section 1 self-check passes. FINAL with lane/connector counts and the sim numbers.
