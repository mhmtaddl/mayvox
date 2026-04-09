type LogLevel = 'info' | 'warn' | 'error';

declare global {
  interface Window {
    electronLogger?: {
      log: (level: LogLevel, message: string, data?: unknown) => void;
    };
  }
}

const IS_DEV = import.meta.env.DEV;

// ── Dedupe: aynı mesajı 1sn içinde tekrar yazma ──
let lastMsg = '';
let lastTime = 0;
const DEDUPE_MS = 1000;

function isDuplicate(message: string): boolean {
  const now = Date.now();
  if (message === lastMsg && now - lastTime < DEDUPE_MS) return true;
  lastMsg = message;
  lastTime = now;
  return false;
}

function safeMeta(data: unknown): string {
  if (data === undefined || data === null) return '';
  try {
    return JSON.stringify(data);
  } catch {
    return '[unserializable]';
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: LogLevel, message: string, data?: unknown) {
  if (isDuplicate(message)) return;

  // Production'da info loglarını atla (warn + error her zaman aktif)
  if (!IS_DEV && level === 'info') return;

  // Electron main process logger
  if (typeof window !== 'undefined' && window.electronLogger) {
    window.electronLogger.log(level, message, data);
    return;
  }

  // Browser console
  const prefix = `[${level.toUpperCase()}] ${timestamp()}`;
  const meta = safeMeta(data);

  if (level === 'error') {
    console.error(prefix, message, meta || '');
  } else if (level === 'warn') {
    console.warn(prefix, message, meta || '');
  } else {
    console.log(prefix, message, meta || '');
  }
}

export const logger = {
  info:  (message: string, data?: unknown) => write('info',  message, data),
  warn:  (message: string, data?: unknown) => write('warn',  message, data),
  error: (message: string, data?: unknown) => write('error', message, data),
};
