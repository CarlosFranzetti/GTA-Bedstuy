# Lighting targets (R3, research-lighting)

Owner: R3. Audience: M1 (lighting-reflections). Read-only reference, no source was changed.

**How to read the numbers.** `[src]` = taken from a source excerpt listed in section 6. `[calc]` = computed here from our code or from the formulas cited. `[est]` = estimate or stylisation chosen for the game look, to be tuned by eye with `scripts/light-audit.mjs`. Nothing below was rendered; every target needs a screenshot check.

**Source caveat.** In this session WebFetch could not resolve `en.wikipedia.org`, `google.github.io` or `www.cs.utah.edu` (DNS failure), so the Preetham paper, the Filament material page, the Wikipedia EV and daylight tables were NOT read directly. Their figures come from WebSearch excerpts, and the primary pages still need checking.

---

## 0. Exposure math (verified against our three.js build)

Our renderer is three r186 (`package.json`). `ACESFilmicToneMapping` scales colour by `toneMappingExposure / 0.6`, applies an RRT+ODT fit, then OutputPass applies sRGB `[calc]` (ShaderChunk `tonemapping_pars_fragment.glsl.js`, the `/ 0.6` line).

Display value (sRGB, 0..1) for a grey scene-linear value L, computed with that formula:

| scene-linear L | E = 0.90 | E = 1.00 | E = 1.15 | E = 1.35 |
|---|---|---|---|---|
| 0.10 | 0.27 | 0.30 | 0.33 | 0.37 |
| 0.20 | 0.46 | 0.50 | 0.54 | 0.60 |
| 0.30 | 0.60 | 0.64 | 0.68 | 0.74 |
| 0.50 | 0.78 | 0.81 | 0.85 | 0.90 |
| 0.80 | 0.92 | 0.94 | 0.98 | 1.00 (clip) |
| 1.00 | 0.97 | 0.99 | 1.00 | 1.00 (clip) |

Reading: at E = 1.35 (our night factor, `src/render/lut.ts:148`) anything above scene-linear 0.8 clips. At E = 1.0 the clip point is about 1.0. Night is currently the brightest preset, which is backwards for "night streets readable without blown lamps".

Sun-to-ground check `[calc]`: with our sun at 2.2 and a horizontal albedo 0.8 at noon, direct diffuse is about 2.2 x 0.85 x 0.8 / pi = 0.48, plus hemisphere about 0.08, plus env. That lands near display 0.85 to 0.9 at E = 1.0, so noon does not clip on plain ground. Clipping comes from night exposure, lamps and specular glints.

---

## 1. Per-hour targets

Sun elevation column is the proposed path (peak about 58-60 degrees at 12:00, see section 3 item 4). Current elevations are in section 3. Colours are hex from Kelvin via the standard approximation `[calc]` (CCT values in `[src]`/`[est]`, section 6).

Sun CCT anchors: sunrise and sunset about 2000-3500 K, midday about 5400-6500 K `[src]`. Chosen values are `[est]` within those ranges.

Moon: intensity 0.3-0.4, colour about 7500 K, elevation 40 degrees, from the side opposite the sun, as a separate DirectionalLight (item 2 in section 4). Real full-moon illuminance 0.1-1 lux `[src]`, which is about 1/100,000 of noon sun. The game compression to 0.35 vs 2.2 (about 1:6) is `[est]`: a physically true moon would be unreadable.

