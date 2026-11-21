# CONTROLS: keys, pad and interface laid out by GTA convention (lane CONTROLS, 21 Nov 2026)

Owner (21 Nov evening): "interface and keys and controller settings mapped as if it were GTA and Rockstar."
We copy bindings and screen positions (conventions). We copy no art, font, icon, sound or logo.

## Sources and how far they can be trusted

- PRIMARY, read in full: Rockstar newswire, "Tailoring Your Settings and Controls in GTAV PC" (1 May 2015),
  https://www.rockstargames.com/newswire/article/51974aa3a724o2/rockstar-game-tips-tailoring-your-settings-and-controls-in
  Confirms: Esc pauses (and goes back in menus); menu keys are WASD / arrows, Mouse 1 or Enter to select, Mouse 2 /
  Backspace / Esc to go back; middle mouse opens the phone, wheel moves the highlight; 0-9 pick weapons; Tab-style weapon
  wheel with wheel scrolling; B = point; Caps Lock = special ability; M = interaction menu; F5-F8 character switch;
  driving and flying are keyboard by default, left mouse = mouse steering override; most keys rebindable, menu keys not.
- SECONDARY (community wiki, tables of the defaults; the publisher's own support pages for the key lists were not reachable
  from this box): https://gta.fandom.com/wiki/Controls_for_GTA_V and https://gta.fandom.com/wiki/Controls_for_GTA_IV
  (read 21 Nov 2026 through a scraper; the two pages agree with each other on the shared rows, and with the Rockstar page
  above where they overlap). Rows marked "wiki" below rest on these alone.
- Nobody has played this with a real pad or keyboard. Nothing below was checked against a running GTA.

## Convention table

Confidence: P = Rockstar page, W = wiki table only, S = our own choice (no GTA equivalent, or not verifiable).
IV pad names are Xbox 360 / PS3. V pad names are Xbox / PlayStation.

| Action | GTA IV PC | GTA V PC | GTA IV pad | GTA V pad | Conf. |
|---|---|---|---|---|---|
| Move | W A S D | W A S D | left stick | left stick | W |
| Look | mouse | mouse | right stick | right stick | W |
| Sprint | Left Shift | Left Shift | A / Cross | A / Cross | W |
| Jump | Space | Space | X / Square | X / Square | W |
| Stealth / crouch | Left Ctrl | Left Ctrl | L3 | L3 | W |
| Attack, fire, punch | Left mouse | Left mouse | RT (fire), B / Circle (punch) | RT / R2 | W |
| Aim, lock on | Right mouse | Right mouse | LT / L2 | LT / L2 | W |
| Reload | R | R | B / Circle (armed) | B / Circle (armed) | W |
| Take cover | Q | Q | RB / R1 | RB / R1 | W |
| Enter / exit vehicle | F | F | Y / Triangle | Y / Triangle | W |
| Weapon wheel | 1-9 slots, wheel | Tab, wheel | d-pad right cycles | LB / L1 | W (V also P) |
| Next / previous weapon | wheel | wheel in the wheel | d-pad right / left | d-pad in the wheel | W |
| Phone | Up arrow | Up arrow or middle mouse | d-pad up | d-pad up | W, P (middle mouse) |
| Pause | Esc | Esc | Start | Start | P |
| Map | Esc, map tab | Esc, map tab; M = interaction menu | Start, map tab | Start, map tab | S for M |
| Camera view | V | V | Back / Select | View / touchpad | W |
| Look behind | C | C | R3 held | R3 held | W |
| Accelerate | W | W | RT / R2 | RT / R2 | W |
| Brake, reverse | S | S | LT / L2 | LT / L2 | W |
| Handbrake | Space | Space | RB / R1 | RB / R1 | W |
| Horn | G (wiki; held) | G (wiki) | L3 held | L3 held | W, uncertain: both pages list G, my memory said E |
| Headlights | H | H | X held | d-pad right | W |
| Radio next / previous | wheel | . and , (wiki) | d-pad left / right | d-pad left / right | W, uncertain |
| Cinematic camera (car) | Caps Lock | Caps Lock | Back | Back | W |
| Phone / menu navigate | arrows, Enter, Backspace | W A S D, arrows, Enter, Backspace, Mouse 2 back | d-pad, A, B | d-pad, A, B | P |

Where IV and V differ: V's layout for keyboard and mouse (what players' hands know today), as asked. The two pad layouts
are the same for everything this game has; the one real difference is IV's separate fire (RT) and punch (B) buttons. We
have a single action button (RT, as V), so no preset switch was built: two presets that differ in no button we use would
only add a menu row.

## Our defaults (keyboard, mouse)

On foot: W A S D move, mouse look, Left Shift sprint (hold; the default is a jog), Space jump, Alt (hold) or Caps Lock walk,
Left mouse or G attack, Right mouse aim (no aim mode yet), R reload (reserved; also retries a failed mission), Q cover
(reserved), F enter vehicle, Tab or wheel next item in hand (wheel up = previous), Up arrow or middle mouse or P phone,
M map, Esc pause (opens on the Map tab), C look behind (hold), V camera view, B swap shoulder, N point at HOME / WAX DELI.
In a vehicle: W throttle, S brake and reverse, A D steer, Space handbrake, G horn (held), wheel or . and , radio next and
previous, C look behind, V camera, F exit, H headlights (reserved: no headlights yet).
Left Ctrl (stealth in V) is bound to Walk only while the page is fullscreen with the Keyboard Lock API active.

## Our defaults (pad, by the V table)

Left stick move, right stick look, A sprint (hold), X jump, B reload (reserved), Y enter or exit, RT attack (throttle in a
car), LT aim (brake in a car), LB next item (on foot), RB swap shoulder on foot (cover when it exists) / handbrake in a car,
L3 walk toggle on foot / horn in a car, R3 look behind, d-pad up phone, d-pad left and right previous and next item on foot
and previous and next radio station in a car, Back camera view, Start pause.

## Status

(updated as the work lands; see the end of the file)
