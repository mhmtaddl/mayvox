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
        background: [
          'radial-gradient(circle at 50% 18%, rgba(var(--theme-accent-rgb, 99, 102, 241), 0.13), transparent 34%)',
          'linear-gradient(180deg, rgb(var(--theme-sidebar-rgb, 12,18,32)), rgb(var(--theme-bg-rgb, 8,13,24)))',
        ].join(', '),
        color: 'var(--theme-text, #e2e8f0)',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(420px, calc(100vw - 48px))',
          borderRadius: 20,
          border: '1px solid rgba(var(--glass-tint, 255,255,255), 0.12)',
          background: 'linear-gradient(180deg, rgba(var(--theme-sidebar-rgb, 12,18,32), 0.94), rgba(var(--theme-bg-rgb, 8,13,24), 0.96))',
          boxShadow: '0 24px 70px rgba(0,0,0,0.46), inset 0 1px 0 rgba(var(--glass-tint, 255,255,255), 0.07)',
          backdropFilter: 'blur(10px)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.10)',
            border: '1px solid rgba(var(--theme-accent-rgb, 99, 102, 241), 0.16)',
            color: 'var(--theme-accent, #8b5cf6)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v6h-6" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 760, letterSpacing: 0, color: 'var(--theme-accent, #8b5cf6)' }}>
              MAYVox
            </div>
            <h2 style={{ fontSize: 14, fontWeight: 760, margin: '2px 0 0', lineHeight: 1.25 }}>Güvenli mod</h2>
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--theme-secondary-text, #94a3b8)', margin: '12px 0 0', lineHeight: 1.55 }}>
          Görünüm durdu. Oturum korunur, ekranı yenileyerek devam edebilirsin.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid rgba(var(--theme-accent-rgb, 99, 102, 241), 0.22)',
              background: 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.13)',
              color: 'var(--theme-text, #e2e8f0)',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.18)'; e.currentTarget.style.borderColor = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.34)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.13)'; e.currentTarget.style.borderColor = 'rgba(var(--theme-accent-rgb, 99, 102, 241), 0.22)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            Yeniden yükle
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--theme-secondary-text, #94a3b8)', opacity: 0.72, minWidth: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Oturum korunur
          </div>
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
