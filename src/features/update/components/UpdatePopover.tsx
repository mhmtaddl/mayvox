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
      {/* Header + Close */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <h3 className="text-base font-bold text-[var(--theme-text)]">Güncelleme</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-sidebar)] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pb-4">
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
              className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--theme-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
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
              className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
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
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--theme-border)] text-[var(--theme-text)] text-sm font-medium hover:bg-[var(--theme-sidebar)] transition-colors"
            >
              <RotateCcw size={16} />
              Tekrar Dene
            </button>
          </>
        )}

        {phase === 'installing' && (
          <p className="text-sm text-[var(--theme-secondary-text)] mt-1">Kurulum başlatılıyor...</p>
        )}
      </div>
    </motion.div>
  );
}
