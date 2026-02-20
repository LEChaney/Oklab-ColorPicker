const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');

let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 400, height: 820, backgroundColor: '#1e1e2e',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
  globalShortcut.register('Alt+C', () => win.webContents.executeJavaScript('pickColor()', true));
  ipcMain.on('set-aot', (_, v) => win.setAlwaysOnTop(v));
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
