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
  maximizeRestore: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  isFocused: () => Promise<boolean>;
  onState: (cb: (data: { maximized: boolean; focused: boolean }) => void) => void;
  offState: () => void;
}

declare global {
  interface Window {
    electronWindow?: ElectronWindowAPI;
  }
}

const TITLEBAR_HEIGHT = 36;

export default function AppChrome() {
  const api = typeof window !== 'undefined' ? window.electronWindow : undefined;
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (!api) return;
    void api.isMaximized().then(setMaximized).catch(() => {});
    void api.isFocused().then(setFocused).catch(() => {});
    api.onState(({ maximized: m, focused: f }) => {
      setMaximized(m);
      setFocused(f);
    });
    return () => { api.offState(); };
  }, [api]);

  // Web modunda (Electron yoksa) hiç render etme — drag region anlamsız.
  if (!api) return null;

  const onMin = useCallback(() => api.minimize(), [api]);
  const onMaxRestore = useCallback(() => api.maximizeRestore(), [api]);
  const onClose = useCallback(() => api.close(), [api]);

  return (
    <header
      className="relative w-full select-none"
      style={{
        height: TITLEBAR_HEIGHT,
        WebkitAppRegion: 'drag',
        background: focused
          ? 'linear-gradient(180deg, rgba(var(--theme-bg-rgb), 0.92) 0%, rgba(var(--theme-bg-rgb), 0.78) 100%)'
          : 'linear-gradient(180deg, rgba(var(--theme-bg-rgb), 0.85) 0%, rgba(var(--theme-bg-rgb), 0.68) 100%)',
        borderBottom: '1px solid rgba(var(--theme-accent-rgb), 0.10)',
        boxShadow: focused
          ? 'inset 0 1px 0 rgba(var(--theme-accent-rgb), 0.10), 0 1px 0 rgba(0,0,0,0.35)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        backdropFilter: 'blur(18px) saturate(140%)',
        transition: 'background 200ms ease, box-shadow 200ms ease',
      } as React.CSSProperties}
    >
      {/* Ambient center glow — sadece focused */}
      {focused && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse 220px 28px at 50% 0%, rgba(var(--theme-accent-rgb), 0.12), transparent 70%)',
            mixBlendMode: 'screen',
          }}
        />
      )}

      <div className="relative h-full flex items-center justify-between px-3">
        {/* LEFT — brand */}
        <div
          className="flex items-center gap-2 shrink-0 pr-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <BrandMark focused={focused} />
          <span className={`text-[11.5px] font-extrabold tracking-[0.20em] uppercase leading-none transition-opacity ${focused ? 'opacity-95' : 'opacity-55'}`}>
            <span className="text-[var(--theme-text)]">MAY</span><span className="text-[var(--theme-accent)]">VOX</span>
          </span>
        </div>

        {/* CENTER — drag area, ambient only */}
        <div className="flex-1 h-full" aria-hidden />

        {/* RIGHT — control rail (segmented) */}
        <div
          className="flex items-center gap-1 shrink-0 pl-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ControlButton onClick={onMin} ariaLabel="Küçült" tone="neutral">
            <Minus size={13} strokeWidth={2.2} />
          </ControlButton>
          <ControlButton onClick={onMaxRestore} ariaLabel={maximized ? 'Geri al' : 'Tam ekran'} tone="neutral">
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </ControlButton>
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
      className="relative w-5 h-5 rounded-md flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22), rgba(var(--theme-accent-rgb),0.06))',
        border: '1px solid rgba(var(--theme-accent-rgb), 0.30)',
        boxShadow: focused ? '0 0 10px rgba(var(--theme-accent-rgb), 0.30), inset 0 1px 0 rgba(255,255,255,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'box-shadow 200ms ease',
      }}
    >
      {/* Ses dalgası izlenimi — 3 mini bar */}
      <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
        <rect x="0.5" y="3" width="1.6" height="3" rx="0.6" fill="var(--theme-accent)" opacity="0.85" />
        <rect x="3.4" y="1" width="1.6" height="7" rx="0.6" fill="var(--theme-accent)" opacity="1" />
        <rect x="6.3" y="2" width="1.6" height="5" rx="0.6" fill="var(--theme-accent)" opacity="0.9" />
        <rect x="9.2" y="3.5" width="1.3" height="2" rx="0.5" fill="var(--theme-accent)" opacity="0.7" />
      </svg>
    </div>
  );
}

// ── Control Button — premium command unit ──
function ControlButton({ onClick, ariaLabel, tone, children }: {
  onClick: () => void;
  ariaLabel: string;
  tone: 'neutral' | 'danger';
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const isDanger = tone === 'danger';

  const baseBg = hover
    ? (isDanger ? 'rgba(239,68,68,0.22)' : 'rgba(var(--theme-accent-rgb), 0.10)')
    : 'rgba(255,255,255,0.025)';
  const border = hover
    ? (isDanger ? 'rgba(239,68,68,0.40)' : 'rgba(var(--theme-accent-rgb), 0.30)')
    : 'rgba(255,255,255,0.05)';
  const color = hover && isDanger ? '#fff' : 'var(--theme-text)';

  return (
    <button
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
          ? (isDanger
              ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 12px rgba(239,68,68,0.30)'
              : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 8px rgba(var(--theme-accent-rgb), 0.18)')
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
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
