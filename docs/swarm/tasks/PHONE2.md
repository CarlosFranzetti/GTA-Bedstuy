# PHONE2: what is weak about playing on a phone, and the fixes (Tavi Okonkwo)

Owner: "the phone is meh so let's fix that". Method: hosted build of the tree as found (commit c5fb1a0 plus the lanes' work),
headless Chromium with Playwright `devices['iPhone 13']`, 390x844 and 844x390, phone tier (`?q=phone`), software GL. Frames:
`scratchpad/phone2/before/` (full page, interface visible; the game canvas shown for one frame per orientation). What only a real
iPhone can show is listed at the end. Safe-area insets cannot be emulated here (the notch and home-bar values are 0 in this
browser), so clearance was checked by reading the CSS, not by looking.

## AUDIT (before any change)

Legibility (smallest text on screen) and targets, 390x844 and 844x390:

| Screen | Finding |
|---|---|
| Loading | Progress bar, percentage and stage name are present and large. The sound button reads "CLICK FOR SOUND" on a phone (nobody clicks). |
| Title | Works with a tap. The sub line reads "A on a gamepad" on a phone (the word SPACE is dropped but the "A" stays): confusing. Controls link is 14 px type, fine. |
| On foot, portrait | Eight identical 78 px round buttons in a 2x4 grid, labels 11 px. ACT, the most used, is the same size as HORN and RADIO; HORN and RADIO do nothing on foot. The stick is a fixed ring, 150 px, bottom-left, so the thumb has to find it. The cluster covers the right half of the lower screen. |
| On foot, landscape | Buttons shrink to 54 px with 9 px labels (below the 12 px floor and the 44 px target). The ring is 120 px. |
| Mission chip | In portrait the chip ("Offer: Crate Digger") overlaps the HEAT bar under the minimap (chip top 182, bars 180..196). |
| Phone text toast | Lands at right, y 136..185 in landscape: directly on the CAR and RUN buttons, so the text is unreadable over the button labels and the buttons are covered. In portrait it overlaps the pause / map / phone row by 4 px and the hands widget. |
| Pause menu, settings | Arrow buttons 34 px (rule under 760 px wide wins over the touch 44 px rule), rows 44 px. On 844x390 the settings list shows 3.5 rows. A "Window mode" row is shown where the iPhone has no fullscreen API. |
| Map, phone panel | Reachable from 48 px icon buttons; the phone panel sits over the right-hand cluster in landscape (acceptable: it is modal). |
| Hands widget | 56x48 box, clear of the row of buttons in portrait, touches the MAP button (x 622..678 against 676..720) in landscape. |
| Car | Stick steers and also throttles: pushing up is gas, pulling down is brake and reverse. The BRAKE button is Space+Shift (a handbrake slide), not a brake. No big throttle. |

Controls (src/ui/TouchControls.ts, touch.css as found):
* Stick: fixed 150 px ring, 56 px travel, dead zone 0.12 of travel that jumps to 0.12 output (no easing), does not follow the thumb.
* Look: right 60% of the screen (it overlapped the button cluster and the whole of the minimap), 2.2x gain, no smoothing.
* Buttons release on `pointerleave`, so a thumb that rolls half a millimetre off a held button lets go of it (HORN, ACT, LOOK).
* No haptics. Run is a hold on the right thumb, the same thumb that has to look: it cannot be held while looking.
* Reachability: nothing needed the left thumb to let go of the stick, but RUN, JUMP and ACT are on the same thumb as look.

Picture (phone tier, `scratchpad/phone2/before/before-l-03b-foot-canvas.png`): the canvas was 720 px wide. In landscape that is
720x332 stretched over 844x390, in portrait it was 390x844 CSS px at ratio 1 (a 3 x blur for a 6-inch screen). Trees and kerbs are
blocky, the sky and haze are milky (noon grade lifts the blacks by 0.025, fog from 30 to 100 m in horizon colour).

Loading (emulation, relative only): about 70 s from navigation to ready in this software-GL box; boot download 7.0 MB (IPHONE.md).

## WHAT WAS CHANGED

### 1. Interface (both orientations)
* One authoritative touch layout (`src/ui/touch.css`, selectors prefixed `html .hud-root.touch` so they beat the phone rules scattered through hud.css,
  map.css, mission.css and phone.css). Portrait: minimap and bars top left, mission chip below them (it no longer overlaps the HEAT bar), phone
  text under the chip, radio station popup under the chip (it used to run across the cash and the minimap), prompt above the stick's home.
  Landscape: stars, cash, a row of hands / map / phone / pause at the top right (the hands widget no longer touches MAP), the phone text and
  subtitles move to the middle top and bottom so they never cover the buttons (the old text landed on CAR and RUN).
* Pause, phone and map buttons 48 px; menu arrows 44 px (the 760 px rule had made them 36); rows 46 to 48 px.
* Settings on a phone on its side: the day / time / street lines are hidden so the list shows five rows instead of three and a half.
* Radio "no stream / tap to start" bar (a fixed element at z-index 2^31 that sat on the controls): above the cluster in portrait, under the top row in landscape.
* Everything tappable in the HUD sits above the two touch zones (z-index) so the full-screen zones never swallow the chip, the hands widget or the corner buttons.
* Title: "tap to start" and the sub line "best played sideways" (it said "A on a gamepad"); loading chip "Tap for sound" on a phone.
* Portrait gets a small "Turn your phone sideways for a wider view" pill for 7 s once per session; it takes no touches.

### 2. Controls (`src/ui/TouchControls.ts`)
* Floating stick: it appears where the thumb lands anywhere in the left half, follows a drifting thumb (the ring is dragged along, so reversing is
  instant), fades out on release. A dashed ghost ring labelled MOVE marks the usual spot while nothing touches. Output eases up from zero at the
  dead-zone edge instead of jumping to 0.12. In a car it steers and auto-centres on release.
* Look: the whole right half that is not a button (it used to be 60% and ran under the cluster). Same 2.2x gain; a smoother delivers 55% of the
  pending turn each frame and flushes the rest when the finger lifts, so nothing is lost and a flick does not jump.
* Buttons are 46 to 100 px with labels 12 to 20 px (they were 54 px and 9 px sideways). On foot: ACT (92 px, the largest, bottom right corner),
  JUMP left of it, RUN above it, VIEW and BACK small and out of the way. RUN is a latch: tap it, sprint while the stick is held, it lets go
  when the stick does (the right thumb is busy looking). HORN and RADIO are gone on foot, where they did nothing.
* CAR is a context button: it appears only when the HUD prompt says a car or a door is in reach (it reads the same "CAR  Enter car" prompt, no main.ts
  wiring), pulses gold, and becomes EXIT in a car.
* In a car: GAS (100 px) and BRAKE (84 px) are the big ones, HAND is the handbrake, HORN, RADIO, VIEW, BACK are small. The stick steers. Pushing it up
  still adds throttle, so nothing was taken away. BRAKE is the foot brake (Space); the old BRAKE was Space plus Shift, a handbrake slide.
* Buttons keep a held press with pointer capture (rolling a thumb off HORN or ACT no longer lets go).
* Haptic tick on press through `navigator.vibrate` where it exists (Android Chrome). iPhone Safari has no `navigator.vibrate` at all: there is
  no haptic on the owner's phone and none can be added from a web page. A saved switch (`TouchPrefs.haptics`) exists; no menu row yet.
* Not done: tilt steering (optional in the brief; needs a permission prompt on iOS and a settings row).
* Every key and gamepad binding is untouched: the buttons press the same virtual keys (KeyF, Space, ShiftLeft, KeyH, KeyE, KeyC, KeyV, ActionButton, and KeyW for GAS).

### 3. Picture on the phone tier
* Render size: the phone buffer was capped at 720 px WIDE. Portrait rendered 390 x 844 (a 3 x blur); landscape 720 x 332. Now the cap is on the
  LONG side: 1280 px on recent phones (iPhone 12 or later by screen size, iPads, Android with 8+ cores and 6+ GB), 960 on older ones
  (`handheldBufferLongSide`, `GpuProfile.ts`), pixel ratio up to 3, steady in both orientations (`screen` keeps iOS portrait dimensions).
  iPhone 13 (screen long side 844): 1280 x 591 in landscape (0.76 MP against 0.24 MP before), about 590 x 1010 in portrait with the Safari bars showing (it was 390 x 664). The existing
  "Resolution scale" slider in Settings (Display, first group) is the sharper / smoother choice: 100% is 1280, 75% about 960, 50% about 640.
  The auto drop in PerfMonitor is unchanged. This is the one change that can hurt frame rate on a weak phone: see the try-list.
* Grade: the phone gets its own bake of the per-hour 3D LUT (`phoneGrade` in lut.ts): saturation x1.07, S-curve +0.06, black lift x0.6. No extra pass, no
  extra cost; other tiers share the same code path and are untouched. Fog (30 to 100 m in horizon colour) stays: its tests lock a
  deliberate ramp and the frames show the distance fading cleanly.
* Already there and kept: instanced blob shadows under people and cars, lamp pool, quarter-resolution sign bloom at night when the phone holds 45 fps.

### 4. Memory (see the table below)
* `texSize` table (`src/textures/texTier.ts`): phone `atlas` (shop-front sheets) and `people` go from 0.5 to 0.375.
* `uploadPendingCanvasTextures` (`src/render/TierDetail.ts`, self-starting from `__gtaReady`, no main.ts line): sends canvases that still wait for their first view
  to the GPU at 0.5, 2.5, 6, 15 and 40 s, which runs the release hook and empties the canvas. It also adopts the cargo-box liveries, which were built
  without the hook. GPU memory is unchanged (the upload would have happened at first sight); live canvas memory falls.

### 5. Start-up
* Verified by reading main.ts: one tap on the title does `notifyGesture` (audio context and title music) and `startGame` in the same pointerdown. No keyboard is needed.
  Loading shows a stage name, a percentage and a bar. ContextGuard shows "Tap to reload" (IPHONE lane tests).
* The viewport re-apply after rotation still needs the main.ts lines below.

### 6. Add to Home Screen
* index.html and the hosted plugin already carry `apple-mobile-web-app-capable`, `black-translucent` status bar, title, touch icon, theme colour and
  the manifest link. Changed: manifest `orientation` "landscape" to "any" (a locked orientation made portrait play impossible on Android; play is still best sideways).
  The first-run help adds a line "Share, then Add to Home Screen, hides the browser bars" on iPhone Safari when the page is not installed (the only way
  to lose the bars on iOS, which has no Fullscreen API). Icons untouched (logo lane).

### 7. First-run help
* One screen over the game, shown once play starts, remembered in `localStorage` (`gtabs.touchTutorialSeen`): MOVE (left side), LOOK (right side), and
  a list of ACT, JUMP, RUN, CAR, GAS / BRAKE. It never blocks play (only its GOT IT button takes touches), touching the controls dismisses it
  after 4 s, and it fades by itself after 20 s. Storage that throws (private window) falls back to showing it each run.

## Tests

`tests/unit/ui/touch.test.ts` (floating stick, follow, look smoothing, context buttons, GAS / BRAKE / RUN, tutorial memory, haptics),
`tests/unit/render/phone2-render.test.ts` (phone grade, pending canvas upload), and updated quality-tier, gpu-profile, graphics-settings and
tex-tier tests (render size by long side, handheld classification, texture factors).
`npx vitest run tests/unit/ui tests/unit/render --maxWorkers=1`: 64 files, 663 tests pass. `tests/unit/textures` and `tests/unit/core`: 27 files, 508 pass.
`npx tsc --noEmit`: clean.
