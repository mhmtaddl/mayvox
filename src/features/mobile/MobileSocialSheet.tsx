import React from 'react';
import { Pin } from 'lucide-react';

interface MobileSocialSheetProps {
  open?: boolean;
  variant?: 'overlay' | 'inline';
  onClose?: () => void;
  pinned?: boolean;
  onTogglePinned?: () => void;
  children?: React.ReactNode;
}

export default function MobileSocialSheet({ open = false, variant = 'overlay', onClose, pinned = false, onTogglePinned, children }: MobileSocialSheetProps) {
  const header = onTogglePinned ? (
    <div className="mb-1.5 flex min-h-9 items-center justify-end border-b border-[rgba(var(--glass-tint),0.045)] pb-1.5">
      <button
        type="button"
        onClick={onTogglePinned}
        aria-label={pinned ? 'Panel sabitlemesini kaldir' : 'Paneli sabitle'}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-[0.98] ${pinned ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/45'}`}
      >
        <Pin size={13} />
      </button>
    </div>
  ) : null;

  if (variant === 'inline') {
    if (!open) return null;
    return (
      <aside
        className="h-full min-h-0 w-[clamp(168px,15vw,190px)] shrink-0 overflow-hidden px-2 pb-2.5 pt-1"
        onClick={event => event.stopPropagation()}
        onTouchStart={event => event.stopPropagation()}
        onTouchMove={event => event.stopPropagation()}
        onTouchEnd={event => event.stopPropagation()}
        style={{
          background: 'transparent',
          boxShadow: 'inset 1px 0 0 rgba(var(--glass-tint),0.045)',
        }}
      >
        <div className="h-full min-h-0 overflow-hidden">
          {header}
          {children}
        </div>
      </aside>
    );
  }

  return (
    <div
      className={`absolute inset-0 z-40 transition-[visibility] duration-200 ${open ? 'visible' : 'invisible'}`}
      onTouchStart={event => event.stopPropagation()}
      onTouchMove={event => event.stopPropagation()}
      onTouchEnd={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-[rgba(var(--theme-bg-rgb),0.12)] backdrop-blur-[1.5px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-label="Arkadas panelini kapat"
        tabIndex={open ? 0 : -1}
      />
      <aside
        className={`absolute inset-y-0 right-0 h-full w-[clamp(168px,15vw,190px)] overflow-hidden px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+12px)] transition-[transform,opacity] duration-220 ease-out ${open ? 'translate-x-0 opacity-100' : 'translate-x-[104%] opacity-80'}`}
        style={{
          background: 'rgba(var(--theme-bg-rgb),0.06)',
          boxShadow: 'inset 1px 0 0 rgba(var(--glass-tint),0.045)',
        }}
        aria-hidden={!open}
      >
        <div className="h-[calc(100vh-92px-env(safe-area-inset-top))] min-h-0 overflow-hidden">
          {header}
          {children}
        </div>
      </aside>
    </div>
  );
}
