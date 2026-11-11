#!/usr/bin/env bash
# Release gate (ENGINE, Stage 14 Phase 0). Fable runs this before publishing the web build, the artifact or a native tag.
# Usage: scripts/gate.sh [--skip-render] [--tiers phone,low,medium] [--logs <dir>]
#   --skip-render   skip the headless-browser steps (smoke, gameplay, perf budgets); the table marks them SKIP and the gate
#                   cannot pass with skips (exit 2), so use it only for a quick pre-check.
# Browser steps go through scripts/swarm-render.sh (render lock), one at a time. Exit 0 only when every row is PASS.
# Steps (each logs to <logs>/<step>.log):
#   tsc        tsc --noEmit; FAIL on any error in src/ (errors only under tests/ are reported, not failing)
#   vitest     full unit suite, --maxWorkers=2
#   build      npm run build (single-file) -> dist/
#   artifact   node scripts/make-artifact.mjs -> dist/artifact.html, <= 12 MB
#   hosted     VITE_HOSTED=1 vite build -> dist-hosted/
#   native     npm --prefix native test (Electron shell unit tests)
#   smoke      tests/e2e/smoke.mjs on dist/: WebGL2 up and errors []
#   gameplay   scripts/playtest/live-gameplay.cjs on dist-hosted/: every check PASS
#   perf       scripts/perf-breakdown.mjs on dist/: triangles and draws <= TIER_BUDGET at views 1, 4, 10 per tier
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
SKIP_RENDER=0; TIERS="phone,low,medium"; LOGS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-render) SKIP_RENDER=1 ;;
    --tiers) TIERS="$2"; shift ;;
    --logs) LOGS="$2"; shift ;;
    *) echo "unknown option $1" >&2; exit 64 ;;
  esac; shift
done
[ -n "$LOGS" ] || LOGS="$(mktemp -d "${TMPDIR:-/tmp}/gate.XXXXXX")"
mkdir -p "$LOGS"
NAMES=(); STATES=(); NOTES=()
row() { NAMES+=("$1"); STATES+=("$2"); NOTES+=("$3"); printf '[gate] %-9s %-4s %s\n' "$1" "$2" "$3"; }
run() { local name="$1"; shift; local t0=$SECONDS; "$@" > "$LOGS/$name.log" 2>&1; local rc=$?; echo "$((SECONDS - t0))s" > "$LOGS/$name.time"; return $rc; }
secs() { cat "$LOGS/$1.time" 2>/dev/null; }
RENDER="$ROOT/scripts/swarm-render.sh"

# 1 typecheck (src must be clean)
run tsc npx tsc --noEmit
SRC_ERR=$(grep -cE '^src/.*error TS' "$LOGS/tsc.log"); TEST_ERR=$(grep -cE '^tests/.*error TS' "$LOGS/tsc.log")
if [ "$SRC_ERR" -eq 0 ]; then row tsc PASS "src clean, $TEST_ERR error(s) under tests/ ($(secs tsc))"; else row tsc FAIL "$SRC_ERR error(s) in src/ ($(secs tsc))"; fi

# 2 unit tests
run vitest npx vitest run --maxWorkers=2
SUM=$(grep -E '^\s+Tests\s' "$LOGS/vitest.log" | tail -1 | sed 's/^ *//')
if grep -qE '^\s+Tests\s.*failed' "$LOGS/vitest.log" || ! grep -qE '^\s+Tests\s' "$LOGS/vitest.log"; then row vitest FAIL "${SUM:-no summary, see log} ($(secs vitest))"; else row vitest PASS "$SUM ($(secs vitest))"; fi

# 3 single-file build + artifact size
if run build npm run build; then
  row build PASS "dist/ ($(secs build))"
  if run artifact node scripts/make-artifact.mjs; then row artifact PASS "$(grep -oE '\([0-9.]+ MB\)' "$LOGS/artifact.log" | tail -1) <= 12 MB"; else row artifact FAIL "$(tail -1 "$LOGS/artifact.log")"; fi
else row build FAIL "see $LOGS/build.log"; row artifact SKIP "no build"; fi

