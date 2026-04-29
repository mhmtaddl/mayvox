import React, { useEffect, useRef } from 'react';
import { X, Sparkles, Shield, Monitor, Smartphone, Globe } from 'lucide-react';
import { motion } from 'motion/react';
import { ReleaseNote } from '../lib/releaseNotes';

interface Props {
  version: string;
  notes: ReleaseNote;
  onClose: () => void;
  isAdmin?: boolean;
}

function hasNewFormat(notes: ReleaseNote): boolean {
  return !!(notes.desktop || notes.android || notes.common || notes.admin);
}

function Section({ icon, title, items, startIndex }: { icon: React.ReactNode; title: string; items: string[]; startIndex: number }) {
  if (!items.length) return null;
  const isNoChange = items.length === 1 && items[0] === 'Bu sürümde değişiklik yok.';

  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-wide">{title}</span>
      </div>
      {isNoChange ? (
        <p className="text-[11px] text-[var(--theme-text)] opacity-40 italic pl-4">Bu sürümde değişiklik yok.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: (startIndex + i) * 0.04 }}
              className="flex items-start gap-2 text-[11px] text-[var(--theme-text)] opacity-75 leading-snug"
            >
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)] shrink-0" />
              {item}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReleaseNotesPopover({ notes, onClose, isAdmin }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const useNew = hasNewFormat(notes);

  // Stagger index counter
  let idx = 0;
  const nextIdx = (count: number) => { const start = idx; idx += count; return start; };

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center pb-[88px]" onClick={onClose}>
      <motion.div
        ref={ref}
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-[85%] max-w-sm max-h-[60vh] flex overflow-hidden rounded-2xl"
        style={{
          // Mic/hoparlör butonuyla aynı accent-tinted surface
          background: 'rgba(var(--theme-accent-rgb), 0.15)',
          border: '1px solid rgba(var(--theme-accent-rgb), 0.25)',
          boxShadow:
            '0 32px 64px -16px rgba(0,0,0,0.55),' +
            ' 0 8px 20px -6px rgba(0,0,0,0.3),' +
            ' inset 0 1px 0 rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px) saturate(120%)',
          WebkitBackdropFilter: 'blur(20px) saturate(120%)',
        } as React.CSSProperties}
      >
        {/* Left accent bar */}
        <div className="w-[3px] shrink-0 rounded-l-full bg-[var(--theme-accent)]" />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="relative flex items-center justify-between px-4 pt-3.5 pb-3 shrink-0 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Sparkles size={14} className="text-[var(--theme-accent)]" />
                <div className="absolute inset-0 blur-[6px] opacity-40 bg-[var(--theme-accent)] rounded-full pointer-events-none" />
              </div>
              <span className="text-[13px] font-bold text-[var(--theme-text)] tracking-wide">Sürüm Notları</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[var(--theme-secondary-text)] opacity-40 hover:opacity-80 transition-all duration-200 hover:rotate-90 hover:scale-110"
            >
              <X size={14} />
            </button>
          </div>

          {/* İçerik */}
          <div className="relative px-4 py-3 overflow-y-auto custom-scrollbar">
            {useNew ? (
              <>
                {notes.desktop && notes.desktop.length > 0 && (
                  <Section icon={<Monitor size={11} className="text-[var(--theme-accent)]" />} title="Desktop" items={notes.desktop} startIndex={nextIdx(notes.desktop.length)} />
                )}
                {notes.android && notes.android.length > 0 && (
                  <Section icon={<Smartphone size={11} className="text-[var(--theme-accent)]" />} title="Android" items={notes.android} startIndex={nextIdx(notes.android.length)} />
                )}
                {notes.common && notes.common.length > 0 && (
                  <Section icon={<Globe size={11} className="text-[var(--theme-accent)]" />} title="Ortak" items={notes.common} startIndex={nextIdx(notes.common.length)} />
                )}
                {isAdmin && notes.admin && notes.admin.length > 0 && (
                  <Section icon={<Shield size={11} className="text-[var(--theme-accent)]" />} title="Admin" items={notes.admin} startIndex={nextIdx(notes.admin.length)} />
                )}
              </>
            ) : (
              <>
                {notes.title && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="text-[11px] font-semibold text-[var(--theme-text)] mb-2"
                  >
                    {notes.title}
                  </motion.p>
                )}
                <ul className="space-y-1.5">
                  {notes.items.map((item, i) => {
                    if (!item) return <li key={i} className="h-1" />;
                    if (item.startsWith('—') && item.endsWith('—')) {
                      return (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2, delay: i * 0.04 }}
                          className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-wide pt-1.5 first:pt-0"
                        >
                          {item}
                        </motion.li>
                      );
                    }
                    return (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.04 }}
                        className="flex items-start gap-2 text-[11px] text-[var(--theme-text)] opacity-75 leading-snug"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)] shrink-0" />
                        {item}
                      </motion.li>
                    );
                  })}
                </ul>
                {isAdmin && notes.adminItems && notes.adminItems.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center gap-1 mb-2">
                      <Shield size={11} className="text-[var(--theme-accent)]" />
                      <span className="text-[10px] font-bold text-[var(--theme-accent)] uppercase tracking-wide">Admin</span>
                    </div>
                    <ul className="space-y-1.5">
                      {notes.adminItems.map((item, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: (notes.items.length + i) * 0.04 }}
                          className="flex items-start gap-2 text-[11px] text-[var(--theme-text)] opacity-75 leading-snug"
                        >
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)]/50 shrink-0" />
                          {item}
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