| hour | sun elev (deg) | sun intensity | sun colour (CCT / hex) | hemi sky | hemi ground | hemi intensity | scene.environmentIntensity | toneMappingExposure (final) | fog colour | fog near / far (linear, m) | bloom threshold / strength |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | moon 40 (sun below) | moon 0.30 | 7500 K / #e6ebff | #1c2a5a | #3b2c20 | 0.40 | 0.50 | 0.95 | #0d1638 | 90 / 900 | 0.9 / 0.50 |
| 3 | moon 40 (sun below) | moon 0.30 | 7500 K / #e6ebff | #1a2650 | #3b2c20 | 0.40 | 0.50 | 0.90 | #0d1638 | 90 / 900 | 0.9 / 0.50 |
| 6 | 0 (horizon) | 0.0 | 2400 K / #ff9b3d | #e6a08a | #3a2c22 | 0.35 | 0.30 | 1.05 | #e8a07e | 60 / 900 | 1.4 / 0.20 |
| 7 | 11.5 | 0.8 | 3300 K / #ffbb81 | #9fc9e8 | #4a4138 | 0.30 | 0.30 | 1.00 | #cfd9e0 | 110 / 1300 | 1.8 / 0.12 |
| 9 | 34 | 1.6 | 4800 K / #ffe0c7 | #a8d4f2 | #6b6258 | 0.30 | 0.20 | 1.00 | #b4d4ec | 150 / 1600 | 2.0 / 0.10 |
| 12 | 58 | 2.2 | 5500 K / #ffedde | #b8dcf5 | #6b6258 | 0.30 | 0.20 | 1.00 | #a9d2f0 | 150 / 1800 | 2.0 / 0.10 |
| 15 | 49 | 2.0 | 5000 K / #ffe4ce | #b0d8f2 | #6b6258 | 0.30 | 0.20 | 1.00 | #aed1ee | 150 / 1700 | 2.0 / 0.10 |
| 17 | 28 | 1.5 | 4000 K / #ffcea6 | #d8c0b0 | #6b5a4a | 0.30 | 0.25 | 1.00 | #d9c6ad | 110 / 1300 | 1.8 / 0.12 |
| 18 | 17 | 1.0 | 2900 K / #ffae67 | #f0a070 | #54433a | 0.28 | 0.30 | 1.00 | #e0a07a | 80 / 1000 | 1.4 / 0.20 |
| 19 | 6 | 0.45 | 2400 K / #ff9b3d | #6a6fa8 | #3e3228 | 0.30 | 0.30 | 1.00 | #6e6f9a | 70 / 900 | 1.2 / 0.30 |
| 20 | moon 40 (sun below) | moon 0.35 | 7500 K / #e6ebff | #2c3d78 | #4a3320 | 0.40 | 0.50 | 0.95 | #1a2450 | 90 / 900 | 0.9 / 0.50 |
| 22 | moon 40 (sun below) | moon 0.30 | 7500 K / #e6ebff | #1c2a5a | #3b2c20 | 0.40 | 0.50 | 0.95 | #0e1638 | 100 / 900 | 0.9 / 0.50 |

Notes on the table:
- **Exposure.** This is the final `renderer.toneMappingExposure`. Our code multiplies base 1.0 (`src/render/LightingConfig.ts:7`) by the preset factor (`src/render/lut.ts:148`, day 1.0 / dusk 1.15 / night 1.35). Set the values here directly or change the factors. `[est]`: exposure stays near 1.0 at every hour, because the physical brightness drop is handled by the sun/hemi/env values, not by exposure.
- **Fog colour** should equal the sky horizon colour at that hour (`src/render/SkyDome.ts:74-83`), so the fade merges into the dome. The table colours are `[est]` in that spirit.
- **Fog near/far** `[calc]`: Koschmieder gives extinction beta = 3.912 / V (2% contrast threshold), so fog fraction f(d) = 1 - exp(-beta d). For V = 10 km (clear-but-hazy NYC day), f(300 m) = 0.11, f(600 m) = 0.21, f(900 m) = 0.30. Linear fog from 150 to 1800 m gives f(300) = 0.09, f(600) = 0.27, f(900) = 0.45, close enough for a game. Dusk and dawn use shorter far values because the haze is thicker `[est]`. Night is `[est]`.
- **Bloom** `[est]`: day threshold 2.0 keeps sun-hit whites and specular glints, and low strength avoids sky haze (acceptance criterion in `docs/swarm/PRD.md`). Dusk gets its own setting. Night strength 0.5 (from 0.7) keeps lamp glow without a haze wash.
- **Hemi sky** is the average of the sky dome near the horizon. **Hemi ground** is a bounce colour from sunlit street and brownstone albedo, about 0.2-0.3 `[est]`. The current ground colour (`#2b2620`) is much darker (section 3).
- **scene.environmentIntensity** applies only to materials that have no own `envMap` (`node_modules/three/src/renderers/WebGLRenderer.js:2734-2738`). See section 3 item 11.

---

## 2. Per-material targets

Roughness (r), metalness (m), envMapIntensity (env), F0 (dielectric reflectance at normal incidence). `[src]` = source value. `[est]` = estimate. Current values from `src/textures/MaterialLibrary.ts`.

