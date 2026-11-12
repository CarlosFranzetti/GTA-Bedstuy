import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, net, powerSaveBlocker, protocol, session, shell, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  APP_HOST, APP_ORIGIN, APP_SCHEME, RA_TIMEOUT_MS, buildCsp, isAllowedNavigation, isAppNavigation,
  isExternalOpenable, loadState, mapRaApi, resolveAppPath, saveState, appQueryFromArgs,
  chooseAngle, sanitizeStorageSnapshot, wantsFullscreenAtLaunch, type Prefs,
} from './policy';
import { formatGraphicsReport, type GfxFacts } from './report';

const dev = process.argv.includes('--dev');
const smoke = process.env.GTA_SMOKE === '1'; // headless boot test (xvfb): software GL, no state, no single-instance lock
const isMac = process.platform === 'darwin';
const NAME = 'GTA Bed-Stuy';
const DISCLAIMER = 'GTA Bed-Stuy is a non-commercial fan tribute. It is not affiliated with, endorsed by, or connected to Rockstar Games or Take-Two Interactive.';
app.setName(NAME);

// --- GPU / media switches (must precede app ready) ---
const sw = app.commandLine;
const angle = smoke ? 'swiftshader' : chooseAngle(process.platform, process.argv); // metal on Apple Silicon, d3d11 on Windows, `--angle=<name>` overrides
sw.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // radio and the title music start without a click
sw.appendSwitch('disable-renderer-backgrounding');
sw.appendSwitch('disable-background-timer-throttling');
sw.appendSwitch('disable-backgrounding-occluded-windows');
sw.appendSwitch('force_high_performance_gpu'); // dual-GPU laptops: use the discrete GPU for ANGLE's adapter
sw.appendSwitch('enable-gpu-rasterization');
if (angle) sw.appendSwitch('use-angle', angle);
if (process.platform === 'win32') sw.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // keep the frame loop at full rate behind other windows
if (process.env.GTA_IGNORE_GPU_BLOCKLIST === '1') sw.appendSwitch('ignore-gpu-blocklist');
if (smoke) { sw.appendSwitch('enable-unsafe-swiftshader'); sw.appendSwitch('no-sandbox'); }

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web');
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const prefFile = () => path.join(app.getPath('userData'), 'prefs.json');
let win: BrowserWindow | null = null;

const storageFile = () => path.join(app.getPath('userData'), 'saves-backup.json');
const logConsole = smoke || process.argv.includes('--log-console');

function readPrefs(): Prefs { try { const p = JSON.parse(fs.readFileSync(prefFile(), 'utf8')); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
function writeJsonAtomic(file: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch { /* a full disk must never take the game down */ }
}
function writePrefs(p: Prefs): void { writeJsonAtomic(prefFile(), p); }

function toggleFullscreen(on?: boolean) {
  if (!win) return;
  win.setFullScreen(on === undefined ? !win.isFullScreen() : on);
}

async function appProtocol(req: Request): Promise<Response> {
  const ra = mapRaApi(req.url);
  if (ra) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), RA_TIMEOUT_MS);
    try {
      const r = await net.fetch(ra, { method: req.method === 'GET' || req.method === 'HEAD' ? req.method : 'GET', signal: ctl.signal, bypassCustomProtocolHandlers: true });
      return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' } });
    } catch {
      return new Response(JSON.stringify({ error: 'upstream unavailable' }), { status: 504, headers: { 'content-type': 'application/json' } });
    } finally { clearTimeout(t); }
  }
  const file = resolveAppPath(req.url, webRoot);
  if (!file) return new Response('Forbidden', { status: 403 });
  try {
    const headers = new Headers(req.headers);
    return await net.fetch(pathToFileURL(file).toString(), { headers, bypassCustomProtocolHandlers: true });
  } catch { return new Response('Not found', { status: 404 }); }
}

