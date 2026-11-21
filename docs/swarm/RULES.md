# Rules for every lane (read this first; it is short)

Status: current (checked 21 Nov 2026)

Repo: /home/user/GTA-Bedstuy. GTA Bed-Stuy is a non-commercial fan-tribute GTA-style browser game (Three.js, Vite, TypeScript,
vitest). The owner is Carlos Franzetti. Fable Hart (the CEO, the session that started you) directs; you report to Fable.

1. **Talk.** Post like a colleague: `scripts/swarm-say.sh "Your Name (LANE)" "<message>"`. A start post naming the files you
   take, blockers at once, a wrap-up. Read the last 15 posts of docs/swarm/transcript.md before you start so you know who else
   is in your files. Names and teams are in docs/swarm/ORG.md.
2. **Shared tree.** Many lanes edit at once. Touch only your files. Never `git stash`, never commit, never push (Fable commits
   everything, often, so your work in progress will appear in commits: that is expected). Never edit `src/main.ts`: give Fable
   the exact lines in your final report.
3. **Keep it compiling.** `npx tsc --noEmit` must show no errors under `src/` from your files before you stop.
4. **Tests.** Run only the test files for what you touch, with `--maxWorkers=2`. Add or update tests for what you change.
5. **Browser jobs go through the queue**, never directly:
   - the full game: `scripts/swarm-render.sh <command>` (two at a time). In the page, right after boot, hide the game canvas:
     `__gtaDebug.renderer.domElement.style.visibility = 'hidden'`, or this machine's software compositor piles up gigabytes and
     the page is killed. To capture a frame from a hidden canvas: `__gtaDebug.stopLoop()`, then `__gtaDebug.renderOnce()` and,
     in the same task, `renderer.domElement.toDataURL('image/png')` (or `gl.readPixels`) and write it out with Node.
     Use `?perf=0&q=low` unless you need another tier; medium needs about 3.5 GB.
   - a standalone showcase page (one character, one car): `SWARM_SMALL=1 scripts/swarm-render.sh <command>`.
   - no WebGL at all (audio render, network probe): `SWARM_LIGHT=1 scripts/swarm-render.sh <command>`.
   - Keep each job under ten minutes. Never report fps from this machine (software rendering): report triangles and draws.
   - Node needs `NODE_PATH=/opt/node-tools/node_modules:/home/user/GTA-Bedstuy/node_modules` for Playwright. Outbound requests
     from the browser need the proxy: see scripts/playtest/live-radio.cjs.
6. **Scratch files** go under /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/<your-lane>/.
   Give full absolute paths for anything Fable should look at. Look at your own frames before you report and say plainly what
   is wrong in them.
7. **Legal lines that never bend.** No assets, fonts, logos, sounds or traced art from Rockstar or any other game: those games
   are style references only. No Google Maps or Street View data. Third-party data needs a licence that allows this use,
   verified at its source and recorded in docs/CREDITS.md. Store, brand and venue names are parodies. No lettering or logos on
   clothes. Real DJ and artist names are shown for real streams. Never write any AI model identifier in code, docs or commits.
8. **Sizes.** The single-file build has a 12 MB budget and sits near 9.3 MB. Say your byte delta. New data over 60 kB loads
   from a file on hosted and native builds only, unless Fable says otherwise.
9. **Honesty.** Say what you did not verify. If a test is red, say so. If you could not see or hear the result, say so.
10. **Final report** to Fable: what landed, what is not verified, main.ts lines if any, byte delta, evidence paths, decisions
    you need. 250 words at most plus a file list.

## Deployments (12 Nov)
Vercel builds a production deployment for every push to master unless the commit message says otherwise (`ignoreCommand` in
vercel.json). A commit whose message contains "work in progress", starts with "WIP", or contains "[skip deploy]" is not built.
So: lanes' in-flight snapshots use "Lanes' work in progress"; a commit Fable has checked uses a plain description and goes live.
The deployment source leaves out playtests, docs, tests, scripts, native and cache (.vercelignore). Playtest videos are not
tracked in git.

## Starting the game in scripts (12 Nov)
The title screen is dismissed with SPACE (or Enter, a tap on a touch screen, A or Start on a gamepad, a click on the prompt).
Other keys and clicks no longer start the game, and the player cannot move while the title is up. A script that drives the
player must `page.keyboard.press('Space')` first. Frame captures with `__gtaDebug` do not need it.

