#!/usr/bin/env bash
# Runs the voice-pack bake in the background as a series of short light jobs (two shards at once, about nine minutes
# each) so the render queue's light slot is handed back between chunks and other lanes can interleave.
#   nohup setsid scripts/voice/bake-driver.sh > cache/voice-bake/driver.log 2>&1 &
#   touch cache/voice-bake/STOP        stop after the current chunk
#   node scripts/voice/bake-pack.mjs --status
# Stops by itself when both shards report nothing left to render or the pack budget is reached.
cd "$(dirname "$0")/../.." || exit 1
W=cache/voice-bake
LIMIT=${CHUNK_CLIPS:-40}
mkdir -p "$W"
rm -f "$W/STOP"
n=0
while [ ! -e "$W/STOP" ]; do
  n=$((n + 1))
  echo "[driver] chunk $n at $(date -u +%FT%TZ)"
  SWARM_LIGHT=1 scripts/swarm-render.sh bash -c "
    node scripts/voice/bake-pack.mjs --shard 0/2 --limit $LIMIT > $W/chunk-0.log 2>&1 &
    node scripts/voice/bake-pack.mjs --shard 1/2 --limit $LIMIT > $W/chunk-1.log 2>&1 &
    wait"
  cat "$W/chunk-0.log" "$W/chunk-1.log" >> "$W/bake.log"
  node scripts/voice/bake-pack.mjs --assemble > "$W/assemble.log" 2>&1
  stop=1
  for s in 0 1; do grep -q "nothing to do\|budget reached" "$W/chunk-$s.log" || stop=0; done
  [ $stop = 1 ] && { echo "[driver] nothing left to bake"; break; }
done
echo "[driver] done at $(date -u +%FT%TZ)"
