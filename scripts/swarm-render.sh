#!/usr/bin/env bash
# Serialise headless-browser jobs across swarm lanes: parallel swiftshader Chromiums starve each other
# (OOM kills, 120 s screenshot timeouts).
#
#   scripts/swarm-render.sh <command...>                  heavy job (the full game in a browser): two at a time, oldest first
#   SWARM_SMALL=1 scripts/swarm-render.sh <command...>    small job (a standalone showcase page, not the full game): two slots
#   SWARM_LIGHT=1 scripts/swarm-render.sh <command...>    light job (offline audio render, network probe, no WebGL): its own slot
#
# Heavy jobs queue by ticket, oldest first, so a lane cannot be starved by luckier pollers. A ticket whose process
# has died is ignored. Keep one job under about ten minutes: split long batches so others get a turn.
# Waits up to 2 h for a slot, then runs the command and returns its exit code.
ROOT=/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad
BASE=$ROOT/render.lock
mkdir -p "$ROOT"
END=$((SECONDS + 7200))

if [ -n "$SWARM_SMALL" ]; then  # standalone showcase pages (one character, one car, an icon sheet): never the full game
  while [ $SECONDS -lt $END ]; do
    for L in "$BASE.small" "$BASE.small2"; do
      exec 9>"$L"
      if flock -n 9; then "$@"; exit $?; fi
      exec 9>&-
    done
    sleep $((1 + RANDOM % 3))
  done
  echo "swarm-render: no free small slot in 2 h" >&2; exit 75
fi

if [ -n "$SWARM_LIGHT" ]; then
  while [ $SECONDS -lt $END ]; do
    exec 9>"$BASE.light"
    if flock -n 9; then "$@"; exit $?; fi
    exec 9>&-
    sleep $((1 + RANDOM % 3))
  done
  echo "swarm-render: no free light slot in 2 h" >&2; exit 75
fi

QDIR=$ROOT/render.queue
mkdir -p "$QDIR"
# SWARM_PRIORITY=1 (Fable only: an owner-reported bug) jumps the queue
TICKET="$QDIR/${SWARM_PRIORITY:+0}$(date +%s%N)-$$"
echo $$ > "$TICKET"
trap 'rm -f "$TICKET"' EXIT

# True when no live ticket is older than ours (file names sort by creation time).
first_in_line() {
  local t pid
  for t in "$QDIR"/*; do
    [ "$t" = "$TICKET" ] && return 0
    pid=$(cat "$t" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then return 1; fi
    rm -f "$t"
  done
  return 0
}

while [ $SECONDS -lt $END ]; do
  if first_in_line; then
    for L in "$BASE" "$BASE.2"; do  # two full-game pages at once: each MUST hide the game canvas (see docs/swarm/RULES.md) or it reaches 4 GB+
      exec 9>"$L"
      if flock -n 9; then rm -f "$TICKET"; "$@"; exit $?; fi
      exec 9>&-
    done
  fi
  sleep $((2 + RANDOM % 3))
done
echo "swarm-render: no free slot in 2 h" >&2; exit 75
