import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Monitor, Smartphone, Clock, History, User as UserIcon, UserPlus, UserMinus, Check, X, Star, MessageSquare, PhoneCall, Server as ServerIcon, Gamepad2 } from 'lucide-react';
import type { User } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { getPublicDisplayName } from '../lib/formatName';
import AvatarContent from './AvatarContent';
import { hasCustomAvatar } from '../lib/statusAvatar';
import { useSettings } from '../contexts/SettingsCtx';
import { useUser } from '../contexts/UserContext';
import { getFrameTier, getFrameStyle, getFrameClassName } from '../lib/avatarFrame';
import { useUI } from '../contexts/UIContext';
import { useSharedFavorites } from '../contexts/FavoriteFriendsContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface Props {
  user: User;
  position: { x: number; y: number };
  onClose: () => void;
  onInvite?: () => void;
  onDM?: (userId: string) => void;
  canInvite: boolean;
  inviteStatus?: string;
  onCooldown: boolean;
  cooldownRemaining: number;
  isMe: boolean;
  currentAppVersion?: string;
  serverName?: string | null;
  source?: 'default' | 'search';
}

const POPUP_W = 240;
const POPUP_H = 340;

const formatOnlineDuration = (onlineSince: number) => {
  const rawMins = Math.floor((Date.now() - onlineSince) / 60000);
  // 1 dakikadan kısa süreleri "< 1 dk" göstermek yerine doğrudan "1 dk" yap.
  const mins = Math.max(1, rawMins);
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins / 60), m = mins % 60;
  // İki basamaklı dakika okunurluk için "1 sa 05 dk"
  const mm = String(m).padStart(2, '0');
  return m > 0 ? `${h} sa ${mm} dk` : `${h} sa`;
};

const formatLastSeen = (lastSeenAt: string) => {
  const d = new Date(lastSeenAt);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Bugün ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Dün ${time}`;
  return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })} ${time}`;
};

