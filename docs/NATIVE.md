# Native desktop apps (macOS Apple Silicon, Windows x64)

GTA Bed-Stuy is a non-commercial fan tribute. The desktop apps are a thin Electron shell (`native/`) around the same hosted web build the browser version uses, so the browser and the app draw the same game with the same Chromium WebGL2 engine. The web build and the 12 MB single-file artifact are untouched.

## Get it running in under two minutes (owner)

1. On GitHub open the repository, **Actions**, the workflow **native**, and the newest run with a green tick. (Builds start by themselves when game or app files change on `master`; **Run workflow** starts one by hand.)
2. Scroll to **Artifacts** at the bottom of the run page. Download `gta-bedstuy-mac-arm64-<commit>` (your M4 Mac) or `gta-bedstuy-win-x64-<commit>` (Windows). Downloads need a GitHub login; they are kept 30 days. The file names carry the commit, so you can tell which build you have.
3. Unzip.
   - **Mac**: open `GTA-Bed-Stuy-<version>-<commit>-mac-arm64.dmg`, drag the game to Applications. The app is not signed by Apple (we have no paid developer account yet), so the first start needs one extra step:
     - Double-click it. macOS says it cannot verify it. Click **Done**.
     - **Apple menu, System Settings, Privacy & Security**, scroll down to the line about "GTA Bed-Stuy was blocked", click **Open Anyway**, then **Open** and your password or Touch ID. macOS 14 and older also allow the old shortcut: right-click the app, **Open**, **Open**. Apple removed that shortcut in macOS 15.
     - Or one line in Terminal, no clicking: `xattr -dr com.apple.quarantine "/Applications/GTA Bed-Stuy.app"`.
     - You do this once per downloaded build.
   - **Windows**: run `GTA-Bed-Stuy-Setup-...exe` (installer) or `GTA-Bed-Stuy-Portable-...exe` (no install). Windows shows "Windows protected your PC": click **More info**, then **Run anyway**.
4. The game starts in real full screen. `F11` (Windows) or `Ctrl+Cmd+F` (Mac) switches to a window and back; `Alt+Enter` also works on Windows.

If something looks wrong: menu **Game, Copy Graphics Report** (`Ctrl/Cmd+Shift+G`, the menu bar shows when you press Alt on Windows or is at the top of the Mac screen), paste the text to us, and add what you saw. Steps for a proper check are in `docs/PLATFORM-CHECK.md`.

## Why Electron (not Tauri)
- Same engine everywhere: bundled Chromium (the engine the game is tuned and tested on). Tauri would use WKWebView on Mac and WebView2 on Windows, so WebGL2, WebAudio, workers and the SoundCloud widget iframe would behave differently on Mac.
- Reliable WebGL2 via ANGLE (Metal on macOS, Direct3D 11 on Windows), the discrete GPU is requested, autoplay is allowed so radio and title music start without a click, background throttling is off.
- Cost: download about 100 MB instead of about 10 MB. Accepted for a 3D game.