| material (key) | r target | m target | env target | F0 / notes | current (line) | conf. |
|---|---|---|---|---|---|---|
| window glass (`window`) | 0.05-0.10 | 0 | 1.0-1.2 | F0 0.04 (glass IOR 1.5). Keep opacity 0.9 | r 0.15, m 0.3, env 1.0 (`:411`, `:31`) | r `[est]` from GTA notes "glass about 0.05"; F0 `[src]`; m=0 `[est]` |
| storefront glass (`storefrontGlass`) | 0.08-0.12 | 0 | 1.2 | F0 0.04 | r 0.15, m 0.3, env 1.0 (`:411`, `:31`) | `[est]` |
| car glass (`carGlass`) | 0.03-0.05 | 0 | 1.5 | F0 0.04; tint via colour, not metalness | r 0.05, m 0.9, env 1.5 (`:474`) | m `[est]`, r `[est]` |
| car paint base (`carPaint`, `copLivery`) | 0.35-0.5 | 0.0-0.2 | 1.2 | base is a dielectric with flake; reflection comes from clearcoat | r 0.35, m 0.6, env 1.2 (`:356`, `:171`) | `[est]` |
| car clearcoat | 0.03-0.08 | n/a | 1.2 | clearcoat F0 0.04 (IOR 1.5) `[src]`; glossy example clearCoatRoughness 0.1 `[src]` | clearcoatRoughness 0.08 (`:356`) | good as is |
| asphalt, dry (`asphalt`, `asphaltWorn`) | 0.85-0.90 | 0 | 0.2 | F0 0.04; albedo about 0.06-0.12 `[src, secondary]` | roughness map forced to factor 1; env 0.25 (`:32`, `:432`) | `[est]` |
| asphalt, wet (new variant, see section 4) | 0.15-0.25 | 0 | 1.0 (wet mask only) | F0 0.02 (water IOR 1.33) `[src]`; albedo x0.5-0.6 of dry `[calc from src]` | none | `[est]` |
| sidewalk / concrete (`concrete`, `bluestone`) | 0.80-0.90 | 0 | 0.2 (only if given own envMap) | F0 0.04; fresh concrete albedo about 0.5 `[src]` | r 0.9 (default), not registered, so it gets scene env 0.18 (`:434`) | `[est]` |
| brick, raw (`brickRed`) | 0.75-0.85 | 0 | 0.1 | albedo varies; grime darkens base | roughness map, factor forced to 1; map values not read (`:443`) | `[est]`; forum chart 0.57 linear `[src, unverified]` conflicts |
| brick, painted (`brickPainted`) | 0.55-0.70 | 0 | 0.3 | paint is a smoother dielectric | as above (`:444`) | `[est]` |
| brownstone (`brownstone`, `stoop`) | 0.80-0.85 | 0 | 0.1 | sandstone-like | roughness map (`:442`) | `[est]` |
| painted metal (`metalDark`, `metalGreen`, `hydrant`, `trash`) | 0.35-0.50 | 0 | 0.3-0.5 | painted metal is dielectric | r 0.6/0.6/0.55/0.7, m 0.5/0.4/0.2/0.3 (`:459-462`) | m `[est]` |
| bare metal (`manhole`, `grate`, `rollGate`) | 0.40-0.50 | 0.8-0.9 | 0.5 | cast iron / steel | r 0.55/0.6, m 0.6 (`:438-439`) | `[est]` |

Sources for the material column: F0 0.04 for dielectrics and clearcoat, F0 0.02 for water, F0 about 0.04-0.05 for glass and plastic (Filament, via a mirror excerpt); Babylon.js and Unity SRP both use IOR 1.5 for clearcoat (section 6). Roughness ranges for brick, concrete and asphalt are `[est]` because the only roughness chart found was a forum quote with conflicting numbers.

---

## 3. Our current values that deviate most from the targets

Ranked by visual impact. Current values were replicated per hour with the same formulas as `DayNight.ts` (scratch script in the session scratchpad).

