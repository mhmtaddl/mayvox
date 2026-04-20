import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, UserX, Ban, Check } from 'lucide-react';

export type ConfirmVariant = 'kick' | 'ban';

interface Props {
  variant: ConfirmVariant;
  targetName: string;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

const VARIANT_META: Record<ConfirmVariant, {
  title: string;
  description: (name: string) => React.ReactNode;
  reasonRequired: boolean;
  reasonPlaceholder: string;
  ctaLabel: string;
  ctaBusyLabel: string;
  icon: React.ReactNode;
  tone: 'warn' | 'danger';
}> = {
  kick: {
    title: 'Sunucudan At',
    description: name => (
      <><strong className="text-[#e8ecf4]/95">{name}</strong> sunucudan atılacak. Tekrar katılmak için davet alabilir.</>
    ),
    reasonRequired: false,
    reasonPlaceholder: 'Opsiyonel — sebep (kayıtlara girer)',
    ctaLabel: 'Sunucudan At',
    ctaBusyLabel: 'Atılıyor...',
    icon: <UserX size={18} strokeWidth={1.8} />,
    tone: 'warn',
  },
  ban: {
    title: 'Üyeyi Yasakla',
    description: name => (
      <><strong className="text-[#e8ecf4]/95">{name}</strong> yasaklanacak ve davet almadıkça tekrar katılamaz. Yasak kayıtlara işlenir.</>
    ),
    reasonRequired: true,
    reasonPlaceholder: 'Yasak sebebi (zorunlu — kayıtlara girer)',
    ctaLabel: 'Yasakla',
    ctaBusyLabel: 'Yasaklanıyor...',
    icon: <Ban size={18} strokeWidth={1.8} />,
    tone: 'danger',
  },
};

export default function ConfirmModal({ variant, targetName, open, busy, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const meta = VARIANT_META[variant];
  const toneColor = meta.tone === 'danger' ? '#ef4444' : '#fb923c';
  const toneRgb = meta.tone === 'danger' ? '239,68,68' : '251,146,60';

  useEffect(() => { if (!open) setReason(''); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmed = reason.trim();
  const canSubmit = !busy && (!meta.reasonRequired || trimmed.length >= 3);

  const modal = (
    <div
      className="fixed inset-0 z-[700] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl p-6 animate-[confirmIn_200ms_cubic-bezier(0.2,0.8,0.2,1)]"
        style={{
          background: 'linear-gradient(180deg, rgba(22,26,40,0.98), rgba(14,18,30,0.98))',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow:
            '0 24px 60px rgba(0,0,0,0.55), ' +
            '0 8px 24px rgba(0,0,0,0.30), ' +
            'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
          style={{
            background: `rgba(${toneRgb}, 0.14)`,
            border: `1px solid rgba(${toneRgb}, 0.25)`,
            color: toneColor,
            boxShadow: `inset 0 1px 0 rgba(${toneRgb}, 0.10)`,
          }}
        >
          {meta.icon}
        </div>

        <h3 className="text-[15.5px] font-bold text-[#e8ecf4] tracking-tight mb-1.5">{meta.title}</h3>
        <p className="text-[11.5px] text-[#7b8ba8] leading-relaxed mb-5">
          {meta.description(targetName)}
        </p>

        <label className="block text-[10px] font-semibold uppercase tracking-[0.10em] text-[#7b8ba8]/70 mb-2">
          {meta.reasonRequired ? 'Sebep (zorunlu)' : 'Sebep'}
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value.slice(0, 200))}
          placeholder={meta.reasonPlaceholder}
          rows={3}
          autoFocus
          className="w-full bg-[rgba(255,255,255,0.035)] border rounded-xl px-4 py-3 text-[12.5px] text-[#e8ecf4] placeholder:text-[#7b8ba8]/40 outline-none resize-none transition-all duration-200 ease-out focus:bg-[rgba(255,255,255,0.055)]"
          style={{
            borderColor: meta.tone === 'danger'
              ? 'rgba(239,68,68,0.22)'
              : 'rgba(251,146,60,0.22)',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = meta.tone === 'danger' ? 'rgba(239,68,68,0.50)' : 'rgba(251,146,60,0.50)';
            e.currentTarget.style.boxShadow = `0 0 0 4px rgba(${toneRgb}, 0.10)`;
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = meta.tone === 'danger' ? 'rgba(239,68,68,0.22)' : 'rgba(251,146,60,0.22)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-[#7b8ba8]/50">
          <span>
            {meta.reasonRequired && trimmed.length > 0 && trimmed.length < 3
              ? <span className="text-amber-400/80">En az 3 karakter</span>
              : ''}
          </span>
          <span>{reason.length}/200</span>
        </div>

        <div className="flex items-center gap-2 justify-end mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl text-[12.5px] font-semibold text-[#e8ecf4]/75 hover:text-[#e8ecf4] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.10)] border border-[rgba(255,255,255,0.08)] transition-all duration-200 active:scale-[0.97]"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmed)}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-[12.5px] font-semibold text-white transition-all duration-200 active:scale-[0.97] hover:brightness-[1.08] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:active:scale-100"
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
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
