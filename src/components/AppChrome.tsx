import React, { useEffect, useState, useCallback } from 'react';
import { useRef } from 'react';
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
  dragStart?: (payload: WindowDragPayload) => void;
  dragMove?: (payload: WindowDragPayload) => void;
  dragEnd?: () => void;
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
const WINDOW_DRAG_THRESHOLD = 2;

type WindowDragPayload = {
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
};

type WindowDragState = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  dragging: boolean;
};

function isInteractiveWindowTarget(target: HTMLElement | null) {
  if (!target) return true;
  if (target.closest('[data-window-control]')) return true;
  if (target.closest('[data-no-window-drag], [data-no-drag], .no-drag')) return true;
  if (target.closest('button, input, textarea, select, a, [role="button"]')) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  return false;
}

function toWindowDragPayload(event: React.PointerEvent<HTMLElement>): WindowDragPayload {
  return {
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

export default function AppChrome() {
  const api = typeof window !== 'undefined' ? window.electronWindow : undefined;
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const [authMode, setAuthMode] = useState(false);
  const dragStateRef = useRef<WindowDragState | null>(null);

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
    if (isInteractiveWindowTarget(target)) return;
    event.preventDefault();
    event.stopPropagation();
    void (api.toggleMaximize?.() ?? api.maximizeRestore());
  }, [api, authMode]);

  const onTitlebarPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (authMode || event.button !== 0) return;
    if (isInteractiveWindowTarget(event.target as HTMLElement | null)) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [authMode]);

  const onTitlebarPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.screenX - state.startScreenX;
    const dy = event.screenY - state.startScreenY;
    if (!state.dragging) {
      if (Math.hypot(dx, dy) < WINDOW_DRAG_THRESHOLD) return;
      state.dragging = true;
      api.dragStart?.(toWindowDragPayload(event));
    }

    event.preventDefault();
    api.dragMove?.(toWindowDragPayload(event));
  }, [api]);

  const finishTitlebarDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (state.dragging) api.dragEnd?.();
    dragStateRef.current = null;
  }, [api]);

  return (
    <header
      className="titlebar window-titlebar app-titlebar relative w-full select-none"
      onDoubleClick={onTitlebarDoubleClick}
      onPointerDown={onTitlebarPointerDown}
      onPointerMove={onTitlebarPointerMove}
      onPointerUp={finishTitlebarDrag}
      onPointerCancel={finishTitlebarDrag}
      style={{
        height: TITLEBAR_HEIGHT,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <div className="relative h-full flex items-center justify-between px-3">
        {/* Header stays no-drag so renderer can implement reliable drag + double-click behavior. */}
        <div
          className="group relative z-30 flex items-center gap-2 shrink-0 pr-3"
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
          className="relative z-30 flex items-center gap-[10px] shrink-0 pl-3 pr-2"
          data-window-control
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {!authMode && (
            <>
              <ControlButton onClick={onMin} ariaLabel="Küçült" tone="neutral">
                <Minus size={10} strokeWidth={2.8} />
              </ControlButton>
              <ControlButton onClick={onMaxRestore} ariaLabel={maximized ? 'Geri al' : 'Tam ekran'} tone="accent">
                {maximized ? <RestoreIcon /> : <MaximizeIcon />}
              </ControlButton>
            </>
          )}
          <ControlButton onClick={onClose} ariaLabel="Kapat" tone="danger">
            <X size={10} strokeWidth={2.8} />
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
    },
    accent: {
      bg: '#459d43',
      hoverBg: '#61c554',
      border: '#3fae3b',
      icon: '#155c18',
    },
    danger: {
      bg: '#c94b47',
      hoverBg: '#ff5f57',
      border: '#e0443e',
      icon: '#7b1511',
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
      className="group w-[16px] h-[16px] rounded-full flex items-center justify-center transition-transform duration-150 active:scale-90"
      style={{
        background: hover ? palette.hoverBg : palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.icon,
        opacity: hover ? 1 : 0.66,
        boxShadow: hover
          ? 'inset 0 1px 0 rgba(255,255,255,0.56), inset 0 -1px 0 rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.18)'
          : 'inset 0 1px 0 rgba(255,255,255,0.24), 0 1px 2px rgba(0,0,0,0.16)',
      }}
    >
      <span
        className="flex items-center justify-center transition-opacity duration-120"
        style={{ opacity: hover ? 0.98 : 0 }}
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
