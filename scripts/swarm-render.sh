#!/usr/bin/env bash
# Serialise heavy headless renders across swarm lanes: parallel swiftshader Chromiums starve each other
# (OOM kills, 120 s screenshot timeouts). Two slots. A waiting job polls BOTH slots, so a free slot is
# never left idle while jobs queue on the other one.
# Usage: scripts/swarm-render.sh <command...>   — waits for a free slot (up to 2 h), then runs the command.
BASE=/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/render.lock
mkdir -p "$(dirname "$BASE")"
END=$((SECONDS + 7200))
while [ $SECONDS -lt $END ]; do
  for L in "$BASE" "$BASE.2"; do
    exec 9>"$L"
    if flock -n 9; then "$@"; exit $?; fi
    exec 9>&-
  done
  sleep $((2 + RANDOM % 4))
done
echo "swarm-render: no free slot in 2 h" >&2; exit 75
