const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronLogger', {
  log: (level, message, data) => {
    ipcRenderer.send('app:log', { level, message, data });
  },
});

// ── Auto-update bridge ──────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronUpdate', {
  check: () => ipcRenderer.send('update:check'),
  download: () => ipcRenderer.send('update:download'),
  install: () => ipcRenderer.send('update:install'),
  onChecking: (cb) => {
    ipcRenderer.removeAllListeners('update:checking');
    ipcRenderer.on('update:checking', () => cb());
  },
  onAvailable: (cb) => {
    ipcRenderer.removeAllListeners('update:available');
    ipcRenderer.on('update:available', (_e, info) => cb(info));
  },
  onNotAvailable: (cb) => {
    ipcRenderer.removeAllListeners('update:not-available');
    ipcRenderer.on('update:not-available', () => cb());
  },
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('update:progress');
    ipcRenderer.on('update:progress', (_e, info) => cb(info));
  },
  onDownloaded: (cb) => {
    ipcRenderer.removeAllListeners('update:downloaded');
    ipcRenderer.on('update:downloaded', (_e, info) => cb(info));
  },
  onError: (cb) => {
    ipcRenderer.removeAllListeners('update:error');
    ipcRenderer.on('update:error', (_e, info) => cb(info));
  },
  removeAllListeners: () => {
    ['update:checking', 'update:available', 'update:not-available', 'update:progress', 'update:downloaded', 'update:error']
      .forEach(ch => ipcRenderer.removeAllListeners(ch));
  },
});

contextBridge.exposeInMainWorld('electronApp', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  setTrayChannel: (name) => ipcRenderer.send('tray:set-channel', name || null),
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
