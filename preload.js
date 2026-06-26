const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  electron: () => process.versions.electron
});

contextBridge.exposeInMainWorld('titlebar', {
  minimize: () => ipcRenderer.send('titlebar-minimize'),
  maximize: () => ipcRenderer.send('titlebar-maximize'),
  close:    () => ipcRenderer.send('titlebar-close'),
});
