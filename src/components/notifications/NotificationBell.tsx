import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { UserPlus, MessageSquare, Download, AtSign, Mail, ChevronRight, ChevronLeft, UserCheck, ShieldAlert, PhoneMissed, Check, X as XIcon, Trash2 } from 'lucide-react';
import NotificationBadge from './NotificationBadge';
import type { NotificationSummary, NotifItem, NotifKind } from '../../hooks/useNotificationCenter';
import { markAllInformationalRead, clearReadInformational } from '../../features/notifications/informationalStore';

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
  /** Popover'da inline Kabul butonu — senderId geçer, promise dönerse loading state tutulur. */
  onAcceptFriendRequest?: (senderId: string) => void | Promise<unknown>;
  /** Popover'da inline Reddet butonu. */
  onRejectFriendRequest?: (senderId: string) => void | Promise<unknown>;
  /** Popover'da inline Sunucu Daveti Kabul — inviteId geçer. */
  onAcceptServerInvite?: (inviteId: string) => void | Promise<unknown>;
  /** Popover'da inline Sunucu Daveti Reddet. */
  onDeclineServerInvite?: (inviteId: string) => void | Promise<unknown>;
}

// ── Kind → ikon eşlemesi ──
// Missed call: full-fill gradient tile — kırmızı→amber, white icon.
// Diğerleri: stroke-only lucide icon, wrapper bg'si priority'den gelir.
const KIND_ICON: Record<NotifKind, React.ReactNode> = {
  social: <UserPlus size={15} strokeWidth={1.8} />,
  message: <MessageSquare size={15} strokeWidth={1.8} />,
  system: <Download size={15} strokeWidth={1.8} />,
  mention: <AtSign size={15} strokeWidth={1.8} />,
  invite: <Mail size={15} strokeWidth={1.8} />,
  joinRequest: <UserCheck size={15} strokeWidth={1.8} />,
  restriction: <ShieldAlert size={15} strokeWidth={1.8} className="text-orange-400" />,
  missedCall: (
    <div
      className="w-full h-full rounded-lg flex items-center justify-center"
      style={{
        // Premium red only — top brighter, bottom deeper (180deg vertical).
        // Aggressive glow KALDIRILDI; yalnızca ince inner highlight + contact shadow.
        background:
          'linear-gradient(180deg, #F28680 0%, var(--danger, #E55B54) 55%, #B43B35 100%)',
        boxShadow: [
          'inset 0 1px 0 rgba(255,255,255,0.18)',  // minimal üst highlight
          'inset 0 -1px 0 rgba(0,0,0,0.14)',       // alt depth
          '0 1px 3px rgba(0,0,0,0.25)',            // subtle contact, glow yok
        ].join(', '),
      }}
    >
      <PhoneMissed size={13} strokeWidth={2.1} style={{ color: '#ffffff' }} />
    </div>
  ),
};

// ── Priority → sol çizgi rengi (çok hafif) ──
const PRIORITY_ACCENT = {
  high: 'bg-[var(--theme-accent)]',
  medium: 'bg-[var(--theme-secondary-text)]/20',
  low: 'bg-transparent',
} as const;

