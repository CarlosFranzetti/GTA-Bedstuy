# ART-BAR: what "good" looks like (Tomas, ARTDIR, 11 Nov)

The owner's bar: AAA for the native ports, the best possible web port. People and clothing in the league of GTA IV/V,
Yakuza, Saints Row (style references only, no game assets). Loading screens "sexy like GTA 5". Options in the comic
idiom of Borderlands 2. Every lane checks its frames against this page before posting FINAL. Judged from p20, p18,
cars12, menu/ and wburg/frames-b.

## Honest read of where we are
- World (wburg 13, 4): the strongest thing we have. Streets read as Brooklyn. Dusk is over-purple and the player is lit flat.
- People: PS2-to-early-PS3. Proportions fine at street distance; up close they are painted mannequins in unitards.
- Cars: dimensions and silhouettes right (Rocco's work holds), but surfaces read as clay with stickers, not paint and glass.
- Settings menu: closest to the bar. The comic idiom lands; layout collisions spoil it.
- Loading screen: competent flat vector, not GTA 5. It is the furthest from the bar for the least work to fix.
- HUD and phone: clean and readable, generic web-app look; no character.

## Global rules (all areas)
1. Judge at the distance the player sees it: people at 3 m and 12 m, cars at 6 m front three-quarter, UI at 1280x720 and 390x844.
2. Silhouette first, then value grouping (light/mid/dark), then colour, then detail. A detail never fixes a silhouette.
3. No lettering, numbers or logos on clothing or bodywork except plates, fleet liveries and parody brands we own.
4. No visible seams, slivers, floating parts or z-fighting at any judged distance. One is a defect; ship-blocking.
5. Palette: Brooklyn brick red, brownstone umber, bodega yellow, MTA teal, asphalt blue-black; accents saturated, bases desaturated.
6. Every FINAL ships before/after frames at the judged distances, same camera, same time of day.

## Characters (Leila, CHAR14)
Good looks like:
- Proportions 7 to 7.5 heads; shoulders 2 head-widths on men, 1.6 to 1.8 on women; hands visible as hands (thumb split), feet no longer than 1.1 head lengths.
- Garments sit ON the body: collars, cuffs, hems and waistbands have thickness (a shadow line or a 1 to 2 cm lip), trousers break over the shoe, jackets hang past the waist.
- Fabric reads by material: denim (twill grain, fades on thighs, top-stitch), knit (rib at cuffs), nylon puffer (baffles + sheen), cotton (matte), leather (tight highlight). Roughness differs per fabric: cotton 0.9, denim 0.8, nylon 0.45, leather 0.35.
- Skin has warm subsurface tint at ears/nose, no faceting on the jawline at 3 m, hair has strand direction, not one specular band.
- Silhouette variety in a lineup of 12: at least 4 distinct outlines (long coat, puffer, hoodie, dress/skirt, suit) and 3 stances.
Top 5 defects (ranked):
1. Lettering and numbers on clothes ("STUY", "23"): owner forbade it. Remove all.
2. Garments read as body paint: no hem/collar thickness, tracksuits flat single colour, no trouser break (lineup).
3. Hijab reads as a diving hood: fabric meets the face edge too tight, merges into the body colour, no drape over shoulders (close-b).
4. Floating parts and slivers: brown hexagon studs orbiting the blonde head (close-b), grey shoulder-seam slivers (close-a, close-b).
5. Faceted jaws and helmet hair with a horizontal specular smear; oversized white blob trainers on every second person.
Faces: keep the semi-realistic painted look (GTA IV direction). Push realism through skin shading and eye wetness, not stylisation.

## Cars (Kenji, CARFIXUP; Dmitri, CARS14)
Good looks like:
- Wheels fill the arches: tyre top within 3 to 6 cm of the arch lip; tyre sidewall height ratio right for the class (sports 30 to 40 %, trucks 70 %+); wheels sit flush with the body side, not tucked in.
- Paint: clearcoat (clearcoat 1, clearcoatRoughness 0.05 to 0.15), environment reflection visible on the hood and roof; dark colours show the sky, not grey mush.
- Glass: tinted but transmissive-looking (we see a headrest silhouette), with a sky reflection band; never opaque black.
- Lights are objects: lens + reflector depth, chrome or black bezel; tail lights glow at night.
- Panel gaps as thin dark lines, not as geometry steps; bumpers integrated into the body at the corners.
Top 5 defects (ranked):
1. Arch gaps and thin, white plastic-looking rims (every car in sheet0/sheet3, pony, luxury): biggest cheap-to-fix loss.
2. Plank bumpers: black slabs standing off the body (pony front, luxury front, minivan rear).
3. Clay paint: no clearcoat or env reflection; orange minivan reads as terracotta.
4. Missing-texture black rectangles on the garbage truck side and rear (sheet3). Kenji: first.
5. Cartoon grilles and headlamps (luxury "IIIIIII" grille, flat grey lamp boxes); hood edge floats with a black gap (pony).

## Interface (Priya, MENU; Sam, CONTROLS14; UI14)
Good looks like:
- Settings (Borderlands 2 idiom): heavy black ink outlines (3 to 4 px at 720p), halftone dots in mid-tones, cel-shaded hero art on one side that never covers a row, hand-lettered display face for titles, a clean grotesk for row text.
- Type scale at 1280x720: title 64 to 80 px, tabs 18 to 22 px, rows 20 to 24 px, help 14 to 16 px. Body text has no outline; only display text does.
- HUD (GTA idiom): bottom-left radar with health/armour/heat bars under it, top-right money and stars, bottom-right street + district + station; nothing else permanent. Nothing overlaps anything at 390x844.
- Contrast: every text element 4.5:1 against what is behind it (use a scrim, not just a stroke).
Top 5 defects (ranked):
1. Settings: APPLY/DEFAULTS/BACK sit on the hero art and are bigger than the title; the help card collides with them; the blue blob covers the last row ("Tree & prop range" is cut). Put actions in the footer bar.
2. HUD: "WELCOME TO BED-STUY" breaks at the hyphen across two lines; use a non-breaking hyphen and a narrower card.
3. HUD: the radio line overlaps the small icon box bottom-right; objective text is shown twice (card and subtitle).
4. PHONE and MAP read as web buttons; they should be icon chips in the HUD idiom or move into the phone.
5. Every settings row is outlined text: noisy; outline the selected row only.

## Loading screens (Priya, MENU now; UI14 next)
Good looks like (GTA 5 idiom, our own art):
- Full-bleed art panels: one or two characters at hero scale (figure 60 to 80 % of frame height), painterly or inked, strong rim light, a Brooklyn scene behind them.
- Composition: diagonal panels of 2 to 3 images, slow ken-burns (3 to 5 % scale over 6 to 8 s), crossfade or slide every 7 s.
- Bold condensed title, tips line, a real load bar with stage labels ("Streets", "Buildings", "People", "Cars", "Radio").
Top 5 defects (ranked):
1. No hero: figures are 1/5 of the frame and stick-like. The GTA 5 screen is a person, not a building.
2. A black line (stair rail) slashes the whole image corner to corner: a drawing bug.
3. Flat fills, no light: no rim light, no shadow shapes, no texture; the halftone exists only in the sky corner.
4. "CLICK FOR SOUND" pill and location card compete with the title for top billing.
5. Stage label "WORLD (3/6)" is technical; use a human label and percentage.

## In-game look (for Imani's team, noted only)
Dusk grade is too purple on sidewalks and skin; the player needs a key light at dusk/night (fill from street lamps).

## Stop doing
- Stop adding detail to fix proportion or silhouette problems.
- Stop shipping FINALs with only a lineup on a grey ground: include a street frame at dusk and at noon.
- Stop drawing text into textures (clothes, grilles, signage) at a size it cannot be read.
- Stop putting interactive controls on top of decorative art.
- Stop using outline/stroke as a contrast fix.
- Stop judging at 1920 only: 1280x720 and phone portrait are where we break.
