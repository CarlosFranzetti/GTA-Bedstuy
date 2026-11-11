import { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell, screen } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  APP_HOST, APP_ORIGIN, APP_SCHEME, RA_TIMEOUT_MS, buildCsp, isAllowedNavigation, isAppNavigation,
  isExternalOpenable, loadState, mapRaApi, resolveAppPath, saveState, appQueryFromArgs,
} from './policy';

const dev = process.argv.includes('--dev');
const smoke = process.env.GTA_SMOKE === '1'; // headless boot test (xvfb): software GL, no state, no single-instance lock
const isMac = process.platform === 'darwin';
const NAME = 'GTA Bed-Stuy';
const DISCLAIMER = 'GTA Bed-Stuy is a non-commercial fan tribute. It is not affiliated with, endorsed by, or connected to Rockstar Games or Take-Two Interactive.';
app.setName(NAME);

// --- GPU / media switches (must precede app ready) ---
const sw = app.commandLine;
sw.appendSwitch('autoplay-policy', 'no-user-gesture-required');
sw.appendSwitch('disable-renderer-backgrounding');
sw.appendSwitch('force_high_performance_gpu');
if (isMac) sw.appendSwitch('use-angle', 'metal');
else if (process.platform === 'win32') sw.appendSwitch('use-angle', 'd3d11');
if (process.env.GTA_IGNORE_GPU_BLOCKLIST === '1') sw.appendSwitch('ignore-gpu-blocklist');
if (smoke) { sw.appendSwitch('use-angle', 'swiftshader'); sw.appendSwitch('enable-unsafe-swiftshader'); sw.appendSwitch('no-sandbox'); }

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web');
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const prefFile = () => path.join(app.getPath('userData'), 'prefs.json');
let win: BrowserWindow | null = null;

function readPrefs(): { startFullscreen?: boolean } { try { return JSON.parse(fs.readFileSync(prefFile(), 'utf8')); } catch { return {}; } }

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

function buildMenu() {
  const fsItem = { label: 'Toggle Full Screen', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: () => toggleFullscreen() };
  const tpl: Electron.MenuItemConstructorOptions[] = [];
  if (isMac) tpl.push({ label: NAME, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] });
  tpl.push({
    label: 'View',
    submenu: [
      fsItem,
      ...(isMac ? [] : [{ label: 'Full Screen (Alt+Enter)', accelerator: 'Alt+Enter', visible: false, click: () => toggleFullscreen() } as Electron.MenuItemConstructorOptions]),
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.reload() },
      ...(dev ? [{ role: 'toggleDevTools' } as Electron.MenuItemConstructorOptions] : []),
      ...(isMac ? [] : [{ type: 'separator' } as Electron.MenuItemConstructorOptions, { role: 'quit' } as Electron.MenuItemConstructorOptions]),
    ],
  });
  if (!isMac) tpl.push({ label: 'Help', submenu: [{ label: `About ${NAME}`, click: () => void dialog.showMessageBox({ type: 'info', title: NAME, message: NAME, detail: `Version ${app.getVersion()}\n\n${DISCLAIMER}` }) }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function createWindow() {
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const st = smoke ? { width: 1280, height: 720, maximized: false, fullscreen: false } : loadState(fs, stateFile(), displays);
  const startFs = st.fullscreen || readPrefs().startFullscreen === true;
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width, height: st.height, minWidth: 800, minHeight: 500,
    show: false, backgroundColor: '#000000', title: NAME, autoHideMenuBar: true,
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: !smoke, webSecurity: true,
      backgroundThrottling: false, devTools: dev || smoke,
    },
  });
  const w = win;
  if (st.maximized) w.maximize();
  w.once('ready-to-show', () => { w.show(); if (startFs) w.setFullScreen(true); });

  let timer: NodeJS.Timeout | undefined;
  const persist = () => {
    if (smoke || w.isDestroyed()) return;
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
  void w.loadURL(`${APP_ORIGIN}/index.html${appQueryFromArgs(process.argv)}`); // --debug-gfx, --q=<tier> (docs/PLATFORM-CHECK.md)
}

function wireSession() {
  const ses = session.defaultSession;
  const csp = buildCsp();
  ses.webRequest.onHeadersReceived((details, cb) => {
    const h = { ...details.responseHeaders };
    if (details.url.startsWith(`${APP_SCHEME}://`)) h['Content-Security-Policy'] = [csp];
    cb({ responseHeaders: h });
  });
  const okPerms = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'media', 'audioCapture']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(okPerms.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => okPerms.has(perm));
  ses.protocol.handle(APP_SCHEME, appProtocol);
}

ipcMain.on('gta:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('gta:fullscreen', (_e, on: boolean) => toggleFullscreen(!!on));
ipcMain.on('gta:quit', () => app.quit());
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
  void app.whenReady().then(() => { wireSession(); buildMenu(); createWindow(); });
  app.on('activate', () => { if (!win) createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