1. **No golden hour in the sun colour.** `src/game/DayNight.ts:178-184`. `t = clamp(3 sin(theta) + 0.3)` saturates at 1 once sin(theta) >= 0.23, so the sun is noon colour `#fff3dc` from about 07:00 until 18:00. Sun colour at 18:00 is `#fff3dc` (computed). Target: section 1 colours, which go orange at 06:00-07:00 and 17:00-19:30.
2. **Sun intensity flat at 2.2 from 07:00 to 18:00.** `DayNight.ts:179`. Computed: 2.19 at 07:00, 2.20 at 12:00, 2.20 at 17:00, 2.20 at 18:00. Real irradiance on horizontal ground scales with sin(elevation), so at 17:00 it should be well below noon. Target: 0.8 (07:00), 2.2 (12:00), 1.0 (18:00), per section 1.
3. **Dawn sun is dusty pink.** `DayNight.ts:181`. `lerpColors(MOON_RGB, HORIZON_RGB, t*2)` at 06:00 gives `#d89699`. The moon colour blends into the sunrise colour instead of the warm horizon colour. Target `#ff9b3d` at 2400 K, sun intensity 0 at the horizon (dawn colour carried by sky and fog).
4. **Sun is almost overhead at noon.** `DayNight.ts:79-85` (sunAngle) and `:165-169` (position). theta = 80 degrees at 12:00 and 90 degrees (zenith) at 12:45. NYC on 28 Oct has solar noon altitude about 35 degrees (90 - 40.71 - 13.9, `[calc]`). The summer-solstice maximum is about 73 degrees `[src]`. At 80 degrees a vertical facade gets cos(80) = 0.17 of direct sun, so walls go flat and dark at noon. Target: peak 58-60 degrees, via `elevation = asin(0.866 sin theta)`. Use 36 degrees for a literal late-October look if preferred `[est]`.
5. **No moon: the sun sets below the horizon and lights from below.** `DayNight.ts:79-85, 165-169` plus the night branch at `:179-184`. At 00:00 sin(theta) = -0.97, at 03:00 -0.78, at 22:00 -0.68. Upward faces get no direct light from 19:30 to 06:00; only hemisphere and env light. The 0.4 "moon" intensity (`:20`) is therefore lighting the undersides only. Target: a separate moon DirectionalLight (item 2 in section 4).
6. **Night exposure too high.** `src/render/lut.ts:148` (`night: 1.35`), applied in `src/render/Pipeline.ts:388-392, 427, 466-470`. At E = 1.35 scene-linear 0.8 clips (section 0). Target 0.90-0.95 night, and raise lamp or hemi values instead.
7. **Fog too heavy at mid-range and ends at the camera far plane.** `src/game/DayNight.ts:126` `new Fog(this.sky, 220, 900)` is never retuned by hour. The camera far plane is 900 (`src/core/Camera.ts:33`). Linear fog gives 0.12 at 300 m and 0.56 at 600 m. For V = 10 km, Koschmieder gives 0.11 and 0.21. Target: section 1 near/far.
8. **Night glow and sky turbidity too high at dusk.** `src/render/SkyDome.ts:36-37`: turbidity 9 at 18.3 and 13 at 19.5. A source review says Preetham should not be used past about T = 10 (excerpt garbled; treat as a caution `[src, unverified]`). Target: cap at 9, and let the colour come from the horizon keys.
9. **Bloom: dusk uses day settings, night too strong.** `src/render/Pipeline.ts:15-19`, `:357-361`. Only day and night exist, no dusk. Night strength 0.7 (`:19`) is high for "no bloom haze". Target: section 1 bloom column (dusk 1.2-1.4 / 0.2-0.3, night 0.9 / 0.5).
10. **Day hemisphere ground too dark, sky too white.** `src/game/DayNight.ts:13` (ground `#2b2620`) and `:188-189` (sky desaturated toward white by 0.45). Ground should bounce sunlit street and brownstone, about `#6b6258` `[est]`. Hemi/sun ratio at noon, 0.30 / 2.2 = 0.14 `[calc]`, is within the estimated clear-day diffuse-to-direct range of about 0.1-0.2 `[est]`, so the intensity itself is fine.
11. **Per-material env values mostly do not apply.** `src/textures/MaterialLibrary.ts:31-33` sets envMapIntensity only for keys in `ENV_INTENSITY`, and `registerEnv` (`:345-351`) gives them an envMap. Other materials get no envMap, so three uses scene.environment at scene.environmentIntensity (`WebGLRenderer.js:2734-2738`). Concrete, brick and brownstone therefore get 0.18 by day and 0.5 at night regardless of their own values. Target: register each key with its own value, or accept scene env as the only knob.
12. **Glass metalness wrong.** `MaterialLibrary.ts:411` (window / storefront `metalness: 0.3`) and `:474` (`carGlass metalness: 0.9`). Glass is a dielectric. Target m = 0 with F0 0.04. The car glass will look darker and less mirror-like at grazing angles, which is the intended effect.
13. **Car paint too metallic.** `MaterialLibrary.ts:356` (`physicalPaint` default `metalness: 0.6`). Target base 0.0-0.2 with clearcoat doing the reflecting. Clearcoat roughness 0.08 is already good.
14. **Painted metals too metallic.** `MaterialLibrary.ts:459-462`. Painted hydrant, trash and dark metal are dielectric, so target m = 0.
15. **No wet asphalt state.** `MaterialLibrary.ts:432` plus ENV `asphalt: 0.25` (`:32`). Target: a wet variant (section 4).