## What the shell does
- Serves the web build from a secure `app://bedstuy` protocol. Relative fetches (`anim/street.bin`, `voice/`, `data/*.json`, `fonts/`, `art/`, the lazy `?map=real` chunks) all resolve there; `/ra-api/*` is forwarded to `https://ra-nyc.vercel.app/api/*` in the main process (12 s timeout, no CORS).
- Strict content security policy and navigation rules. One list of remote hosts: `REMOTE_ALLOWLIST` in `native/src/policy.ts`. Radio streams may come from any https host (media elements cannot run code; stations redirect between CDNs). `contextIsolation` on, `nodeIntegration` off, `sandbox` on, no camera or microphone permission.
- **Launch**: true full screen by default (menu **Game, Start in Full Screen** turns it off; `--windowed` and `--fullscreen` override once). The window is black and hidden until the first frame is ready, so there is no white flash. Window size and place are remembered for the windowed mode. One instance only. The display is kept awake while the app runs (a gamepad does not count as activity to the OS).
- **Menu** (Game): Toggle Full Screen, Start in Full Screen, Reload (`Ctrl/Cmd+Shift+R`, not bare `R`, so it cannot fire mid-drive), Copy Graphics Report, Show Saves Folder, Quit. On Mac the usual app menu, Edit and Window menus are there too. The window title is always "GTA Bed-Stuy"; the icon is `public/icons/icon-512.png`.
- **Saves and settings** live in the app's own profile folder (the game keeps them in `localStorage`, nothing goes to the cloud): Mac `~/Library/Application Support/GTA Bed-Stuy/`, Windows `%APPDATA%\GTA Bed-Stuy\`. A plain copy of them is also written to `saves-backup.json` in that folder every 15 seconds and when the window closes; it is only read back if the browser storage is found empty (damaged or cleared profile). Pause menu, Export saves writes a file of your choice.
- **Gamepad**: the browser Gamepad API that `src/core/Gamepad.ts` already uses; it needs the window in focus. Not tested with real hardware yet.
- **GPU**: ANGLE Metal on the Mac, Direct3D 11 on Windows, the high-performance GPU requested (`force_high_performance_gpu`; the game also asks for `powerPreference: high-performance`), GPU rasterization on, Windows window-occlusion throttling off. To try another backend: `--angle=gl` (also `metal`, `d3d11`, `d3d9`, `vulkan`). `GTA_IGNORE_GPU_BLOCKLIST=1` forces WebGL on a blocklisted GPU.
- **Switches**: `--debug-gfx` opens the graphics overlay, `--q=phone|low|medium|high` forces a quality tier, `--windowed`, `--fullscreen`, `--angle=<name>`, `--log-console` (page console to the terminal), `--dev` (DevTools). Mac: `open -a "GTA Bed-Stuy" --args --debug-gfx --q=low`. Windows: `"GTA Bed-Stuy.exe" --debug-gfx`.
- `window.gtaNative = { isNative, platform, version, setFullscreen(b), quit(), saveFile(name, text) }`. Game code uses `src/native/NativeBridge.ts` (feature detection only).
- If the renderer process dies (driver reset, memory), the page reloads itself instead of leaving a black window.

## What the app downloads at run time, and from where
The installer carries the whole game: code, fonts, art, baked voice pack, animation packs, map data. Only the things below are fetched by the player's machine while playing. Everything else is blocked by the policy.

| What | From | When | Licence note |
|---|---|---|---|
| SoundCloud player (`api.js` and the widget iframe) and the tracks it streams | `w.soundcloud.com`, `api.soundcloud.com`, `api-v2.soundcloud.com`, `api-widget.soundcloud.com`, `*.sndcdn.com` | when a SoundCloud-based radio station is tuned | SoundCloud's own embed terms; we only use the official widget |
| Live radio streams (WFMU, KEXP, SomaFM, WNYC and fallbacks) | each station's own public stream host (any https host) | when such a station is tuned | public streams, credited in the Radio panel |
| Now-playing lines | `api.kexp.org`, `api.somafm.com` | while KEXP or SomaFM plays | public APIs |
| RA NYC event and podcast pool for the Resident Advisor station | `ra-nyc.vercel.app` through the app's own `/ra-api/` route | when that station is tuned | the studio's own proxy service |
| **"HD voices" (opt-in): the kokoro-js 1.2.1 library** (a single 2.1 MB file, `kokoro.web.js`, with transformers.js and the **eSpeak NG phonemizer (GPL-3.0)** inside it) and the onnxruntime-web WebAssembly files | `cdn.jsdelivr.net` | only if the player turns on HD voices | Apache-2.0 / MIT, and GPL-3.0 for eSpeak NG |
| "HD voices": Kokoro-82M model weights and voice styles (about 92 MB, cached by the browser) | `huggingface.co`, `*.huggingface.co`, `*.hf.co` | same | Apache-2.0 |

**eSpeak NG (GPL-3.0) is not in the installer.** It is not in `native/`, not in the web build, not in `package.json` or any lock file of the game, and the packaging step fails if a file or script that looks like it (`espeak`, `phonemizer`) ends up in the web build (`native/scripts/webcheck.mjs`, run before packaging and again inside the finished app). It reaches a player's machine only if that player opts in to HD voices, straight from jsDelivr, as part of kokoro-js, exactly as in a browser. The pre-baked voice clips inside the installer are audio that the Kokoro model rendered on the studio's machines; they contain no eSpeak code. If this project ever vendors that library, re-check the GPL implications first (`docs/CREDITS.md`, HD voices).

Nothing else is downloaded: no auto-update, no analytics, no crash upload.

## What the installer contains, with licences
Sources and long form: `docs/CREDITS.md`, section "Desktop apps (NATIVE2)".

