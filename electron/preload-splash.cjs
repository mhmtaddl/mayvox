const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashUpdate', {
  onMode: (cb) => {
    ipcRenderer.removeAllListeners('splash:update-mode');
    ipcRenderer.on('splash:update-mode', (_e, mode) => cb(mode));
  },
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('splash:update-progress');
    ipcRenderer.on('splash:update-progress', (_e, percent) => cb(percent));
  },
});
