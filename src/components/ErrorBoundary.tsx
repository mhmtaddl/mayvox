import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import type { ReactNode } from 'react';
import { logger } from '../lib/logger';

function ErrorFallback() {
  return (
    <div
      className="mv-error-fallback"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 0%, rgba(var(--theme-accent-rgb, 99, 102, 241), 0.16), transparent 34%), var(--theme-bg, #0a0a0f)',
        color: 'var(--theme-text, #e2e8f0)',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 32,
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 18,
          border: '1px solid var(--theme-border, rgba(255,255,255,0.1))',
          background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb, 99, 102, 241), 0.08), transparent 42%), color-mix(in srgb, var(--theme-panel, #12121a) 90%, transparent)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.12)',
            border: '1px solid rgba(var(--theme-accent-rgb, 99, 102, 241), 0.24)',
            color: 'var(--theme-accent, #8b5cf6)',
            boxShadow: '0 12px 32px rgba(var(--theme-accent-rgb, 99, 102, 241), 0.12)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0, color: 'var(--theme-accent, #8b5cf6)', textTransform: 'uppercase' }}>
              MAYVox
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '2px 0 0', lineHeight: 1.2 }}>Bir şeyler ters gitti</h2>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--theme-secondary-text, #94a3b8)', maxWidth: 340, margin: '18px 0 0', lineHeight: 1.6 }}>
          Uygulama bu ekranı güvenli moda aldı. Sayfayı yenileyerek kaldığın yerden devam edebilirsin.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              height: 38,
              padding: '0 18px',
              borderRadius: 10,
              border: '1px solid rgba(var(--theme-accent-rgb, 99, 102, 241), 0.34)',
              background: 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.14)',
              color: 'var(--theme-text, #e2e8f0)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.2)'; e.currentTarget.style.borderColor = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.48)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.14)'; e.currentTarget.style.borderColor = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.34)'; }}
          >
            Sayfayı yenile
          </button>
          <span style={{ fontSize: 12, color: 'var(--theme-secondary-text, #94a3b8)', opacity: 0.72 }}>
            Oturumun korunur
          </span>
        </div>
      </div>
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
