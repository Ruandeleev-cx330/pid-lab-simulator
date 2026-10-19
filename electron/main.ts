import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * Compatibility mode for locked-down / virtualised Windows sessions where the
 * Chromium helper processes cannot start at all (the renderer exits and the
 * window stays blank). It keeps contextIsolation + nodeIntegration disabled; it
 * only relaxes the OS level process sandbox. Never enabled by default.
 */
const rawArgs = process.argv.slice(1);
const wantsSafeMode =
  process.env.PIDLAB_SAFE_MODE === '1' || rawArgs.includes('--safe-mode') || rawArgs.includes('--safe-gpu');
const hasNoSandboxFlag = rawArgs.includes('--no-sandbox');

if (wantsSafeMode && !hasNoSandboxFlag) {
  // The Chromium sandbox switch is only honoured as a real command line flag, so
  // compatibility mode is applied by restarting once with --no-sandbox.
  app.relaunch({ args: [...rawArgs, '--safe-mode', '--no-sandbox'] });
  app.exit(0);
}

let relaunchingInSafeMode = false;
function relaunchSafely(): void {
  if (wantsSafeMode || relaunchingInSafeMode) return;
  relaunchingInSafeMode = true;
  app.relaunch({ args: [...rawArgs, '--safe-mode', '--no-sandbox'] });
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1400, Math.max(1000, screenW - 40));
  const height = Math.min(900, Math.max(620, screenH - 60));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#eaeef3',
    title: 'PID Lab Simulator',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // --- security baseline ------------------------------------------------
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // First-run self healing: if the renderer dies immediately (sandbox not
  // permitted in this session) restart once in compatibility mode.
  mainWindow.webContents.on('render-process-gone', () => relaunchSafely());
  mainWindow.webContents.on('did-fail-load', () => relaunchSafely());

  // First-run self healing: if the renderer dies immediately (sandbox not
  // permitted in this session) restart once in compatibility mode.
  mainWindow.webContents.on('render-process-gone', () => relaunchSafely());
  mainWindow.webContents.on('did-fail-load', () => relaunchSafely());

  // No remote content is ever loaded by this application.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  if (DEV_URL) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC: explicit allow list, argument validation, no dynamic channel names.
// ---------------------------------------------------------------------------

ipcMain.handle('pidlab:app-info', () => ({
  name: 'PID Lab Simulator',
  version: app.getVersion(),
  platform: process.platform,
  isPackaged: app.isPackaged
}));

ipcMain.handle('pidlab:export-results', async (_event, payload: unknown) => {
  if (typeof payload !== 'string' || payload.length === 0 || payload.length > 5_000_000) {
    return { ok: false, error: 'invalid payload' };
  }
  try {
    JSON.parse(payload);
  } catch {
    return { ok: false, error: 'payload is not valid JSON' };
  }

  const target = await dialog.showSaveDialog({
    title: '导出成绩记录',
    defaultPath: `pid-lab-history-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (target.canceled || !target.filePath) return { ok: false, error: 'canceled' };

  try {
    await fs.writeFile(target.filePath, payload, 'utf8');
    return { ok: true, path: target.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'write failed' };
  }
});

app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && details.reason === 'crashed') relaunchSafely();
});

app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && details.reason === 'crashed') relaunchSafely();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

if (isDev) {
  // Keep the dev window usable when the renderer reloads.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
