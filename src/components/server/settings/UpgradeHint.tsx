import React from 'react';
import { Sparkles } from 'lucide-react';
import { useUI } from '../../../contexts/UIContext';

const PLAN_HINT_PATTERNS = [
  /plan limit/i,
  /plan kanal limit/i,
  /plan özel kanal/i,
  /günlük davet link/i,
  /limitine ulaş/i,
  /limiti aşıl/i,
];

export function isPlanLimitError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return PLAN_HINT_PATTERNS.some(p => p.test(msg));
}

export const UPGRADE_TOAST = 'Premium planlar çok yakında aktif olacak';

interface Props {
  /** Sadece `isPlanLimitError`'a eşleşen metinler için göster. Dışarıdan zaten filtrelendiyse boş bırak. */
  compact?: boolean;
}

export default function UpgradeHint({ compact = false }: Props) {
  const { setToastMsg } = useUI();

  return (
    <div
      className={`flex items-center gap-2 ${compact ? 'mt-1.5' : 'mt-2'}`}
      style={{
        padding: compact ? '6px 10px' : '8px 12px',
        borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(236,72,153,0.06))',
        border: '1px solid rgba(168,85,247,0.18)',
      }}
    >
      <Sparkles size={12} className="text-purple-300/85 shrink-0" />
      <span className="text-[11px] text-[var(--theme-text)]/80 flex-1 truncate">
        Pro ve Ultra planlar yakında
      </span>
      <button
        type="button"
        onClick={() => setToastMsg(UPGRADE_TOAST)}
        aria-disabled={true}
        className="h-6 px-2.5 rounded-md text-[10px] font-semibold text-purple-100 cursor-not-allowed transition-transform hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.35), rgba(236,72,153,0.3))',
          border: '1px solid rgba(168,85,247,0.4)',
          boxShadow: '0 0 12px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        Yakında
      </button>
    </div>
  );
}
