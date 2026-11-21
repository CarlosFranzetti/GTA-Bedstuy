# GTA Bed-Stuy: instructions for any session in this repository

Read `MEMORY.md` before doing anything: it holds the owner's standing rules, how the studio works, where things are,
the deploy rules and the current state. Lane work also follows `docs/swarm/RULES.md`.

@MEMORY.md

## The few rules that matter most

- Style references only: no assets, fonts, logos, sounds or traced art from any game. Open and CC0 sources only, each
  recorded in `docs/CREDITS.md`. No Google Maps or Street View data.
- Only the lead edits `src/main.ts`. Never `git stash`. Keep `src/` compiling (`npx tsc --noEmit`).
- A commit message containing "work in progress" is NOT deployed; a plain message deploys to production. Do not write a
  plain message for work you have not verified in the running game.
- Headless full-game pages must hide the canvas, or the page is killed for memory. See MEMORY.md, "Builds and checks".
- Tell the owner what is verified and what is not. Never report frames per second from this box.
- Update `MEMORY.md` when a rule, a decision or the state changes.
