# Art direction: the look of GTA Bed-Stuy

Status: current (written 21 Nov 2026 by the lead, on the owner's instruction). This document outranks ART-BAR.md where
they disagree; ART-BAR.md remains the checklist of defects. Every lane reads this before it touches anything visible.

## The brief the owner gave

"Imagine you are all ex-employees from Rockstar Games making a game to compete with GTA 4. You're a small group of
designers but you're the best they had. Reimagine the game in whatever way you think is best in terms of graphics and
look, and use that for all of the staff."

How we use it: as a STANDARD OF CRAFT and a way of deciding. A small team of veterans does not out-build a big studio.
It out-chooses one: fewer things, each finished, one strong picture held by everybody. It is a working fiction inside
the studio only. Nobody here worked at Rockstar; that claim never appears in the game, the README, the credits or any
post, and nothing from their games is copied (MEMORY.md rules 1 to 4 stand unchanged).

## The picture in one sentence

A real Brooklyn neighbourhood on a hazy late afternoon and under sodium lamps at night: warm low light on brownstone,
cool shadow in the street, worn materials, a muted world where the only loud colours are the ones people put there.

We call the look STOOP LIGHT.

## Five decisions (in order: when two fight, the earlier wins)

1. LIGHT AND AIR BEFORE DETAIL. The fastest way to look like a film and not a toy is the light: a low sun, long soft
   shadows, haze that turns distance warm near the sun and blue away from it, bounce light under cornices, and a grade
   that holds it together. A plain wall in good light beats a detailed wall in flat light. The game's default hour is
   late afternoon, not noon.
2. A MUTED WORLD WITH EARNED ACCENTS. Surfaces are earth and soot: brownstone, oxblood brick, tar, concrete, iron,
   faded paint. Saturated colour is rationed to things people chose: an awning, a taxi, a traffic light, a puffer coat,
   a neon OPEN sign, flowers in a bucket. If everything is bright nothing is.
3. SHAPE AND PROPORTION BEFORE TEXTURE. A person, a car or a building must read from thirty metres as a silhouette.
   Get the proportions right, then the big forms that catch light (cornice, stoop, wheel arch, collar, hem), then
   texture. Never fix a wrong shape with a busier texture.
4. WORN, NOT DIRTY; LIVED-IN, NOT STAGED. Everything has been used for years: paint faded on top, dark at the bottom,
   polished where hands and tyres go, patched where it broke. Wear follows cause (water runs down, soot rises, rust
   starts at steel). Then the street is furnished the way people furnish it: trash out on the right day, a chair by a
   door, a gate half down, mismatched windows.
5. ONE HAND. The whole game looks made by one person: one grade, one texel density, one level of detail per distance,
   one type family, one sense of humour. A beautiful thing that does not match is a defect.

## What that means in numbers (the lead's choices; tune by looking, not by faith)

Colour and light
- Albedo values between about 0.04 and 0.75. Nothing pure black (asphalt about 0.07 to 0.12, tar about 0.05) and
  nothing pure white (paint about 0.70, a white shirt about 0.72).
- Saturation: world surfaces under about 35 percent; vegetation under about 45 percent and yellow-green or olive, never
  emerald (lawns are the worst offender today); accents up to about 80 percent and under about 5 percent of the frame.
- Key to fill: sun to sky about 4 to 1 in the afternoon, softer at noon under haze. Shadows are cool and never black.
- Grade: a filmic curve with a gentle shoulder, blacks lifted a little into the haze colour, shadows towards blue-teal,
  highlights towards amber, overall saturation pulled down about 10 to 15 percent, a soft vignette and fine grain on
  medium and high. Phone and low get the same grade as colour only, with no extra full-screen pass.
- Fog and haze: distance fades into the sky colour for that hour, warmer towards the sun. It must hide the draw
  distance without greying the near street.
- Night: sodium orange street lamps with real pools and falloff, cooler white from shop windows, warm and varied house
  windows, dark gaps between pools, wet roads that double the lamps. Not blue moonlight everywhere.
- Weather is part of the look: overcast is the second signature (soft, grey-green, saturated only in the lamps), rain
  the third.

Shape and surface
- Texel density: about 256 pixels per metre at arm's length on high, half on medium, quarter on low and phone; the same
  on walls, roads, cars and clothes so nothing looks sharper than its neighbour.
- People: natural proportions, about 7.5 heads tall, shoulders about 2 head-widths; weathered faces; clothes as cloth
  (thickness 6 to 15 mm, hems that hang, breaks at elbow and knee); palettes of black, navy, grey, olive, brown, denim,
  off-white, with one accent at most per person. Older people wear 2000s cuts, younger people today's. No lettering.
- Vehicles: a mixed fleet from the 1980s to today, each class a different outline; paint a little chalky on old cars,
  clear and deep on few; dirt low and behind the wheels; chrome and glass are where the sky shows.
- Buildings: brownstone rows first. Cornice, lintel, sill, stoop and railing must cast shadows. No two neighbours the
  same colour, height of stoop or state of repair.
- Streets: the road is half of every frame: aggregate, patches, cracks, wheel tracks, stains, worn paint, steel covers.
- Shops: each a different, readable, funny sign in the project's two fonts; goods and clutter visible through glass.

Motion and camera
- Cars have weight: lean, dive, squat, tyres that give and return. They must still turn easily on a keyboard.
- People stand upright, walk with intent, and react.
- The camera sits lower and a little closer than an arcade camera, with a normal lens (about 55 to 65 degrees), so
  buildings tower and the street has depth.

Interface
- Quiet. Near-black, gold and white. Anton for display, Barlow Condensed for text. Thin lines, generous spacing, no
  gradients, no glow, nothing bouncing. The game is the picture; the interface stays out of it.

## Never

- Emerald grass, pure black asphalt, pure white walls, rainbow crowds, uniform lit windows.
- Outlines, cel shading, cartoon proportions, shiny plastic, lens flare, heavy bloom, chromatic fringes.
- Detail without cause: random noise, random stains, random graffiti.
- A real brand, logo, name of a real business or person, or anything taken from another game.
- A frames-per-second claim from this machine, or a "done" that nobody looked at.

## How every lane works from now on

1. Before: capture the thing as it is, in the game, at the signature hour (17:30 game time) and at night (22:00), and
   write three sentences on what breaks the picture above.
2. Choose the one change that moves the frame most. Do it completely. Look again.
3. Judge the whole frame, not the asset: does it sit in the street, in that light, next to its neighbours?
4. Hand back before and after frames at the same camera and hour, the cost in triangles and draw calls, and what still
   breaks the picture. A lane that made one thing right has done better than a lane that touched ten.

## Signature views (every look change is checked against these)

- A brownstone row from the sidewalk at 17:30, sun raking the stoops.
- The avenue with shops from the middle of the road at 17:30, traffic and people in frame.
- The junction under the elevated line at 22:00, wet.
- A corner shop square-on at 22:00.
- Three people at 3 m and a crowd at 20 m, 17:30.
- A car at 5 m three-quarter front, and traffic at 40 m.
- The same row on the phone tier.
