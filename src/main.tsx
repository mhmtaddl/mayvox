import './lib/supabase';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { logger } from './lib/logger';

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
