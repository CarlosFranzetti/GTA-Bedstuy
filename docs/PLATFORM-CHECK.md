# Platform check: 5 minutes on your own machine

Everything we test runs on a Linux box with a software renderer (SwiftShader). It never touches a real GPU. If you write down
what these five minutes show, we can fix a glitch without guessing. Do it once in Chrome and once in the native app. Do it on
Windows as well if you can.

## What we have not seen on real hardware yet
| Area | What is untested | Where it lives |
|---|---|---|
| Starting tier | An M4 Mac in Chrome should report `ANGLE Metal Renderer: Apple M4` and start on **high** with pixel ratio 1.75 and SMAA. We have never seen the real string. Safari only says "Apple GPU". | src/render/GpuProfile.ts |
| Windows tiers | The RTX/GTX/RX/Iris/UHD rules use renderer strings we wrote by hand. No real Windows machine has run the game. | GpuProfile.ts |
| Flicker fixes | The FLICKER lane changed the stale culling spheres, the car and person LOD hysteresis and the depth range (near 0.1, far 900). We have only checked them in software. | src/render/Culling.ts, CarLod.ts, DepthRange.ts |
| Colour seam | Playtest p12 D4 showed a hard vertical seam, warm on the left and cool on the right, when the phone was open. Not confirmed. | post chain (Pipeline.ts) |
| Auto quality drop | PerfMonitor drops the tier once after a sustained slow stretch. We have never seen it on a 120 Hz ProMotion screen. | src/render/Perf.ts |
| Context loss | The guard should recover from a lost GPU context (sleep and wake, switching GPUs, a driver reset) without a black screen. It has never fired on a real GPU. | src/render/ContextGuard.ts |
| Native app GPU | Electron forces ANGLE Metal on the Mac and D3D11 on Windows, plus the high-performance GPU. Only the CI build has run it. | native/src/main.ts |
| Neural voices | The WebGPU path is off by default and untested. The WASM path is slow on our box. | src/audio/voice/** |

## The check (about 5 minutes)

**1. Chrome, normal (1 min).** Open https://gta-bedstuy.vercel.app/?debug=gfx and start a game. A dark panel shows up in the
top-left corner. Click **Copy report** and paste the text into your message. The first lines matter most: renderer, profile
tier, dpr, buffer size and passes.

**2. Find the glitch (1 min).** Go to wherever the glitch shows up. Note what it looks like (flicker, shimmer, black or white
patches, a seam, z-fighting stripes, things popping in or out, a wrong colour, a stutter) and where it is (on the road,
buildings, cars, people, sky, shadows, the whole screen, or only the edges). Say whether it happens while standing still,
walking, driving or turning the camera. Note the time of day too, since night uses other passes. A screenshot (Cmd+Shift+4)
or a short screen recording (Cmd+Shift+5) is worth more than any description.

**3. Switch things off (2 min).** In the panel, untick one box at a time and check whether the glitch goes away: Ambient
occlusion, Bloom, Depth of field, Anti-aliasing, Vignette, Film grain. Tick it again before you try the next one. Tell us
which box made it go away, or that none did.

**4. Change the tier (1 min).** Open the same link with `&q=medium`, then with `&q=low`, for example
`https://gta-bedstuy.vercel.app/?debug=gfx&q=low`. Tell us whether the glitch is there on each tier. Low and medium drop
some shadows, reflections and LOD distance, so this narrows the cause.

**5. Chrome's renderer (optional, 1 min).** Go to `chrome://flags`, search for **ANGLE**, set "Choose ANGLE graphics
backend" to **OpenGL**, relaunch and repeat step 2. Then set it back to **Default**. If the glitch only happens on the default
(Metal) backend, it is a Metal driver difference and we know where to look. Also open `chrome://gpu`, scroll to
"Driver Information" and copy the `GL_RENDERER` line.

**6. Native app.** Quit the app, then start it from Terminal with the overlay:
`open -a "GTA Bed-Stuy" --args --debug-gfx` (add `--q=low` to force a tier). On Windows, run
`"GTA Bed-Stuy.exe" --debug-gfx`. Repeat steps 1 to 3. Tell us whether the glitch also shows up in the app or only in Chrome.

## What to send us (copy this)
```
Machine: (e.g. MacBook Air M4, 16 GB, macOS 15.x, built-in screen or external 4K)
Browser / app: (Chrome version from chrome://version, or native app build)
Report: (paste from "Copy report")
Glitch: (what it looks like, where, when: standing / driving / turning, day / night)
Goes away when I switch off: (box name, or "none")
Tiers: high ? / medium ? / low ?
ANGLE OpenGL instead of Metal: (gone / still there / not tried)
Native app: (same / not there / not tried)
Frame rate feel: (smooth / choppy, and where)
Screenshot or video: (attached)
```
