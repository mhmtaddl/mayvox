/**
 * YouTubePreviewCard — chat içinde YouTube videoları için zengin önizleme.
 *
 * Yapı:
 *  - Üstte 16:9 thumbnail (hqdefault.jpg) + ortada yarı saydam play FAB
 *  - Altta 2-satır title + channel name (+ küçük YouTube glyph)
 *
 * Metadata:
 *  - İlk render: thumbnail + fallback title "YouTube Video" / "youtube.com"
 *  - Mount sonrası async fetch oEmbed (CORS-enabled public endpoint):
 *    https://www.youtube.com/oembed?url=...&format=json
 *  - Başarılı olursa title + author_name state'e yazılır — re-render.
 *  - Hata → fallback metin kalır (no-op).
 *
 * Davranış (LinkPreviewCard ile aynı):
 *  - Sol tık → openExternalUrl (watch URL)
 *  - Sağ tık → "Bağlantıyı Aç" / "Bağlantıyı Kopyala" menu
 *  - http/https guard zaten openExternalUrl içinde
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, Play, Youtube } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { openExternalUrl } from '../../lib/openExternalUrl';
import { youtubeThumbnailUrl } from '../../lib/youtubeParser';
import { setActiveYouTubeId } from '../../lib/youtubePlayerStore';

interface Props {
  url: string;
  videoId: string;
  isOwn?: boolean;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

export default function YouTubePreviewCard({ url, videoId, isOwn = false }: Props) {
  const thumb = useMemo(() => youtubeThumbnailUrl(videoId), [videoId]);
  const [meta, setMeta] = useState<OEmbedResponse | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── oEmbed fetch — lazy, abort-safe ──────────────────────────────────
  useEffect(() => {
    const ctl = new AbortController();
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    fetch(oembedUrl, { signal: ctl.signal, referrerPolicy: 'no-referrer' })
      .then((r) => (r.ok ? r.json() as Promise<OEmbedResponse> : null))
      .then((data) => { if (data) setMeta(data); })
      .catch(() => { /* no-op — fallback metin kalır */ });
    return () => ctl.abort();
  }, [url]);

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

  // Primary click → in-app player. Context menu'daki "Tarayıcıda Aç" external route için handleOpenExternal.
  const handlePrimaryClick = () => { setActiveYouTubeId(videoId); setMenu(null); };
  const handleOpenExternal = () => { openExternalUrl(url); setMenu(null); };

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

  const title = meta?.title?.trim() || 'YouTube Video';
  const channel = meta?.author_name?.trim() || 'YouTube';

  // ── Surface tokens (LinkPreviewCard ile aynı dil) ────────────────────
  const surface = isOwn
    ? {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,249,251,0.94) 100%)',
        border: '1px solid rgba(0,0,0,0.08)',
        shadow: '0 1px 1px rgba(0,0,0,0.04), 0 6px 16px -8px rgba(0,0,0,0.14)',
        innerHighlight: 'inset 0 1px 0 rgba(255,255,255,0.9)',
        titleColor: 'rgba(17,17,17,0.92)',
        channelColor: 'rgba(17,17,17,0.55)',
        hoverRing: 'inset 0 0 0 1px rgba(0,0,0,0.14)',
        hoverShadow: '0 2px 3px rgba(0,0,0,0.06), 0 12px 28px -10px rgba(0,0,0,0.22)',
      }
    : {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        shadow: '0 1px 1px rgba(0,0,0,0.18), 0 8px 22px -10px rgba(0,0,0,0.45)',
        innerHighlight: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        titleColor: 'rgba(255,255,255,0.94)',
        channelColor: 'rgba(255,255,255,0.58)',
        hoverRing: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
        hoverShadow: '0 2px 4px rgba(0,0,0,0.25), 0 14px 32px -12px rgba(0,0,0,0.55)',
      };

  return (
    <div
      data-link-preview="youtube"
      data-link-preview-video-id={videoId}
      className="relative block w-full min-w-0 max-w-[380px]"
      style={{ isolation: 'isolate' }}
    >
      <button
        type="button"
        onClick={handlePrimaryClick}
        onContextMenu={handleContextMenu}
        title={url}
        className="group/yt relative block w-full text-left rounded-[14px]
                   transition-[transform,box-shadow] duration-[260ms]
                   hover:-translate-y-[1px] active:scale-[0.994]
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
        {/* Hover glow */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[14px] opacity-0 group-hover/yt:opacity-100 transition-opacity duration-[260ms] z-10"
          style={{
            boxShadow: `${surface.hoverRing}, ${surface.hoverShadow}`,
            transitionTimingFunction: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        />

        {/* ── Thumbnail (16:9) ──────────────────────────────────────── */}
        <span
          className="relative block w-full"
          style={{ aspectRatio: '16 / 9', background: '#0f0f0f' }}
        >
          {!thumbFailed ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setThumbFailed(true)}
              className="absolute inset-0 w-full h-full object-cover select-none"
              draggable={false}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <Youtube size={48} className="text-white/70" />
            </span>
          )}

          {/* Alt vignette — metin-dostu */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 100%)',
            }}
          />

          {/* Play FAB — ortada */}
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <span
              className="flex items-center justify-center transition-transform duration-[260ms] group-hover/yt:scale-[1.08]"
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                background: 'rgba(0,0,0,0.55)',
                border: '1.5px solid rgba(255,255,255,0.88)',
                boxShadow: '0 6px 18px -4px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                transitionTimingFunction: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
              }}
            >
              <Play size={22} fill="#ffffff" className="text-white" style={{ marginLeft: 3 }} />
            </span>
          </span>

          {/* YouTube brand chip — sol alt */}
          <span
            className="absolute left-2.5 bottom-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wide uppercase"
            style={{
              background: 'rgba(0,0,0,0.6)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <Youtube size={11} className="text-red-500" />
            YouTube
          </span>
        </span>

        {/* ── Meta row (title + channel) ─────────────────────────── */}
        <span className="relative block px-3 py-2.5">
          <span
            className="block text-[12.5px] font-semibold tracking-[-0.01em] leading-[1.3]"
            style={{
              color: surface.titleColor,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </span>
          <span
            className="block mt-1 text-[10.5px] font-medium tracking-[-0.005em] truncate inline-flex items-center gap-1.5"
            style={{ color: surface.channelColor }}
          >
            <Youtube size={10} className="text-red-500 shrink-0" />
            {channel}
          </span>
        </span>

        {copied && (
          <span
            className="absolute -top-2 right-2 z-20 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide"
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
            <MenuRow icon={ExternalLink} label="Tarayıcıda Aç" onClick={handleOpenExternal} />
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
