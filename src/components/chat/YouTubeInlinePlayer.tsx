/**
 * YouTubeInlinePlayer — uygulama-içi YouTube oynatıcı.
 *
 * Modlar (sadece oynatılabilen videoda):
 *   - small       : kartın yerinde 16:9 iframe (max-w 380)
 *   - expanded    : viewport üzerinde fixed overlay (min(72vw, 780px)) + backdrop blur
 *   - fullscreen  : Fullscreen API
 *
 * Restricted (embed bloklanmış) video → sade "YouTube'da izleyin" kartı;
 *   kartın tamamı tıklanabilir, mode switch / close butonu yok.
 *
 * Autoplay guard:
 *   Modül store `activeYouTubeId` process ömrü boyunca yaşar — room/DM
 *   değişiminde component remount olduğunda önceki state "restore edip
 *   otomatik oynatır". Bunu engellemek için player unmount cleanup'ında
 *   aktif ID hâlâ bu video ise store sıfırlanır.
 *
 * Kapsam: LOKAL render. WebSocket/room broadcast yok.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Youtube } from 'lucide-react';
import {
  setActiveYouTubeId, getActiveYouTubeId,
} from '../../lib/youtubePlayerStore';
import { openExternalUrl } from '../../lib/openExternalUrl';
import { youtubeWatchUrl } from '../../lib/youtubeParser';

type Mode = 'small' | 'expanded' | 'fullscreen';
type PlayState = 'playing' | 'restricted';

interface Props {
  videoId: string;
  isOwn?: boolean;
}

export default function YouTubeInlinePlayer({ videoId, isOwn = false }: Props) {
  // İlk mod = expanded (ikincil pencere). Synchronous ilk ölçümle flash engellenir.
  const [mode, setMode] = useState<Mode>('expanded');
  // Fullscreen'e giderken önceki modu hatırla — çift tık/ESC ile aynı moda dönsün.
  const [preFsMode, setPreFsMode] = useState<Mode>('expanded');
  const [playState, setPlayState] = useState<PlayState>('playing');
  const [chatRect, setChatRect] = useState<DOMRect | null>(() => {
    if (typeof document === 'undefined') return null;
    const el = document.querySelector<HTMLElement>('[data-mv-chat-area]');
    return el ? el.getBoundingClientRect() : null;
  });
  const [chatContext, setChatContext] = useState<'dm' | 'room' | null>(() => {
    if (typeof document === 'undefined') return null;
    const el = document.querySelector<HTMLElement>('[data-mv-chat-area]');
    const ctx = el?.getAttribute('data-mv-chat-area');
    return ctx === 'dm' ? 'dm' : ctx === 'room' ? 'room' : null;
  });
  const fsRef = useRef<HTMLDivElement>(null);

  const watchUrl = useMemo(() => youtubeWatchUrl(videoId), [videoId]);
  const embedUrl = useMemo(
    () => `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    [videoId],
  );

  // ── Autoplay restore guard ─────────────────────────────────────────
  // Unmount'ta store'daki ID hâlâ bu video ise sıfırla. Room/DM switch'inde
  // remount geldiğinde preview'dan başlar, click olmadan iframe oluşmaz.
  useEffect(() => {
    return () => {
      if (getActiveYouTubeId() === videoId) {
        setActiveYouTubeId(null);
      }
    };
  }, [videoId]);

  // ── oEmbed pre-check ──────────────────────────────────────────────
  useEffect(() => {
    const ctl = new AbortController();
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    fetch(oembedUrl, { signal: ctl.signal, referrerPolicy: 'no-referrer' })
      .then((r) => { if (!r.ok) setPlayState('restricted'); })
      .catch(() => { /* network fail → iframe denemesine izin ver */ });
    return () => ctl.abort();
  }, [watchUrl]);

  const handleOpenExternalAndClose = useCallback(() => {
    openExternalUrl(watchUrl);
    setActiveYouTubeId(null);
  }, [watchUrl]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && mode === 'fullscreen') {
        setMode(preFsMode);
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [mode, preFsMode]);

  // ESC / mouse-back → player'ı kapat (tüm modlar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Fullscreen'deysek browser zaten exit yapar → fullscreenchange ile preFs moduna döner.
      if (!document.fullscreenElement) {
        e.preventDefault();
        setActiveYouTubeId(null);
      }
    };
    const onMouse = (e: MouseEvent) => {
      // button 3 = mouse back (XButton1). Browser'ın default back behavior'ını bastır + player kapat.
      if (e.button === 3) {
        e.preventDefault();
        setActiveYouTubeId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouse);
      window.removeEventListener('mouseup', onMouse);
    };
  }, []);

  // Fullscreen'de X butonu idle-hide: mouse hareket ederse görünür, 2.5s sonra gizlenir.
  const [xVisible, setXVisible] = useState(true);
  const xTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode !== 'fullscreen') {
      if (xTimerRef.current) { clearTimeout(xTimerRef.current); xTimerRef.current = null; }
      setXVisible(true);
      return;
    }
    const schedule = () => {
      if (xTimerRef.current) clearTimeout(xTimerRef.current);
      xTimerRef.current = setTimeout(() => setXVisible(false), 2500);
    };
    const wake = () => { setXVisible(true); schedule(); };
    schedule();
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
      if (xTimerRef.current) { clearTimeout(xTimerRef.current); xTimerRef.current = null; }
    };
  }, [mode]);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { /* no-op */ });
    }
    setActiveYouTubeId(null);
  }, []);

  // ── Chat alanı bounds ölçümü (expanded overlay'i scope etmek için) ──
  // data-mv-chat-area işaretli scroll container'ı bul; viewport-wide blur yerine
  // player'ı sadece chat penceresi bölgesinde konumla.
  useEffect(() => {
    if (mode !== 'expanded') {
      setChatRect(null);
      setChatContext(null);
      return;
    }
    const el = document.querySelector<HTMLElement>('[data-mv-chat-area]');
    if (!el) return;
    const ctxAttr = el.getAttribute('data-mv-chat-area');
    setChatContext(ctxAttr === 'dm' ? 'dm' : 'room');
    const measure = () => setChatRect(el.getBoundingClientRect());
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [mode]);

  const switchMode = useCallback(async (next: Mode) => {
    if (next === mode) return;
    // Fullscreen'e giderken önceki modu sakla
    if (next === 'fullscreen' && mode !== 'fullscreen') {
      setPreFsMode(mode);
    }
    if (mode === 'fullscreen' && document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* no-op */ }
    }
    if (next === 'fullscreen') {
      const el = fsRef.current;
      if (el?.requestFullscreen) {
        try { await el.requestFullscreen(); } catch { /* no-op */ }
      }
    }
    setMode(next);
  }, [mode]);

  // Çift tık → fullscreen ↔ önceki mod toggle.
  // iframe olay'ları yakalar; non-iframe alanda (padding/çerçeve) çalışır.
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'fullscreen') {
      switchMode(preFsMode);
    } else {
      switchMode('fullscreen');
    }
  }, [mode, preFsMode, switchMode]);


  // ── Restricted branch: sade kart, mode system yok ─────────────────
  if (playState === 'restricted') {
    return (
      <RestrictedCard
        isOwn={isOwn}
        onOpen={handleOpenExternalAndClose}
      />
    );
  }

  // ── Playable: 3-mode ─────────────────────────────────────────────
  const IframeEl = (
    <iframe
      src={embedUrl}
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        border: 0, display: 'block', background: '#000',
      }}
    />
  );

  if (mode === 'small') {
    // Kontrol kapsülü video'nun DIŞINDA — sağda, dikey ortalı.
    // Wrapper relative, kart max-w-380 + sağda 36px kapsül alanı.
    return (
      <div
        data-yt-player="small"
        data-yt-video-id={videoId}
        className="relative block"
        style={{ width: 'fit-content', maxWidth: 420 }}
      >
        <div
          ref={fsRef}
          onDoubleClick={handleDoubleClick}
          className="relative block rounded-[14px] overflow-hidden"
          style={{
            width: '100%',
            maxWidth: 380,
            minWidth: 240,
            background: '#000',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 22px -10px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
            {IframeEl}
          </div>
          <CloseBtn onClose={handleClose} />
        </div>
      </div>
    );
  }

  const placeholder = (
    <div
      aria-hidden
      className="relative block rounded-[14px] overflow-hidden"
      style={{
        width: '100%',
        maxWidth: 380,
        minWidth: 240,
        paddingBottom: '56.25%',
        background: 'rgba(0,0,0,0.08)',
        border: '1px dashed rgba(0,0,0,0.18)',
      }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold"
        style={{ color: 'rgba(0,0,0,0.55)' }}
      >
        {mode === 'expanded' ? 'Genişletilmiş oynatıcıda' : 'Tam ekranda oynatılıyor'}
      </span>
    </div>
  );

  return (
    <>
      {placeholder}
      {createPortal(
        mode === 'expanded' ? (
          chatContext === 'dm' ? (
            // DM: merkezi modal + viewport blur — eski "büyük mini-pencere" hissi
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center p-5"
              style={{
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(12px) saturate(140%)',
                WebkitBackdropFilter: 'blur(12px) saturate(140%)',
              }}
              onClick={(e) => { if (e.target === e.currentTarget) setMode('small'); }}
            >
              <div
                ref={fsRef}
                onDoubleClick={handleDoubleClick}
                className="relative rounded-2xl overflow-hidden"
                style={{
                  width: 'min(72vw, 780px)',
                  background: '#000',
                  boxShadow: '0 28px 72px -24px rgba(0,0,0,0.75)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
                  {IframeEl}
                </div>
                <CloseBtn onClose={handleClose} />
              </div>
            </div>
          ) : chatRect ? (
            // Room: chat alanını kapla, iframe'i 16:9 oranında chat genişliğinde
            // dikey ortala — YouTube'un kendi iç letterbox'ı devreye girmez → yan boşluk yok.
            <div
              ref={fsRef}
              onDoubleClick={handleDoubleClick}
              className="fixed z-[89] overflow-hidden flex items-center justify-center"
              style={{
                top: chatRect.top,
                left: chatRect.left,
                width: chatRect.width,
                height: chatRect.height,
                background: '#000',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingBottom: '56.25%',
                }}
              >
                {IframeEl}
              </div>
              <CloseBtn onClose={handleClose} />
            </div>
          ) : (
            <div
              ref={fsRef}
              className="relative overflow-hidden mx-auto my-4"
              style={{
                width: 'min(90%, 780px)',
                background: '#000',
                boxShadow: '0 18px 40px -16px rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
                {IframeEl}
              </div>
              <CloseBtn onClose={handleClose} />
            </div>
          )
        ) : (
          <div
            ref={fsRef}
            onDoubleClick={handleDoubleClick}
            className="fixed inset-0 z-[95]"
            style={{ background: '#000' }}
          >
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {IframeEl}
            </div>
            <CloseBtn onClose={handleClose} visible={xVisible} />
          </div>
        ),
        document.body,
      )}
    </>
  );
}

// ── Restricted card — tam-kart tıklanabilir, sade ─────────────────────

function RestrictedCard({
  isOwn, onOpen,
}: {
  isOwn: boolean;
  onOpen: () => void;
}) {
  const surface = isOwn
    ? {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,249,251,0.94) 100%)',
        border: '1px solid rgba(0,0,0,0.08)',
        shadow: '0 1px 1px rgba(0,0,0,0.04), 0 6px 16px -8px rgba(0,0,0,0.14)',
        titleColor: 'rgba(17,17,17,0.92)',
        bodyColor: 'rgba(17,17,17,0.55)',
        iconColor: 'rgba(17,17,17,0.38)',
      }
    : {
        background: 'linear-gradient(180deg, rgba(18,18,22,0.96) 0%, rgba(12,12,16,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        shadow: '0 1px 1px rgba(0,0,0,0.25), 0 8px 22px -10px rgba(0,0,0,0.45)',
        titleColor: 'rgba(255,255,255,0.94)',
        bodyColor: 'rgba(255,255,255,0.58)',
        iconColor: 'rgba(255,255,255,0.28)',
      };

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/restricted block w-full rounded-[14px] overflow-hidden text-left
                 transition-transform duration-[260ms]
                 hover:-translate-y-[1px] active:scale-[0.995]
                 outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
      style={{
        maxWidth: 380,
        minWidth: 240,
        background: surface.background,
        border: surface.border,
        boxShadow: surface.shadow,
        transitionTimingFunction: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
      }}
    >
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5 gap-1.5">
          <Youtube size={30} style={{ color: surface.iconColor }} strokeWidth={1.6} />
          <div
            className="text-[12.5px] font-semibold tracking-[-0.01em] leading-[1.25]"
            style={{ color: surface.titleColor }}
          >
            Bu video uygulama içinde oynatılamıyor
          </div>
          <div
            className="text-[10.5px] font-medium leading-[1.35]"
            style={{ color: surface.bodyColor, maxWidth: 260 }}
          >
            YouTube'da izleyin
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Close button — küçük, sağ üst köşe ───────────────────────────────────

function CloseBtn({
  onClose, visible = true,
}: {
  onClose: () => void;
  visible?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      title="Kapat"
      aria-label="Kapat"
      className={`group/ytclose absolute z-20 flex items-center justify-center rounded-full
                  transition-all duration-200 ease-out
                  text-white hover:text-red-500
                  hover:scale-[1.25] hover:border-red-500/60
                  ${visible ? 'opacity-80 hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{
        top: 4,
        right: 4,
        width: 22,
        height: 22,
        background: 'rgba(0,0,0,0.68)',
        border: '1px solid rgba(255,255,255,0.18)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        transitionTimingFunction: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
      }}
    >
      <X size={11} strokeWidth={2.4} />
    </button>
  );
}
