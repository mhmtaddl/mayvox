import React from 'react';
import { motion } from 'motion/react';
import { X, Download, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
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

export default function MobileUpdateSheet({ state, urgency, onDownload, onInstall, onRetry, onClose }: Props) {
  const { phase, version, progress, error, policy } = state;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-t-2xl border-t border-x border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 pb-8 z-10"
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-[var(--theme-border)] mx-auto mb-4" />

        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors">
          <X size={18} />
        </button>

        <h3 className="text-base font-bold text-[var(--theme-text)] mb-1">Güncelleme</h3>

        {phase === 'available' && (
          <>
            <p className="text-sm text-[var(--theme-secondary-text)]">
              v{version} sürümü {urgency === 'force' ? 'zorunlu' : urgency === 'recommended' ? 'öneriliyor' : 'mevcut'}.
            </p>
            {policy?.message && (
              <p className="text-xs text-[var(--theme-secondary-text)]/70 mt-2">{policy.message}</p>
            )}
            <button
              onClick={onDownload}
              className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--theme-accent)] text-white text-sm font-semibold"
            >
              {isElectron() ? <Download size={16} /> : <ExternalLink size={16} />}
              {isElectron() ? 'İndir' : 'APK İndir'}
            </button>
          </>
        )}

        {phase === 'downloading' && (
          <div className="flex items-center gap-4 mt-3">
            <UpdateProgressRing progress={progress} size={44} stroke={3.5} />
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">{progress > 0 && progress < 100 ? 'İndiriliyor' : 'Hazırlanıyor'}</p>
              <p className="text-lg font-bold text-[var(--theme-accent)] tabular-nums">%{progress}</p>
            </div>
          </div>
        )}

        {phase === 'downloaded' && (
          <>
            <p className="text-sm text-[var(--theme-secondary-text)]">v{version} indirildi. Kuruluma hazır.</p>
            <button
              onClick={onInstall}
              className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
            >
              <RefreshCw size={16} />
              Yeniden Başlat ve Kur
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="text-sm text-red-400 mt-1">{error}</p>
            <button
              onClick={onRetry}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text)] text-sm font-medium"
            >
              <RotateCcw size={16} />
              Tekrar Dene
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
