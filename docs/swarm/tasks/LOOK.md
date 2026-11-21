# LOOK: lighting and look development (Stoop Light)

Lane: LOOK (lighting and look-development lead). Brief: docs/swarm/art/DIRECTION.md. Status: started 21 Nov 2026.

## Plan (in order)
1. Baseline frames of the signature views (before). 2. Afternoon: sun, sky, haze, ambient, shadows; 17:30 is the start hour
(already `LIGHTING.startHour = 17.5` and `DayNight DEFAULT_START_HOUR = 17.5`). 3. One grade for all tiers (the per-hour 3D LUT in
`src/render/lut.ts`, already used by phone too). 4. Night. 5. Overcast and rain. 6. Camera proposal (numbers only).

## Findings from the old frames (surfaces4 baseline at low, 17:30 and 22:00, row view) and the code
- 17:30: deep saturated blue sky gradient, not haze; near-black road; strong blue shadows; saturated red brick. Nothing warm
  reaches the shadows or the distance. The grade LUT BOOSTED saturation (golden 1.26, noon 1.27) where DIRECTION wants it down.
- 22:00: black sky with bright white stars, navy road, no readable sodium pools, bright blue ambient (hemi 4.4, moon 2.7)
  so there is no dark between lamps; sidewalks saturated blue; pink windows.
- Start hour is already 17.5 (`LIGHTING.startHour`, passed by main.ts line 175): nothing to change in main.ts.
- Camera on foot already is fov 64, distance 3.2, height 1.55 (CAM_FOOT); car fov 70 to 82.

## Changes
- `src/render/lut.ts` (the one grade, baked per hour into a 3D LUT, used by every tier incl. phone, so no extra pass anywhere):
  saturation 0.90 to 0.95 (was 1.15 to 1.27), S-curve 0.26 to 0.34 (was 0.32 to 0.44), blacks lifted 0.02 to 0.036 and TINTED to
  the haze colour of the hour (`liftTint`, new field), shadows blue-teal, highlights amber, a soft chroma cap (knee 0.42,
  slope 0.8; greens knee 0.16, slope 0.45, pushed towards olive). Phone grade offsets reduced (saturation x1.02, was x1.07;
  lift x0.8, was x0.6) so phone gets the same colour result.
- `src/render/SkyDome.ts`: horizon and fog colour keys (night dark blue-grey with city glow 0x1a2030 to 0x232a3d, golden-hour dust
  haze 0xd0c0ae to 0xcfc1ae, pale blue 0xb8c9da at high sun), hazier Preetham keys 12:00 to 19:30 (turbidity 8 to 10 at 16:00 to
  18:30, was 5; rayleigh 1.2 to 1.7; mie 0.011 to 0.015), a wider haze band plus 10 percent haze colour over the whole dome (no
  cobalt zenith), stars at 40 percent strength and 1.7 px (was 95 percent, 2.2 px).
- `src/render/LightingConfig.ts`: night ambient halved (hemi 4.4 to 2.5, moon 2.7 to 1.2, greyer blue 0x3e4c70, warm ground bounce
  0x5a4632), golden hour sun 2.9 at 17:00 (was 2.4) and 0xffc796 / 0xffb070, greyer skylight 0xb0bccf, hemi 1.3 to 1.9, exposure
  1.18 to 1.2 at 17:00 to 18:00 (was 1.05 to 1.1), fog closer at 17:00 (80 to 1000 m) and 18:00 (70 to 850 m), more haze at
  17:30 (amount 0.38, glow 0.5), night bloom restrained (threshold 1.1, strength 0.34; was 0.9 and 0.5), moon colour 0xcfd6e6.
- `src/render/NightLights.ts`: street lamp colour sodium 0xffa44f at 70 cd (was 0xffcf8a at 45 cd).
- `src/render/LensFlare.ts`: no rainbow ring, no hexagon ghosts (DIRECTION: no lens flare); one soft warm sun glow of 420 px remains.
- `src/game/DayNight.ts`: overcast light is grey-green by day (sky fill 0x9ba79d, bounce 0x6d6c5e, sun 0xdfe5dc, 55 percent at full
  overcast, day only), overcast fog tint slightly green-grey.
- tests: `tests/unit/render/art-grade.test.ts` pinned the OLD boosted saturation (>= 1.22) and curve (>= 0.3); changed on purpose
  to the Stoop Light numbers, plus a chroma-cap test. Nothing else touched.

## Before and after frames
Folder: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/look/before and .../after
(`<view>_<tier>.jpg` before, `<view>_<tier>_a6.jpg` after). Capture script: .../look/cap.cjs (shots files shots*.json in the same
folder). Rendered in software at 960x540 (phone 844x390), `?perf=0&q=<tier>`; no fps claimed.
Note: other lanes edit textures in the same tree, so before (built early) and after also differ by their work.
Capture caveat: the page crashes about every second shot on this box (shader recompile on hour or weather change under load);
the script reloads and retries.

## Left to do / still breaks the picture
(to fill)