| Component | Licence |
|---|---|
| Electron 45 (Node.js, V8) | MIT |
| Chromium and its libraries incl. FFmpeg (separate library file, LGPL-2.1 build) | BSD-3-Clause and others; full text in `LICENSES.chromium.html` inside the app |
| three.js | MIT |
| Game code, procedural audio (title theme, credits music) | original to this project |
| Fonts Anton, Barlow, Barlow Condensed | SIL OFL 1.1 |
| PBR textures; car and character models; MakeHuman base mesh | CC0 1.0 |
| Captured walk and run motion (CMU) | free for all uses, acknowledgement kept in the credits |
| Baked DJ and talk voice clips (Kokoro-82M output) | Apache-2.0 model; clips are our own render |
| Brooklyn overview and street-furniture data | NYC Open Data public data (terms page not re-read, see CREDITS) |

Electron's FFmpeg can decode AAC and H.264 (patent-encumbered formats). That is not a copyright question for this free project, but it is why a commercial release would need a legal check.

## Build locally
Needs Node 20.19+ (22 recommended).

macOS (Apple Silicon Mac):
```
npm ci && npm --prefix native ci
VITE_HOSTED=1 npm run build
npm --prefix native run dist:mac      # -> native/release/*.dmg and *.zip
npm --prefix native run dev           # run from source with DevTools
```
Windows (PowerShell):
```
npm ci; npm --prefix native ci
$env:VITE_HOSTED='1'; npm run build; Remove-Item Env:VITE_HOSTED
npm --prefix native run dist:win      # -> native/release/*.exe (installer and portable)
```
`GTA_WEB_DIR=<folder>` makes the packaging step take the web build from another folder; `GTA_BUILD_ID=<text>` adds text to the installer file names (CI uses the short commit).

## The CI workflow (`.github/workflows/native.yml`)
- Starts on a push to `master` that touches `native/**`, the workflow, or anything the hosted web build is made from (`src/**`, `public/**`, `index.html`, `vite.config.ts`, `package*.json`, `tsconfig*.json`), on a `v*` tag, and by hand. A newer push cancels a build still running for the same branch.
- Job **smoke** (Linux, virtual display): builds the web bundle, runs the shell's unit tests, boots the real Electron app and checks the title screen, start, one frame, fonts, street animation pack, voice pack, map data, the radio and voice hosts in the policy, and the graphics report (`native/scripts/smoke.mjs`). Software rendering only: it proves the app boots, not how it looks or runs on a GPU.
- Job **build** (macOS arm64, Windows x64): hosted web build, shell tests, packaging, then `verify-package.mjs` looks inside the finished app and fails if the web build is missing, is the single-file artifact, lacks fonts, voice pack, `street.bin` or map data, or contains the phonemizer. Artifacts are named with the commit: `gta-bedstuy-mac-arm64-<commit>` and `gta-bedstuy-win-x64-<commit>`; the installers inside carry it too. A missing installer fails the upload step.
- A tag such as `v0.1.0` also attaches the installers to a GitHub Release.
- Never verified on GitHub's runners yet: nobody has run this workflow. The Linux unpacked app and the smoke test are the only things run so far.

## Signing (optional, secrets are not set up yet)
Add repository secrets; the workflow already reads them and signs only when present.
- macOS: Apple Developer Program membership ($99/year) and a "Developer ID Application" certificate exported as .p12. Secrets: `CSC_LINK` (base64 of the .p12 or a URL), `CSC_KEY_PASSWORD`; for notarization also `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Hardened runtime and `native/build/entitlements.mac.plist` are ready. Signed and notarized builds remove the "Open Anyway" step.
- Windows: a code-signing certificate (OV, or EV for instant SmartScreen reputation). Secrets: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
No auto-update is included.

## Develop and test the shell
```
npm --prefix native run typecheck && npm --prefix native test
npm --prefix native run compile
GTA_WEB_DIR=<hosted build folder> npm --prefix native run prep
scripts/swarm-render.sh xvfb-run -a node native/scripts/smoke.mjs --json out.json --shot out.png   # Linux boot smoke
```
The smoke script hides the game canvas before the page runs (swarm rules), uses `--debug-gfx --q=low`, adds `perf=0`, and takes `--query "map=real&perf=0"` for the real-map path. Env switches: `GTA_SMOKE=1` (set by the script: software GL, no saved state), `GTA_IGNORE_GPU_BLOCKLIST=1`.