## Standard check scripts: how to rebuild them (added 21 Nov)
The five scripts below were written by lanes and live in the session scratch folder, which can be lost. They are not in the repo. Each
is 30 to 150 lines of Node. If the folder is gone, write them again from this description. The copies existing on 21 Nov were at
`scratchpad/flicker/smoke.cjs` (boot smoke), `flicker/pedprobe.cjs` (pedestrian probe), `flicker/actcheck.cjs` (action check),
`iphone2/memprobe2.cjs` (phone memory probe) and `mapshot/mapshot.cjs` (map screenshot).

**What they share.** Arguments: the build folder, a port, an output folder. Build first (`VITE_HOSTED=1 npx vite build --outDir <dir>`).
Start `node node_modules/vite/bin/vite.js preview --outDir <dir> --port <port> --strictPort` from the repo and wait about 3 s. Launch
Playwright's Chromium (`NODE_PATH=/opt/node-tools/node_modules:/home/user/GTA-Bedstuy/node_modules`), viewport 960 x 540, collect
`pageerror` and console errors, and abort every request whose host is not localhost (or just `**/ra-api/**`). Open
`http://localhost:<port>/?perf=0&q=low`, wait for `window.__gtaReady === true` (up to 15 minutes on this box), and at once set
`__gtaDebug.renderer.domElement.style.visibility = 'hidden'`. Run the whole script through `scripts/swarm-render.sh`. After the
check call `__gtaDebug.stopLoop()`; draw frames by hand with `step(n)`, `setFreeCam(x, y, z, lookX, lookY, lookZ)`, `renderOnce()` and
`renderer.domElement.toDataURL('image/jpeg', 0.88)`, write them with Node, then `clearFreeCam()`, close the browser and kill the server.

1. **Boot smoke.** Does the build start, draw a sane frame and run the simulation without errors? Press Space, wait 1.5 s and check the
   title (`.hud-splash`) is gone. Stop the loop, `setHour(15)`, `step(30)`, take a frame, `step(120)`, take a frame. Report: meshes, count
   of meshes with a non-finite world matrix (must be 0), pedestrians and vehicles alive, distance the player moved, triangles and draw
   calls from `renderer.info`, and any page or console errors. Frames of the player and of the nearest pedestrian from 2 m.
2. **Pedestrian probe.** `stopLoop()`, `setHour(13)`, `step(150)`, take the six pedestrians nearest the player and photograph each from
   the side and from behind-and-aside at about 3 m, with the pose numbers (torso, hips, leg and knee angles, speed, anim state). Then the
   player from the side, front, behind, feet and top, and the detail level in use (the LOD object's current level).
3. **Action check.** Start page, press W while the title is up and confirm the title stays and the player does not move (0 m). Press Space
   and confirm the title leaves. Stop the loop, dispatch `keydown` `KeyG`, `step(6)`, read the arm rotations, `step(4)`, `keyup`, and take a
   free-camera frame of the punch from 2 m. Also read the hands state (`__gtaDebug.combat`).
4. **Phone memory probe.** Use `devices['iPhone 13']` (or a desktop viewport with the `desktop` argument), Chromium with
   `--js-flags=--expose-gc --enable-precise-memory-info`, and a CDP session. Track every canvas created (wrap `document.createElement` and
   `OffscreenCanvas`) and sample `performance.memory.usedJSHeapSize` every 250 ms for the peak. After boot, and again after play (teleport,
   `step`), call `gc()` twice, read `Runtime.getHeapUsage`, and walk `__gtaDebug.scene`: triangles, vertex and index bytes by top-level
   group and by attribute, textures by size with an estimate of GPU bytes, live 2D canvases and their pixel memory. Also sum the
   `content-length` of every response during boot. Compare against the targets in `docs/swarm/tasks/IPHONE.md`.
5. **Map screenshot.** For `?perf=0&q=low` and `?map=real&perf=0&q=low`: boot, hide the canvas, press Space, wait 0.9 s, `stopLoop()`,
   press M, wait 1.5 s, take a full-page screenshot at 1280 x 720 with device scale factor 2 (the map is a DOM panel, so the hidden canvas
   does not matter), and print pedestrians, vehicles and the player position. The real map needs a hosted build.

Rules that apply to every one of them: never report frames per second; report triangles and draw calls; say that frames were rendered in
software; if the page is killed, run the capture alone and retry once before reporting a failure.

