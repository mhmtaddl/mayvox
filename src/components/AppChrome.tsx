import React, { useEffect, useState, useCallback } from 'react';
import { useRef } from 'react';
import { Minus, X } from 'lucide-react';

/**
 * MayVox Custom Desktop Chrome — frameless Electron window'u premium kontrol rayı.
 * - Sol: küçük marka mark + "MAY/VOX" wordmark
 * - Orta: drag region (boş, ambient glow)
 * - Sağ: soft frameless minimize / maximize-restore / close kontrolleri
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

const TITLEBAR_HEIGHT = 36;
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
          className="group relative z-30 flex items-center gap-[7px] shrink-0 pr-3 transition-opacity duration-160"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <BrandMark focused={focused} />
          <span
            className={`text-[11.5px] font-bold tracking-[0.12em] uppercase leading-none transition-[opacity,color] duration-160 group-hover:opacity-95 ${focused ? 'opacity-90' : 'opacity-56'}`}
            style={{
              color: 'rgba(var(--glass-tint), 0.82)',
              textShadow: '0 1px 8px rgba(0,0,0,0.08)',
            }}
          >
            MAYVOX
          </span>
        </div>

        {/* CENTER — drag area, ambient only */}
        <div className="flex-1 h-full" aria-hidden />

        {/* RIGHT — frameless window controls */}
        <div
          className="relative z-30 flex items-center gap-2 shrink-0 pl-3 pr-2"
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
      className="relative w-[14px] h-[14px] flex items-center justify-center transition-opacity duration-160 group-hover:opacity-100"
      style={{
        opacity: focused ? 0.78 : 0.48,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1.4" y="5.4" width="1.45" height="3.4" rx="0.72" fill="rgba(120,210,255,0.62)" />
        <rect x="4.2" y="2.7" width="1.5" height="8.7" rx="0.75" fill="rgba(120,210,255,0.72)" />
        <rect x="7.0" y="4.1" width="1.5" height="6.0" rx="0.75" fill="rgba(125,150,255,0.62)" />
        <rect x="9.8" y="5.9" width="1.35" height="2.8" rx="0.68" fill="rgba(120,210,255,0.52)" />
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
  const [active, setActive] = useState(false);
  const palette = {
    neutral: {
      hoverBg: 'rgba(245, 180, 64, 0.22)',
      hoverBorder: 'rgba(245, 180, 64, 0.36)',
      hoverIcon: 'rgba(251, 191, 36, 0.92)',
      hoverShadow: '0 0 10px rgba(245, 180, 64, 0.10)',
    },
    accent: {
      hoverBg: 'rgba(74, 222, 128, 0.20)',
      hoverBorder: 'rgba(74, 222, 128, 0.34)',
      hoverIcon: 'rgba(134, 239, 172, 0.92)',
      hoverShadow: '0 0 10px rgba(74, 222, 128, 0.10)',
    },
    danger: {
      hoverBg: 'rgba(248, 113, 113, 0.22)',
      hoverBorder: 'rgba(248, 113, 113, 0.38)',
      hoverIcon: 'rgba(252, 165, 165, 0.95)',
      hoverShadow: '0 0 11px rgba(248, 113, 113, 0.12)',
    },
  }[tone];
  const idleBg = 'rgba(var(--glass-tint), 0.055)';
  const idleBorder = 'rgba(var(--glass-tint), 0.11)';
  const idleIcon = 'rgba(var(--glass-tint), 0.62)';

  return (
    <button
      data-window-control
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      title={ariaLabel}
      aria-label={ariaLabel}
      className="group w-[13px] h-[13px] rounded-[4px] flex items-center justify-center"
      style={{
        background: hover ? palette.hoverBg : idleBg,
        border: `1px solid ${hover ? palette.hoverBorder : idleBorder}`,
        color: hover ? palette.hoverIcon : idleIcon,
        opacity: hover ? 1 : 0.94,
        transform: active ? 'scale(0.96)' : hover ? 'scale(1.04)' : 'scale(1)',
        boxShadow: hover
          ? `inset 0 1px 0 rgba(255,255,255,0.14), ${palette.hoverShadow}`
          : 'inset 0 1px 0 rgba(var(--glass-tint),0.10), inset 0 -1px 0 rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.10)',
        transition: 'background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, opacity 140ms ease, transform 120ms ease',
      }}
    >
      <span
        className="flex items-center justify-center transition-opacity duration-120"
        style={{ opacity: hover ? 0.86 : 0 }}
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