Already close to target (leave alone): ACES + OutputPass ordering (`Pipeline.ts:245-247`); sun direction south tilt (`DayNight.ts:12`); glass base roughness 0.15 (close to the 0.05-0.10 target); asphalt dry env 0.25 (near 0.2); hemi/sun ratio at noon (item 10).

---

## 4. Wet roads and cheap reflections (three.js)

GTA 5 on PC shows puddles mirroring the sky when reflections are on, and the Series X ray-traced mode shows reflective rain-soaked streets (`docs/reference/gta5-style-notes.md` sec. 1). Real-time literature models wet roads as dry, wet, drenched and puddle regions with a two-layer reflection for puddles `[src: CESCG 2021]`.

Cheap option A (recommended first): a wet-asphalt material variant.
1. Clone the asphalt material, set roughness 0.20, metalness 0, `envMapIntensity` 1.0, albedo x0.55 `[est]`.
2. Drive a puddle mask with noise (the existing relief/roughness map). Use the mask only where wet. Keep dry asphalt at roughness 0.85-0.9.
3. Swap to the wet variant in rain or after a timer, or blend with a decal plane using MeshPhysical clearcoat 1.0, clearcoatRoughness 0.05.

Option B (puddles only, more cost): three's Reflector (planar) on a small plane under each puddle. Planar roughness is a blur, so use a lower-res target; a Vulkan planar-reflection tutorial notes that roughness-aware blur is the usual extension `[src]`. BeamNG also uses roughness to control reflection sharpness `[src]`.

Sun glint: roughness 0.2 on wet asphalt gives a visible sun streak at low sun (17:00-19:00). Check it at 18:00 after the sun path change, since high-noon sun on wet road is a point glint `[est]`.

---

## 5. Priority list for M1 (top 5 numeric changes)

1. **Sun path and colour.** Peak elevation 58-60 degrees at 12:00 (`DayNight.ts:79-85`). Sun intensity = 2.2 x (sin e / 0.853)^0.7, capped at 2.2. Sun colour by elevation: 2400 K at 0 degrees, 3300 K at 11 degrees, 5500 K at 58 degrees (`DayNight.ts:178-184`).
2. **Moon as a separate light.** DirectionalLight at 40 degrees elevation, intensity 0.30-0.35, colour 7500 K (`#e6ebff`), active 19:30-06:00 only. Remove the below-horizon sun from lighting (`DayNight.ts:165-184`).
3. **Exposure and bloom by hour.** Night toneMappingExposure 0.95 instead of 1.35 (`lut.ts:148`). Night bloom 0.9 / 0.50, dusk 1.4 / 0.20 (new dusk branch in `Pipeline.ts:357-361`).
4. **Fog per hour.** Replace `Fog(220, 900)` (`DayNight.ts:126`) with the near/far and colour in section 1. Set colour to the SkyDome horizon colour (`SkyDome.ts:74-83`). Cap turbidity at 9 (`SkyDome.ts:36-37`).
5. **Material metalness.** Glass metalness 0 and roughness 0.08 (`MaterialLibrary.ts:411`); car glass metalness 0 (`:474`); car paint base metalness 0.15 (`:356`); painted metals metalness 0 (`:459-462`); add the wet asphalt variant (section 4).

---

## 6. Sources

