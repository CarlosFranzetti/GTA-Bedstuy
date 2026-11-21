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

(see the sections below, filled in as the work landed)
