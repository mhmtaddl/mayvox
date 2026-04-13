import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UserPlus, MessageSquare, Download, AtSign, Mail, ChevronRight, UserCheck, ShieldAlert } from 'lucide-react';
import NotificationBadge from './NotificationBadge';
import type { NotificationSummary, NotifItem, NotifKind } from '../../hooks/useNotificationCenter';
import { clearAllInformational, removeInformational } from '../../features/notifications/informationalStore';

interface Props {
  summary: NotificationSummary;
  onOpenFriendRequests?: () => void;
  onOpenDM?: () => void;
  onOpenUpdate?: () => void;
  onOpenInvites?: () => void;
  onOpenAdminInviteRequests?: () => void;
  onOpenJoinRequest?: (serverId: string) => void;
  /** Informational "kabul edildin" bildirimi tıklanınca sunucuya geç. */
  onOpenServer?: (serverId: string) => void;
}

// ── Kind → ikon eşlemesi ──
const KIND_ICON: Record<NotifKind, React.ReactNode> = {
  social: <UserPlus size={15} strokeWidth={1.8} />,
  message: <MessageSquare size={15} strokeWidth={1.8} />,
  system: <Download size={15} strokeWidth={1.8} />,
  mention: <AtSign size={15} strokeWidth={1.8} />,
  invite: <Mail size={15} strokeWidth={1.8} />,
  joinRequest: <UserCheck size={15} strokeWidth={1.8} />,
  restriction: <ShieldAlert size={15} strokeWidth={1.8} className="text-orange-400" />,
};

// ── Priority → sol çizgi rengi (çok hafif) ──
const PRIORITY_ACCENT = {
  high: 'bg-[var(--theme-accent)]',
  medium: 'bg-[var(--theme-secondary-text)]/20',
  low: 'bg-transparent',
} as const;

