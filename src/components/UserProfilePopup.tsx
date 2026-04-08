import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Monitor, Smartphone, Clock, History, Activity, User as UserIcon } from 'lucide-react';
import type { User } from '../types';
import { isOutdated } from '../features/update/compareVersions';
import { formatFullName } from '../lib/formatName';
import { useSettings } from '../contexts/SettingsCtx';

interface Props {
  user: User;
  position: { x: number; y: number };
  onClose: () => void;
  onInvite?: () => void;
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
  user, position, onClose, onInvite, canInvite, inviteStatus,
  onCooldown, cooldownRemaining, isMe, currentAppVersion,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const { showLastSeen } = useSettings();

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
  const statusColor = !isOnline ? 'text-white/40' : statusText === 'Aktif' ? 'text-emerald-400' : statusText === 'Telefonda' ? 'text-red-400' : 'text-orange-400';
  const statusDotColor = !isOnline ? 'bg-white/20' : statusText === 'Aktif' ? 'bg-emerald-500' : statusText === 'Telefonda' ? 'bg-red-500' : 'bg-orange-500';

  const hasVersion = !!user.appVersion;
  const outdated = !hasVersion || (currentAppVersion ? isOutdated(user.appVersion!, currentAppVersion) : false);

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
            background: 'var(--popover-bg)',
            border: `1px solid var(--popover-border)`,
            boxShadow: 'var(--popover-shadow), inset 0 1px 0 rgba(255,255,255,0.05)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Top radial light */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_50%_0%,rgba(var(--theme-accent-rgb),0.14),transparent_65%)]" />
          {/* Top edge highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--theme-border)] to-transparent" style={{ borderRadius: '20px 20px 0 0', opacity: 0.5 }} />
          {/* Hover glow — only on hover */}
          <div className="pointer-events-none absolute inset-0 rounded-[18px] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" style={{ boxShadow: '0 0 24px rgba(var(--theme-accent-rgb), 0.08)' }} />

          {/* Profile area */}
          <div className="flex flex-col items-center pt-5 pb-3 px-5">
            {/* Avatar */}
            <div className="relative mb-3">
              {/* Mount ripple — tek seferlik, avatar merkezinden */}
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
                  <span className="text-[28px] font-bold" style={{ color: 'var(--popover-text)', opacity: 0.6 }}>{user.avatar}</span>
                ) : (
                  <UserIcon size={36} className="text-white/20" />
                )}
              </div>
              {/* Status dot — pulse for online */}
              <div className="absolute -bottom-0.5 -right-0.5">
                <div className={`w-4 h-4 rounded-full ${statusDotColor} ring-2 ring-[var(--popover-bg)]`} />
                {isOnline && (
                  <div className={`absolute inset-0 rounded-full ${statusDotColor} animate-ping opacity-40`} />
                )}
              </div>
              {/* "SEN" badge */}
              {isMe && <span className="absolute -top-1.5 -right-1.5 text-[7px] font-bold px-1.5 py-0.5 bg-[var(--theme-accent)] text-white rounded-full leading-none shadow-sm">SEN</span>}
            </div>

            {/* Name + role */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="font-bold text-[16px] leading-tight tracking-wide" style={{ color: 'var(--popover-text)' }}>{formatFullName(user.firstName, user.lastName)}</span>
              {user.isAdmin && <ShieldCheck size={14} className="text-[var(--theme-accent)] shrink-0" strokeWidth={2.5} />}
              {!user.isAdmin && user.isModerator && (
                <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-3.5 h-3.5 shrink-0"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
              )}
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                !isOnline
                  ? 'text-[var(--popover-text-secondary)]/60 border-[var(--theme-border)]/50 bg-[var(--theme-surface-card)]/40'
                  : statusText === 'Aktif'
                    ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10'
                    : statusText === 'Telefonda'
                      ? 'text-red-400 border-red-500/25 bg-red-500/10'
                      : 'text-orange-400 border-orange-500/25 bg-orange-500/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
                {statusText}
              </span>
              {user.age && <span className="text-[10px] font-medium" style={{ color: 'var(--popover-text-secondary)', opacity: 0.5 }}>{user.age} yaş</span>}
            </div>

            {/* Meta chips */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
              {user.platform && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--theme-border)]/60 bg-[var(--theme-surface-card)]/60 text-[var(--popover-text-secondary)]">
                  {user.platform === 'mobile' ? <Smartphone size={10} /> : <Monitor size={10} />}
                  {user.platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
                </span>
              )}
              {isOnline && user.onlineSince && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--theme-border)]/60 bg-[var(--theme-surface-card)]/60 text-[var(--popover-text-secondary)]">
                  <Clock size={9} />
                  {formatOnlineDuration(user.onlineSince)}
                </span>
              )}
              {!isOnline && showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--theme-border)]/60 bg-[var(--theme-surface-card)]/60 text-[var(--popover-text-secondary)]">
                  <History size={9} />
                  {formatLastSeen(user.lastSeenAt)}
                </span>
              )}
              {hasVersion && (
                <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  outdated
                    ? 'text-red-400/60 border-red-500/20 bg-red-500/6'
                    : 'border-[var(--theme-border)]/40 bg-[var(--theme-surface-card)]/40 text-[var(--popover-text-secondary)]/60'
                }`}>
                  v{user.appVersion}
                </span>
              )}
            </div>

            {/* Invite action */}
            {canInvite && renderInvite()}
          </div>
        </div>
      </motion.div>
    </>
  );
}
