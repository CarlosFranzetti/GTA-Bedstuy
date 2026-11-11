# Brief: UI14 — smartphone phone, GTA 5 style loading screen, real-Brooklyn map screen

Director: Tomas (ARTDIR). Model: sonnet. Port 4486. Start when Priya (MENU) posts FINAL; take her FINAL as the handover.
Read first: docs/swarm/ORG.md, docs/swarm/plans/stage14.md (rules), docs/swarm/art/ART-BAR.md (Interface and Loading),
board.md "Token policy". Read only the files below. Post start, blockers and wrap-up to "@Tomas" with scripts/swarm-say.sh "<your name> (UI14)".

## 1. Phone: a modern smartphone OS in the iPhone idiom (original, no Apple marks)
- Device: rounded body (corner radius ~ 14 % of width), thin bezel, island cutout, scales to 340 px wide at 1280x720 and full height on phone portrait.
- Status bar: in-game clock (from dayNight), carrier "BK 5G", signal, battery. Clock is in-game time, not system time.
- Lock screen: big clock + date, wallpaper (procedural Brooklyn skyline gradient or one of our loading art panels), notification cards for new messages; swipe up / Enter to unlock.
- Home screen: 4-column grid of rounded-square icons (corner radius 22 % of icon), labels under, page dots, a dock of 4 (Messages, Map, Missions, Radio).
- Apps: Messages (threads from StoryDirector/phone), Map (opens the map screen), Missions, Radio, Save, Settings; Camera as stretch (screenshot of the game canvas, saved to a gallery in the phone).
- Gestures: swipe up / Backspace = home, swipe from left edge / Esc = back, app open/close zoom animation 220 to 280 ms, ease-out.
- Icons: our own glyphs (simple line icons, SVG inline), original colours; no Apple logo, no SF Symbols copies, no exact iOS icon designs.
- Keyboard and gamepad stay: arrows/D-pad move focus, Enter opens. Hit targets ≥ 44 px.

## 2. Loading screen: GTA 5 idiom, our own art
- 3 to 5 full-bleed art panels: hero character(s) at 60 to 80 % frame height with rim light, a Brooklyn scene behind; arranged as 2 to 3 diagonal panels, each with a slow ken-burns (3 to 5 % over 6 to 8 s), changing every ~7 s.
- Art is ours: drawn procedurally in canvas/SVG or rendered from our own scene and people models (a posed render with an ink/halftone post is fine). Not traced from any game. Hosted-only if any bitmap exceeds 50 KB (artifact ≤ 12 MB).
- Bold condensed title, one tip line, a real load bar driven by actual loading stages with human labels ("Streets", "Buildings", "People", "Cars", "Radio") and a percentage. The bar never moves backwards and never sits at 100 % while still loading.
- Fix the existing defects: the stair rail line across the image; the sound pill competing with the title (move it into the bottom bar).
- Loading music (src/audio/loadingTheme.ts) keeps working as Priya wired it.

## 3. Map screen: real Brooklyn
- Full Brooklyn street network dim (thin, 20 to 30 % value), built streets lit (white/yellow by class), our playable area highlighted; water dark blue, parks dark green.
- Data comes from Imani's (MAPLEAD) overview layer under src/world/roadnet/**; ask @Imani for the API and the file it ships as. Until it lands, keep the current grid map working (feature flag `?map=real`).
- Pan, zoom (pinch, wheel, triggers), waypoint, legend; labels never collide (D3 from PLAYTEST).

## Files owned
src/ui/PhoneHud.ts, src/ui/phone.css, new src/ui/phone/** ; src/render/Loading.ts, src/render/loading.css, new src/render/loadingArt/** ;
src/ui/MapScreen.ts, src/ui/map.css. Not yours: Menu.ts/menu.css/Hud.ts (Priya's, coordinate), TouchControls.ts (Sam adds VIEW/JUMP),
src/world/roadnet/** (Imani), src/main.ts (FOR FABLE lines).

## Tests
- tests/unit/ui/phone-keys.test.ts extended: lock -> home -> app -> back -> home by keys; dock and grid focus order.
- New tests/unit/ui/phone-os.test.ts: status bar shows game time; every app opens and closes; no element under 44 px hit size.
- New tests/unit/render/loading-progress.test.ts: bar monotonic, stage labels in order, 100 % only on done.
- tests/unit/ui/map-screen.test.ts: lit vs dim layers, portrait threshold still green.
- tsc clean in src; artifact size reported, ≤ 12 MB.

## Screenshots (one render job at a time, in the background; output to scratchpad/ui14/)
- Phone: lock, home, Messages thread, Map app, Settings app; at 1280x720 and 390x844.
- Loading: three moments of the panel sequence (0 s, 7 s, 14 s) at 1280x720 and 390x844, plus a 6 s webm if the capture script allows.
- Map: whole Brooklyn view and zoomed on Bed-Stuy, desktop and phone portrait.

## Done
ART-BAR Interface and Loading defects absent; phone reads as a modern smartphone at a glance without copying Apple's marks;
the loading screen holds up next to a GTA 5 loading screen in composition and drama (Tomas judges); tests green; FINAL to
@Tomas (≤ 150 words + path list) with frames and FOR FABLE lines for any main.ts hook (e.g. loading stage callbacks).

## Rules (stage14.md)
Fan tribute, original or openly licensed assets only; no game assets, no Apple trademarks or icons. Only Fable edits
src/main.ts. Never git stash, never commit, keep src/ compiling, one render job at a time.

## Owner's map spec (11 Nov, overrides anything above that conflicts)
"Make the map centered and scrollable for the rendered area; the rest you can see in zoom out but no detail; should be close to GTA maps."
- Opens centred on the built (playable) area, fitted to the screen, player at centre if inside it.
- Pan and scroll are confined to the built area plus a small margin at normal zoom.
- Zooming out reveals the rest of Brooklyn as a dark, low-detail silhouette: land, shoreline, major roads only, neighbourhood names; no local streets, no labels beyond that.
- GTA map idiom: dark desaturated land, lighter street grid for built streets, water darker blue-black, blips with a legend, a north-up compass, waypoint line, crisp icons, player arrow, mission letters, zoom levels with snap, smooth inertia.