# 4 hosted build (web + native payload)
if VITE_HOSTED=1 run hosted npx vite build --outDir dist-hosted --emptyOutDir; then row hosted PASS "dist-hosted/ ($(secs hosted))"; else row hosted FAIL "see $LOGS/hosted.log"; fi

# 5 native shell tests
if [ -d native/node_modules ]; then
  if run native npm --prefix native test; then row native PASS "$(grep -E '^\s+Tests\s' "$LOGS/native.log" | tail -1 | sed 's/^ *//')"; else row native FAIL "see $LOGS/native.log"; fi
else row native FAIL "native/node_modules missing: npm run native:install"; fi

# 6-8 headless browser steps (render lock)
if [ "$SKIP_RENDER" = 1 ]; then
  row smoke SKIP "--skip-render"; row gameplay SKIP "--skip-render"; row perf SKIP "--skip-render"
else
  if [ -f dist/index.html ]; then
    run smoke "$RENDER" node tests/e2e/smoke.mjs
    if grep -q '"errors": \[\]' "$LOGS/smoke.log" && grep -q '"webgl2": true' "$LOGS/smoke.log"; then row smoke PASS "webgl2, errors [] ($(secs smoke))"; else row smoke FAIL "$(grep -m1 -E 'failed|error|timeout' "$LOGS/smoke.log" | cut -c1-90)"; fi
  else row smoke SKIP "no dist/"; fi
  if [ -f dist-hosted/index.html ]; then
    DIST="$ROOT/dist-hosted" run gameplay "$RENDER" node scripts/playtest/live-gameplay.cjs
    NP=$(grep -c '^PASS' "$LOGS/gameplay.log"); NF=$(grep -cE '^FAIL|SCRIPT FAIL|Target crashed' "$LOGS/gameplay.log")
    if [ "$NF" -eq 0 ] && [ "$NP" -gt 0 ]; then row gameplay PASS "$NP/$NP checks ($(secs gameplay))"; else row gameplay FAIL "$NP pass, $NF fail: $(grep -m1 -E '^FAIL|SCRIPT FAIL' "$LOGS/gameplay.log" | cut -c1-80)"; fi
  else row gameplay SKIP "no dist-hosted/"; fi
  if [ -f dist/index.html ]; then
    run perf "$RENDER" node scripts/perf-breakdown.mjs "$LOGS/perf.json" --q "$TIERS" --dist dist --port 4442
    VERDICT=$(npx tsx -e "
      import { readFileSync } from 'node:fs'; import { TIER_BUDGET } from './src/render/QualityTier.ts';
      const j = JSON.parse(readFileSync('$LOGS/perf.json', 'utf8')); const bad = []; const tiers = '$TIERS'.split(',');
      for (const t of tiers) { const rs = j.results.filter((r) => r.tier === t); if (rs.length < 3) bad.push(t + ': ' + rs.length + '/3 views');
        for (const r of rs) { const b = TIER_BUDGET[t]; if (r.info.triangles > b.triangles || r.info.total > b.draws) bad.push(t + ' v' + r.view + ' ' + Math.round(r.info.triangles / 1000) + 'k/' + r.info.total); } }
      console.log(bad.length ? 'FAIL ' + bad.join(', ') : 'PASS ' + tiers.join('/') + ' within TIER_BUDGET');" 2>&1 | tail -1)
    case "$VERDICT" in PASS*) row perf PASS "${VERDICT#PASS }" ;; *) row perf FAIL "${VERDICT#FAIL }" ;; esac
  else row perf SKIP "no dist/"; fi
fi

# table
echo; printf '%-9s | %-4s | %s\n' STEP RESULT DETAIL; printf -- '----------+--------+----------------------------------------\n'
FAIL=0; SKIP=0
for i in "${!NAMES[@]}"; do printf '%-9s | %-6s | %s\n' "${NAMES[$i]}" "${STATES[$i]}" "${NOTES[$i]}"; [ "${STATES[$i]}" = FAIL ] && FAIL=1; [ "${STATES[$i]}" = SKIP ] && SKIP=1; done
echo "logs: $LOGS"
if [ $FAIL = 1 ]; then echo "GATE: FAIL"; exit 1; fi
if [ $SKIP = 1 ]; then echo "GATE: INCOMPLETE (skipped steps)"; exit 2; fi
echo "GATE: PASS"; exit 0
