import React from 'react';
import { motion } from 'motion/react';
import { Clock } from 'lucide-react';

interface Props {
  menu: { userId: string; x: number; y: number };
  currentUserId: string;
  userVolumes: Record<string, number>;
  onUpdateVolume: (userId: string, volume: number) => void;
  // Broadcast speaker toggle
  activeChannel: string | null;
  channels: Array<{ id: string; mode?: string; ownerId?: string; speakerIds?: string[]; members?: string[] }>;
  allUsers: Array<{ id: string; name: string }>;
  onToggleSpeaker: (userId: string) => void;
  // Invite
  inviteStatuses: Record<string, string>;
  inviteCooldowns: Record<string, number>;
  onInvite: (userId: string) => void;
  onClose: () => void;
}

export default function ChatViewUserActionMenu({
  menu,
  currentUserId,
  userVolumes,
  onUpdateVolume,
  activeChannel,
  channels,
  allUsers,
  onToggleSpeaker,
  inviteStatuses,
  inviteCooldowns,
  onInvite,
  onClose,
}: Props) {
  const uid = menu.userId;
  const activeCh = channels.find(c => c.id === activeChannel);
  // members listesi hem LiveKit identity (user.name) hem user.id içerebilir
  // (codebase'de tutarsız). İki kontrolü birden yap.
  const targetUserName = allUsers.find(u => u.id === uid)?.name;
  const isInRoom = !!(
    activeCh?.members?.includes(uid) ||
    (targetUserName && activeCh?.members?.includes(targetUserName))
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={(e) => {
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        el.style.setProperty('--my', `${e.clientY - rect.top}px`);
        el.style.setProperty('--glow-opacity', '1');
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.setProperty('--glow-opacity', '0');
      }}
      style={{
        position: 'fixed',
        top: Math.min(window.innerHeight - 120, menu.y),
        left: menu.x + 10,
        zIndex: 100,
        '--mx': '50%',
        '--my': '0%',
        '--glow-opacity': '0',
      } as React.CSSProperties}
      className="relative w-52 rounded-2xl overflow-hidden border border-white/[0.08] p-2.5 flex flex-col gap-1.5 bg-gradient-to-br from-[var(--theme-bg)] to-[var(--theme-surface-card)] shadow-[0_10px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top radial light (static) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(ellipse_at_50%_0%,rgba(var(--theme-accent-rgb),0.12),transparent_70%)]" />

      {/* Cursor-follow light */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          background: 'radial-gradient(circle 120px at var(--mx) var(--my), rgba(var(--theme-accent-rgb), 0.08), transparent 70%)',
          opacity: 'var(--glow-opacity)',
        }}
      />

      {/* Volume slider */}
      {uid !== currentUserId && (
        <div className={`relative flex flex-col gap-2 p-2 ${activeChannel && !isInRoom && uid !== currentUserId ? 'border-b border-white/[0.06]' : ''}`}>
          <span className="text-[9px] uppercase font-bold text-[var(--theme-secondary-text)]/70 tracking-widest">Ses Ayarı</span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="150"
              value={userVolumes[uid] ?? 100}
              onChange={(e) => onUpdateVolume(uid, parseInt(e.target.value))}
              className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent)]"
            />
            <span className="text-[11px] font-bold text-[var(--theme-accent)] w-10 text-right tabular-nums">%{userVolumes[uid] ?? 100}</span>
          </div>
        </div>
      )}

      {/* Broadcast speaker toggle */}
      {(() => {
        if (!activeCh || activeCh.mode !== 'broadcast' || activeCh.ownerId !== currentUserId) return null;
        if (uid === currentUserId) return null;
        const speakers = activeCh.speakerIds || [];
        const isSpeaker = speakers.includes(uid);
        return (
          <button
            onClick={() => { onToggleSpeaker(uid); onClose(); }}
            className={`w-full text-left px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 active:scale-95 ${
              isSpeaker
                ? 'text-orange-400 bg-orange-500/5 border border-orange-500/15 hover:bg-orange-500/10'
                : 'text-emerald-400 bg-emerald-500/5 border border-emerald-500/15 hover:bg-emerald-500/10'
            }`}
          >
            {isSpeaker ? 'Dinleyiciye Al' : 'Konuşmacı Yap'}
          </button>
        );
      })()}

      {/* Invite button */}
      {activeChannel && !isInRoom && uid !== currentUserId && (() => {
        const status = inviteStatuses[uid];
        const cooldownUntil = inviteCooldowns[uid];
        const onCooldown = !!(cooldownUntil && Date.now() < cooldownUntil);
        const remaining = onCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;

        if (status === 'pending') {
          return (
            <button disabled className="relative w-full text-left px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 text-blue-400 cursor-default bg-blue-500/5 border border-blue-500/10">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Aranıyor...
            </button>
          );
        }
        if (status === 'accepted') {
          return (
            <button disabled className="w-full text-left px-3 py-2 text-xs font-bold rounded-xl text-emerald-400 cursor-default bg-emerald-500/5 border border-emerald-500/10">
              ✓ Kabul Edildi
            </button>
          );
        }
        if (status === 'rejected') {
          return (
            <button disabled className="w-full text-left px-3 py-2 text-xs font-bold rounded-xl text-red-400 cursor-default bg-red-500/5 border border-red-500/10">
              ✕ Reddedildi
            </button>
          );
        }
        return (
          <div>
            <button
              disabled={onCooldown}
              onClick={() => { onInvite(uid); onClose(); }}
              className="w-full text-left px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-badge-text)] active:scale-95 bg-[rgba(var(--glass-tint),0.03)] border border-[rgba(var(--glass-tint),0.06)] hover:border-transparent hover:shadow-[0_0_20px_rgba(var(--theme-accent-rgb),0.2)]"
            >
              Davet Et
            </button>
            {onCooldown && (
              <p className="text-[10px] text-orange-400 px-3 pb-1">
                {remaining}s sonra tekrar davet edebilirsiniz.
              </p>
            )}
          </div>
        );
      })()}
    </motion.div>
  );
}
