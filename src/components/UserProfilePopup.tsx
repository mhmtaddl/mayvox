import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Shield, Monitor, Clock, History, Activity } from 'lucide-react';
import type { User } from '../types';
import { isOutdated } from '../lib/versionCompare';

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

const POPUP_W = 224;
const POPUP_H = 310;

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

  const x = Math.min(position.x + 8, window.innerWidth - POPUP_W - 12);
  const y = Math.min(position.y + 8, window.innerHeight - POPUP_H - 12);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 30s timer — online duration canlı güncellenir
  useEffect(() => {
    if (!user.onlineSince) return;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [user.onlineSince]);

  const statusDot = () => {
    if (user.status !== 'online') return 'bg-[var(--theme-border)]';
    const s = user.statusText;
    if (!s || s === 'Aktif') return 'bg-emerald-500';
    if (s === 'Telefonda') return 'bg-red-500';
    if (s === 'Hemen Geleceğim' || s.includes('Sonra')) return 'bg-orange-500';
    return 'bg-emerald-500';
  };

  const renderInvite = () => {
    if (!canInvite) return null;
    if (inviteStatus === 'pending') return (
      <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
        Aranıyor...
      </div>
    );
    if (inviteStatus === 'accepted') return (
      <span className="text-xs font-bold text-emerald-400">✓ Kabul Edildi</span>
    );
    if (inviteStatus === 'rejected') return (
      <span className="text-xs font-bold text-red-400">✕ Reddedildi</span>
    );
    return (
      <button
        disabled={onCooldown}
        onClick={() => onInvite?.()}
        className="w-full px-3 py-2 rounded-xl text-xs font-bold transition-all bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-white border border-[var(--theme-accent)]/25 disabled:opacity-40 disabled:cursor-not-allowed"
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
        initial={{ opacity: 0, scale: 0.94, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -6 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'fixed', top: y, left: x, zIndex: 151, width: POPUP_W }}
        className="bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner + avatar */}
        <div className="relative h-14 bg-gradient-to-br from-[var(--theme-accent)]/25 to-[var(--theme-sidebar)]" />
        <div className="absolute top-6 left-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--theme-accent)]/20 border-[3px] border-[var(--theme-bg)] overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-xl shadow-lg">
            {user.avatar?.startsWith('http')
              ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span>{user.avatar}</span>}
          </div>
        </div>

        {/* Content */}
        <div className="pt-9 px-4 pb-4">
          {/* Name row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-[var(--theme-text)] leading-tight">
              {user.firstName} {user.lastName}
            </span>
            {user.isAdmin && <ShieldCheck size={12} className="text-[var(--theme-accent)] shrink-0" title="Admin" />}
            {!user.isAdmin && user.isModerator && <span className="text-[10px] font-black text-violet-400 shrink-0" title="Moderatör">M</span>}
            {isMe && (
              <span className="text-[7px] font-bold px-1.5 py-0.5 bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] rounded-full border border-[var(--theme-accent)]/25 leading-none">
                SEN
              </span>
            )}
          </div>
          <div className="text-[10px] text-[var(--theme-secondary-text)] font-medium mt-0.5 mb-3">
            {user.age} yaşında
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5 mb-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot()}`} />
            <span className="text-[11px] font-semibold text-[var(--theme-secondary-text)]">
              {user.status === 'online' ? (user.statusText || 'Aktif') : 'Çevrimdışı'}
            </span>
          </div>

          {/* Meta */}
          {user.appVersion && (() => {
            const outdated = currentAppVersion ? isOutdated(user.appVersion, currentAppVersion) : false;
            return (
              <div className="flex items-center gap-1.5 mb-3">
                <Monitor size={10} className={`shrink-0 ${outdated ? 'text-red-400' : 'text-[var(--theme-secondary-text)]/70'}`} />
                <span className={`text-[10px] ${outdated ? 'text-red-400 font-semibold' : 'text-[var(--theme-secondary-text)]'}`}>v{user.appVersion}</span>
              </div>
            );
          })()}

          {/* Activity stats */}
          {(user.onlineSince || user.lastSeenAt || (user.totalUsageMinutes ?? 0) > 0) && (
            <div className="flex flex-col gap-1 mb-3">
              {user.status === 'online' && user.onlineSince ? (
                <div className="flex items-center gap-1.5" title="Şu anki online süresi">
                  <Clock size={10} className="text-emerald-400/80 shrink-0" />
                  <span className="text-[10px] text-[var(--theme-secondary-text)]">{formatOnlineDuration(user.onlineSince)}</span>
                </div>
              ) : user.lastSeenAt ? (
                <div className="flex items-center gap-1.5" title="Son görülme">
                  <History size={10} className="text-[var(--theme-secondary-text)]/70 shrink-0" />
                  <span className="text-[10px] text-[var(--theme-secondary-text)]">{formatLastSeen(user.lastSeenAt)}</span>
                </div>
              ) : null}
              {(user.totalUsageMinutes ?? 0) > 0 && (
                <div className="flex items-center gap-1.5" title="Toplam kullanım süresi">
                  <Activity size={10} className="text-[var(--theme-secondary-text)]/70 shrink-0" />
                  <span className="text-[10px] text-[var(--theme-secondary-text)]">{formatTotalUsage(user.totalUsageMinutes!)}</span>
                </div>
              )}
            </div>
          )}

          {/* Action */}
          {canInvite && (
            <>
              <div className="border-t border-[var(--theme-border)] mb-3" />
              {renderInvite()}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
