import React from 'react';
import Modal from './Modal';

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
  return (
    <Modal open={isOpen} onClose={onCancel} width="sm" danger={danger} padded={false}>
      <div className="p-5">
        <h3 className="text-[15px] font-bold text-[var(--theme-text)] mb-1.5">{title}</h3>
        <p className="text-[12px] text-[var(--theme-secondary-text)] leading-relaxed">{description}</p>
      </div>
      <div className="flex border-t border-[var(--theme-border)]">
        <button
          onClick={onCancel}
          className={`flex-1 py-3.5 text-[13px] font-semibold transition-colors ${
            danger ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-red-400 hover:bg-red-500/10'
          }`}
        >
          {cancelText}
        </button>
        <div className="w-px bg-[var(--theme-border)]" />
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`flex-1 py-3.5 text-[13px] font-bold transition-colors disabled:opacity-40 disabled:cursor-default ${
            danger ? 'text-red-400 hover:bg-red-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'
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
    </Modal>
  );
}
