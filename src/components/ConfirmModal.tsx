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
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          {/* Radial highlight — çok hafif, merkeze dikkat çeker */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.05),transparent_35%)]" />

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-sm border border-[var(--theme-border)]/20 rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(180deg, var(--theme-surface) 0%, var(--theme-bg) 100%)', boxShadow: '0 32px 80px rgba(var(--shadow-base),0.6), 0 8px 24px rgba(var(--shadow-base),0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top glow — modal üstünde çok hafif sıcak ışık */}
            <div className="pointer-events-none absolute inset-x-6 -top-1 h-16 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,230,170,0.07),transparent_70%)]" />
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
