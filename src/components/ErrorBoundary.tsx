import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import type { ReactNode } from 'react';
import { logger } from '../lib/logger';

function ErrorFallback() {
  return (
    <div
      className="mv-error-fallback"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--theme-bg, #0a0a0f)',
        color: 'var(--theme-text, #e2e8f0)',
        fontFamily: 'system-ui, sans-serif',
        gap: 20,
        padding: 32,
      }}
    >
      {/* Icon badge */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.12)',
        boxShadow: '0 0 32px rgba(239, 68, 68, 0.06)',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(239, 68, 68, 0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Bir şeyler ters gitti</h2>
      <p style={{ fontSize: 13, opacity: 0.5, textAlign: 'center', maxWidth: 360, margin: 0, lineHeight: 1.6 }}>
        Sayfayı yenileyerek tekrar deneyebilirsin.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 28px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
      >
        Sayfayı Yenile
      </button>
    </div>
  );
}

function logError(error: Error, info: { componentStack?: string | null }) {
  logger.error('React ErrorBoundary', { message: error.message, stack: error.stack, componentStack: info.componentStack });
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ReactErrorBoundary FallbackComponent={ErrorFallback} onError={logError}>
      {children}
    </ReactErrorBoundary>
  );
}
