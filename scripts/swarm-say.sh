#!/usr/bin/env bash
# Append a line to the shared swarm transcript. Usage: scripts/swarm-say.sh "<agent-name>" "<message>"
# Every agent writes here (start, decisions, questions to other agents, answers, final report) and reads it to answer others.
set -e
T="$(cd "$(dirname "$0")/.." && pwd)/docs/swarm/transcript.md"
printf '\n### %s · %s\n%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$T"