export default function UserProfilePopup({
  user, position, onClose, onInvite, onDM, canInvite, inviteStatus,
  onCooldown, cooldownRemaining, isMe, serverName, source = 'default',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const { showLastSeen, avatarBorderColor } = useSettings();
  const { getRelationship, sendRequest, acceptRequest, rejectRequest, cancelRequest, removeFriend, currentUser } = useUser();
  const { setToastMsg } = useUI();
  const { isFavorite, toggleFavorite } = useSharedFavorites();
  const userIsFav = isFavorite(user.id);

  const { openConfirm } = useConfirm();
  const [actionLoading, setActionLoading] = useState(false);

  const rel = getRelationship(user.id);

  const hasImage = hasCustomAvatar(user.avatar);
  const isSearchMinimal = source === 'search' && !isMe && rel !== 'friend';
  const popupHeight = isSearchMinimal ? 268 : POPUP_H;
  const x = Math.min(position.x + 8, window.innerWidth - POPUP_W - 16);
  const y = Math.min(position.y - 40, window.innerHeight - popupHeight - 16);

  useEscapeKey(onClose);

  useEffect(() => {
    if (!user.onlineSince) return;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [user.onlineSince]);

  const isOnline = user.status === 'online';
  const rawStatusText = isOnline ? (user.statusText || 'Online') : 'Çevrimdışı';
  // Legacy 'Aktif' → 'Online' normalize
  const statusText = rawStatusText === 'Aktif' ? 'Online' : rawStatusText;
  // Manuel "Çevrimdışı" premium statüsü: presence online olsa bile en düşük
  // görsel önceliği alır — real offline ile aynı muted renk.
  const statusColor =
    !isOnline || statusText === 'Çevrimdışı' ? 'text-[var(--theme-secondary-text)]/60'
    : statusText === 'Online' ? 'text-emerald-400'
    : statusText === 'Pasif' ? 'text-yellow-400'
    : statusText === 'Duymuyor' || statusText === 'Rahatsız Etmeyin' ? 'text-red-400'
    : statusText === 'AFK' ? 'text-violet-400'
    : 'text-orange-400';

  const userName = getPublicDisplayName(user);
  const canNonFriendDm = !!onDM && !isMe && rel !== 'friend' && currentUser.allowNonFriendDms !== false && user.allowNonFriendDms !== false;
  const canDirectMessage = !!onDM && !isMe && (rel === 'friend' || canNonFriendDm);


  const handleAccept = async () => {
    setActionLoading(true);
    const ok = await acceptRequest(user.id);
    setActionLoading(false);
    setToastMsg(ok ? `${userName} artık arkadaşın` : 'İşlem başarısız');
  };

  const handleReject = async () => {
    setActionLoading(true);
    const ok = await rejectRequest(user.id);
    setActionLoading(false);
    setToastMsg(ok ? 'İstek reddedildi' : 'İşlem başarısız');
  };

  const triggerConfirm = (action: 'send' | 'remove' | 'cancel') => {
    openConfirm({
      title: action === 'send' ? 'Arkadaş isteği gönder' : action === 'cancel' ? 'İsteği iptal et' : 'Arkadaşı sil',
      description: action === 'send' ? `${userName} kişisine arkadaşlık isteği gönderilsin mi?`
        : action === 'cancel' ? `${userName} kişisine gönderilen istek iptal edilsin mi?`
        : `${userName} kişisini arkadaşlarından silmek istiyor musun?`,
      confirmText: action === 'send' ? 'Ekle' : action === 'cancel' ? 'İptal et' : 'Sil',
      cancelText: 'İptal',
      danger: action === 'remove',
      onConfirm: async () => {
        if (action === 'send') {
          const ok = await sendRequest(user.id);
          setToastMsg(ok ? 'Arkadaşlık isteği gönderildi' : 'İstek gönderilemedi');
        } else if (action === 'cancel') {
          const ok = await cancelRequest(user.id);
          setToastMsg(ok ? 'İstek iptal edildi' : 'İşlem başarısız');
        } else {
          const ok = await removeFriend(user.id);
          setToastMsg(ok ? `${userName} arkadaşlarından kaldırıldı` : 'İşlem başarısız');
        }
      },
    });
  };

  const renderSearchDmButton = () => {
    if (!canNonFriendDm) return null;
    return (
      <button
        onClick={() => { onDM?.(user.id); onClose(); }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.16)]"
        style={{ background: 'rgba(var(--theme-accent-rgb), 0.10)' }}
        title="Mesaj gönder"
        aria-label="Mesaj gönder"
      >
        <MessageSquare size={16} />
      </button>
    );
  };

  const renderSearchInviteButton = () => {
    if (!canInvite && !inviteStatus) return null;
    if (inviteStatus === 'pending') {
      return (
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-blue-300"
          style={{ background: 'rgba(59,130,246,0.10)' }}
          title="Davet bekliyor"
          aria-label="Davet bekliyor"
        >
          <span className="h-2 w-2 rounded-full bg-blue-300 animate-pulse" />
        </span>
      );
    }
    if (inviteStatus === 'accepted') {
      return (
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-emerald-300"
          style={{ background: 'rgba(16,185,129,0.10)' }}
          title="Davet kabul edildi"
          aria-label="Davet kabul edildi"
        >
          <Check size={16} strokeWidth={2.4} />
        </span>
      );
    }
    if (inviteStatus === 'rejected') {
      return (
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-red-300"
          style={{ background: 'rgba(248,113,113,0.10)' }}
          title="Davet reddedildi"
          aria-label="Davet reddedildi"
        >
          <X size={16} strokeWidth={2.4} />
        </span>
      );
    }
    return (
      <button
        disabled={onCooldown}
        onClick={() => onInvite?.()}
        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-30 disabled:cursor-default"
        style={{ background: 'rgba(16,185,129,0.10)' }}
        title={onCooldown ? `${cooldownRemaining}s` : 'Odaya davet et'}
        aria-label={onCooldown ? `${cooldownRemaining} saniye sonra davet et` : 'Odaya davet et'}
      >
        <PhoneCall size={16} />
      </button>
    );
  };

  const renderSearchSecondaryActions = () => {
    const dmButton = renderSearchDmButton();
    const inviteButton = renderSearchInviteButton();
    if (!dmButton && !inviteButton) return null;
    return <div className="flex items-center justify-center gap-2">{dmButton}{inviteButton}</div>;
  };

  const renderSearchBadges = () => {
    const relText =
      rel === 'incoming' ? 'İstek geldi'
      : rel === 'outgoing' ? 'İstek gönderildi'
      : rel === 'friend' ? 'Arkadaş'
      : 'Arkadaş değil';
    return (
      <div className="mb-4 flex max-w-full flex-wrap justify-center gap-1.5">
        <span className={`rounded-full bg-[rgba(var(--glass-tint),0.07)] px-2 py-[3px] text-[9px] font-semibold ${statusColor}`}>
          {statusText}
        </span>
        <span className="rounded-full bg-[rgba(var(--glass-tint),0.07)] px-2 py-[3px] text-[9px] font-semibold text-[var(--theme-secondary-text)]/70">
          {relText}
        </span>
        {serverName && (
          <span className="max-w-full truncate rounded-full bg-emerald-500/10 px-2 py-[3px] text-[9px] font-semibold text-emerald-300/85" title={serverName}>
            {serverName}
          </span>
        )}
      </div>
    );
  };

  const renderSearchFriendAction = () => {
    if (rel === 'incoming') {
      return (
        <div className="w-full space-y-2">
          <div className="grid grid-cols-2 gap-2 w-full">
            <button
              onClick={handleAccept}
              disabled={actionLoading}
              className="h-9 rounded-[10px] text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors disabled:opacity-40"
            >
              Kabul et
            </button>
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="h-9 rounded-[10px] text-[11px] font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/15 transition-colors disabled:opacity-40"
            >
              Reddet
            </button>
          </div>
          {renderSearchSecondaryActions()}
        </div>
      );
    }

    if (rel === 'outgoing') {
      return (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => triggerConfirm('cancel')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.16)]"
            style={{ color: 'var(--theme-accent)', background: 'rgba(var(--theme-accent-rgb), 0.10)' }}
            title="İsteği iptal et"
            aria-label="İsteği iptal et"
          >
            <Clock size={16} />
          </button>
          {renderSearchDmButton()}
          {renderSearchInviteButton()}
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => triggerConfirm('send')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.16)]"
          style={{ color: 'var(--theme-accent)', background: 'rgba(var(--theme-accent-rgb), 0.10)' }}
          title="Arkadaşlık isteği gönder"
          aria-label="Arkadaşlık isteği gönder"
        >
          <UserPlus size={16} />
        </button>
        {renderSearchDmButton()}
        {renderSearchInviteButton()}
      </div>
    );
  };

  if (isSearchMinimal) {
    return (
      <>
        <div className="fixed inset-0 z-[150]" onClick={onClose} />
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'fixed', top: Math.max(12, y), left: x, zIndex: 151, width: POPUP_W }}
          className="rounded-[18px] overflow-hidden group/card transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-[2px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="relative surface-floating"
            style={{
              borderRadius: 18,
              backdropFilter: 'blur(14px) saturate(125%)',
              WebkitBackdropFilter: 'blur(14px) saturate(125%)',
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(ellipse_at_35%_-10%,rgba(var(--theme-accent-rgb),0.09),transparent_55%)]" />
            <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-white/[0.10]" />
            <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-transparent group-hover/card:ring-[rgba(var(--theme-accent-rgb),0.22)] transition-[box-shadow] duration-200" />

            <div className="flex flex-col items-center px-5 pt-6 pb-5">
              <div
                className="mb-4 overflow-hidden flex items-center justify-center avatar-squircle"
                style={{
                  width: 68,
                  height: 68,
                  background: 'rgba(var(--theme-accent-rgb), 0.06)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.18), inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 10px -2px rgba(0,0,0,0.22)',
                }}
              >
                {hasImage || user.avatar ? (
                  <AvatarContent
                    avatar={user.avatar}
                    statusText={statusText}
                    firstName={user.displayName || user.firstName}
                    name={userName}
                    letterClassName="text-[24px] font-semibold tracking-tight"
                  />
                ) : (
                  <UserIcon size={30} className="text-[var(--theme-secondary-text)] opacity-30" strokeWidth={1.5} />
                )}
              </div>

              <h3
                className="max-w-full text-center text-[15px] font-semibold leading-snug mb-2.5 whitespace-normal"
                style={{ color: 'var(--theme-text)', overflowWrap: 'anywhere' }}
              >
                {userName}
              </h3>

              {renderSearchBadges()}

              {renderSearchFriendAction()}
            </div>
          </div>
        </motion.div>
      </>
    );
  }


  return (
    <>
      <div className="fixed inset-0 z-[150]" onClick={onClose} />
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -4 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'fixed', top: Math.max(12, y), left: x, zIndex: 151, width: POPUP_W }}
        className="rounded-[18px] overflow-hidden group/card transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-[2px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative surface-floating"
          style={{
            borderRadius: 18,
            backdropFilter: 'blur(14px) saturate(125%)',
            WebkitBackdropFilter: 'blur(14px) saturate(125%)',
          }}
        >
          {/* Üst ambient ışık — hafif asimetrik, ışık kaynağı hissi */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(ellipse_at_35%_-10%,rgba(var(--theme-accent-rgb),0.09),transparent_55%)]" />
          {/* Üst kenar — crisp hairline (solid, gradient değil) */}
          <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-white/[0.10]" />
          {/* Hover: ring + shadow lift */}
          <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-transparent group-hover/card:ring-[rgba(var(--theme-accent-rgb),0.22)] transition-[box-shadow] duration-200" />

          {/* Profile area */}
          <div className="flex flex-col items-center pt-6 pb-3 px-5">
            {/* Avatar */}
            <div className="relative mb-3.5">
              {(() => {
                const isSelf = user.id === currentUser.id;
                const uColor = isSelf ? avatarBorderColor : (user.avatarBorderColor || '');
                const ft = getFrameTier(
                  isSelf ? currentUser.userLevel : user.userLevel,
                  isSelf
                    ? { isPrimaryAdmin: !!currentUser.isPrimaryAdmin, isAdmin: !!currentUser.isAdmin }
                    : { isPrimaryAdmin: !!user.isPrimaryAdmin, isAdmin: !!user.isAdmin },
                );
                const hasFrame = !!uColor;
                return (
              <div
                className={`relative ${hasFrame ? getFrameClassName(ft) : ''}`}
                style={hasFrame ? { ...getFrameStyle(uColor, ft), borderRadius: '22%' } : undefined}
              >
              <div
                className="overflow-hidden flex items-center justify-center avatar-squircle relative"
                style={{
                  width: 72,
                  height: 72,
                  background: 'rgba(var(--theme-accent-rgb), 0.06)',
                  ...(!hasFrame ? {
                    boxShadow: isOnline
                      ? 'inset 0 0 0 1.5px rgba(var(--theme-accent-rgb),0.55),' +
                        ' inset 0 1px 0 rgba(255,255,255,0.10),' +
                        ' 0 4px 10px -2px rgba(0,0,0,0.25)'
                      : 'inset 0 0 0 1px rgba(var(--glass-tint),0.18),' +
                        ' inset 0 1px 0 rgba(255,255,255,0.05),' +
                        ' 0 4px 10px -2px rgba(0,0,0,0.22)',
                  } : {}),
                  transition: 'box-shadow 0.2s ease-out',
                }}
              >
                {hasImage || user.avatar ? (
                  <AvatarContent
                    avatar={user.avatar}
                    statusText={statusText}
                    firstName={user.displayName || user.firstName}
                    name={userName}
                    letterClassName="text-[26px] font-semibold tracking-tight"
                  />
                ) : (
                  <UserIcon size={32} className="text-[var(--theme-secondary-text)] opacity-30" strokeWidth={1.5} />
                )}
              </div>
              </div>
                ); })()}
              {isMe && (
                <span
                  className="absolute -top-1 -right-1 text-[8px] font-semibold px-1.5 py-[2px] rounded-full leading-none tracking-wider"
                  style={{
                    background: 'var(--theme-badge-bg)',
                    color: 'var(--theme-badge-text)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  }}
                >
                  SEN
                </span>
              )}
            </div>

            {/* Name + role */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="font-semibold text-[15px] leading-tight tracking-[-0.01em]"
                style={{ color: 'var(--theme-text)' }}
              >
                {userName}
              </span>
              {user.isAdmin && (
                <ShieldCheck size={13} className="text-[var(--theme-accent)] shrink-0" strokeWidth={2.5} />
              )}
              {!user.isAdmin && user.isModerator && (
                <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-[13px] h-[13px] shrink-0"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
              )}
            </div>

            {/* Status text — secondary tier */}
            <div className={`text-[11px] font-medium tracking-wide ${statusColor} mb-2.5`}>
              {statusText}
            </div>

            {(serverName || user.gameActivity) && (
              <div className="w-full mb-2.5 space-y-1.5">
                {serverName && (
                  <div className="flex items-center justify-center gap-1.5 min-w-0 text-[11px] font-semibold text-[var(--theme-text)]/85">
                    <ServerIcon size={11} className="shrink-0 text-[var(--theme-accent)]/75" />
                    <span className="truncate">{serverName}</span>
                  </div>
                )}
                {user.gameActivity && (
                  <div className="flex items-center justify-center gap-1.5 min-w-0 text-[10.5px] font-medium text-[var(--theme-secondary-text)]/80">
                    <Gamepad2 size={11} className="shrink-0 text-[var(--theme-accent)]/65" />
                    <span className="truncate">{user.gameActivity}</span>
                  </div>
                )}
              </div>
            )}

            {/* Meta chips — hairline, borderless */}
            <div className="flex flex-wrap items-center justify-center gap-1 mb-2.5">
              {user.platform && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-[3px] rounded-full text-[var(--theme-secondary-text)]/80" style={{ background: 'rgba(var(--glass-tint), 0.05)' }}>
                  {user.platform === 'mobile' ? <Smartphone size={10} strokeWidth={2} /> : <Monitor size={10} strokeWidth={2} />}
                  {user.platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
                </span>
              )}
              {isOnline && user.onlineSince && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-[3px] rounded-full text-[var(--theme-secondary-text)]/80" style={{ background: 'rgba(var(--glass-tint), 0.05)' }}>
                  <Clock size={9} strokeWidth={2} />
                  {formatOnlineDuration(user.onlineSince)}
                </span>
              )}
              {!isOnline && showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-[3px] rounded-full text-[var(--theme-secondary-text)]/80" style={{ background: 'rgba(var(--glass-tint), 0.05)' }}>
                  <History size={9} strokeWidth={2} />
                  {formatLastSeen(user.lastSeenAt)}
                </span>
              )}
              {!isMe && !rel && (
                <button
                  onClick={() => triggerConfirm('send')}
                  className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/12 transition-colors"
                  style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}
                  title="Arkadaş isteği gönder"
                >
                  <UserPlus size={11} strokeWidth={2.2} />
                </button>
              )}
              {!isMe && rel === 'outgoing' && (
                <button
                  onClick={() => triggerConfirm('cancel')}
                  className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-blue-400 hover:bg-blue-500/15 transition-colors"
                  style={{ background: 'rgba(59, 130, 246, 0.08)' }}
                  title="İsteği iptal et"
                >
                  <Clock size={11} strokeWidth={2.2} />
                </button>
              )}
              {!isMe && rel === 'incoming' && (
                <button
                  onClick={handleAccept}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-30"
                  style={{ background: 'rgba(16, 185, 129, 0.08)' }}
                  title="Kabul et"
                >
                  <Check size={11} strokeWidth={2.6} />
                </button>
              )}
            </div>

            {/* Hairline separator — action satırı'ndan önce */}
            {!isMe && (
              <div className="w-full h-px mb-2.5" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint),0.12), transparent)' }} />
            )}

            {/* Quick actions — ikon satırı */}
            {!isMe && (
              <div className="flex items-center justify-center gap-0.5">
                {rel === 'friend' && (
                  <button
                    onClick={async () => {
                      const ok = await toggleFavorite(user.id);
                      if (ok) setToastMsg(userIsFav ? `${userName} favorilerden çıkarıldı` : `${userName} favorilere eklendi`);
                    }}
                    className={`w-9 h-9 rounded-[10px] flex items-center justify-center transition-[color,background-color,transform] duration-150 ease-out hover:scale-[1.04] active:scale-[0.98] ${
                      userIsFav
                        ? 'text-amber-400 hover:bg-amber-400/10'
                        : 'text-[var(--theme-secondary-text)]/60 hover:text-amber-400 hover:bg-amber-400/8'
                    }`}
                    title={userIsFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  >
                    <Star size={15} strokeWidth={2} className={userIsFav ? 'fill-current' : ''} />
                  </button>
                )}

                {canDirectMessage && (
                  <button
                    onClick={() => { onDM?.(user.id); onClose(); }}
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--theme-accent)]/70 hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-[color,background-color,transform] duration-150 ease-out hover:scale-[1.04] active:scale-[0.98]"
                    title="Mesaj gönder"
                  >
                    <MessageSquare size={15} strokeWidth={2} />
                  </button>
                )}

                {canInvite && (
                  inviteStatus === 'pending' ? (
                    <span className="w-9 h-9 rounded-[10px] flex items-center justify-center text-blue-400"><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /></span>
                  ) : inviteStatus === 'accepted' ? (
                    <span className="w-9 h-9 rounded-[10px] flex items-center justify-center text-emerald-400"><Check size={15} strokeWidth={2.4} /></span>
                  ) : inviteStatus === 'rejected' ? (
                    <span className="w-9 h-9 rounded-[10px] flex items-center justify-center text-red-400"><X size={15} strokeWidth={2.4} /></span>
                  ) : (
                    <button
                      disabled={onCooldown}
                      onClick={() => onInvite?.()}
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center text-emerald-400/75 hover:text-emerald-400 hover:bg-emerald-500/10 transition-[color,background-color,transform] duration-150 ease-out hover:scale-[1.04] active:scale-[0.98] disabled:opacity-25 disabled:cursor-default"
                      title={onCooldown ? `${cooldownRemaining}s` : 'Odaya davet et'}
                    >
                      <PhoneCall size={15} strokeWidth={2} />
                    </button>
                  )
                )}

                {rel === 'friend' && (
                  <button
                    onClick={() => triggerConfirm('remove')}
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/8 transition-[color,background-color,transform] duration-150 ease-out hover:scale-[1.04] active:scale-[0.98]"
                    title="Arkadaşı sil"
                  >
                    <UserMinus size={15} strokeWidth={2} />
                  </button>
                )}
                {rel === 'incoming' && (
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-[color,background-color,transform] duration-150 ease-out hover:scale-[1.04] active:scale-[0.98] disabled:opacity-30"
                    title="Reddet"
                  >
                    <X size={15} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      </motion.div>

    </>
  );
}
