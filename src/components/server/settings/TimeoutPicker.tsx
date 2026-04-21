import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import {
  TIMEOUT_PRESETS_SECONDS,
  TIMEOUT_PRESET_LABELS,
  type TimeoutPresetSeconds,
} from '../../../lib/serverService';

interface Props {
  anchorRect: DOMRect;
  onSelect: (durationSeconds: TimeoutPresetSeconds) => void;
  onClose: () => void;
  busy?: boolean;
}

interface Option {
  value: TimeoutPresetSeconds;
  label: string;
  hint: string;
}

const OPTIONS: readonly Option[] = TIMEOUT_PRESETS_SECONDS.map(s => ({
  value: s,
  label: TIMEOUT_PRESET_LABELS[s],
  hint: hintFor(s),
}));

function hintFor(s: TimeoutPresetSeconds): string {
  switch (s) {
    case 60:     return 'Kısa uyarı';
    case 300:    return 'Geçici sakinleşme';
    case 600:    return 'Standart timeout';
    case 3600:   return 'Uzun uzaklaştırma';
    case 86400:  return 'Bir günlük ceza';
    case 604800: return 'Haftalık yasak';
  }
}

/**
 * Timeout süresi seçici popover.
 * RolePicker ile aynı davranış: portal, fixed positioning, outside/ESC/scroll ile kapanır.
 */
export default function TimeoutPicker({ anchorRect, onSelect, onClose, busy }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchorRect.bottom + 6, left: anchorRect.right - 280 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const m = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = anchorRect.bottom + 6;
    let left = anchorRect.right - m.width;
    if (left + m.width > vw - 8) left = vw - m.width - 8;
    if (left < 8) left = 8;
    if (top + m.height > vh - 8) top = anchorRect.top - m.height - 6;
    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  const picker = (
    <div
      ref={ref}
      className="popup-surface"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: 280,
        zIndex: 600,
        padding: '10px',
        animation: 'timeoutPickerIn 140ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      <div className="flex items-center gap-2 px-2 pb-2 mb-1 border-b" style={{ borderColor: 'rgba(var(--glass-tint),0.08)' }}>
        <Clock size={12} className="text-amber-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]">Zaman Aşımı Süresi</span>
      </div>

      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          disabled={busy}
          onClick={() => { if (!busy) onSelect(opt.value); }}
          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${
            busy ? 'cursor-not-allowed opacity-50' : 'hover:bg-[rgba(255,255,255,0.06)]'
          }`}
        >
          <span className="shrink-0 mt-0.5 w-6 text-center text-[11px] font-bold tracking-tight text-amber-400/85">
            {shortFor(opt.value)}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[12.5px] font-semibold text-[#e8ecf4]/90">{opt.label}</span>
            <div className="text-[10.5px] text-[#7b8ba8]/75 mt-0.5 leading-snug">{opt.hint}</div>
          </div>
        </button>
      ))}

      <style>{`
        @keyframes timeoutPickerIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(picker, document.body);
}

function shortFor(s: TimeoutPresetSeconds): string {
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 604800) return `${Math.round(s / 86400)}g`;
  return `${Math.round(s / 604800)}hf`;
}
