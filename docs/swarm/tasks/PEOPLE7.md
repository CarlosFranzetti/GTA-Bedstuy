# PEOPLE7 (Marlo Vance): partial result, 21 Nov 2026

## What looked cheap (looked at, before frames in scratchpad/people7/before)
- Beard pieces were built from the skull centre, 17 degrees below level (the nose): a hair-coloured mask covered eyes and lips on every bearded person.
- Hairlines are rows of black or skin teeth; collars are flat orange or red flaps with ribbons; cuffs and hems are cardboard boxes; trousers are straight tubes with a crotch pouch under the belt; locs were straight rods.
- Faces are faceted on elders; texture patches on cheeks near the ears.

## Changed
1. Beards (pedHairPieces.ts buildBeard): cap built from a level slice at chin or lip height, pole on the face; rim shortened below the jaw. Bald men's beard keeps hair colour (pedPaintSwatch.ts). Looked at: beards now sit on the jaw (after/faces-b.png).
   Locs and box braids: 3 segments, more sway (bend), cap columns cut so the piece stays inside its triangle allowance. Hood lying on the shoulders is now a thick cowl (pedHeadwear.ts); NOT looked at in a frame.
2. Wardrobe (pedWardrobe.ts), all on painter families that exist: tops 15 to 19 base, layers 16 to 24 (fleece, windbreaker, varsity, peacoat, leather coat, work jacket, rain slicker, lab coat), bottoms 20 to 29 (flare jeans, slim trousers, cord, dark work trousers, chino shorts, sweat shorts, tennis skirt, denim maxi, midi), shoes 12 to 17 (rain boot, ankle boot, tan boot, flip-flop, canvas low: shapes reuse existing kinds, colour and rules differ).
3. Weather: `setWardrobeWeather(kind)` (rain kinds make slickers, trench, parka, rain boots likelier, no sandals), `seasonForWeather`, `DISTRICT_LOOKS` plus `WardrobeOpts.bias` for block character.
4. Test: pedpieces.test.ts beard lift allowance widened to 0.8 (beards are fitted by level rays; the check is level too but moves rim vertices).

## Not done / still wrong
- Hairline teeth, flat collar flaps (collar accessory still orange or red on some people even after switching to the garment swatch: cause not found), crotch pouch, cuff boxes, puffer hem flange, hood cowl unverified.
- No new garment geometry (turtleneck, hijab variants, aprons etc.), no new heads, hair styles, skin tones, painter material work (items 4, 5), no game frames (low and phone) captured. Wardrobe additions are not yet seen in a crowd.
- Weather and district hooks are not called by the game (main.ts, see report).

## Numbers
- Triangles unchanged by design except locs/braids (about 380 each at the allowance). Hi max about 4,300 per person in the line-ups.
- Phone memory: no new maps, no texture size changes. Single-file build 10.3 MB after (before not measured; change is code only).
- Tests: tests/unit/entities 808 passed; tests/unit/textures passed; tsc clean under src.
