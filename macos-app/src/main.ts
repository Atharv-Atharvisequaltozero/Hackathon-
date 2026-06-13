/**
 * The Cognitive Redline — Electron main process (TypeScript)
 *
 * Runs as a macOS menu-bar (Tray) app. Unlike a sandboxed web page, the main
 * process has Node + OS access, so it can collect REAL system-wide telemetry:
 *   - system idle time (no permission needed)            -> attention gaps / breaks
 *   - frontmost application polling (Accessibility perm) -> context switching
 *
 * Everything stays local. No network calls, no accounts, no backend.
 */
import { app, Tray, BrowserWindow, nativeImage, ipcMain, Notification, powerMonitor } from 'electron';
import * as path from 'path';
import { exec } from 'child_process';

let tray: Tray | null = null;
let win: BrowserWindow | null = null;
let lastFrontApp = '';

function createWindow(): void {
  win = new BrowserWindow({
    width: 470,
    height: 760,
    show: false,
    frame: false,
    resizable: false,
    backgroundColor: '#0b1120',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => {
    if (win && !win.webContents.isDevToolsOpened()) win.hide();
  });
}

function positionWindow(): void {
  if (!tray || !win) return;
  const t = tray.getBounds();
  const w = win.getBounds();
  const x = Math.round(t.x + t.width / 2 - w.width / 2);
  const y = Math.round(t.y + t.height + 4);
  win.setPosition(x, y, false);
}

function toggleWindow(): void {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
    return;
  }
  positionWindow();
  win.show();
  win.focus();
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide(); // menu-bar only, no dock icon

  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(' 🧠 0');
  tray.setToolTip('The Cognitive Redline');
  tray.on('click', toggleWindow);

  createWindow();
  startTelemetry();
});

/**
 * Native system telemetry loop. This is the part a browser physically cannot do.
 */
function startTelemetry(): void {
  setInterval(() => {
    // 1) System-wide idle time (seconds). No permission required.
    const idle = powerMonitor.getSystemIdleTime();
    win?.webContents.send('telemetry', { type: 'idle_sample', idleSec: idle });

    // 2) Frontmost application -> real context-switching detection.
    //    Requires Accessibility/Automation permission (prompts on first run).
    exec(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      (_err, stdout) => {
        const front = (stdout || '').trim();
        if (front && front !== lastFrontApp) {
          if (lastFrontApp) {
            win?.webContents.send('telemetry', {
              type: 'context_switch',
              from: lastFrontApp,
              to: front,
              ts: Date.now(),
            });
          }
          lastFrontApp = front;
        }
      }
    );
  }, 2000);
}

// Renderer reports the live CLI so we can color the menu-bar title.
ipcMain.on('cli-update', (_e, data: { cli: number; redline: boolean }) => {
  if (!tray) return;
  const emoji = data.redline ? '🔴' : data.cli > 40 ? '🟡' : '🟢';
  tray.setTitle(` ${emoji} ${data.cli}`);
});

// Native OS notification (used for the redline intervention).
ipcMain.on('notify', (_e, data: { title: string; body: string }) => {
  new Notification({ title: data.title, body: data.body }).show();
});

// Keep running as a menu-bar agent even with no visible window.
app.on('window-all-closed', () => {
  /* intentionally empty: stay alive in the menu bar */
});
