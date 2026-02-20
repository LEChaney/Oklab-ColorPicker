const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const boundsFile = path.join(app.getPath('userData'), 'window-bounds.json');

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(boundsFile, 'utf8')); } catch (_) { return {}; }
}

function saveBounds() {
  if (!win) return;
  try { fs.writeFileSync(boundsFile, JSON.stringify(win.getBounds())); } catch (_) {}
}

let win;
app.whenReady().then(() => {
  const saved = loadBounds();
  win = new BrowserWindow({
    width: saved.width || 400, height: saved.height || 890,
    x: saved.x, y: saved.y,
    backgroundColor: '#1e1e2e',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true);
  win.loadFile('index.html');
  win.on('resized', saveBounds);
  win.on('moved', saveBounds);
  globalShortcut.register('Alt+C', () => win.webContents.executeJavaScript('pickColor()', true));
  ipcMain.on('set-aot', (_, v) => win.setAlwaysOnTop(v));
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
