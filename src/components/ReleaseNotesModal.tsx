import React, { useEffect, useRef } from 'react';
import { X, Sparkles, Shield } from 'lucide-react';
import { ReleaseNote } from '../lib/releaseNotes';

interface Props {
  version: string;
  notes: ReleaseNote;
  onClose: () => void;
  isAdmin?: boolean;
}

export default function ReleaseNotesPopover({ version, notes, onClose, isAdmin }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const hasAdminItems = notes.adminItems && notes.adminItems.length > 0;

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-3 w-72 max-h-[50vh] bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
    >
      {/* Ok işareti */}
      <div className="absolute -bottom-[7px] right-3 w-3.5 h-3.5 bg-[var(--theme-bg)] border-r border-b border-[var(--theme-border)] rotate-45" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--theme-border)] shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-[var(--theme-accent)]" />
          <span className="text-xs font-bold text-[var(--theme-text)]">Güncelleme Notları</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]">
            v{version}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors"
          aria-label="Kapat"
        >
          <X size={14} />
        </button>
      </div>

      {/* İçerik — scroll */}
      <div className="px-4 py-3 overflow-y-auto custom-scrollbar">
        <p className="text-[11px] font-semibold text-[var(--theme-text)] mb-2">{notes.title}</p>
        <ul className="space-y-1.5">
          {notes.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--theme-secondary-text)] leading-snug">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)] shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        {/* Admin bölümü */}
        {hasAdminItems && (
          <div className="mt-3 pt-3 border-t border-[var(--theme-border)]">
            {isAdmin ? (
              <>
                <div className="flex items-center gap-1 mb-2">
                  <Shield size={11} className="text-[var(--theme-accent)]" />
                  <span className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-wide">
                    Admin &amp; Güvenlik
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {notes.adminItems!.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--theme-secondary-text)] leading-snug">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)]/50 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-[var(--theme-secondary-text)]/60">
                <Shield size={11} />
                <span className="text-[10px]">Admin ve güvenlik güncelleştirmeleri</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
