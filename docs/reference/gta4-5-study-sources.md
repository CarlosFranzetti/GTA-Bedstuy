# Sources for the GTA IV and V study

Read on 21 Nov 2026 by Ines Calloway (STUDY). Companion to `docs/reference/gta4-5-study.md`.
Nothing was downloaded from a game or a rip. Pages were fetched as text through the Firecrawl scraper and the search tool.
"Full text" = I read the page's whole article text. "Extract" = the scraper returned a summary answering a targeted question
(slightly less certain; counts in the vehicle pages were tallied by that tool, so are approximate). "Search excerpt" = I saw
only the search tool's summary and did NOT open the page; these are marked and used only as lower-confidence support.

## Opened and used

| # | URL | Title | Mode | What I took |
|---|---|---|---|---|
| 1 | https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/ | GTA V Graphics Study (part 1) | Full text | Deferred pipeline, G-buffer contents (diffuse, normal, specular/gloss/fresnel, irradiance with emissive), stencil classes, 128x128 environment cubemap of scenery only, alpha-stipple LOD fade, 4 cascaded shadows (1024x4096), half-res SSAO, skin subsurface pass for player and NPCs, filmic tone map with slow adaptive exposure, bloom, lens distortion, 4155 draw calls / 1113 textures / 88 targets |
| 2 | https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study-part-2/ | Part 2: LOD and Reflections | Extract | Low-poly block and district meshes in one draw call (about 2,500 triangles for one hillside district), fog and low-poly distance, 240x120 planar reflection, headlight volumes drawn after main pass |
| 3 | https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study-part-3/ | Part 3: Post-Effects | Extract | Sun flare (about 70 sprites, 12 streak quads), aperture-scaled flares, anamorphic streaks on headlights, depth of field from a CoC map, "wasted" screen blur plus grey plus vignette plus grain |
| 4 | https://www.grandtheftwiki.com/GTA_IV_Handling.dat_Breakdown (redirects to /Handling.cfg/GTAIV) | Handling.cfg/GTAIV, Grand Theft Wiki | Extract | Every IV handling field: mass, drag, centre of mass, steering lock (0.5 typical), drive bias, gears (4 sedans, 5 to 7 sports, 10+ rigs), drive inertia, suspension force/bias/damping/limits/raise, traction curve min/max/lateral, traction bias, brake force and bias (0.6 to 0.7), damage multipliers |
| 5 | https://github-wiki-see.page/m/5mods/tutorials/wiki/Handling-%E2%80%90-Understanding-and-editing-GTAV's-Handling | Understanding and editing GTAV's Handling (5mods tutorials) | Extract | V parameters and recommended values (traction max about 1.7, min about 1.5, lateral about 22 degrees, suspension force 3.0 for sedans or muscle, damping about 1.3, example Phoenix values, top speed 145 mph example) |
| 6 | https://eddlm.github.io/Handling-Tools/guide | Handling guide, eddlm Handling Tools | Extract | Traction curve meaning (Gs before skidding, slip angle), CoM and roll-centre effect on weight transfer, brake force per wheel, brake bias 0.55 to 0.7, gear ratio range 3.33 to 0.9, inertia multiplier for heavy versus nimble |
| 7 | https://traxion.gg/how-grand-theft-auto-iv-broke-the-open-world-mould-for-vehicle-physics/ | How GTA IV broke the open-world mould for vehicle physics (Traxion, 30 Dec 2024) | Full text | IV driving: heavy, body roll, understeer, planning, damage and dents, police on same rules; V more forgiving; just under 120 cars and motorcycles; unlicensed replica approach |
| 8 | https://www.thedrive.com/news/gta-6-driving-physics-hint-at-return-to-the-realism-of-gta-4 | GTA 6 Driving Physics Hint at Return to the Realism of GTA 4 (The Drive, Aug 2026) | Extract | V's extra grip, muted weight transfer and suspension travel versus IV |
| 9 | https://www.grandtheftwiki.com/Clothing_in_GTA_IV | Clothing in GTA IV, Grand Theft Wiki | Extract | Garment and outfit types, three store positions (street, casual and sporting, suits) |
| 10 | https://gta.wiki/w/Clothing_in_GTA_Online | Clothing in GTA Online, GTA Wiki | Extract | Category list: Tops, Pants, Shoes, Hats, Accessories, Glasses, Outfits, Masks |
| 11 | https://gta.wiki/w/Pedestrians_in_GTA_IV | Pedestrians in GTA IV, GTA Wiki | Extract | Pedestrian entries with popcycle groups (cops, prostitutes and pimps, Eastern European, generic, park); no model counts on the page |
| 12 | https://www.grandtheftwiki.com/Vehicles_in_GTA_IV | Vehicles in GTA IV, Grand Theft Wiki | Extract (tallied by tool) | Class headings and approximate entry counts |
| 13 | https://www.grandtheftwiki.com/Vehicles_in_GTA_V | Vehicles in GTA V, Grand Theft Wiki | Extract (tallied by tool) | Class headings and approximate entry counts |
| 14 | https://www.modding-forum.com/guide/1-lod-models/ | LOD Models, Modding Forum guide | Extract | GTA V vehicle LOD levels L0 to L4 with triangle ranges and distances (modder's guide, not Rockstar) |
| 15 | https://gamingbolt.com/grand-theft-auto-vs-art-director-i-want-to-create-new-cities-not-recreate-existing-ones | Garbut: "I want to create new cities" (GamingBolt, 3 Jan 2014, quoting Edge) | Full text | Compress, edit, emphasise; popular perception versus the real city |
| 16 | https://mcvuk.com/development-news/inside-rockstar-north-part-4-the-art/ | Inside Rockstar North Part 4: The Art (MCV/Develop, 7 Oct 2013) | Full text | Blocked-in map first, sculpt like a sculpture, six to eight designers for nine to twelve months, per-block guides and location photos, tone changes within blocks, 150 artists, New York research team |
| 17 | /home/user/GTA-Bedstuy/docs/swarm/art/ART-BAR.md and docs/reference/gta5-style-notes.md | Project docs | Full text | Existing rules and the earlier notes this study corrects |