export default function NotificationBell({ summary, onOpenFriendRequests, onOpenDM, onOpenUpdate, onOpenInvites, onOpenAdminInviteRequests, onOpenJoinRequest, onOpenServer }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // ── Session seen-state: panel açılınca mevcut key'ler "görüldü" olur ──
  const seenRef = useRef<Set<string>>(new Set());
  const [seenSnapshot, setSeenSnapshot] = useState<Set<string>>(new Set());

  // Panel açıldığında seen snapshot'ı güncelle; KAPANDIĞINDA okundu sayılıp temizle.
  // Açılış anında temizlersek kullanıcı okumaya vakit bulamadan siliniyor — yanlıştı.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      setSeenSnapshot(new Set(seenRef.current));
      wasOpenRef.current = true;
      return;
    }
    // open → closed geçişi:
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      // Görülen item'ları seen set'ine ekle (sonraki açılışta "yeni" olarak görünmesin).
      summary.items.forEach(item => seenRef.current.add(item.key));
      // Informational kayıtları temizle (aksiyon gerektirmez, çana bakmak okundu demektir).
      // Aksiyon tipi item'lar KAYNAĞA bağlı olarak kendiliğinden düşer — onları temizleme.
      clearAllInformational();
    }
  }, [open, summary.items]);

  // Dış tıklamada kapat
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const { bellCount, items } = summary;

  // ── Callback resolver ──
  const getOnClick = useCallback((item: NotifItem): (() => void) | undefined => {
    if (!item.isActionable) return undefined;
    // Informational "kabul edildin" kayıtları: key `info:joinreq-accepted:<sid>` ile gelir.
    if (item.key.startsWith('info:joinreq-accepted:') && item.serverId && onOpenServer) {
      const sid = item.serverId;
      const infoKey = item.key.slice('info:'.length);
      return () => { onOpenServer(sid); removeInformational(infoKey); setOpen(false); };
    }
    if (item.key.startsWith('info:joinreq-rejected:')) {
      const infoKey = item.key.slice('info:'.length);
      return () => { removeInformational(infoKey); setOpen(false); };
    }
    // Restriction informational items — sunucuya geç + bildirimi sil.
    if ((item.key.startsWith('info:restricted:') || item.key.startsWith('info:unrestricted:')) && item.serverId && onOpenServer) {
      const sid = item.serverId;
      const infoKey = item.key.slice('info:'.length);
      return () => { onOpenServer(sid); removeInformational(infoKey); setOpen(false); };
    }
    // joinRequest: her sunucu için ayrı item, serverId ile sunucu ayarlarına git
    if (item.kind === 'joinRequest' && item.serverId && onOpenJoinRequest) {
      const sid = item.serverId;
      return () => { onOpenJoinRequest(sid); setOpen(false); };
    }
    const map: Record<string, (() => void) | undefined> = {
      friends: onOpenFriendRequests,
      dm: onOpenDM,
      update: onOpenUpdate,
      invites: onOpenInvites,
      'admin-invite-requests': onOpenAdminInviteRequests,
    };
    const handler = map[item.key];
    if (!handler) return undefined;
    return () => { handler(); setOpen(false); };
  }, [onOpenFriendRequests, onOpenDM, onOpenUpdate, onOpenInvites, onOpenAdminInviteRequests, onOpenJoinRequest, onOpenServer]);

  return (
    <div className="relative">
      {/* ── Çan butonu ── */}
      <button
        ref={btnRef}
        onClick={() => setOpen(prev => !prev)}
        className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 group/bell ${
          open
            ? 'text-[var(--theme-accent)] bg-[var(--theme-accent)]/8'
            : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--glass-tint),0.04)]'
        }`}
        title="Bildirimler"
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={bellCount > 0 && !open ? 'group-hover/bell:animate-[bell-ring_0.5s_ease-in-out]' : ''}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {bellCount > 0 && !open && (
          <NotificationBadge count={bellCount} mode="count" variant="accent" size="sm" className="absolute -top-0.5 -right-0.5" />
        )}
      </button>

      {/* ── Panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            className="absolute bottom-full right-0 mb-2 w-72 rounded-xl z-50 overflow-hidden"
            style={{
              background: 'rgba(var(--theme-sidebar-rgb), 0.92)',
              backdropFilter: 'blur(20px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
              border: '1px solid rgba(var(--glass-tint), 0.07)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 1px 0 rgba(var(--glass-tint), 0.04) inset',
            }}
          >
            {/* Top edge */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--glass-tint),0.06)] to-transparent" />

            {/* Başlık */}
            <div className="px-4 pt-3 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/50">
                Bildirimler
              </span>
            </div>

            {/* İçerik */}
            <div className="pb-1.5">
              {items.length === 0 ? (
                <div className="flex items-center gap-3 px-4 py-5">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(var(--glass-tint),0.04)] flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--theme-secondary-text)]/25">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <span className="text-[11px] text-[var(--theme-secondary-text)]/40">Her şey güncel</span>
                </div>
              ) : (
                items.map(item => {
                  const isNew = !seenSnapshot.has(item.key);
                  const onClick = getOnClick(item);

                  return (
                    <button
                      key={item.key}
                      onClick={onClick}
                      disabled={!onClick}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left group/row transition-colors duration-100 ${
                        onClick ? 'hover:bg-[rgba(var(--glass-tint),0.05)] cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      {/* Sol priority çizgisi */}
                      <div className={`w-[2px] self-stretch rounded-full shrink-0 ${PRIORITY_ACCENT[item.priority]} transition-opacity duration-300`} />

                      {/* İkon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-100 ${
                        item.priority === 'high'
                          ? 'bg-[var(--theme-accent)]/8 text-[var(--theme-accent)] group-hover/row:bg-[var(--theme-accent)]/12'
                          : 'bg-[rgba(var(--glass-tint),0.05)] text-[var(--theme-secondary-text)] group-hover/row:text-[var(--theme-accent)] group-hover/row:bg-[var(--theme-accent)]/8'
                      }`}>
                        {KIND_ICON[item.kind]}
                      </div>

                      {/* Metin */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-semibold block truncate leading-tight ${
                            isNew ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text)]/70'
                          }`}>
                            {item.label}
                          </span>
                          {isNew && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--theme-accent)] opacity-70 shrink-0">
                              yeni
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] block truncate leading-tight mt-0.5 ${
                          isNew ? 'text-[var(--theme-secondary-text)]/50' : 'text-[var(--theme-secondary-text)]/35'
                        }`}>
                          {item.detail}
                        </span>
                      </div>

                      {/* Sağ taraf */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.count > 0 && <NotificationBadge count={item.count} mode="count" variant="accent" size="sm" />}
                        {onClick && (
                          <ChevronRight size={12} className="text-[var(--theme-secondary-text)]/20 group-hover/row:text-[var(--theme-secondary-text)]/50 transition-colors duration-100" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
