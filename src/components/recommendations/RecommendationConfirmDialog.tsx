import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, Trash2, X } from 'lucide-react';

interface Props {
  open: boolean;
  variant: 'hide' | 'delete';
  busy?: boolean;
  title?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function RecommendationConfirmDialog({ open, variant, busy, title, onCancel, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  const isDelete = variant === 'delete';
  const Icon = isDelete ? Trash2 : EyeOff;
  const heading = isDelete ? 'Öneriyi sil' : 'Öneriyi gizle';
  const description = isDelete ? 'Bu öneri silinecek.' : 'Bu öneri Keşif panosundan gizlenecek.';
  const actionLabel = isDelete ? 'Öneriyi sil' : 'Öneriyi gizle';
  const actionClass = isDelete
    ? 'border-red-400/20 bg-red-500/12 text-red-200 hover:bg-red-500/18'
    : 'border-amber-400/20 bg-amber-500/12 text-amber-200 hover:bg-amber-500/18';

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
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
              <h2 className="text-[14px] font-semibold text-[var(--theme-text)]">{heading}</h2>
              {title && <div className="mt-0.5 truncate text-[11px] text-[var(--theme-secondary-text)]/58">{title}</div>}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
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
            disabled={busy}
            className="rounded-xl px-3.5 py-2 text-[12px] text-[var(--theme-secondary-text)] transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-45"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50 ${actionClass}`}
          >
            {busy ? 'İşleniyor...' : actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
