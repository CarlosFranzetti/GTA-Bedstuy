# Rules for every lane (read this first; it is short)

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
