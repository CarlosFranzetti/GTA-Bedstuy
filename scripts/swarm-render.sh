#!/usr/bin/env bash
# Serialise heavy headless renders across swarm lanes: parallel swiftshader Chromiums starve each other
# (OOM kills, 120 s screenshot timeouts). Two slots: slot 1 is the original lock (older queued jobs keep
# waiting on it); slot 2 opens when slot 1 is busy, so a long playtest no longer blocks every capture.
# Usage: scripts/swarm-render.sh <command...>   — waits for a free slot, then runs the command.
BASE=/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/render.lock
mkdir -p "$(dirname "$BASE")"
for L in "$BASE" "$BASE.2"; do
  if flock -n "$L" true 2>/dev/null; then exec flock -w 7200 "$L" "$@"; fi
done
exec flock -w 7200 "$BASE.2" "$@"
