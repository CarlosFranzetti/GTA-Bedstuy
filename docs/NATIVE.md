# Native desktop apps (macOS Apple Silicon, Windows x64)

GTA Bed-Stuy is a non-commercial fan tribute. The desktop apps are a thin Electron shell (`native/`) around the same hosted web build the browser version uses. The web build and the 12 MB single-file artifact are untouched.

## Why Electron (not Tauri)
- Same engine everywhere: bundled Chromium (the engine the game is tuned and tested on). Tauri would use WKWebView on Mac and WebView2 on Windows, so WebGL2, WebAudio, workers and the SoundCloud widget iframe would behave differently on Mac.
- Reliable WebGL2 via ANGLE (Metal on macOS, D3D11 on Windows), the discrete GPU can be forced (`force_high_performance_gpu`), autoplay policy can be relaxed so radio and loading music start without a click, background throttling can be disabled.
- Cost: download about 100 MB instead of about 10 MB. Accepted for a 3D game.

## What the shell does
- Serves `dist/` from a secure `app://bedstuy` protocol (relative assets, fetch, localStorage and the SoundCloud iframe work) and proxies `/ra-api/*` to `https://ra-nyc.vercel.app/api/*` in the main process (12 s timeout, no CORS).
- Strict CSP and navigation rules. One allowlist array: `REMOTE_ALLOWLIST` in `native/src/policy.ts` (SoundCloud widget and media CDN, jsDelivr and Hugging Face for the voice model). External links open in the system browser. `contextIsolation` on, `nodeIntegration` off, `sandbox` on.
- Fullscreen: F11, Alt+Enter (Windows), Ctrl+Cmd+F (macOS). Window size, position, maximized and fullscreen are remembered. Single instance. Menu is minimal (Toggle Full Screen, Reload, Quit; DevTools only with `--dev`).
- `window.gtaNative = { isNative, platform, version, setFullscreen(b), quit(), saveFile(name, text) }`. Game code uses `src/native/NativeBridge.ts` (feature detection only).
- Saves stay in localStorage (inside the app's own profile).

## Build locally
Needs Node 20.19+ (22 recommended).

macOS (Apple Silicon Mac):
```
npm ci && npm --prefix native ci
npm run native:build:mac      # -> native/release/*.dmg and *.zip
npm run native:dev            # run from source with DevTools
```
Windows (PowerShell; the `VITE_HOSTED=1` shell syntax in npm scripts needs Git Bash, or run the steps by hand):
```
npm ci; npm --prefix native ci
$env:VITE_HOSTED='1'; npm run build; Remove-Item Env:VITE_HOSTED
npm --prefix native run dist:win   # -> native/release/*.exe (installer and portable)
```

## Build in CI and download
GitHub: Actions, "native", Run workflow (branch master). It builds `macos-latest` (Apple Silicon, arm64) and `windows-latest` (x64) and uploads artifacts `gta-bedstuy-mac-arm64` and `gta-bedstuy-win-x64` on the run page. Pushing a tag `v*` (for example `git tag v0.1.0 && git push origin v0.1.0`) also attaches the files to a GitHub Release. CI is the first proof that the Mac and Windows packages build; nothing was built on those platforms before it ran.

## Opening an unsigned app
- macOS: the app is ad-hoc signed, not notarized. Open the dmg, drag to Applications, then right-click the app, Open, Open. Or: `xattr -dr com.apple.quarantine "/Applications/GTA Bed-Stuy.app"`.
- Windows: SmartScreen shows "Windows protected your PC". Click "More info", then "Run anyway". The portable exe needs no install.

## Signing (optional, secrets are not set up yet)
Add repository secrets; the workflow already reads them and signs only when present.
- macOS: Apple Developer Program membership ($99/year) and a "Developer ID Application" certificate exported as .p12. Secrets: `CSC_LINK` (base64 of the .p12 or a URL), `CSC_KEY_PASSWORD`; for notarization also `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Hardened runtime and `native/build/entitlements.mac.plist` are ready.
- Windows: a code-signing certificate (OV, or EV for instant SmartScreen reputation). Secrets: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
No auto-update is included.

## Develop and test the shell
```
npm --prefix native run typecheck && npm --prefix native test
xvfb-run -a node native/scripts/smoke.mjs   # Linux boot smoke on port 4477 (needs native/web from `npm --prefix native run prep`)
```
Env switches: `GTA_IGNORE_GPU_BLOCKLIST=1` (try on a blocklisted GPU), `GTA_SMOKE=1` (software GL, used by the smoke script).
