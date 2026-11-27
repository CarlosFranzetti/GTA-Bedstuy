# RADIOUX (27 Nov 2026): phone-first layout for /radio/

Lane RADIOUX (Mara Okafor). Owner: "Let's get that radio working, show me mockups, use UX skills, has to work on phone."
Status: in progress. NOTHING HERE WAS HEARD (no one on this box can hear).

## The lead's critique of the 390x844 page (before)
1. SoundCloud player and status line two screens down. 2. Page 4,905 px tall. 3. 134 tap targets under 44 px.
4. Two speakers fill a phone screen. 5. "Tap" status says nothing big on the first screen.

## Design (phones under 700 px; desktop keeps the boombox)
- First screen: one-line header, console (display, strip, knobs, five keys; speakers become two slim grille strips), then ONE
  status and action row (56 px button when action is needed), the caption, then the SoundCloud card for SoundCloud stations only.
- Sticky mini player at the bottom (48 px buttons, safe-area padding); tucks away while the console's keys are on screen.
- Station tiles at least 56 px; a tap tunes and plays inside the handler, then scrolls the boombox into view.
- Details sections: Set timeline, What was said, About this station and its mixes, What is on each station, Settings.
- Strip marks are decoration (not buttons, no tab stop); swipe on the strip steps one station. Desktop marks stay clickable (delegated click).

## Results (390x844 phone, network open, nothing heard)
- Page height 4,905 -> 2,172 px (log section open because it has a line; 2,116 px on desktop 1280x800).
- Tap targets under 44 px: 134 -> 0 (also 0 with `--count-hidden`, which counts links inside closed sections). Desktop: 1 (the inline "GTA Bed-Stuy" link in the subtitle, hidden on phones).
- First screen holds: header with "The game" link, boombox console (display, strip, knobs, five keys; speakers are two grille strips), status row, caption, the SoundCloud player fully visible (only its one-line note is cut off).
- Overflow false at 390, 360, 768, 1280. Stations "On air": 17 of 17 (live script, phone, 8 s each). The script's "advancing" flag is true for 9 (SoundCloud stations); the streams and talk stations show false in this headless Chromium (audio clock with muted output), as it would have before.
- Single-file index.html: 11,939,092 -> 11,939,942 bytes. The +850 is other lanes' work (no radio code is in it, grep finds none); /radio/ is hosted-only.
- Tests: tests/unit/radio 34 green (8 new: mini player, tile tap, SC card only for SC stations, five sections, decoration marks and swipe, desktop mark click, caption placement, volume and status button).

## Changes
- Sticky mini player tucks away while the console's keys are visible (IntersectionObserver), shows when scrolled. Its play button starts sound when the status is "tap".
- Strip marks are spans (no tab stop). Desktop: delegated click, bigger hit area. Touch/pen swipe: one station per 36 px, left = next.
- Keys relabelled Prev / Play / Next / New set / Off (aria-labels keep the full names). Start button reads "Tap to start sound".
- Checkbox is a full-row invisible input with a drawn box; a volume range was added to Settings.
- 701 to 900 px: narrower speakers, stickers hidden.
- Tool fixes: scripts proxy bypass for localhost (they timed out here without it); radiopage-ux skips content inside closed details (`--count-hidden` restores); new radiopage-mock.mjs makes the mockups in docs/swarm/teams/sheets/radioux-*.png.

## Not done / not verified
Nothing heard. No real iPhone (safe-area, home bar, sound-blocked flow only faked in a picture). 360x740: SoundCloud player is cut by the fold. Swipe tested with synthetic events and not by hand. Mini-player tuck relies on IntersectionObserver.
