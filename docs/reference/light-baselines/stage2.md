# Stage 2 lighting baselines (L9)

Numeric only; the PNGs stay in the session scratchpad. Produced by `node scripts/light-audit.mjs` (headless swiftshader, 640x360,
sRGB luma 0..1; "blown" = pixels > 0.95, "crushed" = < 0.05, "low-half" = bottom half of the frame = street level).
Build = Stage 2 tree at 00:0xZ (Weather wired by P8, S4 storefronts and B3 facades partly landed). Gate: blown < 0.5 % everywhere (max seen 0.09 %).
Scope: the machine was at load ~20 (six lanes), so car and aerial views were not re-run at Stage 2; Stage 1 numbers for them stay in git history (`fin_*` set, scripts/light-audit.mjs defaults).

## Street view (player on foot at the spawn), low tier
| hour | mean | blown % | crushed % | sat | low-half mean | low-half blown % |
|---|---|---|---|---|---|---|
| 6 | 0.082 | 0.00 | 37.5 | 0.61 | 0.066 | 0.00 |
| 9 | 0.187 | 0.00 | 20.7 | 0.63 | 0.121 | 0.00 |
| 12 | 0.314 | 0.00 | 1.7 | 0.36 | 0.252 | 0.00 |
| 15 | 0.305 | 0.02 | 2.3 | 0.34 | 0.264 | 0.00 |
| 18 | 0.158 | 0.00 | 29.5 | 0.64 | 0.114 | 0.00 |
| 19.5 | 0.234 | 0.02 | 27.8 | 0.52 | 0.192 | 0.00 |
| 21 | 0.242 | 0.02 | 26.0 | 0.58 | 0.194 | 0.00 |
| 0 | 0.244 | 0.02 | 24.6 | 0.57 | 0.199 | 0.00 |

Note: from ~23:00Z the spawn street view looks into a large lit shop window (S4 storefront glazing, flat cream, ~0.85 luma), which
lifts the night street mean from 0.097 / 0.104 (21h / 0h, audit at 22:36Z before S4 landed) to ~0.24. The 0.09-0.11 target is met
without that face; the request to cap shop-window glazing emissive at 0.35 x texel went to S4 (transcript 00:15Z).

## Night lamp views, low tier (21h / 0h)
| hour | mean | blown % | crushed % | sat | low-half mean | low-half blown % |
|---|---|---|---|---|---|---|
| 21 | 0.218 | 0.08 | 27.6 | 0.44 | 0.260 | 0.04 |
| 0 | 0.220 | 0.09 | 27.8 | 0.43 | 0.248 | 0.06 |

| hour | mean | blown % | crushed % | sat | low-half mean | low-half blown % |
|---|---|---|---|---|---|---|
| 21 | 0.121 | 0.01 | 58.9 | 0.67 | 0.098 | 0.00 |
| 0 | 0.184 | 0.04 | 30.7 | 0.51 | 0.210 | 0.04 |

Signal lamps (HDR 2.2-2.6, toneMapped off) bloom as crisp points: blown 0.08 / 0.09 %, no haze (night bloom threshold 0.9, strength 0.5).

## Medium tier, street view (12 / 18 / 0)
| hour | mean | blown % | crushed % | sat | low-half mean | low-half blown % |
|---|---|---|---|---|---|---|
| 12 | 0.318 | 0.00 | 2.3 | 0.37 | 0.254 | 0.00 |
| 18 | 0.156 | 0.00 | 27.9 | 0.64 | 0.115 | 0.00 |
| 0 | 0.246 | 0.01 | 25.0 | 0.57 | 0.198 | 0.00 |

## Wet ground (snapped `weather.setState('wet', true)`), low tier, street view
| hour | mean | blown % | crushed % | sat | low-half mean | low-half blown % |
|---|---|---|---|---|---|---|
| 12 wet | 0.311 | 0.00 | 2.3 | 0.40 | 0.230 | 0.00 |
| 0 wet | 0.236 | 0.03 | 29.6 | 0.60 | 0.193 | 0.00 |

12h dry for comparison: low-half mean 0.252 vs wet 0.230; the road turns mirror-like (sky and car reflected), night shows lamp glints in the puddles.

## Shadow bias (acne / peter-panning), measured on a controlled rig
Rig (scratchpad `acne3.mjs`): a 36 m plane, 1 m cube, 0.15 m x 0.3 m curb strip, 3 m pole, a wall parallel to the sun azimuth and a wall facing the sun,
placed at y = 45 m in full sun; sun elevation 11.5 deg (7h) and 17.2 deg (18h).

| tier | texel (cm) | old flat (normalBias / bias) | acne at 7h / 18h | 0.15 m curb shadow | final normalBias / bias |
|---|---|---|---|---|---|
| medium | 7.8 | 0.5 / -0.0003 (and 0.24 / -0.00025) | none (also none with both = 0) | lost with 0.5 and 0.24, present at 0.04-0.08 | 0.06 / -0.0002 |
| high | 4.9 | 0.5 / -0.0003 | none (also none with both = 0) | faint line, attached | 0.04 / -0.00015 |
| low | 11.7 | 0.5 / -0.0003 | not rendered on the rig (same rule, 1 texel) | n/a | 0.10 / -0.0003 |