/** Gathers what a person needs to paste into a bug report and puts it on the clipboard. Returns the text. */
async function collectGraphicsReport(): Promise<string> {
  const w = win;
  let page: GfxFacts['page'] = null;
  if (w && !w.isDestroyed()) {
    try {
      page = await w.webContents.executeJavaScript(`(() => {
        try {
          const dbg = window.__gtaDebug;
          let gl = dbg && dbg.renderer && dbg.renderer.getContext && dbg.renderer.getContext();
          let tmp = null;
          if (!gl) { tmp = document.createElement('canvas'); gl = tmp.getContext('webgl2') || tmp.getContext('webgl'); }
          const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
          const out = {
            renderer: gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '',
            vendor: gl ? String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR)) : '',
            version: gl ? String(gl.getParameter(gl.VERSION)) : '',
            overlay: (document.querySelector('[data-gfx-debug] pre') || {}).textContent || '',
            dpr: window.devicePixelRatio, innerWidth: window.innerWidth, innerHeight: window.innerHeight,
          };
          if (tmp && gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
          return out;
        } catch (e) { return { error: String(e) }; }
      })()`, true);
    } catch (e) { page = { error: String(e) }; }
  }
  let gpuDevices: GfxFacts['gpuDevices'] = [];
  try { gpuDevices = ((await app.getGPUInfo('basic')) as { gpuDevice?: GfxFacts['gpuDevices'] }).gpuDevice ?? []; } catch { /* report without it */ }
  const text = formatGraphicsReport({
    app: `${NAME} ${app.getVersion()}`,
    versions: { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node },
    platform: process.platform, arch: process.arch,
    angle: angle ?? '(chromium default)',
    switches: process.argv.filter((a) => /^--(debug-gfx|q=|angle=|windowed|fullscreen)/.test(a)),
    fullscreen: !!w && !w.isDestroyed() && w.isFullScreen(),
    displays: screen.getAllDisplays().map((d) => ({ w: d.size.width, h: d.size.height, scale: d.scaleFactor, hz: d.displayFrequency })),
    gpuDevices,
    featureStatus: app.getGPUFeatureStatus() as unknown as Record<string, string>,
    page,
  });
  clipboard.writeText(text);
  return text;
}

async function copyGraphicsReport(): Promise<void> {
  const text = await collectGraphicsReport();
  if (win && !win.isDestroyed() && !smoke) {
    void dialog.showMessageBox(win, { type: 'info', title: NAME, message: 'Graphics report copied', detail: `Paste it into your message.\n\n${text.split('\n').slice(0, 6).join('\n')}`, buttons: ['OK'] });
  }
}

function buildMenu() {
  const prefs = readPrefs();
  const fsItem: Electron.MenuItemConstructorOptions = { label: 'Toggle Full Screen', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: () => toggleFullscreen() };
  const tpl: Electron.MenuItemConstructorOptions[] = [];
  if (isMac) tpl.push({ label: NAME, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] });
  if (isMac) tpl.push({ role: 'editMenu' });
  tpl.push({
    label: 'Game',
    submenu: [
      fsItem,
      ...(isMac ? [] : [{ label: 'Full Screen (Alt+Enter)', accelerator: 'Alt+Enter', visible: false, click: () => toggleFullscreen() } as Electron.MenuItemConstructorOptions]),
      { label: 'Start in Full Screen', type: 'checkbox', checked: prefs.startFullscreen !== false, click: (i) => writePrefs({ ...readPrefs(), startFullscreen: i.checked }) },
      { type: 'separator' },
      // Shift is required: a bare Ctrl+R is too easy to hit in the middle of a drive.
      { label: 'Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => win?.webContents.reload() },
      { label: 'Copy Graphics Report', accelerator: 'CmdOrCtrl+Shift+G', click: () => void copyGraphicsReport() },
      { label: isMac ? 'Show Saves Folder in Finder' : 'Show Saves Folder', click: () => void shell.openPath(app.getPath('userData')) },
      ...(dev ? [{ role: 'toggleDevTools' } as Electron.MenuItemConstructorOptions] : []),
      ...(isMac ? [] : [{ type: 'separator' } as Electron.MenuItemConstructorOptions, { label: 'Quit', accelerator: 'Ctrl+Q', click: () => app.quit() } as Electron.MenuItemConstructorOptions]),
    ],
  });
  if (isMac) tpl.push({ role: 'windowMenu' });
  if (!isMac) tpl.push({ label: 'Help', submenu: [{ label: `About ${NAME}`, click: () => void dialog.showMessageBox({ type: 'info', title: NAME, message: NAME, detail: `Version ${app.getVersion()}\n\n${DISCLAIMER}` }) }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function createWindow() {
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const st = smoke ? { width: 960, height: 540, maximized: false, fullscreen: false } : loadState(fs, stateFile(), displays);
  const startFs = wantsFullscreenAtLaunch(readPrefs(), process.argv, smoke);
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width, height: st.height, minWidth: 800, minHeight: 500,
    // Hidden until the first paint is ready and black behind the page: no white flash at start.
    show: false, backgroundColor: '#000000', title: NAME, autoHideMenuBar: true, fullscreen: startFs,
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: !smoke, webSecurity: true,
      backgroundThrottling: false, devTools: dev || smoke,
    },
  });
  const w = win;
  if (st.maximized && !startFs) w.maximize();
  w.once('ready-to-show', () => { w.show(); if (startFs && !w.isFullScreen()) w.setFullScreen(true); });
  w.on('page-title-updated', (e) => e.preventDefault()); // the window keeps the game's name whatever the page calls itself

  let timer: NodeJS.Timeout | undefined;
  const persist = () => {
    if (smoke || w.isDestroyed()) return;
    // Remember the windowed size and place even while in full screen, so the toggle returns to where the player left it.
    const b = w.isFullScreen() || w.isMaximized() ? (w.getNormalBounds?.() ?? w.getBounds()) : w.getBounds();
    saveState(fs, stateFile(), { ...b, maximized: w.isMaximized(), fullscreen: w.isFullScreen() });
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(persist, 400); };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) (w as any).on(ev, later);
  w.on('close', persist);
  w.on('closed', () => { win = null; });

  w.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalOpenable(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (isAppNavigation(url)) return;
    e.preventDefault();
    if (isExternalOpenable(url)) void shell.openExternal(url);
  });
  w.webContents.on('will-frame-navigate', (e) => { if (!isAllowedNavigation(e.url)) e.preventDefault(); });
  w.webContents.on('will-attach-webview', (e) => e.preventDefault());
  // A crashed or killed renderer (driver reset, out of memory) comes back by itself instead of leaving a dead black window.
  w.webContents.on('render-process-gone', (_e, d) => { console.error('render-process-gone', d.reason); if (d.reason !== 'clean-exit' && !smoke && !w.isDestroyed()) w.webContents.reload(); });
  if (logConsole) w.webContents.on('console-message', (e) => console.log(`[page ${e.level}] ${e.message}`));
  const extra = smoke && /^[\w=&.\-]+$/.test(process.env.GTA_SMOKE_QUERY ?? '') ? process.env.GTA_SMOKE_QUERY! : '';
  const q = appQueryFromArgs(process.argv); // --debug-gfx, --q=<tier> (docs/PLATFORM-CHECK.md)
  void w.loadURL(`${APP_ORIGIN}/index.html${extra ? `${q ? `${q}&` : '?'}${extra}` : q}`);
}

