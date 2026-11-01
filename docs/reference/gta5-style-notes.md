# GTA 5 style notes (art direction reference)

Purpose: emulate the look of GTA 5 with procedural three.js materials and post-processing for the GTA Bed-Stuy fan tribute. This is style analysis only. No Rockstar asset, texture or image was downloaded or used.

**Sourcing caveat.** The research environment could not open most primary pages (the Courrèges blog, Digital Foundry, threejs.org, Wikipedia). Figures below come from search-result excerpts and are marked as such. Anything marked **(speculation)** is my inference or common practice, not a sourced claim about GTA 5. Verify against the original pages before quoting.

## 1. Rendering pipeline

- **Deferred lighting, HDR buffers.** Courrèges' PC (DX11, 2015) analysis describes a deferred pipeline with many HDR buffers, tone-mapped to 8-bit with Reinhard ([Courrèges, 2015](https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/), via [search excerpt](https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/)). Browser: keep to forward rendering with a small light budget; deferred is costly in three.js.
- **Shadows.** No GTA 5 cascade count was found. A San Andreas mod reportedly uses four cascades ([DSOGaming](https://www.dsogaming.com/?p=194337)); this is a mod claim for another game. Browser: one directional shadow map at 2048, PCF soft, with 2 cascades if affordable.
- **Ambient occlusion.** GTA 5's engine (RAGE) was extended with AO for this game ([RAGE, Wikipedia](https://en.wikipedia.org/wiki/Rockstar_Advanced_Game_Engine)). three.js's [GTAOPass](https://threejs.org/docs/pages/GTAOPass.html) is higher quality than SSAOPass and more expensive.
- **Tone mapping and bloom.** [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html) requires tone mapping enabled on the renderer. The OutputPass-last ordering is community guidance, not verified against the docs.
- **Lens flare and streaks.** Courrèges' Part 3 reports about 70 sprites on the sun-to-centre axis and 12 rotated streak quads, with flare size proportional to the simulated aperture ([Part 3 excerpt](https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study-part-3/)). Browser: a sprite overlay with 8 to 12 sprites and fade when the sun is occluded.
- **Depth of field and post-effects.** A community mod lists depth of field, lens flares, bloom, lens artifacts and "filmic grading" as switchable post effects ([PostFXOff](https://www.gta5-mods.com/es/misc/timecycle)). Whether cutscenes use a separate path is unconfirmed. Browser: apply blur only when the cinematic camera is active.
- **Atmospheric fog.** Modders reduced distance fog and density in later versions ([ImmersionENB](https://www.gta5-mods.com/nl/misc/immersionenb)). No stock values were found.
- **Wet roads and reflections.** Digital Foundry describes rain-soaked, reflective streets in the Series X ray-traced mode ([Pure Xbox](https://purexbox.com/news/2022/12/video-digital-foundry-puts-gta5-ray-tracing-to-the-test-on-xbox-series-x)). On PC, puddles mirror the sky when "Reflections MSAA" is off ([AMD forum](https://community.amd.com:443/t5/pc-graphics/reflections-not-displaying-correctly-in-gta-5-solved/td-p/537118)). Browser: a planar or cube-camera reflection on the road, enabled only when wet.
- **Colour grading with time-of-day LUTs.** Not confirmed for GTA 5. Browser: a 3D LUT or a custom grade pass, applied by time of day.

## 2. Colour and tone

- **Daytime.** Art director Aaron Garbut describes a lot of work on the "California" feel for the sunset, and on lighting and colour in general, in a [forum repost of an interview](https://www.elotrolado.net/hilo_hilo-oficial-grand-theft-auto-v_1689666_s18750). He also says the aim was not to recreate existing cities ([GamingBolt](https://gamingbolt.com/grand-theft-auto-vs-art-director-i-want-to-create-new-cities-not-recreate-existing-ones)). The warm-highlight, cool-shadow, desaturated-mid look is **(speculation)** and needs checking against your own play sessions.
- **Golden hour.** No source. **(speculation)** warm, low-angle key with long shadows and a warm haze.
- **Night.** Modders describe stock streetlights as dated yellow and replace them with white ([MaxedStreetLights](https://www.gta5-mods.com/fi/misc/maxedwhitestreetlights)). Other mods fix over-bright coronas and add subtle volumetric light ([MaxedV](https://www.gta5-mods.com/cs/misc/maxedv)). So the stock night reads as warm sodium-like, and white is a modder choice.
- **Haze.** Modders also remove a yellow haze in the stock distance fog. Stock haze is therefore warm and yellowish, but the magnitude is unsourced.
- **Contrast, grain, vignette.** No confirmed stock film grain or vignette. Photo-mode details were not found. Treat grain and vignette as optional.

## 3. Materials and clutter

No source covered GTA 5's material parameters. Values below are **(speculation)** starting points for PBR-style materials.

- **Asphalt.** Matte when dry (roughness about 0.85), wet patches with low roughness (about 0.25) and a faint mirror.
- **Concrete and brick.** Roughness 0.8 to 0.9, albedo noise, and grime darkening at the base and under sills.
- **Painted metal.** Roughness 0.35 to 0.5, with a faint edge highlight.
- **Car paint.** Clearcoat 0.6 to 0.8 over a flat base colour.
- **Glass.** Low roughness (about 0.05), strong environment reflection, slight tint.
- **Decals.** Community mods show that players expect graffiti, posters and litter (for example [Graffiti and Billboards](https://gta5mod.net/gta-5-mods/misc/graffiti-and-billboards/) and [Real-Life Litter](https://it.gta5-mods.com/misc/tags/misc-texture+prop/4)). Density rules are not sourced.
- **Signage.** Parody brands and lightboxes are typical of the look. No source.
- **Clutter.** Bins, poles, wires, fences, cones and dumpsters are typical urban props. No stock placement rules were found.

## 4. Camera

- Stock third-person distance, height and FOV were not confirmed. Mods expose FOV and distance through INI settings ([Custom Camera V+](https://ru.gta5-mods.com/scripts/custom-camera-v-plus/download/40741)). The best way to find stock values is to measure them in your own play sessions, not from any extracted asset.
- The stock editor uses straight-line, spring-damped camera moves that can undershoot ([Rockstar Editor+](https://www.gta5-mods.com/sl/scripts/rockstar-editor)). **(speculation)** The follow camera should use damping and a small look-ahead.
- **(speculation)** FOV 55 to 65, follow distance 5 to 7 m, height 1.8 to 2.5 m, with a pull-back at speed.

## 5. Ten cheapest changes for GTA-ness

Values are starting points to tune by eye. Only the bloom and tone-mapping notes are sourced.

1. **ACES filmic tone mapping with OutputPass last.** Exposure 1.0 by day, 0.8 at dusk, 0.6 at night.
2. **Bloom only on emissives.** UnrealBloomPass strength 0.3, radius 0.5, threshold 0.9. Drop the threshold to 0.75 at night.
3. **Hour-driven exponential-squared fog.** Density 0.004 by day, 0.009 overcast, 0.012 at night. Warm haze colour by day (around #d8c6a5), dark sodium-tinted colour at night.
4. **Global grade.** A 16³ LUT, or a shader that tints shadows toward teal (around #2c4a50, 8% mix) and highlights warm (around #ffd9a0, 6% mix), with saturation 0.9 and contrast 1.05.
5. **Clutter per 50 m block side.** 4 to 6 bins, one pole per 25 m, two wire spans, one dumpster per alley, 3 to 5 ground decals along the kerb, and one graffiti per three building faces.
6. **Wet-road pass.** Roughness 0.25 and a sky-coloured planar reflection, masked by noise for puddles, enabled per weather state.
7. **Sun flare.** 8 to 12 sprites on the sun-to-centre axis plus 4 streak quads, faded when the sun is occluded.
8. **Night streetlights.** Point lights with decay 2, sodium colour (around #ffb35c) on older blocks and cool white (around #f0f4ff) on newer ones, capped at about 32 nearest lights. Coronas as capped sprites.
9. **Third-person camera.** FOV 60, offset (0, 2.2, -6.5), damping 0.08, plus 1.5 m pull-back above 60 km/h.
10. **Ambient occlusion.** GTAOPass with radius about 0.5 world units and blendIntensity 0.8, or cheap baked contact shadows under cars, bins and kerbs if GTAOPass is too costly.

## 6. See also: the design bible

`docs/reference/BIBLE.md` (Stage 3) turns these rendering and camera notes into reviewable design targets for camera, mechanics, graphics, missions, ambient world, radio and the hour-by-hour day in Bed-Stuy, framed by one test: would someone want to live in this Bed-Stuy for a day? Where this file and the bible disagree on a number, the bible's `[tune]` targets win; the sourcing caveats here still apply.
