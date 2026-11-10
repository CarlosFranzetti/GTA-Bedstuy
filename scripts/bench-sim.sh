#!/usr/bin/env bash
# CPU cost per fixed sim step in node (no browser): p50/p95/p99/max per system over 3000 steps of walking then driving.
cd "$(dirname "$0")/.." && BENCH_SIM=1 npx vitest run tests/unit/sim/bench-sim.test.ts --maxWorkers=1 --disableConsoleIntercept 2>&1 | grep -E "steps=|p50|steps >|✓|×|FAIL|Error|expected"
