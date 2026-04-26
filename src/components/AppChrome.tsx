import React, { useEffect, useState, useCallback } from 'react';
import { Minus, X } from 'lucide-react';

/**
 * MayVox Custom Desktop Chrome — frameless Electron window'u premium kontrol rayı.
 * - Sol: küçük marka mark + "MAY/VOX" wordmark
 * - Orta: drag region (boş, ambient glow)
 * - Sağ: minimize / maximize-restore / close (segmented control hissi)
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
  const onTitlebarMouseDown = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-window-control]')) return;
    if (event.detail < 2) return;
    event.preventDefault();
    event.stopPropagation();
    void api.toggleMaximize?.();
  }, [api]);

  return (
    <header
      className="titlebar window-titlebar app-titlebar relative w-full select-none"
      onMouseDownCapture={onTitlebarMouseDown}
      style={{
        height: TITLEBAR_HEIGHT,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div className="relative h-full flex items-center justify-between px-3">
        {/* LEFT — brand */}
        <div
          className="flex items-center gap-2 shrink-0 pr-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <BrandMark focused={focused} />
          <span className={`text-[13px] font-black tracking-[0.18em] uppercase leading-none transition-opacity ${focused ? 'opacity-95' : 'opacity-55'}`}>
            <span className="text-[var(--theme-text)]">MAY</span><span className="text-[var(--theme-accent)]">VOX</span>
          </span>
        </div>

        {/* CENTER — drag area, ambient only */}
        <div className="flex-1 h-full" aria-hidden />

        {/* RIGHT — control rail (segmented) */}
        <div
          className="flex items-center gap-1 shrink-0 pl-3 pr-2"
          data-window-control
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {!authMode && (
            <>
              <ControlButton onClick={onMin} ariaLabel="Küçült" tone="neutral">
                <Minus size={13} strokeWidth={2.2} />
              </ControlButton>
              <ControlButton onClick={onMaxRestore} ariaLabel={maximized ? 'Geri al' : 'Tam ekran'} tone="accent">
                {maximized ? <RestoreIcon /> : <MaximizeIcon />}
              </ControlButton>
            </>
          )}
          <ControlButton onClick={onClose} ariaLabel="Kapat" tone="danger">
            <X size={13} strokeWidth={2.2} />
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
        opacity: focused ? 1 : 0.62,
        transition: 'opacity 200ms ease',
      }}
    >
      {/* Ses dalgası izlenimi — 3 mini bar */}
      <svg width="14" height="11" viewBox="0 0 14 11" fill="none" aria-hidden>
        <rect x="1" y="4" width="2" height="4" rx="0.8" fill="var(--theme-accent)" opacity="0.9" />
        <rect x="4.4" y="1.5" width="2.1" height="8" rx="0.8" fill="var(--theme-accent)" opacity="1" />
        <rect x="8" y="2.8" width="2.1" height="5.4" rx="0.8" fill="var(--theme-accent)" opacity="0.95" />
        <rect x="11.5" y="4.4" width="1.7" height="2.8" rx="0.7" fill="var(--theme-accent)" opacity="0.78" />
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
  const isDanger = tone === 'danger';
  const hoverRgb = tone === 'danger' ? '239,68,68' : tone === 'accent' ? '56,189,248' : '245,158,11';

  const baseBg = hover
    ? `rgba(${hoverRgb}, 0.13)`
    : 'transparent';
  const border = hover
    ? `rgba(${hoverRgb}, 0.24)`
    : 'transparent';
  const color = hover ? `rgb(${hoverRgb})` : isDanger ? 'var(--window-close-fg, #0d0d0d)' : 'var(--theme-text)';

  return (
    <button
      data-window-control
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={ariaLabel}
      aria-label={ariaLabel}
      className="w-[28px] h-[22px] rounded-md flex items-center justify-center transition-all duration-150 active:scale-90"
      style={{
        background: baseBg,
        border: `1px solid ${border}`,
        color,
        boxShadow: hover
          ? `0 0 10px rgba(${hoverRgb}, 0.18)`
          : 'none',
      }}
    >
      {children}
    </button>
  );
}

// ── Inline icons ──
function MaximizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />
    </svg>
  );
}
function RestoreIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.2" />
      <path d="M3 5.5V3.2c0-.95.65-1.7 1.5-1.7h5.3c.85 0 1.5.75 1.5 1.7v5.3c0 .95-.65 1.7-1.5 1.7H8.5" opacity="0.55" />
    </svg>
  );
}
