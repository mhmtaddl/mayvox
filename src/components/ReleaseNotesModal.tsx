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
    <div className="fixed inset-0 z-[150] flex items-end justify-center pb-16 sm:pb-20 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={ref}
        onClick={e => e.stopPropagation()}
        className="w-[90%] max-w-md max-h-[60vh] bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--theme-border)] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--theme-accent)]" />
            <span className="text-sm font-bold text-[var(--theme-text)]">Sürüm Notları</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]">
              v{version}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-sidebar)] transition-colors"
          >
            <X size={16} />
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
