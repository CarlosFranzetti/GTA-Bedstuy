# TUTORIAL: the mini tutorial (lane TUTORIAL, 22 Nov 2026)

Owner, 22 Nov: "I also want a mini tutorial." Gameplay and interface programmer: Marisol Quade (TUTORIAL).

Status: built, unit-tested, driven by a scripted player with the real systems on both maps, and run in the real game (hosted build, scratch copy
with the main.ts diff). Needs the main.ts diff to take effect. Not played by a person; no pad, no phone in hand. See "Not verified".

## What a player sees

A quiet card low on the screen (top centre on a phone): one line of instruction with the key drawn as a gold-outlined cap, one line of why, a
thin row of dots for progress, and "Skip tutorial" with its key. Near-black, gold, white, Barlow. It fades in and out, never moves, never takes the
pointer (the whole card is `pointer-events: none`; on a phone only the two small buttons take a tap). The game is live throughout. When a panel
opens (pause, map, phone, shop, decks), a room, a mission beat or the title is up, the card hides and its clock stops; it comes back where it was.

Each step is done by doing the thing; a small tick shows for under a second, then the next step. Not done in 20 s: the line repeats more plainly.
Not done in 45 s: the card offers to move on (Enter on a keyboard, a Next button on a phone; the pad is offered "D-pad down skips the tutorial").

It starts once: on a new game with no save, the moment the title is dismissed. It does not start when a save was loaded, and does not start again
on this device (a new game on the same machine) unless the player asks: Settings, Game, "Replay tutorial".

## The steps, in order (the order of what is near wins; a step whose thing is not near waits and comes back)

Text below is as drawn, with the default bindings (caps shown plain). Full list for pad and touch: `docs/swarm/tasks/TUTORIAL-text.txt`
(generated from the data, so it matches the code). Keys follow `src/core/Bindings.ts` and rebinding; the pad shows its own button names
(Xbox, PlayStation, generic); a phone shows the on-screen captions.

| id | keyboard and mouse | done when |
|---|---|---|
| look | Move the mouse to look around. | the view has turned about 60 degrees in total |
| walk | Hold W A S D to walk. | 8 m walked |
| run | Hold Shift while you walk to run. | 1 s at a sprint |
| jump | Press Space to jump. | the body leaves the ground |
| vault | Run at the hood of a parked car and press Space to go over it. | a vault starts. Offered only when a car is within 7 m, and takes the card when that holds for 0.6 s |
| car | Walk up to a car and press F to get in. | in a car. Offered when a car is within 30 m |
| drive | Hold W to drive. A and D steer. | 1.5 s above 4 m/s |
| brake | Hold S to brake. Tap Space for the handbrake. | both seen while moving |
| camera | Hold C to look behind. Press V to change the view. | C held 0.3 s and the view changed |
| radio | Press . for the next station and , for the previous one. (why: The stations are real mixes and live streams.) | both pressed (a phone has only the next-station button) |
| out | Press F to get out. | out of the car |
| pickup | Walk over the glow on the ground to pick it up. | the hands changed. Offered only when a pickup is within 45 m |
| action | Left click uses what is in your hands. Tab changes what you carry. | both pressed (a phone: ACT) |
| police | Minor trouble builds heat. Get seen too often and you are wanted. Stand still for an officer and you are busted. | 8 s (information) |
| phone | Press Up to open the phone. | the phone was opened |
| map | Press M for the map, then click a spot to drop a waypoint. | map or phone seen and a waypoint exists |
| pause | Press Esc to pause. Settings, Controls and Save are in there. (why: You can replay this tutorial from Settings, under Game.) | the pause menu was opened |
| home | The arrow at the top points to the nearest job. N points it at home, the green awning. | N pressed, or home within 15 m for 4 s, or 14 s |
Then one line, "That is the lot. The block is yours.", for 4.5 s, and it ends.

"home" is the `last` step: it is taken only when nothing else can be done now. Steps that never became available (no car was ever near) are
remembered; the first time the player gets into a car afterwards, the car steps that remain (drive, brake, camera, radio, out) come back once, with no
goodbye. Vault, pickup and car are never forced.

Rebinding changes the card. A step whose key has no binding at all (the player cleared it) moves on by itself after 2.5 s. The action step reads
Bindings and `src/game/combat/items.ts` only through the action ids (`attack`, `itemNext`), so COMBAT2's new items change nothing here; it teaches
"this button uses what is in your hands, this one cycles what you carry", as asked. (Re-read at the end: see "COMBAT2".)

## Skip, replay, hints

- Skip tutorial: Backspace (keyboard), D-pad down (pad), the button on the card (phone). One press ends it; police grace is then 20 s.
- Move on: Enter once the card offers it (45 s); a Next button on a phone.
- Replay tutorial: Settings, Game, "Replay tutorial". It closes the menu, forgets that the tutorial ran, and starts at once from the top. Works on a session
  that began from a loaded save too. It is a row passed to the menu as `gameRows` (small edit in `src/ui/Menu.ts`), sitting before Credits.
