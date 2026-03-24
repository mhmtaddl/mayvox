import React, { useEffect, useRef } from 'react';
import { Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import appLogo from '../assets/app-logo.png';

interface UpdateInfo {
  version: string;
  sizeMB: number | null;
  state: 'available' | 'downloading' | 'downloaded' | 'dismissed';
  progress: number;
}

interface Props {
  message: string;
  updateInfo: UpdateInfo | null;
  onDownload: () => void;
  onInstall: () => void;
}

export default function ForceUpdateOverlay({ message, updateInfo, onDownload, onInstall }: Props) {
  const st = updateInfo?.state;
  const progress = updateInfo?.progress ?? 0;
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Keyboard trap: Escape engelle, Tab'ı overlay içinde tut ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape'i engelle
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Tab'ı overlay içinde tut
      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };

    document.addEventListener('keydown', handler, true);
    // İlk fokus
    const timer = setTimeout(() => {
      const btn = containerRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      btn?.focus();
    }, 100);

    return () => {
      document.removeEventListener('keydown', handler, true);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Zorunlu güncelleme"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--theme-bg)]/95 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-sm mx-6 rounded-2xl border border-[var(--theme-border)]/30 bg-[var(--theme-surface)] shadow-2xl overflow-hidden"
      >
        {/* Top accent bar */}
        <div className="h-1 bg-[var(--theme-accent)]" />

        <div className="px-7 pt-7 pb-6">
          {/* Icon */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl overflow-hidden ring-1 ring-[var(--theme-border)]/30 shrink-0">
              <img src={appLogo} alt="CylkSohbet" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--theme-text)]">Yeni sürüm gerekli</h2>
              <p className="text-[11px] text-[var(--theme-secondary-text)]/60 mt-0.5">
                v{updateInfo?.version ?? '—'}
              </p>
            </div>
          </div>

          {/* Message */}
          <p className="text-[13px] text-[var(--theme-secondary-text)] leading-relaxed mb-6">
            {message || 'Devam etmek için uygulamayı güncellemeniz gerekiyor.'}
          </p>

          {/* Progress bar — downloading */}
          {st === 'downloading' && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-[var(--theme-secondary-text)]/60">İndiriliyor</span>
                <span className="text-[12px] font-bold text-[var(--theme-accent)] tabular-nums">%{progress}</span>
              </div>
              <div className="h-2 bg-[var(--theme-border)]/15 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--theme-accent)' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                />
              </div>
              <p className="text-[10px] text-[var(--theme-secondary-text)]/40 mt-2">
                Tamamlandığında kurulum hazır olacak.
              </p>
            </div>
          )}

          {/* Action button */}
          {st === 'downloaded' ? (
            <button
              onClick={onInstall}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold text-white transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50 focus:ring-offset-2 focus:ring-offset-[var(--theme-surface)]"
              style={{ backgroundColor: 'var(--theme-accent)' }}
            >
              <RefreshCw size={15} />
              Yükle ve Yeniden Başlat
            </button>
          ) : st === 'downloading' ? (
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold text-[var(--theme-secondary-text)]/40 bg-[var(--theme-border)]/15 cursor-not-allowed"
            >
              <Download size={15} />
              İndiriliyor…
            </button>
          ) : (
            <button
              onClick={onDownload}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold text-white transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50 focus:ring-offset-2 focus:ring-offset-[var(--theme-surface)]"
              style={{ backgroundColor: 'var(--theme-accent)' }}
            >
              <Download size={15} />
              Güncellemeyi İndir
            </button>
          )}

          {/* Security note */}
          <div className="flex items-center gap-1.5 mt-4 justify-center">
            <ShieldAlert size={11} className="text-[var(--theme-secondary-text)]/30" />
            <span className="text-[9px] text-[var(--theme-secondary-text)]/30">
              Bu güncelleme uyumluluk ve güvenlik için gereklidir.
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
