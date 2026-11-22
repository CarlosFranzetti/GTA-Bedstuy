# TUTORIAL: the mini tutorial (lane TUTORIAL, 22 Nov 2026)

Owner, 22 Nov: "I also want a mini tutorial." Gameplay and interface programmer: Marisol Quade (TUTORIAL).

Status: IN PROGRESS. Notes are kept current; the last section says what is verified.

## Plan and where things are
- `src/ui/tutorial/` (new): `types.ts`, `steps.ts` (the steps as data), `engine.ts` (pure step engine), `resolve.ts` (tokens to key caps from `Bindings`),
  `card.ts` + `tutorial.css` (the card), `hints.ts` (one-time hints), `store.ts` (what is remembered), `context.ts` (the host the game hands over),
  `Tutorial.ts` (the one class main.ts builds), `rows.ts` (the two pause-menu rows), `index.ts`.
- Small exact edits elsewhere: `src/core/Input.ts` (`pressCount(code)`: how often an action was pressed, never consumed), `src/ui/Menu.ts` (`gameRows` option).
- main.ts: a diff file for the lead (see the last section).
