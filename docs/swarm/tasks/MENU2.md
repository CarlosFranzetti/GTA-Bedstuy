# MENU2: one rule for every panel (lane MENU2, 22 Nov 2026)

Owner, 22 Nov: "revamp the entire menu system. It is a bit buggy with the mouse and having to use Esc to click things.
Figure out a more user friendly method with less chance of confusions or bugs and implement." And: "make sure the engine
on off option is in settings."

Status: built and driven in a real headless browser with a real mouse and keyboard (35 of 35 checks green at 1280 x 720 and at
640 x 360). Not seen by a person with a real pointer lock, pad or phone. Needs the `main.ts` diff (below) to take effect.

## Defects reproduced (headless Chromium, hosted build, `?map=grid&q=low`, real `page.mouse` and `page.keyboard`)

Headless Chromium does lock the pointer on a click or a key and does leave it on `document.exitPointerLock()`; a CDP Escape
press both reaches the page and drops the lock (a desktop Chrome swallows that first Esc: not reproduced, reasoned from the code).

1. A click on a menu row re-locks the pointer. Before: `requestPointerLock` fired twice on the first real click on the "Invert
   Look Y" row, `pointerlockchange` went free then LOCKED, the cursor was gone, the second click and a right click did nothing.
   Cause: `main.ts` has `overlay.addEventListener('mousedown', () => input.notifyGesture())`, `notifyGesture()` calls
   `requestLock()`, and every panel lives inside `overlay`. `Input.requestLock` only refused for the title screen.
   This is "having to use Esc to click things": Esc was the only way to get the cursor back.
2. Nothing closed the game's input while a panel was open. The phone lets WASD, F and Shift through on purpose; the menu only
   froze the simulation. A held key survived the panel and could fire on resume.
3. Esc had six owners (menu on window-bubble; shop, decks, phone, map on document-capture; credits and the rebinding capture on
   window-capture; the radio list only with focus inside it). The radio list opened from the menu had no body class, never
   released the pointer and, without focus, Esc closed the menu underneath it.
4. The pause menu opened after a browser lock exit only if no `ui-panel-open` class was set, and the map tab sets one itself.
5. Settings were staged until APPLY; Back asked "Discard?". A mouse player changed a value, saw nothing happen, left.
6. Hover moved the highlight on `mouseenter`, only while "the options column had the zone". A list that scrolls under a still
   mouse stole the focus from the keyboard.
7. No right click: the browser's own menu opened over the pause menu.
8. Closing the phone, map, shop or decks never gave the pointer back; the player had to click the canvas.
Not reproducible here: the real "Esc is eaten by the browser" sequence, alt-tab, a real pad, a real phone.

## The rule (what the player is told)

Open a screen and the mouse is yours and the game waits. Back (Esc, B, a right click or the Back button) goes up one step, and
the last Back resumes. Resume, from the button, Start or a click on the game, puts the mouse back in the game.

## What changed

- `src/ui/PanelManager.ts` (new): the stack of open panels. First panel to open: releases the pointer, closes the input gate.
  A lock that arrives while a panel is open is released again. Esc is handled here first (window capture), sent to the top
  panel's `back()`; with nothing open it opens the pause menu; a panel that is mid-rebind keeps its own Esc. Right click is Back
  (a touch long press is not). A browser lock exit with nothing open lands in the pause menu. When the last panel closes the
  gate opens (one tick later after a key, so the key is not also a game key) and the pointer goes back to the game if the closing
  gesture was a click or a key other than Esc (a browser gives Esc no user gesture; then the first click on the game locks).
- `src/core/Input.ts`: `blocked` gate. Closed: no keys, mouse buttons, wheel, look, touch or pad buttons, no lock request, no
  `mousedown` on the canvas. Held keys are dropped, and keys still held when it reopens are ignored until released (no jump on
  resume). `contextmenu` is prevented while closed.
- `src/ui/Menu.ts`, `menuRows.ts`, `menu.css`: no Apply step, every change applies and saves at once. Settings groups Game,
  Controls, Audio, Graphics, Map as chips; each group ends with "Reset <group> to defaults" that asks once (Back cancels).
  The chips share the one focus with the rows (Up from the first row reaches them, Left and Right change group). Hover moves
  the focus only when the mouse moves. Right click and the footer Back button go back; the header button says Resume.
  `Menu.back()` cancels a "press again" question or a rebinding first, then resumes. The pause menu sets `menu-open`
  (hides the location card like the other panels). Zones, pending changes, Apply, Defaults and Discard are gone.
- Engine sound On / Off: new "Engine sound" switch in Audio directly above the slider (renamed "Engine volume"). Off sets the
  mixer's engine to 0 (no engine voice is created, AUDIOFIX). On restores the level it had before it went Off (saved as
  `engineLast` in the existing settings key; 100% on the slider, the engine bus at its default 0.55, if none was saved).
  Dragging the slider to 0 turns the switch Off.
- Saved settings keys are unchanged (`gta-bedstuy.settings.v1` gains an optional `engineLast`; nothing is lost).
- `src/ui/panelKeys.ts`: `setPanelClass` also counts `menu-open` and `radio-open`.

## Where each device ends up

- Mouse: every row, chip, tab, arrow, bar (drag) and button clicks; the wheel scrolls lists; right click goes back.
- Keyboard: arrows or WASD, Enter or Space, Q and E tabs, Esc and Backspace back. Tab stays in the dialog.
- Pad: unchanged mapping (D-pad, A, B, LB, RB, Start). Start resumes from the menu, closes the top panel otherwise.
- Touch: the pause button opens it; rows, chips, arrows, Back and Resume are taps; a long press does nothing.

## Tests

- `tests/unit/ui/panel-manager.test.ts` (20): stack, gate, pointer release, Esc routing, repeat, keeps-Esc, lock exit,
  relock on click or key but not on Esc, touch, right click, insideOf, body-class observer; `Input` gate (held key, lock
  request, click); Menu + manager + Input together (a click on a row asks for no lock; Resume re-locks from its own click).
- `tests/unit/ui/menu.test.ts`, `menu-audio.test.ts`, `map-switch.test.ts` rewritten for the grouped, immediate model
  (53 + engine switch tests).
- Browser: `scratchpad/menu2/drive.cjs` (real mouse and keyboard, 35 checks; run at 1280x720 and 640x360, and an emulated
  iPhone 13 landscape with taps). Logs `run-desktop.log`, `run-small.log`, `run-phone.log`; shots in `shots/`, `shots-small/`,
  `shots-phone/`.

## Not verified

A real pointer lock in a desktop browser (the Esc swallow), alt-tab and lost-window lock exits, a real pad, a real phone, the
shop and decks panels in the browser (unit-level only: they register in `ensureAudio`), the pad on the radio list.
