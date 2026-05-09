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
      <div className="flex gap-2 border-t border-[var(--theme-border)] p-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="mv-action-button-ghost mv-interactive mv-focus-ring flex-1"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`${danger ? 'mv-action-button-danger' : 'mv-action-button'} mv-interactive mv-focus-ring flex-1`}
        >
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="mv-loading-spinner" />
              İşleniyor...
            </span>
          ) : confirmText}
        </button>
      </div>
    </Modal>
  );
}
