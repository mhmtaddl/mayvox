const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronLogger', {
  log: (level, message, data) => {
    ipcRenderer.send('app:log', { level, message, data });
  },
});

contextBridge.exposeInMainWorld('electronUpdater', {
  onUpdateAvailable: (cb) => {
    ipcRenderer.removeAllListeners('updater:update-available');
    ipcRenderer.on('updater:update-available', (_e, info) => cb(info));
  },
  onDownloadProgress: (cb) => {
    ipcRenderer.removeAllListeners('updater:download-progress');
    ipcRenderer.on('updater:download-progress', (_e, info) => cb(info));
  },
  onUpdateDownloaded: (cb) => {
    ipcRenderer.removeAllListeners('updater:update-downloaded');
    ipcRenderer.on('updater:update-downloaded', (_e, info) => cb(info));
  },
  startDownload: () => ipcRenderer.send('updater:start-download'),
  installNow: () => ipcRenderer.send('updater:install-now'),
});

contextBridge.exposeInMainWorld('electronApp', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
});

// Global PTT (bas-konuş) API — main process uiohook-napi kullanır,
// böylece uygulama arka plandayken / odak başka yerdeyken de çalışır.
contextBridge.exposeInMainWorld('electronPtt', {
  /** Başlangıçta localStorage'dan gelen mevcut tuşu main process'e bildir */
  init: (keyStr) => ipcRenderer.send('ptt:init', keyStr),
  /** Ham keycode ile init — isim çakışmalarını önler (örn. sol/sağ CTRL) */
  initRaw: (rawCode) => ipcRenderer.send('ptt:initRaw', rawCode),
  /** PTT tuşu atama modunu başlat — main bir sonraki tuşu/tıklamayı yakalar */
  startListening: () => ipcRenderer.send('ptt:startListening'),
  /** PTT tuşu atama modunu iptal et */
  stopListening: () => ipcRenderer.send('ptt:stopListening'),
  /** Tuş atandığında dinle (görüntü adıyla) */
  onKeyAssigned: (cb) => {
    ipcRenderer.removeAllListeners('ptt:keyAssigned');
    ipcRenderer.on('ptt:keyAssigned', (_e, data) => cb(data));
  },
  offKeyAssigned: () => ipcRenderer.removeAllListeners('ptt:keyAssigned'),
  /** PTT basıldığında / bırakıldığında dinle */
  onDown: (cb) => {
    ipcRenderer.removeAllListeners('ptt:down');
    ipcRenderer.on('ptt:down', () => cb());
  },
  offDown: () => ipcRenderer.removeAllListeners('ptt:down'),
  onUp: (cb) => {
    ipcRenderer.removeAllListeners('ptt:up');
    ipcRenderer.on('ptt:up', () => cb());
  },
  offUp: () => ipcRenderer.removeAllListeners('ptt:up'),
});