The city streets at 7h / 18h are almost entirely in building shade (row houses 12-15 m, sun 11-17 deg), so acne can only show on roofs, upper facades and
sun-parallel walls; none were visible at medium or high in the stoop / east-west street audit frames either.


# Stage 3 column (L10, 1 Nov, build 16:15Z, after the shop-glazing cap)
Same rig (`node scripts/light-audit.mjs`, 640x360, low tier unless stated). S2 = the Stage 2 numbers above, S3 = this build.
Caveat for the day rows: W2 rebuilt the avenue faces between the two runs, so the spawn view now has a tree trunk in the foreground and a brick wall on the right
instead of the Stage 2 open shopfront; day means are therefore not comparable one to one (the street is in building shade), only the night rows and blown % are.

## Street view (spawn), low tier
| hour | S2 mean | S3 mean | S3 blown % | S3 crushed % | S3 sat | S3 low-half mean |
|---|---|---|---|---|---|---|
| 6 | 0.082 | 0.083 | 0.00 | 37.3 | 0.53 | 0.078 |
| 9 | 0.187 | 0.140 | 0.00 | 19.7 | 0.49 | 0.103 |
| 12 | 0.314 | 0.207 | 0.00 | 6.4 | 0.37 | 0.171 |
| 15 | 0.305 | 0.231 | 0.00 | 12.1 | 0.31 | 0.216 |
| 18 | 0.158 | 0.135 | 0.00 | 25.3 | 0.46 | 0.118 |
| 19.5 | 0.234 | 0.131 | 0.01 | 24.5 | 0.56 | 0.112 |
| 21 | 0.242 | 0.127 | 0.01 | 30.3 | 0.62 | 0.100 |
| 0 | 0.244 | 0.130 | 0.01 | 28.0 | 0.61 | 0.104 |

Night spawn mean is now inside the 0.085-0.13 target at 21h and 0h (it is the upper edge of the band).

## Night lamp / shop views, low tier
| view, hour | S2 mean | S3 mean | S3 blown % | S3 crushed % | S3 low-half mean |
|---|---|---|---|---|---|
| signals 21 | 0.218 | 0.208 | 0.08 | 27.9 | 0.240 |
| signals 0 | 0.220 | 0.218 | 0.08 | 26.2 | 0.243 |
| shops 21 | 0.121 | 0.111 | 0.01 | 50.3 | 0.104 |
| shops 0 | 0.184 | 0.139 | 0.01 | 36.7 | 0.171 |

## Medium tier, street view
| hour | S2 mean | S3 mean | S3 blown % | S3 crushed % | S3 low-half mean |
|---|---|---|---|---|---|
| 12 | 0.318 | 0.208 | 0.00 | 6.4 | 0.170 |
| 18 | 0.156 | 0.132 | 0.00 | 24.5 | 0.116 |
| 0 | 0.246 | 0.130 | 0.01 | 27.0 | 0.104 |

Blown stays <= 0.08 % in every frame (gate < 0.5 %).

## Shop glazing cap (night)
Cause: `storefrontGlass` shared one night emissive (0.9 x warm `#ffd27a`) with `window`, and its emissive map is a flat white rectangle for the whole glass, so one shop face
read as a ~0.85-luma cream wall. Fix, in `src/textures/MaterialLibrary.ts` only: per-key night intensity (`GLASS_NIGHT_INTENSITY`): `storefrontGlass` 0.35 (variant 0) / 0.28 (variant 1),
`window` unchanged at 0.9 (only variants 0 and 3 of four have a lit emissive map, so upper floors stay a warm patchwork of lit and dark rooms). Lightbox 0.55 and stickers are S4's and unchanged.

Before/after on the Stage 2 audit command (`--hours 21,0 --views street,shops,signals --q low`, before = 15:2xZ build, same spawn scene with the big shop face):
| view | hour | before mean | after mean |
|---|---|---|---|
| street | 21 | 0.240 | 0.127 |
| street | 0 | 0.141 | 0.130 |
| shops | 21 | 0.117 | 0.111 |
| shops | 0 | 0.170 | 0.139 |
| signals | 21 / 0 | 0.216 / 0.218 | 0.208 / 0.218 |

The street rows also include W2's layout change; the same-build A/B (`--glass 0.9` forces the old value) on a close-up of the nearest shopfront at 21h gives a glazing crop mean of
0.395 -> 0.300 luma and a frame mean 0.128 -> 0.118, glazing still clearly lit (PNG scratchpad `l10/glaze_before.png` / `glaze_after.png`).

## GTAO proxy halo check (AoProxy vs real scene)
Same medium build, `?proxies=0` (GTAOPass renders the real scene) vs default (proxy cells), 640x360, spawn street + aerial, 12h and 21h; Default frames, AO-only output, 12h Normal output:
mean absolute luma difference 0.1-1.2 / 255 (pixels differing by > 16: 0.00-0.36 %), edge band around strong luma edges 0.1-2.6 / 255 versus 0.1-1.0 off-edge. The only visible differences are
the player capsule vs the real body and car hulls vs real cars (AO blob shape), and a few lamps. Building edges show no halo or outline difference between modes. The dotted dark
fringe at depth discontinuities (awning edge, poles) is identical with `?proxies=0`, so it comes from GTAOPass (8 samples + denoise) and not from the proxy geometry or normals; it is
faint (AO min 188/255 at 0.8 blend). Not reproducible as a proxy defect; no change to AoProxy.ts / Pipeline.ts.
