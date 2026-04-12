import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  loading?: boolean;
}

export default function ConfirmModal({
  isOpen, title, description, confirmText, cancelText, onConfirm, onCancel, danger, loading,
}: Props) {
  useEscapeKey(onCancel, isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          // Flat, premium backdrop: tek katman solid dim. Radial highlight + backdrop-blur
          // kombinasyonu altındaki accent/glass katmanlarıyla banding + merkez glow patlaması
          // yaratıyordu; kaldırıldı. Sade siyah overlay kullanılır.
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.88)' }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              // Premium-flat: accent tint yok, yüksek spread shadow yok.
              // Tema bağımsız solid card + ince nötr kenar + hafif tek katman gölge.
              background: 'var(--theme-surface-card, var(--theme-bg))',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 className="text-[15px] font-bold text-[var(--theme-text)] mb-1.5">{title}</h3>
              <p className="text-[12px] text-[var(--theme-secondary-text)] leading-relaxed">{description}</p>
            </div>
            <div className="flex border-t border-[var(--theme-border)]">
              <button
                onClick={onCancel}
                className={`flex-1 py-3.5 text-[13px] font-semibold transition-colors ${
                  danger
                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                    : 'text-red-400 hover:bg-red-500/10'
                }`}
              >
                {cancelText}
              </button>
              <div className="w-px bg-[var(--theme-border)]" />
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 py-3.5 text-[13px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  danger
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    İşleniyor...
                  </span>
                ) : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
