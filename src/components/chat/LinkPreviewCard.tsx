/**
 * LinkPreviewCard — Apple/Arc/Linear vari premium link önizleme.
 *
 * Yüzey stratejisi:
 *  - isOwn  (açık bubble): "paper" yüzey — beyaza yakın gradient + ince border +
 *    layered shadow + inner highlight. Bubble'ın içinde yüzüyormuş hissi.
 *  - !isOwn (koyu bubble): "glass" yüzey — rgba(255,255,255,0.06) + backdrop-blur
 *    + ince beyaz border + soft drop shadow. macOS vibrancy tarzı.
 *
 * Link kimliği:
 *  - Favicon: Google s2 favicon service (network; referrerPolicy=no-referrer).
 *  - Fallback: domain baş harfi (squircle badge).
 *  - Sağ üst: ExternalLink affordance — "bu tıklanabilir bağlantı" sinyali.
 *
 * Etkileşim (DEĞİŞMEDİ):
 *  - Sol tık → openExternalUrl (http/https guard)
 *  - Sağ tık → "Bağlantıyı Aç" / "Bağlantıyı Kopyala"
 *  - Hover → hafif lift + shadow intensify (Apple easing)
 *  - Klavye: Enter/Space → aç
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Copy, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { openExternalUrl, isSafeHttpUrl } from '../../lib/openExternalUrl';
import { getDomain, prettifyTitle } from '../../lib/linkify';

interface Props {
  url: string;
  /** Opsiyonel override — metadata-driven backend entegrasyonu için hook. */
  title?: string;
  /** Kullanıcının kendi mesajı mı — yüzey varyantı (paper vs glass) için. */
  isOwn?: boolean;
}

