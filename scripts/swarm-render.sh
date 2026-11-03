#!/usr/bin/env bash
# Serialise heavy headless renders across swarm lanes: the box has one GPU-less CPU pool, so parallel
# swiftshader Chromiums starve each other (OOM kills, 120 s screenshot timeouts).
# Usage: scripts/swarm-render.sh <command...>   — waits for the lock, then runs the command.
LOCK=/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/render.lock
mkdir -p "$(dirname "$LOCK")"
exec flock -w 7200 "$LOCK" "$@"
