import React, { useEffect, useRef } from 'react';
import { X, Sparkles, Shield, Monitor, Smartphone, Globe } from 'lucide-react';
import { ReleaseNote } from '../lib/releaseNotes';

interface Props {
  version: string;
  notes: ReleaseNote;
  onClose: () => void;
  isAdmin?: boolean;
}

// Yeni format mı (desktop/android/common alanları var mı)
function hasNewFormat(notes: ReleaseNote): boolean {
  return !!(notes.desktop || notes.android || notes.common || notes.admin);
}

function Section({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  if (!items.length) return null;
  const isNoChange = items.length === 1 && items[0] === 'Bu sürümde değişiklik yok.';

  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-wide">{title}</span>
      </div>
      {isNoChange ? (
        <p className="text-[11px] text-[var(--theme-secondary-text)]/50 italic pl-4">Bu sürümde değişiklik yok.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--theme-secondary-text)] leading-snug">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)] shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReleaseNotesPopover({ version, notes, onClose, isAdmin }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const useNew = hasNewFormat(notes);

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center pb-20 sm:pb-24 popup-overlay" onClick={onClose}>
      <div
        ref={ref}
        onClick={e => e.stopPropagation()}
        className="w-[85%] max-w-sm max-h-[65vh] flex flex-col overflow-hidden popup-surface"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.04)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--theme-accent)]" />
            <span className="text-[13px] font-semibold text-[var(--theme-text)]">Sürüm Notları</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[var(--theme-secondary-text)] opacity-40 hover:opacity-70 transition-opacity">
            <X size={14} />
          </button>
        </div>

        {/* İçerik */}
        <div className="px-5 py-4 overflow-y-auto custom-scrollbar">
          {useNew ? (
            <>
              {notes.desktop && notes.desktop.length > 0 && (
                <Section icon={<Monitor size={11} className="text-[var(--theme-accent)]" />} title="Desktop" items={notes.desktop} />
              )}
              {notes.android && notes.android.length > 0 && (
                <Section icon={<Smartphone size={11} className="text-[var(--theme-accent)]" />} title="Android" items={notes.android} />
              )}
              {notes.common && notes.common.length > 0 && (
                <Section icon={<Globe size={11} className="text-[var(--theme-accent)]" />} title="Ortak" items={notes.common} />
              )}
              {isAdmin && notes.admin && notes.admin.length > 0 && (
                <Section icon={<Shield size={11} className="text-[var(--theme-accent)]" />} title="Admin" items={notes.admin} />
              )}
            </>
          ) : (
            <>
              {/* Eski format — geriye uyumluluk */}
              {notes.title && <p className="text-[11px] font-semibold text-[var(--theme-text)] mb-2">{notes.title}</p>}
              <ul className="space-y-1.5">
                {notes.items.map((item, i) => {
                  if (!item) return <li key={i} className="h-1" />;
                  if (item.startsWith('—') && item.endsWith('—')) {
                    return <li key={i} className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-wide pt-1.5 first:pt-0">{item}</li>;
                  }
                  return (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--theme-secondary-text)] leading-snug">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)] shrink-0" />
                      {item}
                    </li>
                  );
                })}
              </ul>
              {isAdmin && notes.adminItems && notes.adminItems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--theme-border)]">
                  <div className="flex items-center gap-1 mb-2">
                    <Shield size={11} className="text-[var(--theme-accent)]" />
                    <span className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-wide">Admin</span>
                  </div>
                  <ul className="space-y-1.5">
                    {notes.adminItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--theme-secondary-text)] leading-snug">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)]/50 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