## Search excerpts only (not opened; support only)

- LCPDFR component and ped wiki pages (lcpdfr.com/wiki/lspdfr/04/modding/doc/component/): GTA V's 12 component slots and drawable/texture pairs. The page itself returned 403; the slot list came from the search tool's summary of the same page plus mod changelogs.
- gta5-mods.com ped changelogs: ped LOD distances 25, 50, 80 (one mod's settings).
- Donut Team forum post: a stock V vehicle at most 85,000 triangles (informal).
- GamesRadar "Why GTA IV is set in Liberty City" and a Kotaku / CarThrottle / Positioniseverything set on handling: borough mapping, Houser's "approximation" remark, split community opinion on IV versus V handling.
- New Yorker report (via a search summary): over a hundred days of research in Los Angeles.
- TechRadar and BuzzFeed-derived summaries of Garbut: "handcrafted", more detail than IV.
- GTA Wiki category page and GTABase: V has 20+ vehicle classes; the vehicle database lists 600+ and 800+ entries (varies by date).

## Pages that failed or gave nothing

- https://www.adriancourreges.com via WebFetch: network not allowed in this session (the same pages opened through Firecrawl).
- https://www.lcpdfr.com/wiki/lspdfr/04/modding/doc/component/: 403 forbidden through the scraper.
- https://gtacars.net/gta5/glossary: opened but returned an error page, no glossary content.
- https://gamesradar.com/why-gta-iv-is-set-in-liberty-city: opened, article text not returned.
- https://gamerant.com/grand-theft-auto-iv-liberty-city-details-only-new-yorkers-appreciate/: returned an empty page (ad overlay).
- https://techradar.com/news/gaming/the-tech-that-built-an-empire-how-rockstar-created-the-world-of-gta-5-1181281: opened, no relevant text returned.
- https://www.gamenguide.com/articles/9144/20140106/...: opened, no lighting content beyond the Garbut quote.
- https://gameranx.com/updates/id/16748/...: opened, only a generic "handcrafted" line.
- Not attempted or not found: any public GDC or SIGGRAPH talk by Rockstar staff; Digital Foundry pages on GTA IV or V (search found none on crowds); an IGN or Edge interview with Garbut on materials; vehicle-class handling tables; any published triangle budget for GTA IV or V people.
