#!/usr/bin/env bash
# FIT seat: dressed sheets of nine people (front, back, side). Usage: scripts/dev/fit-shoot.sh <outDir> <tag> [lod] [extra query] [people] [views]
# extra query examples: "&zoom=-1.0,1.3,0.7" for a close-up (centre x, y, view height in metres)
set -e
OUT=$1; TAG=$2; LOD=${3:-hi}; EXTRA=${4:-}
P=${5:-'m:avg:adult,m:heavy:adult,m:slim:adult,m:broad:adult,f:avg:adult,f:pear:adult,m:elder:old,m:teen:teen,f:kid:kid'}
V=${6:-"front~yaw=0;back~yaw=3.1416;side~yaw=0.6;"}
cd "$(dirname "$0")/../.."
export NODE_PATH=/opt/node-tools/node_modules:$PWD/node_modules
SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/base-sheet.mjs "$OUT" --tag "$TAG" --query "lod=$LOD&people=$P&sp=0.68&w=2200&h=700&vh=2.05$EXTRA" --views "$V"