- Hints: Settings, Game, "Hints: On / Off". Each hint is shown once (7 s, same card, "Hint. You can turn hints off in Settings."), remembered. A hint waits
  for a panel to close and for a mission to end; none while the tutorial runs. The hints (text for every device in `TUTORIAL-text.txt`):
  first time wanted; first time in a shop (WAX DELI door); first record bought; first time at the decks (the HUD prompt names the turntables or the decks);
  first rain. "Jump: climb over" when pinned between cars is main.ts's own toast and stays.
- Remembered in `localStorage` under `gta-bedstuy.tutorial.v1`, next to the settings and key bindings: never in a save slot. A new game on the same machine
  does not replay anything unless the player asks. When a save is loaded at boot, neither the tutorial nor any hint is shown (the brief). That means a
  player who comes back to the autosave sees no hints from then on: the flag `hintsWithSave: true` on `new Tutorial({...})` turns hints back on for loaded
  saves if Fable wants them (default false, as asked).
- Police grace: `Tutorial` owns it. At construction with no save it sets 120 s (what main.ts did); while the tutorial runs it tops it up to 40 s every 5 s;
  after a finished run it leaves 60 s, after a skip 20 s. main.ts's two `setGrace(120)` lines are replaced by the diff (`tutorial.newGame()` for the new-game
  callback).
- The old touch first-run card (`TouchPrefs.TUTORIAL_KEY`, "gtabs.touchTutorialSeen"): on a new game the tutorial writes that key at construction, so
  the old card never shows over this one, and the key keeps working for everyone who already saw it. The old card still shows on a phone that loads a save
  and never saw it (unchanged).

## How it is built

- `src/ui/tutorial/steps.ts`: the steps as data (id, a line per device, plain line, why, `when`, `done`, `auto`, `opportunistic`, `last`). Add or reorder
  here; the engine does not change.
- `engine.ts`: pure, no DOM. Order, availability, completion, tick, plain and offer stages, skip, hiding (clock stands still), lapse (unavailable 4 s: back to
  the pool), opportunistic take-over (dwell 0.6 s), deferred ids. `resolve.ts`: tokens to caps from the binding table. `card.ts`, `tutorial.css`: the card.
  `hints.ts`, `store.ts`, `context.ts` (the small host main.ts hands over, and the per-frame snapshot), `Tutorial.ts` (the one class), `rows.ts`.
- Edits outside the folder: `src/core/Input.ts` (`pressCount(code)`: how often an action was pressed since the page loaded, from any device, never
  consumed: the tutorial cannot take edges the game needs); `src/ui/Menu.ts` (`gameRows` option, two lines). `src/core/Events.ts`: untouched (no new event).
- Heavy per-frame work (nearest car and pickup scan, hands signature) runs only while the tutorial runs or a car chapter is waiting.

## main.ts (for the lead)

`scratchpad/tutorial/main-tutorial.diff` (unified, `git apply --check` clean against the tree of 22 Nov, 15:5x). In short: import `Tutorial, tutorialRows` and
`getWaypoint`; remove `if (!saved) police.setGrace(120)`; build `const tutorial = new Tutorial({ root: overlay, events, police, loadedSave: !!saved, splashUp, host })`
after `radioUi`; pass `gameRows: tutorialRows(tutorial, () => menu.close())` to the Menu; `tutorial.update(frameDt)` after `missionHud.updatePointer(...)`;
`tutorial.newGame()` in the new-game callback; `afterApply: (kind) => { if (kind === 'load') tutorial.cancel(); ...}`; `tutorial` on `__gtaDebug`.
The one-time "your place is the green awning" toast (`showHomeHint`, 2.5 s after boot) is left as it is; on a new game it now appears over the first
step (top centre; the card is low or, on a phone, just under it). The lead may drop the toast on a new game if the overlap reads badly.

## Tests

- `tests/unit/ui/tutorial-engine.test.ts` (14): order, tick, goodbye, availability and coming back, lapse, last step and deferred, opportunistic vault,
  20 s and 45 s stages, move on, skip, hiding under a panel, panels seen while hidden, resume, info steps.
- `tests/unit/ui/tutorial-text.test.ts` (8): a line, a why and a plain line where given, for every step on every device; no exclamation marks, no em dash,
  no other game named; every token resolves with default bindings on foot and in a car on all three devices; follows rebinding and pad family; unbound reported.
- `tests/unit/ui/tutorial.test.ts` (31): start once on a new game, never on a loaded save, never again on this device, no storage, the old touch card key;
  the card (never takes the pointer, device switch mid-step, rebind redraws, hides under a panel or a room); skip keys; grace; Replay (also from a loaded
  save); the two rows; cancel; nothing written outside its own key; each hint once and across a restart, Hints Off, hints wait for panels; the car chapter.
- `tests/unit/sim/tutorial-sim.test.ts` (2): a scripted player with the REAL Player, Input (real key edges), Vehicle, World2D, binding table and Tutorial
  completes every step on the grid map (its real colliders) and on the real-street net (the real start spot). The car, the pickup and the exit spot are placed
  from where the player stands, never from a coordinate.
