type LogLevel = 'info' | 'warn' | 'error';

declare global {
  interface Window {
    electronLogger?: {
      log: (level: LogLevel, message: string, data?: unknown) => void;
    };
  }
}

function write(level: LogLevel, message: string, data?: unknown) {
  if (typeof window !== 'undefined' && window.electronLogger) {
    window.electronLogger.log(level, message, data);
  } else {
    // Dev browser fallback
    console[level]('[LOG]', message, data ?? '');
  }
}

export const logger = {
  info:  (message: string, data?: unknown) => write('info',  message, data),
  warn:  (message: string, data?: unknown) => write('warn',  message, data),
  error: (message: string, data?: unknown) => write('error', message, data),
};
