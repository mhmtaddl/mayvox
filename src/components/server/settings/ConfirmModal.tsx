import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserX, Ban, Check } from 'lucide-react';

export type ConfirmVariant = 'kick' | 'ban';

interface Props {
  variant: ConfirmVariant;
  targetName: string;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

interface VariantMeta {
  title: string;
  description: (name: string) => React.ReactNode;
  reasonRequired: boolean;     // false ise reason field hiç render edilmez
  reasonPlaceholder?: string;
  ctaLabel: string;
  ctaBusyLabel: string;
  icon: React.ReactNode;
  tone: 'warn' | 'danger';
}

const VARIANT_META: Record<ConfirmVariant, VariantMeta> = {
  kick: {
    title: 'Sunucudan At',
    description: name => (
      <><strong className="text-[#e8ecf4]/95">{name}</strong> sunucudan atılacak. Yasak değil — davet ile tekrar katılabilir.</>
    ),
    reasonRequired: false,
    ctaLabel: 'Sunucudan At',
    ctaBusyLabel: 'Atılıyor...',
    icon: <UserX size={18} strokeWidth={1.8} />,
    tone: 'warn',
  },
  ban: {
    title: 'Üyeyi Yasakla',
    description: name => (
      <><strong className="text-[#e8ecf4]/95">{name}</strong> yasaklanacak ve davet almadıkça tekrar katılamaz. Sebep denetim kayıtlarına işlenir.</>
    ),
    reasonRequired: true,
    reasonPlaceholder: 'Yasak sebebi (zorunlu)',
    ctaLabel: 'Yasakla',
    ctaBusyLabel: 'Yasaklanıyor...',
    icon: <Ban size={18} strokeWidth={1.8} />,
    tone: 'danger',
  },
};

const TONE_RGB: Record<'warn' | 'danger', string> = {
  warn: '251,146,60',
  danger: '239,68,68',
};

const TONE_HEX: Record<'warn' | 'danger', string> = {
  warn: '#fb923c',
  danger: '#ef4444',
};

export default function ConfirmModal({ variant, targetName, open, busy, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const meta = VARIANT_META[variant];
  const toneRgb = TONE_RGB[meta.tone];
  const toneHex = TONE_HEX[meta.tone];

  // Modal kapandığında reason'ı temizle
  useEffect(() => { if (!open) setReason(''); }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmed = reason.trim();
  const reasonValid = !meta.reasonRequired || trimmed.length >= 3;
  const canSubmit = !busy && reasonValid;

  const modal = (
    <div
      className="fixed inset-0 z-[700] flex items-center justify-center p-4"
      style={{
        background: 'rgba(10,15,25,0.55)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[22px] p-6 animate-[confirmIn_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{
          background: 'rgba(22,26,40,0.98)',
          boxShadow:
            '0 20px 60px rgba(0,0,0,0.45), ' +
            'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Tone icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
          style={{
            background: `rgba(${toneRgb}, 0.14)`,
            border: `1px solid rgba(${toneRgb}, 0.25)`,
            color: toneHex,
            boxShadow: `inset 0 1px 0 rgba(${toneRgb}, 0.10)`,
          }}
        >
          {meta.icon}
        </div>

        {/* Title + description */}
        <h3 className="text-[15.5px] font-bold text-[#e8ecf4] tracking-tight mb-1.5">{meta.title}</h3>
        <p className="text-[11.5px] text-[#7b8ba8] leading-relaxed mb-5">
          {meta.description(targetName)}
        </p>

        {/* Reason textarea — yalnızca ban variant için */}
        {meta.reasonRequired && (
          <>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.10em] text-[#7b8ba8]/70 mb-2">
              Sebep (zorunlu)
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 200))}
              placeholder={meta.reasonPlaceholder}
              rows={3}
              autoFocus
              className="w-full bg-[rgba(255,255,255,0.035)] border rounded-xl px-4 py-3 text-[12.5px] text-[#e8ecf4] placeholder:text-[#7b8ba8]/40 outline-none resize-none transition-all duration-200 ease-out focus:bg-[rgba(255,255,255,0.055)]"
              style={{ borderColor: `rgba(${toneRgb}, 0.22)` }}
              onFocus={e => {
                e.currentTarget.style.borderColor = `rgba(${toneRgb}, 0.50)`;
                e.currentTarget.style.boxShadow = `0 0 0 4px rgba(${toneRgb}, 0.10)`;
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = `rgba(${toneRgb}, 0.22)`;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-[#7b8ba8]/50">
              <span>
                {trimmed.length > 0 && trimmed.length < 3 && (
                  <span className="text-amber-400/80">En az 3 karakter</span>
                )}
              </span>
              <span>{reason.length}/200</span>
            </div>
          </>
        )}

        {/* Actions */}
        <div className={`flex items-center gap-2 justify-end ${meta.reasonRequired ? 'mt-5' : 'mt-1'}`}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl text-[12.5px] font-semibold text-[#e8ecf4]/75 hover:text-[#e8ecf4] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.10)] border border-[rgba(255,255,255,0.08)] transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-default"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmed)}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-[12.5px] font-semibold text-white transition-all duration-200 active:scale-[0.97] hover:brightness-[1.08] disabled:opacity-35 disabled:cursor-default disabled:hover:brightness-100 disabled:active:scale-100"
            style={{
              background: meta.tone === 'danger'
                ? 'linear-gradient(180deg, rgb(239,68,68), rgb(220,38,38))'
                : 'linear-gradient(180deg, rgb(251,146,60), rgb(234,88,12))',
              boxShadow:
                `inset 0 1px 0 rgba(255,255,255,0.18), ` +
                `inset 0 -1px 0 rgba(0,0,0,0.10), ` +
                `0 1px 2px rgba(0,0,0,0.10), ` +
                `0 6px 18px rgba(${toneRgb}, 0.30)`,
            }}
          >
            {busy
              ? <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> {meta.ctaBusyLabel}</>
              : <><Check size={14} strokeWidth={2.2} /> {meta.ctaLabel}</>}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes confirmIn {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
