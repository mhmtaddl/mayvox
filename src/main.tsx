import './lib/supabase';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/signature/signature.css';
import { logger } from './lib/logger';
import { isCapacitor, isElectron } from './lib/platform';

// Low-perf mode — Capacitor (Android 9+ cihazlarda WebView rendering yavaş).
// <html> üzerindeki 'lowperf' class'ı CSS'te backdrop-filter ve ağır animasyonları
// devre dışı bırakır (bkz. index.css).
if (isCapacitor()) {
  document.documentElement.classList.add('lowperf');
}

if (isElectron()) {
  document.documentElement.classList.add('mv-electron-window');
}

// ── Global error handlers ─────────────────────────────────────────────────────
window.onerror = (message, source, lineno, colno, error) => {
  logger.error('Uncaught error', { message, source, lineno, colno, stack: error?.stack });
};

window.onunhandledrejection = (event) => {
  const reason = event.reason;
  logger.error('Unhandled promise rejection', {
    message: reason?.message ?? String(reason),
    stack: reason?.stack,
  });
};

createRoot(document.getElementById('root')!).render(<App />);
