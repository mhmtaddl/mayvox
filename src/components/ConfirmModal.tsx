import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

/**
 * ConfirmModal — ikili action'lı onay dialog'u.
 * İçeriden global `<Modal>` primitive'ini kullanır; tüm surface/backdrop/portal/ESC
 * davranışı Modal tarafından yönetilir. Burada yalnızca confirm içeriği özelleştirilir.
 */

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
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const Icon = danger ? AlertTriangle : CheckCircle2;
  const actionClass = danger
    ? 'border-red-400/20 bg-red-500/12 text-red-200 hover:bg-red-500/18'
    : 'border-[rgba(var(--theme-accent-rgb),0.22)] bg-[rgba(var(--theme-accent-rgb),0.12)] text-[var(--theme-accent)] hover:bg-[rgba(var(--theme-accent-rgb),0.18)]';

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <div
        onMouseDown={event => event.stopPropagation()}
        className="w-full max-w-[360px] rounded-2xl border border-[var(--theme-border)]/22 bg-[var(--theme-panel)] p-4 shadow-2xl shadow-black/30"
        style={{ boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.06), 0 24px 70px rgba(0,0,0,0.34)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${actionClass}`}>
              <Icon size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-[var(--theme-text)]">{title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.05)] hover:text-[var(--theme-text)] disabled:opacity-45"
            title="Kapat"
          >
            <X size={15} />
          </button>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-[var(--theme-secondary-text)]/72">{description}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl px-3.5 py-2 text-[12px] text-[var(--theme-secondary-text)] transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-45"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50 ${actionClass}`}
          >
            {loading ? 'İşleniyor...' : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
