import React from 'react';
import ReactDOM from 'react-dom/client';
import OverlayApp from './OverlayApp';

// Overlay: minimal standalone mount. Ana uygulama bundle'ından bağımsız.
// Vite multi-entry ile ayrı chunk üretilir, Electron BrowserWindow yüklenir.
const el = document.getElementById('root');
if (el) {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <OverlayApp />
    </React.StrictMode>
  );
}
