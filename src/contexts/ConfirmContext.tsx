import React, { createContext, useContext, useState, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal';

/**
 * Global confirm hook — `useConfirm().openConfirm({ ... })` ile herhangi bir yerden
 * onay dialog'u açar. Görsel katman `<ConfirmModal>` → `<Modal>` primitive üstünden
 * gelir; radial-gradient spotlight / accent glow / backdrop-blur YOK.
 */

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
    if (loading) return;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ openConfirm }}>
      {children}
      <ConfirmModal
        isOpen={!!state?.isOpen}
        title={state?.title ?? ''}
        description={state?.description ?? ''}
        confirmText={state?.confirmText ?? 'Tamam'}
        cancelText={state?.cancelText ?? 'İptal'}
        danger={state?.danger}
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}
