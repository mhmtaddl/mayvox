import React from 'react';
import { motion } from 'motion/react';
import { X, Download, RefreshCw, RotateCcw, ExternalLink } from 'lucide-react';
import type { UpdateState, UpdateUrgency } from '../types';
import UpdateProgressRing from './UpdateProgressRing';
import { isElectron } from '../../../lib/platform';

interface Props {
  state: UpdateState;
  urgency: UpdateUrgency;
  onDownload: () => void;
  onInstall: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export default function UpdatePopover({ state, urgency, onDownload, onInstall, onRetry, onClose }: Props) {
  const { phase, version, progress, error, policy } = state;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute bottom-full mb-2 right-0 w-72 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl z-50 overflow-hidden"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border)]">
        <span className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Güncelleme</span>
        <button onClick={onClose} className="p-1 rounded-lg text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-sidebar)] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {phase === 'available' && (
          <>
            <p className="text-sm font-semibold text-[var(--theme-text)]">
              v{version} {urgency === 'force' ? 'zorunlu' : urgency === 'recommended' ? 'öneriliyor' : 'mevcut'}
            </p>
            {policy?.message && (
              <p className="text-xs text-[var(--theme-secondary-text)] mt-1.5 line-clamp-3">{policy.message}</p>
            )}
            <button
              onClick={onDownload}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--theme-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {isElectron() ? <Download size={14} /> : <ExternalLink size={14} />}
              {isElectron() ? 'İndir' : 'APK İndir'}
            </button>
          </>
        )}

        {phase === 'downloading' && (
          <div className="flex items-center gap-3">
            <UpdateProgressRing progress={progress} size={36} stroke={3} />
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">İndiriliyor</p>
              <p className="text-xs text-[var(--theme-secondary-text)] tabular-nums">%{progress}</p>
            </div>
          </div>
        )}

        {phase === 'downloaded' && (
          <>
            <p className="text-sm font-semibold text-[var(--theme-text)]">v{version} indirildi</p>
            <p className="text-xs text-[var(--theme-secondary-text)] mt-1">Uygulamayı yeniden başlatarak kurulumu tamamlayın.</p>
            <button
              onClick={onInstall}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
            >
              <RefreshCw size={14} />
              Yeniden Başlat ve Kur
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={onRetry}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--theme-border)] text-[var(--theme-text)] text-sm font-medium hover:bg-[var(--theme-sidebar)] transition-colors"
            >
              <RotateCcw size={14} />
              Tekrar Dene
            </button>
          </>
        )}

        {phase === 'installing' && (
          <p className="text-sm text-[var(--theme-secondary-text)]">Kurulum başlatılıyor...</p>
        )}
      </div>
    </motion.div>
  );
}
