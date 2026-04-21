import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Shield, ShieldCheck, User, Check } from 'lucide-react';
import type { ServerRole } from '../../../lib/permissionBundles';
import { canSetRole } from '../../../lib/permissionBundles';

interface Props {
  currentRole: ServerRole;
  actorRole: ServerRole;
  anchorRect: DOMRect;
  onSelect: (role: ServerRole) => void;
  onClose: () => void;
  busy?: boolean;
}

interface Option {
  value: ServerRole;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

const OPTIONS: readonly Option[] = [
  { value: 'admin', label: 'Yönetici', hint: 'Sunucu ayarları + tam moderasyon', icon: <Shield size={14} className="text-blue-400" /> },
  { value: 'mod', label: 'Moderatör', hint: 'Ses moderasyonu + davet yönetimi', icon: <ShieldCheck size={14} className="text-purple-400" /> },
  { value: 'member', label: 'Üye', hint: 'Temel erişim — sesli kanallar, mesaj', icon: <User size={14} className="text-[#7b8ba8]" /> },
];

export default function RolePicker({ currentRole, actorRole, anchorRect, onSelect, onClose, busy }: Props) {
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
        animation: 'rolePickerIn 140ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      <div className="flex items-center gap-2 px-2 pb-2 mb-1 border-b" style={{ borderColor: 'rgba(var(--glass-tint),0.08)' }}>
        <Crown size={12} className="text-amber-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]">Rol Ata</span>
      </div>

      {OPTIONS.map(opt => {
        const isSelected = opt.value === currentRole;
        const canAssign = canSetRole(actorRole, opt.value);
        const disabled = !canAssign || busy || isSelected;

        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => { if (canAssign && !isSelected && !busy) onSelect(opt.value); }}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${
              isSelected
                ? 'bg-[rgba(59,130,246,0.10)]'
                : canAssign && !busy
                ? 'hover:bg-[rgba(255,255,255,0.06)]'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            <span className="shrink-0 mt-0.5">{opt.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[12.5px] font-semibold ${isSelected ? 'text-[#e8ecf4]' : 'text-[#e8ecf4]/85'}`}>
                  {opt.label}
                </span>
                {isSelected && (
                  <Check size={12} strokeWidth={3} className="text-[#60a5fa]" aria-label="Mevcut rol" />
                )}
              </div>
              <div className="text-[10.5px] text-[#7b8ba8]/75 mt-0.5 leading-snug">{opt.hint}</div>
              {!canAssign && !isSelected && (
                <div className="text-[9.5px] text-amber-400/70 mt-1 italic">Yalnızca sahip atayabilir</div>
              )}
            </div>
          </button>
        );
      })}

      <style>{`
        @keyframes rolePickerIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(picker, document.body);
}
