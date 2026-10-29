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
