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

const POPUP_W = 260;
const POPUP_H = 400;

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
  user,
  position,
  onClose,
  onInvite,
  canInvite,
  inviteStatus,
  onCooldown,
  cooldownRemaining,
  isMe,
  currentAppVersion,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const { showLastSeen } = useSettings();

  const hasImage = !!user.avatar?.startsWith('http');

  // Position — keep within viewport
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

  const statusDotColor =
    !isOnline ? 'bg-[var(--theme-border)]'
    : statusText === 'Aktif' ? 'bg-emerald-500'
    : statusText === 'Telefonda' ? 'bg-red-500'
    : statusText === 'Hemen Geleceğim' || statusText.includes('Sonra') ? 'bg-orange-500'
    : 'bg-emerald-500';

  const hasVersion = !!user.appVersion;
  const outdated = !hasVersion || (currentAppVersion ? isOutdated(user.appVersion!, currentAppVersion) : false);

  const renderInvite = () => {
    if (!canInvite) return null;
    if (inviteStatus === 'pending') return (
      <div className="flex items-center gap-2 text-xs font-bold text-blue-400 py-2 justify-center">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
        Aranıyor...
      </div>
    );
    if (inviteStatus === 'accepted') return (
      <span className="text-xs font-bold text-emerald-400 py-2 block text-center">✓ Kabul Edildi</span>
    );
    if (inviteStatus === 'rejected') return (
      <span className="text-xs font-bold text-red-400 py-2 block text-center">✕ Reddedildi</span>
    );
    return (
      <button
        disabled={onCooldown}
        onClick={() => onInvite?.()}
        className="w-full py-2 rounded-xl text-[11px] font-bold transition-all bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-btn-primary-text)] border border-[var(--theme-accent)]/25 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {onCooldown ? `${cooldownRemaining}s` : 'Odaya Davet Et'}
      </button>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[150]" onClick={onClose} />
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.92, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'fixed', top: Math.max(12, y), left: x, zIndex: 151, width: POPUP_W }}
        className="rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Portrait hero area ── */}
        <div className="relative" style={{ height: 200 }}>
          {hasImage ? (
            <img
              src={user.avatar!}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            /* Placeholder hero — large icon + accent gradient */
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, rgba(var(--theme-accent-rgb), 0.2) 0%, rgba(var(--theme-accent-rgb), 0.05) 100%)',
              }}
            >
              {user.avatar ? (
                <span className="text-[64px] font-bold text-[var(--theme-text)] opacity-60 select-none">
                  {user.avatar}
                </span>
              ) : (
                <UserIcon size={80} className="text-[var(--theme-accent)] opacity-20" strokeWidth={1} />
              )}
            </div>
          )}

          {/* Dark gradient overlay for text readability */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
            }}
          />

          {/* Status dot — top right */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${statusDotColor} ring-2 ring-black/30`} />
          </div>

          {/* "SEN" badge — top left */}
          {isMe && (
            <div className="absolute top-3 left-3">
              <span className="text-[8px] font-bold px-2 py-0.5 bg-[var(--theme-accent)]/80 text-white rounded-full leading-none">
                SEN
              </span>
            </div>
          )}

          {/* Identity overlay — bottom of hero */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            {/* Name + role */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[15px] text-white leading-tight drop-shadow-lg">
                {formatFullName(user.firstName, user.lastName)}
              </span>
              {user.isAdmin && (
                <span className="shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center bg-white/15 backdrop-blur-sm">
                  <ShieldCheck size={11} className="text-[var(--theme-accent)]" strokeWidth={2.5} />
                </span>
              )}
              {!user.isAdmin && user.isModerator && (
                <span className="shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center bg-violet-500/20 backdrop-blur-sm">
                  <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-2.5 h-2.5"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
                </span>
              )}
            </div>
            {/* Age + status */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-white/60 font-medium">{user.age} yaşında</span>
              <span className="text-white/25">·</span>
              <span className="text-[11px] text-white/70 font-semibold">{statusText}</span>
            </div>
          </div>
        </div>

        {/* ── Info section ── */}
        <div
          className="px-4 py-3 flex flex-col gap-2"
          style={{
            background: 'var(--theme-surface-card)',
            borderTop: '1px solid rgba(var(--glass-tint), 0.04)',
          }}
        >
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {/* Platform */}
            {user.platform && (
              <div className="flex items-center gap-1.5">
                {user.platform === 'mobile'
                  ? <Smartphone size={11} className="text-[var(--theme-accent)] opacity-70 shrink-0" />
                  : <Monitor size={11} className="text-[var(--theme-accent)] opacity-70 shrink-0" />
                }
                <span className="text-[10px] text-[var(--theme-secondary-text)] font-medium">
                  {user.platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
                </span>
              </div>
            )}

            {/* Version */}
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${outdated ? 'bg-red-400' : 'bg-emerald-400'}`} />
              <span className={`text-[10px] font-semibold ${outdated ? 'text-red-400' : 'text-emerald-400'}`}>
                {hasVersion ? `v${user.appVersion}` : 'Eski'}
              </span>
            </div>

            {/* Online duration or last seen */}
            {isOnline && user.onlineSince ? (
              <div className="flex items-center gap-1.5">
                <Clock size={10} className="text-emerald-400/70 shrink-0" />
                <span className="text-[10px] text-[var(--theme-secondary-text)]">{formatOnlineDuration(user.onlineSince)}</span>
              </div>
            ) : !isOnline && showLastSeen && user.showLastSeen !== false && user.lastSeenAt ? (
              <div className="flex items-center gap-1.5">
                <History size={10} className="text-[var(--theme-secondary-text)]/60 shrink-0" />
                <span className="text-[10px] text-[var(--theme-secondary-text)]">{formatLastSeen(user.lastSeenAt)}</span>
              </div>
            ) : null}

            {/* Total usage */}
            {(user.totalUsageMinutes ?? 0) > 0 && (
              <div className="flex items-center gap-1.5">
                <Activity size={10} className="text-[var(--theme-secondary-text)]/60 shrink-0" />
                <span className="text-[10px] text-[var(--theme-secondary-text)]">{formatTotalUsage(user.totalUsageMinutes!)}</span>
              </div>
            )}
          </div>

          {/* Invite action */}
          {canInvite && (
            <>
              <div className="border-t border-[rgba(var(--glass-tint),0.05)] my-0.5" />
              {renderInvite()}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