function wireSession() {
  const ses = session.defaultSession;
  const csp = buildCsp();
  ses.webRequest.onHeadersReceived((details, cb) => {
    const h = { ...details.responseHeaders };
    if (details.url.startsWith(`${APP_SCHEME}://`)) h['Content-Security-Policy'] = [csp];
    cb({ responseHeaders: h });
  });
  const okPerms = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']); // no camera or microphone: the game never records
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(okPerms.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => okPerms.has(perm));
  ses.protocol.handle(APP_SCHEME, appProtocol);
}

if (smoke) (globalThis as Record<string, unknown>).__gtaSmoke = { collectGraphicsReport }; // reached over --inspect by scripts/smoke.mjs
ipcMain.on('gta:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('gta:fullscreen', (_e, on: boolean) => toggleFullscreen(!!on));
ipcMain.on('gta:quit', () => app.quit());
// Saved-game backup. The game keeps saves in localStorage (inside userData); the preload mirrors them to saves-backup.json and
// restores from it only if the browser storage came back empty (cleared profile, damaged database).
ipcMain.on('gta:storage-load', (e) => {
  try { e.returnValue = sanitizeStorageSnapshot(JSON.parse(fs.readFileSync(storageFile(), 'utf8'))); } catch { e.returnValue = null; }
});
ipcMain.on('gta:storage-save', (_e, snap: unknown) => {
  const clean = smoke ? null : sanitizeStorageSnapshot(snap);
  if (clean && Object.keys(clean).length) writeJsonAtomic(storageFile(), clean);
});
ipcMain.handle('gta:save-file', async (_e, name: string, text: string) => {
  if (!win) return false;
  const safe = name.replace(/[^\w.\- ]+/g, '_') || 'gta-bedstuy-saves.json';
  const r = await dialog.showSaveDialog(win, { defaultPath: safe, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
  try { fs.writeFileSync(r.filePath, text, 'utf8'); return true; } catch { return false; }
});

if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.setAboutPanelOptions({
    applicationName: NAME, applicationVersion: app.getVersion(),
    copyright: DISCLAIMER,
  });
  void app.whenReady().then(() => {
    wireSession(); buildMenu(); createWindow();
    if (!smoke) powerSaveBlocker.start('prevent-display-sleep'); // a gamepad does not count as activity to the OS
  });
  app.on('child-process-gone', (_e, d) => { if (d.type === 'GPU') console.error('gpu process gone', d.reason); });
  app.on('activate', () => { if (!win) createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