export default function NotificationBell({ summary, onOpenFriendRequests, onOpenDM, onOpenUpdate, onOpenInvites, onOpenAdminInviteRequests, onOpenJoinRequest, onOpenServer, onAcceptFriendRequest, onRejectFriendRequest, onAcceptServerInvite, onDeclineServerInvite }: Props) {
  const [open, setOpen] = useState(false);
  const [btnRect, setBtnRect] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Panel'i body'e portal et + button bounds'unu fixed positioning için ölç.
  // Stacking context sorununu bypass eder (video player z'sinin altında kalmaz).
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      if (btnRef.current) setBtnRect(btnRef.current.getBoundingClientRect());
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  // ── Session seen-state: panel açılınca mevcut key'ler "görüldü" olur ──
  // Informational store ayrıca readAt ile persist ediyor; burası session-level.
  const seenRef = useRef<Set<string>>(new Set());
  const [seenSnapshot, setSeenSnapshot] = useState<Set<string>>(new Set());

  // Pagination (5 item / sayfa)
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);

  // Panel açıldığında seen snapshot'ı güncelle + sayfayı 0'a al.
  // Kapandığında: seen güncellenir + informational'lara readAt set edilir (silinmez).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      setSeenSnapshot(new Set(seenRef.current));
      setPage(0);
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      // Görülen item'ları seen set'ine ekle (sonraki açılışta "yeni" rozeti çıkmasın).
      summary.items.forEach(item => seenRef.current.add(item.key));
      // Informational kayıtları SİLMEZ, sadece "okundu" işaretler — kullanıcı tarih+saat ile
      // sonradan görebilir. Temizleme başlıktaki "Sil" butonuyla manuel yapılır.
      markAllInformationalRead();
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

  // Pagination state — items veya page değişince clamp et (liste küçüldüyse son sayfa boşalmış olabilir).
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(
    () => items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [items, safePage],
  );
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  // "Temizle" butonu — informational store'daki okunmuşları siler. Friend-req / server-inv
  // itemları source-based (accept/reject gerekli) olduğu için etkilenmez.
  const handleClearRead = useCallback(() => {
    clearReadInformational();
    setPage(0);
  }, []);
  // Buton sadece okunmuş informational items varsa aktif — items.some ile tespit.
  const hasClearableRead = useMemo(
    () => items.some(it => it.key.startsWith('info:') && it.readAt != null),
    [items],
  );

  // ── Callback resolver ──
  const getOnClick = useCallback((item: NotifItem): (() => void) | undefined => {
    if (!item.isActionable) return undefined;
    // Informational bildirimler: tıklansa da SİLİNMEZ; manuel "Temizle" butonuna kadar
    // çanda kalır. Sadece ilgili sunucuya geçiş yapılır ve popover kapanır.
    if (item.key.startsWith('info:joinreq-accepted:') && item.serverId && onOpenServer) {
      const sid = item.serverId;
      return () => { onOpenServer(sid); setOpen(false); };
    }
    if (item.key.startsWith('info:joinreq-rejected:')) {
      return () => { setOpen(false); };
    }
    if ((item.key.startsWith('info:restricted:') || item.key.startsWith('info:unrestricted:')) && item.serverId && onOpenServer) {
      const sid = item.serverId;
      return () => { onOpenServer(sid); setOpen(false); };
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

  // State model: notification color is independent from popover open state.
  // Panel open only pauses motion/badge cues; the bell stays yellow while actionable
  // notifications exist.
  const hasBellNotifications = bellCount > 0;
  const unread = bellCount > 0 && !open;

  return (
    <div className="relative">
      {/* ── Çan butonu ── */}
      <button
        ref={btnRef}
        onClick={() => setOpen(prev => !prev)}
        className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 group/bell ${
          hasBellNotifications
            ? `${open ? 'bg-[rgba(245,181,68,0.08)]' : ''} mv-notification-bell-has hover:bg-[rgba(245,181,68,0.10)]`
            : `${open ? 'bg-[rgba(var(--glass-tint),0.05)]' : ''} mv-notification-bell-idle hover:bg-[rgba(var(--glass-tint),0.04)]`
        }`}
        title="Bildirimler"
      >
        <svg
          width="22" height="16" viewBox="-4 0 32 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={unread ? 'bell-swing-loop' : ''}
        >
          {unread && (
            <>
              <g className="bell-wave-l" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
                <line x1="-0.5" y1="8"  x2="-3"   y2="6"  />
                <line x1="-1"   y1="12" x2="-3.5" y2="12" />
                <line x1="-0.5" y1="16" x2="-3"   y2="18" />
              </g>
              <g className="bell-wave-r" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
                <line x1="24.5" y1="8"  x2="27"   y2="6"  />
                <line x1="25"   y1="12" x2="27.5" y2="12" />
                <line x1="24.5" y1="16" x2="27"   y2="18" />
              </g>
              <path
                d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
                fill="currentColor" stroke="none"
              />
            </>
          )}
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread && (
          <NotificationBadge count={bellCount} mode="count" variant="accent" size="sm" className="absolute -top-0.5 -right-0.5" />
        )}
      </button>

      {/* ── Panel (portal → body, AnimatePresence portal'ın İÇİNDE) ── */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="bell-panel"
              ref={panelRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.1 } }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="fixed w-[300px] rounded-2xl z-[120] overflow-hidden"
              style={{
                // btnRect ölçülmüşse button'a anchor'la; yoksa sağ-üst fallback — panel ASLA kaybolmasın.
                ...(btnRect
                  ? {
                      bottom: window.innerHeight - btnRect.top + 8,
                      right: window.innerWidth - btnRect.right,
                    }
                  : { top: 80, right: 20 }),
                background: 'var(--theme-bg)',
                border: '1px solid var(--theme-border)',
                boxShadow:
                  '0 24px 56px -16px rgba(var(--shadow-base),0.55),' +
                  ' 0 6px 16px -4px rgba(var(--shadow-base),0.22),' +
                  ' inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
            {/* Başlık — title + counter + Temizle butonu */}
            <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.08)' }}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--theme-text)]/85">
                  Bildirimler
                </span>
                {items.length > 0 && (
                  <span className="text-[9.5px] font-bold tabular-nums bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] px-1.5 py-0.5 rounded-full leading-none">
                    {items.length}
                  </span>
                )}
              </div>
              <button
                onClick={handleClearRead}
                disabled={!hasClearableRead}
                title="Okunmuş bildirimleri temizle"
                aria-label="Okunmuş bildirimleri temizle"
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[var(--theme-secondary-text)]/65 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>

            {/* İçerik */}
            <div className="py-1.5">
              {items.length === 0 ? (
                <div className="flex flex-col items-center text-center gap-2.5 px-6 py-8">
                  <div
                    className="relative w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.10) 0%, rgba(var(--theme-accent-rgb),0.03) 100%)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.10), inset 0 1px 0 rgba(255,255,255,0.05)',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--theme-accent)]/55">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[12.5px] font-semibold text-[var(--theme-text)]/90 tracking-[-0.01em]">
                      Her şey güncel
                    </span>
                    <span className="text-[10.5px] text-[var(--theme-secondary-text)]/50 leading-snug max-w-[200px]">
                      Yeni bir bildirim geldiğinde burada görünecek.
                    </span>
                  </div>
                </div>
              ) : (
                pageItems.map(item => {
                  // "Yeni" = session'da görülmedi VE store'da readAt yok.
                  // Bakıldıktan sonra üste doğru kısalır (compact layout), içeriği kalır.
                  const isNew = !seenSnapshot.has(item.key) && !item.readAt;
                  const compact = !isNew;
                  const onClick = getOnClick(item);

                  // Missed call → Apple-grade floating notification item
                  if (item.kind === 'missedCall') {
                    return <MissedCallItem key={item.key} item={item} />;
                  }

                  // Arkadaşlık isteği — aksiyon-pending, compact'laştırılmaz.
                  if (item.kind === 'social' && item.key.startsWith('friend-req:') && item.actorId) {
                    return (
                      <FriendRequestItem
                        key={item.key}
                        item={item}
                        isNew={isNew}
                        onAccept={onAcceptFriendRequest}
                        onReject={onRejectFriendRequest}
                      />
                    );
                  }

                  // Sunucu daveti — aksiyon-pending, compact'laştırılmaz.
                  if (item.kind === 'invite' && item.key.startsWith('server-inv:') && item.actorId) {
                    return (
                      <ServerInviteItem
                        key={item.key}
                        item={item}
                        isNew={isNew}
                        onAccept={onAcceptServerInvite}
                        onDecline={onDeclineServerInvite}
                      />
                    );
                  }

                  // Standart item — "yeni" full padding, "okunmuş" compact + tarih-saat pilli.
                  const timeLabel = item.createdAt ? formatNotifTime(item.createdAt) : '';
                  return (
                    <motion.button
                      key={item.key}
                      layout
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                      onClick={onClick}
                      disabled={!onClick}
                      className={`w-full flex items-center gap-3 text-left group/row transition-colors duration-150 ${
                        compact ? 'px-4 py-1.5' : 'px-4 py-2.5'
                      } ${onClick ? 'hover:bg-[var(--theme-panel-hover)] cursor-pointer' : 'cursor-default'}`}
                      style={{ opacity: compact ? 0.78 : 1 }}
                    >
                      {/* Sol priority çizgisi */}
                      <div className={`w-[2px] self-stretch rounded-full shrink-0 ${PRIORITY_ACCENT[item.priority]} transition-opacity duration-300`} />

                      {/* İkon — compact'ta daha küçük */}
                      <div className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-lg flex items-center justify-center shrink-0 transition-colors duration-100 ${
                        item.priority === 'high' && !compact
                          ? 'bg-[var(--theme-accent)]/8 text-[var(--theme-accent)] group-hover/row:bg-[var(--theme-accent)]/12'
                          : 'bg-[rgba(var(--glass-tint),0.05)] text-[var(--theme-secondary-text)] group-hover/row:text-[var(--theme-accent)] group-hover/row:bg-[var(--theme-accent)]/8'
                      }`}>
                        {KIND_ICON[item.kind]}
                      </div>

                      {/* Metin */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`${compact ? 'text-[10.5px]' : 'text-[11px]'} font-semibold block truncate leading-tight ${
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
                        {item.detail && !compact && (
                          <span className="text-[10px] block truncate leading-tight mt-0.5 text-[var(--theme-secondary-text)]/50">
                            {item.detail}
                          </span>
                        )}
                      </div>

                      {/* Sağ taraf — compact modda tarih/saat pilli; yeni modda count + chevron */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {compact && timeLabel && (
                          <span
                            className="tabular-nums select-none"
                            style={{
                              fontSize: 9.5,
                              fontWeight: 500,
                              padding: '2px 6px',
                              borderRadius: 999,
                              background: 'rgba(var(--glass-tint), 0.06)',
                              color: 'var(--theme-secondary-text)',
                              opacity: 0.72,
                              letterSpacing: '0.01em',
                            }}
                          >
                            {timeLabel}
                          </span>
                        )}
                        {!compact && item.count > 0 && <NotificationBadge count={item.count} mode="count" variant="accent" size="sm" />}
                        {!compact && onClick && (
                          <ChevronRight size={12} className="text-[var(--theme-secondary-text)]/20 group-hover/row:text-[var(--theme-secondary-text)]/50 transition-colors duration-100" />
                        )}
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>

            {/* Pagination control — sadece 5+ bildirim varsa göster */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between gap-2 px-3 py-2"
                style={{ borderTop: '1px solid rgba(var(--glass-tint), 0.06)' }}
              >
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  aria-label="Önceki sayfa"
                  title="Önceki sayfa"
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--theme-secondary-text)]/65 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10.5px] font-semibold tabular-nums text-[var(--theme-secondary-text)]/75 select-none">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  aria-label="Sonraki sayfa"
                  title="Sonraki sayfa"
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--theme-secondary-text)]/65 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

// ── MissedCallItem ─────────────────────────────────────────────────────
// Apple Notification Center kalitesinde tek item.
//  - Floating-notification container (theme-adaptive tint + subtle border)
//  - 32×32 icon tile: top-brighter / bottom-deeper red vertical gradient
//  - Tek satır: bold isim + normal detail
//  - Sağda küçük soft pill: relative time (şimdi / N dk / N sa / N gün)
//  - Entry: fade + 6px up translate, 160ms cubic
//  - Exit: scale 0.96 + blur 4px + fade, 200ms (AnimatePresence gerekir — bu
//    item parent unmount'ta anlık kaybolur; runtime'da tekil remove için
//    removeInformational handler'ı bağlanabilir. Şimdilik entry-focused.)
//  - Hover: y -1 + bg tint lift + shadow growth — NO scale bounce
//  - Click: scale 0.98 + dismiss (bu item'ı hafif sıyır)
const MissedCallItem: React.FC<{ item: NotifItem }> = ({ item }) => {
  // Bildirim artık tıklamayla silinmiyor — "Temizle" butonu manuel silmeye ayrıldı.
  const handleDismiss = React.useCallback(() => {
    // no-op; missed call item çanda kalır, kullanıcı isterse Temizle ile siler.
    void item;
  }, [item]);

  const relativeLabel = React.useMemo(() => {
    if (!item.createdAt) return '';
    return formatRelativeTime(item.createdAt);
  }, [item.createdAt]);

  return (
    <motion.button
      type="button"
      onClick={handleDismiss}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', transition: { duration: 0.20, ease: [0.22, 1, 0.36, 1] } }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98, y: 0 }}
      className="group/mc block w-full text-left outline-none mx-0 mb-1 last:mb-0"
      style={{
        // Panel içi "kart" — çok hafif tint + ince border; theme-adaptive.
        marginLeft: 10,
        marginRight: 10,
        width: 'calc(100% - 20px)',
        background: 'rgba(var(--glass-tint), 0.05)',
        border: '1px solid rgba(var(--glass-tint), 0.09)',
        borderRadius: 14,
        padding: '10px 12px',
        boxShadow: [
          '0 1px 2px rgba(0,0,0,0.08)',
          '0 2px 6px -2px rgba(0,0,0,0.10)',
          'inset 0 1px 0 rgba(255,255,255,0.03)',
        ].join(', '),
        transition:
          'background 180ms cubic-bezier(0.4,0,0.2,1), ' +
          'border-color 180ms cubic-bezier(0.4,0,0.2,1), ' +
          'box-shadow 200ms cubic-bezier(0.4,0,0.2,1)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(var(--glass-tint), 0.09)';
        el.style.borderColor = 'rgba(var(--glass-tint), 0.14)';
        el.style.boxShadow = [
          '0 2px 4px rgba(0,0,0,0.10)',
          '0 4px 12px -2px rgba(0,0,0,0.14)',
          'inset 0 1px 0 rgba(255,255,255,0.04)',
        ].join(', ');
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(var(--glass-tint), 0.05)';
        el.style.borderColor = 'rgba(var(--glass-tint), 0.09)';
        el.style.boxShadow = [
          '0 1px 2px rgba(0,0,0,0.08)',
          '0 2px 6px -2px rgba(0,0,0,0.10)',
          'inset 0 1px 0 rgba(255,255,255,0.03)',
        ].join(', ');
      }}
      aria-label={`Cevapsız çağrı: ${item.label} ${item.detail}`}
    >
      <div className="flex items-center gap-3">
        {/* Icon tile — full red gradient, white stroke, minimal depth */}
        <div
          className="w-8 h-8 shrink-0 flex items-center justify-center"
          style={{
            borderRadius: 10,
            background:
              'linear-gradient(180deg, #F28680 0%, var(--danger, #E55B54) 55%, #B43B35 100%)',
            boxShadow: [
              'inset 0 1px 0 rgba(255,255,255,0.20)',
              'inset 0 -1px 0 rgba(0,0,0,0.14)',
              '0 1px 3px rgba(0,0,0,0.25)',
            ].join(', '),
          }}
        >
          <PhoneMissed size={14} strokeWidth={2.25} style={{ color: '#ffffff' }} />
        </div>

        {/* Text — tek satır: bold isim + normal detail */}
        <div className="min-w-0 flex-1">
          <p
            className="truncate leading-[1.3]"
            style={{
              fontSize: 12.5,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary, var(--theme-text))',
            }}
          >
            <span style={{ fontWeight: 600 }}>{item.label}</span>
            {item.detail && (
              <span
                style={{
                  fontWeight: 400,
                  color: 'var(--text-secondary, var(--theme-secondary-text))',
                  opacity: 0.75,
                }}
              >
                {' '}{item.detail}
              </span>
            )}
          </p>
        </div>

        {/* Meta pill — relative time, soft & minimal */}
        {relativeLabel && (
          <span
            className="shrink-0 tabular-nums select-none"
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '3px 7px',
              borderRadius: 999,
              background: 'rgba(var(--glass-tint), 0.08)',
              color: 'var(--text-secondary, var(--theme-secondary-text))',
              opacity: 0.72,
              letterSpacing: '0.01em',
            }}
          >
            {relativeLabel}
          </span>
        )}
      </div>
    </motion.button>
  );
};

// ── FriendRequestItem ───────────────────────────────────────────────────
// Popover içinde inline Kabul/Reddet butonlu arkadaşlık isteği item'ı.
// Kullanıcı aksiyon almadan silinmez — accept/reject başarılıysa incomingRequests
// array'inden düşer ve item doğal olarak kaybolur.
const FriendRequestItem: React.FC<{
  item: NotifItem;
  isNew: boolean;
  onAccept?: (senderId: string) => void | Promise<unknown>;
  onReject?: (senderId: string) => void | Promise<unknown>;
}> = ({ item, isNew, onAccept, onReject }) => {
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);
  const senderId = item.actorId!;
  const initial = (item.label || '?').trim().charAt(0).toUpperCase();

  const handle = async (action: 'accept' | 'reject') => {
    if (pending) return;
    setPending(action);
    try {
      const fn = action === 'accept' ? onAccept : onReject;
      await fn?.(senderId);
      // Başarı → item source'tan (incomingRequests) düşer; component unmount olur.
    } catch {
      setPending(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      className="w-full flex items-center gap-3 px-4 py-2.5"
    >
      {/* Sol priority çizgisi — medium */}
      <div className="w-[2px] self-stretch rounded-full shrink-0 bg-[var(--theme-secondary-text)]/20" />

      {/* Avatar — gönderen ya da fallback initial */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
        style={{
          background: item.avatarUrl ? 'transparent' : 'rgba(var(--theme-accent-rgb), 0.12)',
          border: '1px solid rgba(var(--glass-tint), 0.10)',
        }}
      >
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-[12px] font-bold text-[var(--theme-accent)]">{initial}</span>
        )}
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
        <span className="text-[10px] block truncate leading-tight mt-0.5 text-[var(--theme-secondary-text)]/55">
          {item.detail}
        </span>
      </div>

      {/* Aksiyon butonları — Kabul (accent) + Reddet (subtle) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => handle('accept')}
          disabled={!!pending || !onAccept}
          title="Kabul et"
          aria-label="Arkadaşlık isteğini kabul et"
          className="w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-40 disabled:cursor-default transition-colors"
          style={{
            color: 'var(--theme-accent)',
            background: pending === 'accept' ? 'rgba(var(--theme-accent-rgb), 0.22)' : 'rgba(var(--theme-accent-rgb), 0.10)',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.22)',
          }}
          onMouseEnter={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.18)'; }}
          onMouseLeave={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.10)'; }}
        >
          <Check size={13} strokeWidth={2.5} className={pending === 'accept' ? 'animate-pulse' : ''} />
        </button>
        <button
          onClick={() => handle('reject')}
          disabled={!!pending || !onReject}
          title="Reddet"
          aria-label="Arkadaşlık isteğini reddet"
          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--theme-secondary-text)]/75 hover:text-red-400 disabled:opacity-40 disabled:cursor-default transition-colors"
          style={{
            background: pending === 'reject' ? 'rgba(239, 68, 68, 0.14)' : 'rgba(var(--glass-tint), 0.05)',
            border: '1px solid rgba(var(--glass-tint), 0.10)',
          }}
          onMouseEnter={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.10)'; }}
          onMouseLeave={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(var(--glass-tint), 0.05)'; }}
        >
          <XIcon size={13} strokeWidth={2.5} className={pending === 'reject' ? 'animate-pulse' : ''} />
        </button>
      </div>
    </motion.div>
  );
};

// ── ServerInviteItem ────────────────────────────────────────────────────
// Sunucu daveti — inline Kabul (✓) / Reddet (✗). Friend-req ile aynı pattern,
// avatar rounded-square (sunucu logosu), actorId = inviteId.
const ServerInviteItem: React.FC<{
  item: NotifItem;
  isNew: boolean;
  onAccept?: (inviteId: string) => void | Promise<unknown>;
  onDecline?: (inviteId: string) => void | Promise<unknown>;
}> = ({ item, isNew, onAccept, onDecline }) => {
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const inviteId = item.actorId!;
  const initial = (item.label || '?').trim().charAt(0).toUpperCase();

  const handle = async (action: 'accept' | 'decline') => {
    if (pending) return;
    setPending(action);
    try {
      const fn = action === 'accept' ? onAccept : onDecline;
      await fn?.(inviteId);
    } catch {
      setPending(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      className="w-full flex items-center gap-3 px-4 py-2.5"
    >
      {/* Sol priority çizgisi — medium */}
      <div className="w-[2px] self-stretch rounded-full shrink-0 bg-[var(--theme-secondary-text)]/20" />

      {/* Avatar — sunucu logosu (rounded square) */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
        style={{
          background: item.avatarUrl ? 'transparent' : 'rgba(var(--theme-accent-rgb), 0.12)',
          border: '1px solid rgba(var(--glass-tint), 0.10)',
        }}
      >
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-[12px] font-bold text-[var(--theme-accent)]">{initial}</span>
        )}
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
        <span className="text-[10px] block truncate leading-tight mt-0.5 text-[var(--theme-secondary-text)]/55">
          {item.detail}
        </span>
      </div>

      {/* Aksiyon butonları — Kabul (accent) + Reddet (subtle) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => handle('accept')}
          disabled={!!pending || !onAccept}
          title="Daveti kabul et"
          aria-label="Sunucu davetini kabul et"
          className="w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-40 disabled:cursor-default transition-colors"
          style={{
            color: 'var(--theme-accent)',
            background: pending === 'accept' ? 'rgba(var(--theme-accent-rgb), 0.22)' : 'rgba(var(--theme-accent-rgb), 0.10)',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.22)',
          }}
          onMouseEnter={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.18)'; }}
          onMouseLeave={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.10)'; }}
        >
          <Check size={13} strokeWidth={2.5} className={pending === 'accept' ? 'animate-pulse' : ''} />
        </button>
        <button
          onClick={() => handle('decline')}
          disabled={!!pending || !onDecline}
          title="Reddet"
          aria-label="Sunucu davetini reddet"
          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--theme-secondary-text)]/75 hover:text-red-400 disabled:opacity-40 disabled:cursor-default transition-colors"
          style={{
            background: pending === 'decline' ? 'rgba(239, 68, 68, 0.14)' : 'rgba(var(--glass-tint), 0.05)',
            border: '1px solid rgba(var(--glass-tint), 0.10)',
          }}
          onMouseEnter={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.10)'; }}
          onMouseLeave={(e) => { if (!pending) e.currentTarget.style.background = 'rgba(var(--glass-tint), 0.05)'; }}
        >
          <XIcon size={13} strokeWidth={2.5} className={pending === 'decline' ? 'animate-pulse' : ''} />
        </button>
      </div>
    </motion.div>
  );
};

// Bildirim zaman formatı (TR): okunmuş bildirim sağ pillinde gösterilir.
//   < 1 dk → "şimdi"
//   < 60 dk → "N dk"
//   < 24 sa → "N sa"
//   24-48 sa → "Dün HH:mm"
//   2-6 gün → "N gün"
//   ≥ 7 gün → "DD MMM HH:mm" (ör. "12 May 09:15")
function formatNotifTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'şimdi';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const d = new Date(ms);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor(hr / 24);
  if (days === 1) return `Dün ${time}`;
  if (days < 7) return `${days} gün`;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' ' + time;
}

// Relative time formatter (TR): "şimdi" / "N dk" / "N sa" / "N gün"
function formatRelativeTime(createdAtMs: number): string {
  const diff = Date.now() - createdAtMs;
  if (diff < 60_000) return 'şimdi';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} dk`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa`;
  const days = Math.floor(hrs / 24);
  return `${days} gün`;
}
