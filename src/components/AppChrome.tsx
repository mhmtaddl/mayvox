import React, { useEffect, useState, useCallback } from 'react';
import { Minus, X } from 'lucide-react';

/**
 * MayVox Custom Desktop Chrome — frameless Electron window'u premium kontrol rayı.
 * - Sol: küçük marka mark + "MAY/VOX" wordmark
 * - Orta: drag region (boş, ambient glow)
 * - Sağ: macOS tarzı renkli minimize / maximize-restore / close noktaları
 *
 * Drag: header'in kendisi `-webkit-app-region: drag`, butonlar `no-drag`.
 */

interface ElectronWindowAPI {
  minimize: () => void;
  maximizeRestore: () => void | Promise<void>;
  toggleMaximize?: () => void | Promise<void>;
  close: () => void;
  setAuthMode?: (enabled: boolean, kind?: string) => void;
  isMaximized: () => Promise<boolean>;
  isFocused: () => Promise<boolean>;
  onState: (cb: (data: { maximized: boolean; focused: boolean; authMode?: boolean }) => void) => void;
  offState: () => void;
}

declare global {
  interface Window {
    electronWindow?: ElectronWindowAPI;
  }
}

const TITLEBAR_HEIGHT = 40;

export default function AppChrome() {
  const api = typeof window !== 'undefined' ? window.electronWindow : undefined;
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const [authMode, setAuthMode] = useState(false);

  useEffect(() => {
    if (!api) return;
    void api.isMaximized().then(setMaximized).catch(() => {});
    void api.isFocused().then(setFocused).catch(() => {});
    api.onState(({ maximized: m, focused: f, authMode: a }) => {
      setMaximized(m);
      setFocused(f);
      setAuthMode(!!a);
    });
    return () => { api.offState(); };
  }, [api]);

  useEffect(() => {
    document.documentElement.classList.toggle('mv-window-maximized', maximized);
    return () => document.documentElement.classList.remove('mv-window-maximized');
  }, [maximized]);

  useEffect(() => {
    document.documentElement.classList.toggle('mv-auth-window', authMode);
    return () => document.documentElement.classList.remove('mv-auth-window');
  }, [authMode]);

  // Web modunda (Electron yoksa) hiç render etme — drag region anlamsız.
  if (!api) return null;

  const onMin = useCallback(() => api.minimize(), [api]);
  const onMaxRestore = useCallback(() => { void api.maximizeRestore(); }, [api]);
  const onClose = useCallback(() => api.close(), [api]);
  const onTitlebarDoubleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (authMode) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-window-control]')) return;
    if (target.closest('[data-no-drag], .no-drag')) return;
    if (target.closest('button, input, select, textarea, a')) return;
    event.preventDefault();
    event.stopPropagation();
    void (api.toggleMaximize?.() ?? api.maximizeRestore());
  }, [api, authMode]);
  return (
    <header
      className="titlebar window-titlebar app-titlebar relative w-full select-none"
      style={{
        height: TITLEBAR_HEIGHT,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div className="relative h-full flex items-center justify-between px-3">
        {/* Drag regions do not reliably emit renderer double-click; brand is the manual maximize zone. */}
        <div
          className="group relative z-30 flex items-center gap-2 shrink-0 pr-3"
          onDoubleClick={onTitlebarDoubleClick}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <BrandMark focused={focused} />
          <span
            className={`text-[14px] font-semibold tracking-[0.10em] uppercase leading-none transition-opacity duration-150 group-hover:opacity-95 ${focused ? 'opacity-90' : 'opacity-55'}`}
            style={{ color: 'rgba(var(--glass-tint), 0.88)' }}
          >
            MAYVOX
          </span>
        </div>

        {/* CENTER — drag area, ambient only */}
        <div className="flex-1 h-full" aria-hidden />

        {/* RIGHT — macOS-style traffic light controls */}
        <div
          className="relative z-30 flex items-center gap-[9px] shrink-0 pl-3 pr-2"
          data-window-control
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {!authMode && (
            <>
              <ControlButton onClick={onMin} ariaLabel="Küçült" tone="neutral">
                <Minus size={9} strokeWidth={2.8} />
              </ControlButton>
              <ControlButton onClick={onMaxRestore} ariaLabel={maximized ? 'Geri al' : 'Tam ekran'} tone="accent">
                {maximized ? <RestoreIcon /> : <MaximizeIcon />}
              </ControlButton>
            </>
          )}
          <ControlButton onClick={onClose} ariaLabel="Kapat" tone="danger">
            <X size={9} strokeWidth={2.8} />
          </ControlButton>
        </div>
      </div>
    </header>
  );
}

// ── Brand mark — küçük "luxury voice console" amblemi ──
function BrandMark({ focused }: { focused: boolean }) {
  return (
    <div
      className="relative w-6 h-6 flex items-center justify-center"
      style={{
        opacity: focused ? 0.82 : 0.52,
        transition: 'opacity 200ms ease',
      }}
    >
      {/* Ses dalgası izlenimi — 3 mini bar */}
      <svg width="14" height="11" viewBox="0 0 14 11" fill="none" aria-hidden>
        <rect x="1" y="4" width="2" height="4" rx="0.8" fill="rgba(var(--glass-tint), 0.82)" opacity="0.62" />
        <rect x="4.4" y="1.5" width="2.1" height="8" rx="0.8" fill="rgba(var(--glass-tint), 0.82)" opacity="0.74" />
        <rect x="8" y="2.8" width="2.1" height="5.4" rx="0.8" fill="rgba(var(--glass-tint), 0.82)" opacity="0.68" />
        <rect x="11.5" y="4.4" width="1.7" height="2.8" rx="0.7" fill="rgba(var(--glass-tint), 0.82)" opacity="0.54" />
      </svg>
    </div>
  );
}

// ── Control Button — premium command unit ──
function ControlButton({ onClick, ariaLabel, tone, children }: {
  onClick: () => void;
  ariaLabel: string;
  tone: 'neutral' | 'accent' | 'danger';
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const palette = {
    neutral: {
      bg: '#c8983c',
      hoverBg: '#f5bf4f',
      border: '#d99a25',
      icon: '#7a5100',
      glow: '245, 191, 79',
    },
    accent: {
      bg: '#459d43',
      hoverBg: '#61c554',
      border: '#3fae3b',
      icon: '#155c18',
      glow: '97, 197, 84',
    },
    danger: {
      bg: '#c94b47',
      hoverBg: '#ff5f57',
      border: '#e0443e',
      icon: '#7b1511',
      glow: '255, 95, 87',
    },
  }[tone];

  return (
    <button
      data-window-control
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={ariaLabel}
      aria-label={ariaLabel}
      className="group w-[15px] h-[15px] rounded-full flex items-center justify-center transition-all duration-150 active:scale-90"
      style={{
        background: hover ? palette.hoverBg : palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.icon,
        opacity: hover ? 1 : 0.84,
        boxShadow: hover
          ? `inset 0 1px 0 rgba(255,255,255,0.46), 0 0 0 3px rgba(${palette.glow}, 0.13), 0 0 13px rgba(${palette.glow}, 0.28)`
          : `inset 0 1px 0 rgba(255,255,255,0.24), 0 1px 2px rgba(0,0,0,0.20)`,
      }}
    >
      <span
        className="flex items-center justify-center transition-opacity duration-120"
        style={{ opacity: hover ? 1 : 0.28 }}
      >
        {children}
      </span>
    </button>
  );
}

// ── Inline icons ──
function MaximizeIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round">
      <rect x="1.8" y="1.8" width="8.4" height="8.4" rx="1.5" />
    </svg>
  );
}
function RestoreIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.2" />
      <path d="M3 5.5V3.2c0-.95.65-1.7 1.5-1.7h5.3c.85 0 1.5.75 1.5 1.7v5.3c0 .95-.65 1.7-1.5 1.7H8.5" opacity="0.55" />
    </svg>
  );
}