Used (excerpts from WebSearch, pages not all opened):
- Exposure value EV100 table, static 2008 Wikipedia copy: https://wikipedia2007.classicistranieri.com/e/x/p/Exposure_value.html (full moon EV -3 to -2 for landscapes; street scenes 7-8; the table is old, verify against current Wikipedia).
- Sunny 16 baseline EV about 14.7-15: https://www.photrio.com/forum/goto/post?id=2525161 and https://dgrin.com/discussion/comment/783076 (forum, low authority).
- Night skylines EV -1 to +1: https://ilexinstant.com/ilex-posts/ilex-photography/2015/09/21/understanding-exposure-value (blog).
- Full-moon EV calculator: https://www.lapseoftheshutter.com/exposure-calculator/
- Lux references, direct sun 32,000-120,000, overcast 1,000-2,000, full moon 0.27-1.0 lux: https://help.autodesk.com/cloudhelp/ENU/Fusion-Render/files/RND-LIGHTING.htm and the Wikipedia Daylight/Lux search listing (https://en.wikipedia.org/wiki/Daylight, not opened).
- Noon sun about 5400 K (patent text, not a measurement): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12165574
- Daylight CCT vs solar elevation, Granada (midday about 6500 K): Ratnasingam, Collins, Hernandez-Andres, EURASIP J. Image Video Process. 2013, https://jivp-eurasipjournals.springeropen.com/articles/10.1186/1687-5281-2013-14 (only figure captions read).
- Golden hour 2000-3500 K guides: https://www.digitalcameraworld.com/features/what-and-when-is-golden-hour-photography (low authority; several blogs give 2500-3500 K).
- Sodium vs LED: PNNL Kansas City LED street-lighting demo (LED 31% fewer lumens, 39% less power): https://www.pnnl.gov/publications/demonstration-led-street-lighting-kansas-city-mo ; NAVFAC LED vs 2000 K HPS: https://www.energy.gov/sites/prod/files/2014/01/f7/led_parking_lights_navfac.pdf ; Ontario MTO draft, LED highway CCT at most 4000 K: https://tcp.mto.gov.on.ca/sites/default/files/2025-01/DRAFT%20DEB-EED-2025-01%20Light%20Emitting%20Diodes%20for%20Highway%20Lighting%20Installations.pdf ; NYC LED conversion from 2013 and the 4000 K complaint: https://www.sierraclub.org/atlantic/blog/2017/03/led-streetlight-legislation-nyc
- HPS efficacy 80-140 lm/W: https://www.oakled.com/blogs/comparison-between-led-street-lights-and-high-pressure-sodium-lights/ (vendor, low authority).
- NYC solar noon altitude: summer solstice about 72.7-73 deg, winter about 25.9 deg: https://everycalculators.com/calculate-noon-sun-angle.html (calculator; the 28 Oct value 35.4 deg is our calc from declination about -13.9 deg).
- Koschmieder: visibility V = 3.912 / extinction (2% contrast threshold), USPTO 10672282 excerpt https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10672282 ; 5% threshold uses constant about 3.0 https://pp.bme.hu/ci/article/download/4169/3274 .
- Preetham model validity: Zotti 2007 review https://www.cg.tuwien.ac.at/research/publications/2007/zotti-2007-wscg/zotti-2007-wscg-paper.pdf (validity T about 1.6 and near-sunset caution; the T >= 10 wording is garbled in the excerpt).
- Dielectric F0 and clearcoat: Filament material docs via mirror https://www.mintlify.com/google/filament/materials/material-properties (official https://google.github.io/filament/notes/material_properties.html was unreachable); Babylon.js clear coat IOR 1.5 https://app.unpkg.com/@babylonjs/core@8.12.1/files/Materials/PBR/pbrClearCoatConfiguration.js ; Khronos KHR_materials_clearcoat https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_clearcoat ; three MeshPhysicalMaterial reflectivity default (IOR 1.5): https://www.soft8soft.com/docs/api/en/materials/MeshPhysicalMaterial.html
- Albedo of asphalt, concrete: Epic Unreal physically based materials doc https://dev.epicgames.com/documentation/unreal-engine/physically-based-materials-in-unreal-engine (fresh asphalt 0.02, worn 0.08, fresh concrete 0.51).
- Wet asphalt albedo 0.06-0.08 and dry 0.10-0.18, brick 0.57 and concrete 0.50 linear roughness: Polycount forum quotes https://polycount.com/discussion/comment/2774281 (unverified, secondary).
- Wet road model: CESCG 2021 "Rendering Wet Roads in Driving Simulations" https://cescg.org/wp-content/uploads/2021/03/Nguyenova-Rendering-Wet-Roads-in-Driving-Simulations-1.pdf
- Planar reflection roughness blur: https://docs.vulkan.org/tutorial/latest/Building_a_Simple_Engine/Advanced_Topics/Planar_Reflections.html ; BeamNG roughness and reflections: https://documentation.beamng.com/modding/lighting/reflections/
- GTA 5 style notes already in repo: `docs/reference/gta5-style-notes.md`.

Not reached: en.wikipedia.org (Exposure value, Daylight, Lux, Color temperature), google.github.io (Filament, Frostbite PBR course notes by Lagarde and de Rousiers, SIGGRAPH 2014), www.cs.utah.edu (Preetham 1999). Search returned only index pages for the Frostbite course notes. The wet-surface roughness rule ("lower roughness, darken albedo") is general practice, not sourced here.
