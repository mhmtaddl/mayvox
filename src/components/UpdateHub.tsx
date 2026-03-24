import React, { useState, useEffect, useRef } from 'react';
import { Download, CheckCircle2, RefreshCw, Clock, X, ArrowDownToLine } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UpdateInfo {
  version: string;
  sizeMB: number | null;
  state: 'available' | 'downloading' | 'downloaded' | 'dismissed';
  progress: number;
}

interface Props {
  updateInfo: UpdateInfo;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

// ── Circular progress ring ──────────────────────────────────────────────────

const ProgressRing = ({ progress, size = 34, stroke = 2.5 }: { progress: number; size?: number; stroke?: number }) => {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90">
      {/* Track */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-[var(--theme-border)]/20" />
      {/* Progress */}
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        className="text-amber-400 transition-all duration-500 ease-out"
      />
    </svg>
  );
};

// ── Main component ──────────────────────────────────────────────────────────

export default function UpdateHub({ updateInfo, onDownload, onInstall, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const st = updateInfo.state;
  const isActive = st === 'available' || st === 'downloading' || st === 'downloaded';

  return (
    <div className="relative" ref={ref}>
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`relative flex items-center justify-center w-[34px] h-[34px] rounded-full transition-all duration-300 ${
          st === 'available'
            ? 'bg-blue-500/12 text-blue-400 hover:bg-blue-500/20'
            : st === 'downloading'
              ? 'bg-transparent text-amber-400 hover:bg-amber-500/10'
              : st === 'downloaded'
                ? 'bg-emerald-500/12 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-[var(--theme-border)]/8 text-[var(--theme-secondary-text)]/40 hover:bg-[var(--theme-border)]/15 hover:text-[var(--theme-secondary-text)]/60'
        }`}
      >
        {/* Progress ring for downloading */}
        {st === 'downloading' && <ProgressRing progress={updateInfo.progress} />}

        {/* Icon */}
        {st === 'available' && <ArrowDownToLine size={15} />}
        {st === 'downloading' && <span className="text-[9px] font-bold tabular-nums">{updateInfo.progress}</span>}
        {st === 'downloaded' && <CheckCircle2 size={15} />}
        {st === 'dismissed' && <Clock size={14} />}

        {/* Pulse dot for available */}
        {st === 'available' && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-400" />
          </span>
        )}

        {/* Success glow for downloaded */}
        {st === 'downloaded' && (
          <span className="absolute inset-0 rounded-full bg-emerald-400/15 animate-pulse pointer-events-none" />
        )}
      </button>

      {/* ── Popover panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full right-0 mt-2 w-72 z-50 rounded-xl border border-[var(--theme-border)]/30 bg-[var(--theme-surface)] shadow-2xl shadow-black/30 backdrop-blur-xl overflow-hidden"
          >
            {/* ── Available ── */}
            {st === 'available' && (
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/12 flex items-center justify-center shrink-0 mt-0.5">
                    <Download size={17} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--theme-text)]">Yeni sürüm hazır</p>
                    <p className="text-[11px] text-[var(--theme-secondary-text)]/60 mt-0.5">
                      v{updateInfo.version}{updateInfo.sizeMB ? ` · ${updateInfo.sizeMB} MB` : ''}
                    </p>
                    <p className="text-[10px] text-[var(--theme-secondary-text)]/40 mt-2 leading-relaxed">
                      Yeni özellikler ve iyileştirmeler içeren güncelleme indirilmeye hazır.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => { onDownload(); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-bold transition-colors shadow-sm shadow-blue-500/25"
                  >
                    <Download size={13} />
                    İndir
                  </button>
                  <button
                    onClick={() => { onDismiss(); setOpen(false); }}
                    className="px-3 py-2 rounded-lg text-[11px] font-medium text-[var(--theme-secondary-text)]/60 hover:bg-[var(--theme-border)]/15 hover:text-[var(--theme-secondary-text)] transition-colors"
                  >
                    Sonra
                  </button>
                </div>
              </div>
            )}

            {/* ── Downloading ── */}
            {st === 'downloading' && (
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/12 flex items-center justify-center shrink-0">
                    <Download size={17} className="text-amber-400 animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--theme-text)]">Güncelleme indiriliyor</p>
                    <p className="text-[11px] text-[var(--theme-secondary-text)]/60 mt-0.5">v{updateInfo.version}</p>
                  </div>
                  <span className="text-[13px] font-bold text-amber-400 tabular-nums shrink-0">%{updateInfo.progress}</span>
                </div>
                <div className="h-2 bg-[var(--theme-border)]/15 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                    animate={{ width: `${updateInfo.progress}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-[10px] text-[var(--theme-secondary-text)]/40 mt-2.5">Tamamlandığında kurulum hazır olacak.</p>
              </div>
            )}

            {/* ── Downloaded ── */}
            {st === 'downloaded' && (
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/12 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={17} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--theme-text)]">Güncelleme hazır</p>
                    <p className="text-[11px] text-[var(--theme-secondary-text)]/60 mt-0.5">v{updateInfo.version} indirildi.</p>
                    <p className="text-[10px] text-[var(--theme-secondary-text)]/40 mt-2 leading-relaxed">
                      Kurulumu tamamlamak için uygulamayı yeniden başlatın.
                    </p>
                  </div>
                </div>
                <button
                  onClick={onInstall}
                  className="w-full flex items-center justify-center gap-1.5 mt-4 px-3 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-[12px] font-bold transition-colors shadow-sm shadow-emerald-500/25"
                >
                  <RefreshCw size={13} />
                  Yükle ve Yeniden Başlat
                </button>
              </div>
            )}

            {/* ── Dismissed ── */}
            {st === 'dismissed' && (
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--theme-border)]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock size={17} className="text-[var(--theme-secondary-text)]/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--theme-text)]">Güncelleme ertelendi</p>
                    <p className="text-[10px] text-[var(--theme-secondary-text)]/40 mt-1.5 leading-relaxed">
                      En iyi deneyim için son sürümü daha sonra yükleyebilirsiniz.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => { onDownload(); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--theme-accent)] hover:opacity-90 text-white text-[11px] font-bold transition-opacity"
                  >
                    <Download size={13} />
                    Şimdi İndir
                  </button>
                  <button
                    onClick={() => { onDismiss(); setOpen(false); }}
                    className="p-2 rounded-lg text-[var(--theme-secondary-text)]/40 hover:bg-[var(--theme-border)]/15 hover:text-[var(--theme-secondary-text)] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