export default function LinkPreviewCard({ url, title, isOwn = false }: Props) {
  const safe = useMemo(() => isSafeHttpUrl(url), [url]);

  const display = useMemo(() => ({
    title: title?.trim() || prettifyTitle(url),
    domain: getDomain(url),
    initial: (getDomain(url)[0] || '?').toUpperCase(),
  }), [url, title]);

  const faviconUrl = useMemo(
    () => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(display.domain)}&sz=64`,
    [display.domain],
  );
  const [faviconOk, setFaviconOk] = useState(true);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  if (!safe) {
    return (
      <span className="break-all opacity-60 text-[12px] italic select-text">
        [engellenen bağlantı]
      </span>
    );
  }

  const handleOpen = () => { openExternalUrl(url); setMenu(null); };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch { /* no-op */ }
    setMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const MENU_W = 200;
    const MENU_H = 96;
    const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8);
    const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8);
    setMenu({ x, y });
  };

  // ── Surface tokens ────────────────────────────────────────────────────
  const surface = isOwn
    ? {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,249,251,0.94) 100%)',
        border: '1px solid rgba(0,0,0,0.08)',
        shadow: '0 1px 1px rgba(0,0,0,0.04), 0 6px 16px -8px rgba(0,0,0,0.14)',
        innerHighlight: 'inset 0 1px 0 rgba(255,255,255,0.9)',
        titleColor: 'rgba(17,17,17,0.92)',
        domainColor: 'rgba(17,17,17,0.55)',
        iconColor: 'rgba(17,17,17,0.72)',
        badgeBg: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(242,243,246,0.9) 100%)',
        badgeBorder: '1px solid rgba(0,0,0,0.08)',
        badgeFallbackColor: 'rgba(17,17,17,0.78)',
        // Hover: accent-tinted ring + derin bloom — "tıklanabilir" daha net hissettir
        hoverRing: 'inset 0 0 0 1.5px rgba(var(--theme-accent-rgb),0.55)',
        hoverShadow: '0 4px 8px rgba(0,0,0,0.1), 0 18px 36px -12px rgba(var(--theme-accent-rgb),0.38)',
      }
    : {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        shadow: '0 1px 1px rgba(0,0,0,0.18), 0 8px 22px -10px rgba(0,0,0,0.45)',
        innerHighlight: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        titleColor: 'rgba(255,255,255,0.94)',
        domainColor: 'rgba(255,255,255,0.58)',
        iconColor: 'rgba(255,255,255,0.72)',
        badgeBg: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
        badgeBorder: '1px solid rgba(255,255,255,0.14)',
        badgeFallbackColor: 'rgba(255,255,255,0.88)',
        hoverRing: 'inset 0 0 0 1.5px rgba(var(--theme-accent-rgb),0.65)',
        hoverShadow: '0 4px 10px rgba(0,0,0,0.3), 0 20px 42px -14px rgba(var(--theme-accent-rgb),0.55)',
      };

  return (
    <div
      data-link-preview="card"
      className="relative block w-full min-w-0 max-w-[340px]"
      style={{ isolation: 'isolate' }}
    >
      <button
        type="button"
        onClick={handleOpen}
        onContextMenu={handleContextMenu}
        title={url}
        className="group/lpc relative block w-full text-left rounded-[14px] px-3 py-2.5
                   transition-[transform,box-shadow] duration-[260ms]
                   hover:-translate-y-[2px] active:scale-[0.992]
                   outline-none focus-visible:ring-2 focus-visible:ring-offset-0
                   overflow-hidden"
        style={{
          background: surface.background,
          border: surface.border,
          boxShadow: `${surface.shadow}, ${surface.innerHighlight}`,
          backdropFilter: isOwn ? undefined : 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: isOwn ? undefined : 'blur(14px) saturate(140%)',
          transitionTimingFunction: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        {/* Hover layered glow — Apple easing, sakin */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[14px] opacity-0 group-hover/lpc:opacity-100 transition-opacity duration-[260ms]"
          style={{
            boxShadow: `${surface.hoverRing}, ${surface.hoverShadow}`,
            transitionTimingFunction: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        />

        <span className="relative flex items-center gap-2.5 min-w-0">
          {/* Squircle identity badge — favicon → fallback initial */}
          <span
            className="shrink-0 flex items-center justify-center overflow-hidden"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: surface.badgeBg,
              border: surface.badgeBorder,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 1px rgba(0,0,0,0.06)',
            }}
          >
            {faviconOk ? (
              <img
                src={faviconUrl}
                alt=""
                width={18}
                height={18}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFaviconOk(false)}
                style={{ width: 18, height: 18, objectFit: 'contain' }}
              />
            ) : (
              <span
                className="text-[13px] font-bold leading-none"
                style={{ color: surface.badgeFallbackColor }}
              >
                {display.initial}
              </span>
            )}
          </span>

          {/* Text column */}
          <span className="flex-1 min-w-0 flex flex-col gap-[3px] overflow-hidden">
            <span
              className="text-[12.5px] font-semibold tracking-[-0.01em] leading-[1.28]"
              style={{
                color: surface.titleColor,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {display.title}
            </span>
            <span
              className="text-[10.5px] font-medium tracking-[-0.005em] truncate inline-flex items-center gap-1"
              style={{ color: surface.domainColor }}
            >
              <Link2 size={9} strokeWidth={2.2} style={{ color: surface.domainColor, opacity: 0.75 }} />
              {display.domain}
            </span>
          </span>

          {/* External affordance */}
          <ExternalLink
            size={13}
            className="shrink-0 transition-opacity duration-200"
            style={{ color: surface.iconColor, opacity: 0.55 }}
          />
        </span>

        {copied && (
          <span
            className="absolute -top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide"
            style={{
              background: isOwn ? '#111111' : '#ffffff',
              color: isOwn ? '#ffffff' : '#111111',
            }}
          >
            Kopyalandı
          </span>
        )}
      </button>

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.25, 0.8, 0.25, 1] }}
            style={{ top: menu.y, left: menu.x }}
            className="fixed z-[100] w-[200px] rounded-xl p-1 shadow-2xl backdrop-blur-xl"
            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute inset-0 rounded-xl -z-10"
              style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}
            />
            <MenuRow icon={ExternalLink} label="Bağlantıyı Aç" onClick={handleOpen} />
            <MenuRow icon={Copy} label="Bağlantıyı Kopyala" onClick={handleCopy} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuRow({
  icon: Icon, label, onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[11.5px] font-semibold
                 text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-badge-text)]
                 transition-colors text-left"
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
