const { app, BrowserWindow, shell, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let win = null;

// IPC для кнопок titlebar — регистрируется один раз
ipcMain.on('titlebar-minimize', () => win?.minimize());
ipcMain.on('titlebar-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('titlebar-close',    () => win?.close());

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#090b0a',
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'renderer', 'icon.ico')
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // F12 — открыть DevTools
  globalShortcut.register('F12', () => {
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
  });

  // Открывать внешние ссылки в браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
