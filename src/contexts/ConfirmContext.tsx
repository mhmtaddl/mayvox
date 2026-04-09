import React, { createContext, useContext, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';

interface ConfirmOptions {
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmContextType {
  openConfirm: (options: ConfirmOptions) => void;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = (): ConfirmContextType => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { isOpen: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);

  const openConfirm = useCallback((options: ConfirmOptions) => {
    setState({ ...options, isOpen: true });
  }, []);

  const handleConfirm = async () => {
    if (!state) return;
    setLoading(true);
    try {
      await state.onConfirm();
    } finally {
      setLoading(false);
      setState(null);
    }
  };

  const handleCancel = () => {
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ openConfirm }}>
      {children}
      {state?.isOpen && ReactDOM.createPortal(
        <GlobalConfirmModal state={state} loading={loading} onConfirm={handleConfirm} onCancel={handleCancel} />,
        document.body
      )}
    </ConfirmContext.Provider>
  );
}

// ── Modal component ─────────────────────────────────────────────────────

import { motion, AnimatePresence } from 'motion/react';

function GlobalConfirmModal({
  state, loading, onConfirm, onCancel,
}: {
  state: ConfirmOptions & { isOpen: boolean };
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {state.isOpen && (
          <motion.div
            key="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {state.isOpen && (
          <motion.div
            key="confirm-modal"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="fixed z-[301] w-[calc(100%-2rem)] max-w-sm rounded-2xl overflow-hidden border border-[var(--theme-border)]/20"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'linear-gradient(180deg, var(--theme-surface) 0%, var(--theme-bg) 100%)',
              boxShadow: '0 32px 80px rgba(var(--shadow-base),0.6), 0 8px 24px rgba(var(--shadow-base),0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 className="text-[15px] font-bold text-[var(--theme-text)] mb-1.5">{state.title}</h3>
              <p className="text-[12px] text-[var(--theme-secondary-text)] leading-relaxed">{state.description}</p>
            </div>
            <div className="flex border-t border-[var(--theme-border)]">
              <button
                onClick={onCancel}
                className={`flex-1 py-3.5 text-[13px] font-semibold transition-colors ${
                  state.danger
                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                    : 'text-red-400 hover:bg-red-500/10'
                }`}
              >
                {state.cancelText || 'İptal'}
              </button>
              <div className="w-px bg-[var(--theme-border)]" />
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 py-3.5 text-[13px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  state.danger
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </span>
                ) : state.confirmText}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
