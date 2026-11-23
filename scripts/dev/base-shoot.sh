#!/usr/bin/env bash
# BASE seat: the standard bare sheets (front, back, side) of eight people, plus women, at one level. Usage: scripts/dev/base-shoot.sh <outDir> <tag> [lod] [extra query]
set -e
OUT=$1; TAG=$2; LOD=${3:-hi}; EXTRA=${4:-}
cd "$(dirname "$0")/../.."
P='m:avg:adult,m:heavy:adult,m:slim:adult,m:broad:adult,f:avg:adult,f:pear:adult,m:elder:old,m:teen:teen,f:kid:kid'
export NODE_PATH=/opt/node-tools/node_modules:$PWD/node_modules
SWARM_SMALL=1 scripts/swarm-render.sh node scripts/dev/base-sheet.mjs "$OUT" --tag "$TAG" --query "naked=1&lod=$LOD&people=$P&sp=0.68&w=2200&h=700&vh=2.05$EXTRA" --views "front~yaw=0;back~yaw=3.1416;side~yaw=1.5708"
