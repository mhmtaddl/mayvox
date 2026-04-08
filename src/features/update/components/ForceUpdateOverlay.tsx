import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Download, ExternalLink, RefreshCw } from 'lucide-react';
import type { UpdateState } from '../types';
import UpdateProgressRing from './UpdateProgressRing';
import { isElectron } from '../../../lib/platform';

interface Props {
  state: UpdateState;
  onDownload: () => void;
  onInstall: () => void;
}

export default function ForceUpdateOverlay({ state, onDownload, onInstall }: Props) {
  const { phase, version, progress } = state;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-b from-black/40 via-black/50 to-black/60"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="w-[90%] max-w-md rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-8 text-center shadow-2xl"
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
          <ShieldAlert size={28} className="text-amber-500" />
        </div>

        <h2 className="text-lg font-bold text-[var(--theme-text)]">Güncelleme Gerekli</h2>
        <p className="text-sm text-[var(--theme-secondary-text)] mt-2">
          Devam etmek için uygulamayı güncellemeniz gerekiyor.
        </p>

        {version && (
          <p className="text-xs text-[var(--theme-secondary-text)]/50 mt-1">v{version}</p>
        )}

        <div className="mt-6">
          {phase === 'available' && (
            <button
              onClick={onDownload}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-500 transition-colors"
            >
              {isElectron() ? <Download size={16} /> : <ExternalLink size={16} />}
              {isElectron() ? 'Güncellemeyi İndir' : 'APK İndir'}
            </button>
          )}

          {phase === 'downloading' && (
            <div className="flex items-center justify-center gap-4">
              <UpdateProgressRing progress={progress} size={48} stroke={4} color="#f59e0b" trackColor="rgba(245,158,11,0.15)" />
              <div className="text-left">
                <p className="text-sm font-semibold text-[var(--theme-text)]">İndiriliyor</p>
                <p className="text-xl font-bold text-amber-500 tabular-nums">%{progress}</p>
              </div>
            </div>
          )}

          {phase === 'downloaded' && (
            <button
              onClick={onInstall}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-colors"
            >
              <RefreshCw size={16} />
              Yeniden Başlat ve Kur
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
