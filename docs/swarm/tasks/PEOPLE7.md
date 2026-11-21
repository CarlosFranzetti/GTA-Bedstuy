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

# PEOPLE8: geometry repair (21 Nov 2026)
Frames: scratchpad/people8/before and after. Fixed and seen: 1 hem, 2 cuffs, 3 shoulder pads, 4 crotch, 5 orange bib, 7 hairline (braids). Not fixed: 6 neck and cheek patches, 8 small child.
1. Hem box. Cause: pedCuts.outerRadii dilated the outline by a neighbour each way and blurred it, which on a wide shallow hip turned the ring into a circle 6 to 8 cm off the body. Now a circumscribed polygon over 4x finer rays plus vertices. Three styles (HemStyle): roll (jacket, cardigan, uniform: thin edge), rib (hoodie, tracksuit, bomber: 5 cm band), baffle (puffer: rounded pillow). All follow the body 3 to 12 mm off.
2. Cuffs: cuffRows rewritten (CuffStyle rib 3 mm proud 4 cm, flat 2 mm 3 cm, hem for short sleeves), 10 rays hi, 6 mid.
3. Shoulders: the square patch was the painted uniform epaulette (pedPaintCloth.ts). Removed.
4. Crotch: pelvis vertices with 0.12 to 0.49 leg weight were left hanging (the cut took only 0.5 and above); they are now pulled into the tube, and the inner edges of the tubes grow to meet at the seat (pedLegs.ts rowOf).
5. The orange bib and strip is the scarf accessory (pedGear.ts scarf, chosen by id hash), not a collar: a flat cone plus a 22 cm tail. Now a 5 cm rounded wrap clamped to the neck with a 12 cm tail. Collars were never the cause.
7. Hairline: the skin teeth on the braids person were the cornrow ridge ends thinning to zero (pedHairPieces.cornrows). Ends keep 40 percent and a 2.5 mm floor, edges smoothed across columns. rimFn blur widened to five taps (it helps a little; kept).
Still wrong: the hem of some jackets (navy suit, cardigan) still sits wider than the waist above because the body is hip-wide there; ragged face tile edge on the cheek and jaw (skin atlas, face island) and neck colour step; hoodie pocket bottom is rough; the small bald child not identified (kid body type is h 0.78, head 1.22 by design). Tests: entities and textures pass except car tests from the vehicles lane (carbodies, carlook) and tsc errors in car*.ts from the same lane.

# PEOPLE9 (21 Nov 2026): palette, cloth, faces, age
Brief: owner decided gritty like GTA IV, muted worn colours, clothing mixed by age. Order: 1 palette, 2 fabric and wear, 3 faces, 4 age wardrobe, 5 geometry defects, 6 heads.
Frames: scratchpad/people9/before and after. Status log (updated as I go):
- 3 face: feathered head/body blend (pedPaintShade), age weathering for adults at half strength, uneven tone (pedPaintFace). 4 age: gating in pedWardrobe. Phone: pedMesh bakes 256 on phone tier by textureTier and releases canvas on phone and low.
- 1 PALETTE done and seen: new src/textures/painters/pedMute.ts (sat cap 0.32, value 0.06..0.72, one accent for ~6 to 35 percent of people by age, the player always) applied to the named roster and every generated person; colour tables in pedWardrobe.ts rewritten muted. Frames: people9/after/wardrobe20_off_*.png.
