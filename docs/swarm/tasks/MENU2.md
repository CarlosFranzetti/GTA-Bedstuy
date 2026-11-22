# MENU2: one rule for every panel (lane MENU2, 22 Nov 2026)

Owner, 22 Nov: "revamp the entire menu system. It is a bit buggy with the mouse and having to use Esc to click things.
Figure out a more user friendly method with less chance of confusions or bugs and implement." And: "make sure the engine
on off option is in settings."

Status: IN PROGRESS (notes written early; sections are filled in as the work lands).

## Defects found (from the code; the browser run is below where it could be done)

1. A click inside any panel re-locks the pointer. `src/main.ts` has `overlay.addEventListener('mousedown', () => input.notifyGesture())`
   and `notifyGesture()` calls `requestLock()`. The pause menu, the phone, the shop and the map all live inside `overlay`, so
   the first mouse press on a row asks for pointer lock again. The cursor vanishes, later clicks land on the canvas and do
   nothing. The only way out is Esc, which the browser spends on leaving the lock. That is "having to use Esc to click things".
2. `Input.requestLock` only refuses while the title is up (`lockBlocked`). No panel counts.
3. Nothing stops game keys while a panel is open. The panels each swallow their own keys in their own capture handler (the
   phone lets WASD, F and Shift through on purpose), and the pause menu only freezes the simulation. Keys pressed with a panel
   open are recorded by `Input` and can fire as soon as the panel closes (held Space after Enter on a row: a jump on resume).
4. Esc has five owners: the menu (window, bubble), the shop, DJ, phone and map (document, capture), the radio list (only when
   focus is inside it), Credits and the rebinding capture. Which one answers depends on what has focus.
   The radio list opened from the menu (Settings, Radio library) is not a registered panel: it sets no body class, never releases
   the pointer and answers Esc only with focus inside it, otherwise Esc closes the menu underneath it.
5. After a browser lock exit the menu opens only if no `ui-panel-open` class is set; the pause menu has no such class itself.
6. Settings rows are staged ("pending") until APPLY, with Back asking "Discard?". Mouse players change a value, see nothing
   happen, leave. Audio sliders were already live; everything else was not.
7. Mouse hover moves the highlight only while the options column "has the zone" (`canHover`), and a click moves the zone: the
   keyboard highlight and the mouse hover can disagree about which row Enter acts on.
8. No right click. The browser's own context menu opens over the pause menu.
9. Resume re-locks the pointer only where main.ts asks (`onPause(false)`); closing the phone, map, shop or decks never does.
   Resume by Esc cannot re-lock (a browser gives no user gesture to the Esc key), and nothing tells the player.

## The rule (what the player is told)

Open a screen and the mouse is yours, the game waits. Click anything, or use keys or the pad: Back (Esc, B, right click)
goes up one step and the last Back resumes. Resume (the button, Start, or a click on the game) puts the mouse back in the game.

## Plan

- `src/ui/PanelManager.ts`: the stack of open panels, one Esc owner, the pointer policy, the input gate.
- `src/core/Input.ts`: `blocked` gate (keys, mouse, touch and pad buttons ignored, held keys cleared and suppressed until
  released), `requestLock` refuses while blocked.
- Menu: settings applied at once, grouped Game / Controls / Audio / Graphics / Map with a per-group reset that asks once,
  hover and keyboard share one focus, right click goes back, visible Resume and Back.
- Engine sound On / Off toggle above the slider.

(Results, tests and screenshots are added below as they exist.)
