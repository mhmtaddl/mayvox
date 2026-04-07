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

const POPUP_W = 230;
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
      <button disabled={onCooldown} onClick={() => onInvite?.()} className="w-full py-2.5 btn-primary text-[12px] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
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
        className="rounded-[20px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-surface" style={{ borderRadius: 18 }}>
          {/* Top light gradient */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" style={{ borderRadius: '20px 20px 0 0' }} />

          {/* Profile image area */}
          <div className="flex flex-col items-center pt-5 pb-3 px-4">
            {/* Avatar */}
            <div className="relative mb-3">
              <div className="overflow-hidden flex items-center justify-center avatar-squircle" style={{ width: 68, height: 68, border: '1px solid rgba(var(--glass-tint), 0.08)', background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
                {hasImage ? (
                  <img src={user.avatar!} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : user.avatar ? (
                  <span className="text-[28px] font-bold text-white/60">{user.avatar}</span>
                ) : (
                  <UserIcon size={36} className="text-white/20" />
                )}
              </div>
              {/* Status dot */}
              <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${statusDotColor} ring-2`} style={{ ringColor: 'rgba(20,20,30,0.8)' }} />
              {/* "SEN" badge */}
              {isMe && <span className="absolute -top-1 -right-1 text-[7px] font-bold px-1.5 py-0.5 bg-[var(--theme-accent)]/60 text-white rounded-full leading-none">SEN</span>}
            </div>

            {/* Name + role */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-[16px] text-[#F2F2F2] leading-tight">{formatFullName(user.firstName, user.lastName)}</span>
              {user.isAdmin && <ShieldCheck size={14} className="text-[var(--theme-accent)] shrink-0" strokeWidth={2.5} />}
              {!user.isAdmin && user.isModerator && (
                <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-3.5 h-3.5 shrink-0"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center gap-1.5 mb-4">
              <span className={`text-[12px] font-medium ${statusColor}`}>{statusText}</span>
              {user.age && <span className="text-[11px] text-white/30">• {user.age} yaşında</span>}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-[11px] text-white/50 mb-4">
              {user.platform && (
                <div className="flex items-center gap-1">
                  {user.platform === 'mobile' ? <Smartphone size={11} /> : <Monitor size={11} />}
                  <span>{user.platform === 'mobile' ? 'Mobil' : 'Masaüstü'}</span>
                </div>
              )}
              {isOnline && user.onlineSince && (
                <div className="flex items-center gap-1">
                  <Clock size={10} />
                  <span>{formatOnlineDuration(user.onlineSince)}</span>
                </div>
              )}
              {!isOnline && showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
                <div className="flex items-center gap-1">
                  <History size={10} />
                  <span>{formatLastSeen(user.lastSeenAt)}</span>
                </div>
              )}
            </div>

            {/* Invite action */}
            {canInvite && renderInvite()}
          </div>

          {/* Version — bottom right, very subtle */}
          {hasVersion && (
            <div className="absolute bottom-2 right-3">
              <span className={`text-[9px] ${outdated ? 'text-red-400/50' : 'text-white/20'}`}>v{user.appVersion}</span>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
