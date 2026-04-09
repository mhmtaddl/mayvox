import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Monitor, Smartphone, Clock, History, User as UserIcon, UserPlus, UserMinus, Check, X, Star, MessageSquare } from 'lucide-react';
import type { User } from '../types';
import { isOutdated } from '../features/update/compareVersions';
import { formatFullName } from '../lib/formatName';
import { useSettings } from '../contexts/SettingsCtx';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useFavoriteFriends } from '../hooks/useFavoriteFriends';
import MiniConfirm from './MiniConfirm';

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
}

const POPUP_W = 240;
const POPUP_H = 340;

const formatOnlineDuration = (onlineSince: number) => {
  const mins = Math.floor((Date.now() - onlineSince) / 60000);
  if (mins < 1) return '< 1 dk';
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
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

const formatTotalUsage = (minutes: number) => {
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
};

export default function UserProfilePopup({
  user, position, onClose, onInvite, onDM, canInvite, inviteStatus,
  onCooldown, cooldownRemaining, isMe, currentAppVersion,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const { showLastSeen } = useSettings();
  const { getRelationship, sendRequest, acceptRequest, rejectRequest, cancelRequest, removeFriend, currentUser } = useUser();
  const { setToastMsg } = useUI();
  const { isFavorite, toggleFavorite } = useFavoriteFriends(currentUser.id || undefined);
  const userIsFav = isFavorite(user.id);

  const [miniConfirm, setMiniConfirm] = useState<{ isOpen: boolean; action: 'send' | 'remove' | 'cancel' }>({ isOpen: false, action: 'send' });
  const [actionLoading, setActionLoading] = useState(false);

  const rel = getRelationship(user.id);

  const hasImage = !!user.avatar?.startsWith('http');
  const x = Math.min(position.x + 8, window.innerWidth - POPUP_W - 16);
  const y = Math.min(position.y - 40, window.innerHeight - POPUP_H - 16);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!user.onlineSince) return;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [user.onlineSince]);

  const isOnline = user.status === 'online';
  const statusText = isOnline ? (user.statusText || 'Aktif') : 'Çevrimdışı';
  const statusColor = !isOnline ? 'text-[var(--theme-secondary-text)]/50' : statusText === 'Aktif' ? 'text-emerald-400' : statusText === 'Pasif' ? 'text-yellow-400' : statusText === 'Duymuyor' ? 'text-red-400' : statusText === 'AFK' ? 'text-violet-400' : 'text-orange-400';
  const statusDotColor = !isOnline ? 'bg-[var(--theme-secondary-text)]/30' : statusText === 'Aktif' ? 'bg-emerald-500' : statusText === 'Pasif' ? 'bg-yellow-500' : statusText === 'Duymuyor' ? 'bg-red-500' : statusText === 'AFK' ? 'bg-violet-500' : 'bg-orange-500';

  const hasVersion = !!user.appVersion;
  const outdated = !hasVersion || (currentAppVersion ? isOutdated(user.appVersion!, currentAppVersion) : false);
  const userName = formatFullName(user.firstName, user.lastName);

  const renderInvite = () => {
    if (!canInvite) return null;
    if (inviteStatus === 'pending') return <div className="flex items-center gap-2 text-xs font-bold text-blue-400 py-2 justify-center"><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />Aranıyor...</div>;
    if (inviteStatus === 'accepted') return <span className="text-xs font-bold text-emerald-400 py-2 block text-center">✓ Kabul Edildi</span>;
    if (inviteStatus === 'rejected') return <span className="text-xs font-bold text-red-400 py-2 block text-center">✕ Reddedildi</span>;
    return (
      <button disabled={onCooldown} onClick={() => onInvite?.()} className="w-full py-2.5 btn-primary text-[12px] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform">
        {onCooldown ? `${cooldownRemaining}s` : 'Odaya Davet Et'}
      </button>
    );
  };

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

  const handleMiniConfirm = async () => {
    setActionLoading(true);
    try {
      if (miniConfirm.action === 'send') {
        const ok = await sendRequest(user.id);
        setToastMsg(ok ? 'Arkadaşlık isteği gönderildi' : 'İstek gönderilemedi');
      } else if (miniConfirm.action === 'cancel') {
        const ok = await cancelRequest(user.id);
        setToastMsg(ok ? 'İstek iptal edildi' : 'İşlem başarısız');
      } else {
        const ok = await removeFriend(user.id);
        setToastMsg(ok ? `${userName} arkadaşlarından kaldırıldı` : 'İşlem başarısız');
      }
    } finally {
      setActionLoading(false);
      setMiniConfirm({ isOpen: false, action: 'send' });
    }
  };

  const renderFriendAction = () => {
    if (isMe) return null;

    switch (rel) {
      case 'friend':
        return (
          <button
            onClick={() => setMiniConfirm({ isOpen: true, action: 'remove' })}
            className="w-full py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 rounded-lg transition-all text-red-400/70 hover:text-red-400 hover:bg-red-500/8 border border-red-500/15"
          >
            <UserMinus size={12} /> Arkadaşı sil
          </button>
        );

      case 'outgoing':
        return (
          <button
            onClick={() => setMiniConfirm({ isOpen: true, action: 'cancel' })}
            className="w-full py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 rounded-lg transition-all text-blue-400/60 border border-blue-400/15 hover:border-blue-400/30"
          >
            <Clock size={11} /> İstek gönderildi
          </button>
        );

      case 'incoming':
        return (
          <div className="flex gap-2 w-full">
            <button
              onClick={handleAccept}
              disabled={actionLoading}
              className="flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-1 rounded-lg transition-all text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/15 disabled:opacity-40"
            >
              <Check size={12} strokeWidth={2.5} /> Kabul et
            </button>
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="flex-1 py-2 text-[11px] font-semibold flex items-center justify-center gap-1 rounded-lg transition-all text-red-400/60 hover:text-red-400 hover:bg-red-500/8 border border-red-500/15 disabled:opacity-40"
            >
              <X size={12} /> Reddet
            </button>
          </div>
        );

      default:
        return (
          <button
            onClick={() => setMiniConfirm({ isOpen: true, action: 'send' })}
            className="w-full py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 rounded-lg transition-all text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 border border-[var(--theme-accent)]/15"
          >
            <UserPlus size={12} /> Arkadaş isteği gönder
          </button>
        );
    }
  };

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
        className="rounded-[20px] overflow-hidden group/card transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative"
          style={{
            borderRadius: 18,
            background: 'var(--theme-surface-card)',
            border: `1px solid var(--theme-surface-card-border)`,
            boxShadow: '0 16px 48px rgba(var(--shadow-base),0.4), 0 4px 12px rgba(var(--shadow-base),0.2), inset 0 1px 0 rgba(var(--glass-tint),0.05)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Top radial light */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_50%_0%,rgba(var(--theme-accent-rgb),0.14),transparent_65%)]" />
          {/* Top edge highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--theme-border)] to-transparent" style={{ borderRadius: '20px 20px 0 0', opacity: 0.5 }} />
          {/* Hover glow */}
          <div className="pointer-events-none absolute inset-0 rounded-[18px] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" style={{ boxShadow: '0 0 24px rgba(var(--theme-accent-rgb), 0.08)' }} />

          {/* Profile area */}
          <div className="flex flex-col items-center pt-5 pb-3 px-5">
            {/* Avatar */}
            <div className="relative mb-3">
              <motion.div
                initial={{ scale: 0.85, opacity: 0.2 }}
                animate={{ scale: 1.35, opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="pointer-events-none absolute inset-[-12px] rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.18), transparent 70%)' }}
              />
              <div
                className="overflow-hidden flex items-center justify-center avatar-squircle"
                style={{
                  width: 72,
                  height: 72,
                  border: isOnline ? '2px solid rgba(var(--theme-accent-rgb), 0.35)' : '1px solid rgba(var(--glass-tint), 0.10)',
                  background: 'rgba(var(--theme-accent-rgb), 0.08)',
                  boxShadow: isOnline ? '0 0 20px rgba(var(--theme-accent-rgb), 0.15)' : '0 2px 8px rgba(0,0,0,0.15)',
                  transition: 'border-color 0.3s, box-shadow 0.3s',
                }}
              >
                {hasImage ? (
                  <img src={user.avatar!} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : user.avatar ? (
                  <span className="text-[28px] font-bold" style={{ color: 'var(--theme-text)', opacity: 0.6 }}>{user.avatar}</span>
                ) : (
                  <UserIcon size={36} className="text-[var(--theme-secondary-text)] opacity-30" />
                )}
              </div>
              {/* Status dot */}
              <div className="absolute -bottom-0.5 -right-0.5">
                <div className={`w-4 h-4 rounded-full ${statusDotColor} ring-2 ring-[var(--theme-surface-card)]`} />
                {isOnline && (
                  <div className={`absolute inset-0 rounded-full ${statusDotColor} animate-ping opacity-40`} />
                )}
              </div>
              {isMe && <span className="absolute -top-1.5 -right-1.5 text-[7px] font-bold px-1.5 py-0.5 bg-[var(--theme-badge-bg)] text-[var(--theme-badge-text)] rounded-full leading-none shadow-sm">SEN</span>}
            </div>

            {/* Name + role */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="font-bold text-[16px] leading-tight tracking-wide" style={{ color: 'var(--theme-text)' }}>{userName}</span>
              {user.isAdmin && <ShieldCheck size={14} className="text-[var(--theme-accent)] shrink-0" strokeWidth={2.5} />}
              {!user.isAdmin && user.isModerator && (
                <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-3.5 h-3.5 shrink-0"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
              )}
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                !isOnline
                  ? 'text-[var(--theme-secondary-text)]/60 border-[var(--theme-border)]/50 bg-[var(--theme-surface-card)]/40'
                  : statusText === 'Aktif'
                    ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10'
                    : statusText === 'Pasif'
                      ? 'text-yellow-400 border-yellow-500/25 bg-yellow-500/10'
                      : statusText === 'Duymuyor'
                        ? 'text-red-400 border-red-500/25 bg-red-500/10'
                        : statusText === 'AFK'
                          ? 'text-violet-400 border-violet-500/25 bg-violet-500/10'
                          : 'text-orange-400 border-orange-500/25 bg-orange-500/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
                {statusText}
              </span>
              {user.age && <span className="text-[10px] font-medium" style={{ color: 'var(--theme-secondary-text)', opacity: 0.5 }}>{user.age} yaş</span>}
            </div>

            {/* Meta chips */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
              {user.platform && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--theme-border)]/60 bg-[var(--theme-surface-card)]/60 text-[var(--theme-secondary-text)]">
                  {user.platform === 'mobile' ? <Smartphone size={10} /> : <Monitor size={10} />}
                  {user.platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
                </span>
              )}
              {isOnline && user.onlineSince && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--theme-border)]/60 bg-[var(--theme-surface-card)]/60 text-[var(--theme-secondary-text)]">
                  <Clock size={9} />
                  {formatOnlineDuration(user.onlineSince)}
                </span>
              )}
              {!isOnline && showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--theme-border)]/60 bg-[var(--theme-surface-card)]/60 text-[var(--theme-secondary-text)]">
                  <History size={9} />
                  {formatLastSeen(user.lastSeenAt)}
                </span>
              )}
              {hasVersion && (
                <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  outdated
                    ? 'text-red-400/60 border-red-500/20 bg-red-500/6'
                    : 'border-[var(--theme-border)]/40 bg-[var(--theme-surface-card)]/40 text-[var(--theme-secondary-text)]/60'
                }`}>
                  v{user.appVersion}
                </span>
              )}
            </div>

            {/* Favorite toggle — only for accepted friends */}
            {!isMe && rel === 'friend' && (
              <button
                onClick={async () => {
                  const ok = await toggleFavorite(user.id);
                  if (ok) setToastMsg(userIsFav ? `${userName} favorilerden çıkarıldı` : `${userName} favorilere eklendi`);
                }}
                className={`w-full py-1.5 mb-1.5 text-[10px] font-medium flex items-center justify-center gap-1.5 rounded-lg transition-all ${
                  userIsFav
                    ? 'text-amber-400/70 hover:bg-amber-400/8 border border-amber-400/15'
                    : 'text-[var(--theme-secondary-text)]/40 hover:text-amber-400/70 hover:bg-amber-400/6 border border-transparent'
                }`}
              >
                <Star size={10} className={userIsFav ? 'fill-amber-400/70' : ''} />
                {userIsFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              </button>
            )}

            {/* DM — only for accepted friends */}
            {!isMe && rel === 'friend' && onDM && (
              <button
                onClick={() => { onDM(user.id); onClose(); }}
                className="w-full py-2 mb-1.5 text-[11px] font-semibold flex items-center justify-center gap-1.5 rounded-lg transition-all text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 border border-[var(--theme-accent)]/15"
              >
                <MessageSquare size={12} /> Mesaj gönder
              </button>
            )}

            {/* Friend action */}
            {renderFriendAction()}

            {/* Invite action */}
            {canInvite && <div className="mt-2">{renderInvite()}</div>}
          </div>
        </div>
      </motion.div>

      {/* Mini confirm for send/remove/cancel */}
      <MiniConfirm
        isOpen={miniConfirm.isOpen}
        title={
          miniConfirm.action === 'send' ? 'Arkadaş isteği gönder'
          : miniConfirm.action === 'cancel' ? 'İsteği iptal et'
          : 'Arkadaşı kaldır'
        }
        description={
          miniConfirm.action === 'send' ? `${userName} kullanıcısına istek gönderilsin mi?`
          : miniConfirm.action === 'cancel' ? `${userName} kullanıcısına gönderilen istek iptal edilsin mi?`
          : `${userName} kullanıcısını arkadaşlarından kaldırmak istiyor musun?`
        }
        confirmText={
          miniConfirm.action === 'send' ? 'Gönder'
          : miniConfirm.action === 'cancel' ? 'İptal et'
          : 'Kaldır'
        }
        onConfirm={handleMiniConfirm}
        onCancel={() => setMiniConfirm({ isOpen: false, action: 'send' })}
        danger={miniConfirm.action === 'remove'}
        loading={actionLoading}
      />
    </>
  );
}
