import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  loading?: boolean;
}

/**
 * MiniConfirm — hafif, popover-style onay kartı.
 * Büyük modal yerine hızlı, premium interaction.
 */
export default function MiniConfirm({
  isOpen, title, description, confirmText, cancelText = 'İptal',
  onConfirm, onCancel, danger, loading,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

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
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
          onClick={onCancel}
        >
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[280px] rounded-2xl overflow-hidden"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid rgba(var(--glass-tint), 0.08)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3">
              <p className="text-[13px] font-bold text-[var(--theme-text)] mb-1">{title}</p>
              <p className="text-[11px] text-[var(--theme-secondary-text)] leading-relaxed">{description}</p>
            </div>
            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={onCancel}
                className="flex-1 py-2 text-[11px] font-semibold rounded-lg transition-colors text-red-400 hover:bg-red-500/10"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all disabled:opacity-40 ${
                  danger
                    ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                    : 'text-[var(--theme-accent)] bg-[var(--theme-accent)]/10 hover:bg-[var(--theme-accent)]/20'
                }`}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
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
