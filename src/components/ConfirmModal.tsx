import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen, title, description, confirmText, cancelText, onConfirm, onCancel, danger,
}: Props) {
  // ESC ile kapat
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

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
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-xs bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 className="text-[15px] font-bold text-[var(--theme-text)] mb-1.5">{title}</h3>
              <p className="text-[12px] text-[var(--theme-secondary-text)] leading-relaxed">{description}</p>
            </div>
            <div className="flex border-t border-[var(--theme-border)]">
              <button
                onClick={onCancel}
                className="flex-1 py-3.5 text-[13px] font-semibold text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)]/50 transition-colors"
              >
                {cancelText}
              </button>
              <div className="w-px bg-[var(--theme-border)]" />
              <button
                onClick={onConfirm}
                className={`flex-1 py-3.5 text-[13px] font-bold transition-colors ${
                  danger
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
