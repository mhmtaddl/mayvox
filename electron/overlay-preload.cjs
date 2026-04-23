// Overlay renderer → minimal IPC köprüsü
// Ana uygulama bundle'a dokunmadan ayrı bir pencere için sanitize edilmiş
// snapshot dinleyicisi. Ham state/token/audio akışı buradan GEÇMEZ.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronOverlay', {
  onSnapshot: (cb) => {
    ipcRenderer.removeAllListeners('overlay:data');
    ipcRenderer.on('overlay:data', (_e, snapshot) => {
      try { cb(snapshot); } catch {}
    });
  },
  removeAll: () => ipcRenderer.removeAllListeners('overlay:data'),
});
