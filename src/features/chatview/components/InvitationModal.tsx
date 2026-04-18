import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { PhoneCall, PhoneOff, BellOff, Bell } from 'lucide-react';

interface InvitationData {
  inviterId: string;
  inviterName: string;
  inviterAvatar?: string;
  roomName: string;
  roomId: string;
}

interface Props {
  data: InvitationData;
  onAccept: () => void;
  onDecline: () => void;
  onMute: () => void;
  /** Yalnızca çan ikonunun stilini etkiler — state cb 'ile toggle ayrıştırıldı. */
  isMuted: boolean;
}

// Top-right floating call card — fullscreen overlay değil, non-blocking.
// 35s auto-close timer + missed-call push: ChatView tarafında wire edilir.
export default function InvitationModal({ data, onAccept, onDecline, onMute, isMuted }: Props) {
  return createPortal(
    <motion.div
      initial={{ opacity: 0, x: 20, y: -8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 20, y: -8, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className="fixed top-4 right-4 z-[400] w-[320px] rounded-2xl overflow-hidden pointer-events-auto"
      style={{
        background: 'var(--theme-surface-card, rgba(var(--theme-bg-rgb, 6,10,20), 0.97))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 14px 40px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Header row: avatar + name + inline mute toggle */}
      <div className="px-3.5 pt-3 pb-2 flex items-center gap-3">
        <div className="relative w-11 h-11 shrink-0">
          {!isMuted && (
            <>
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'var(--theme-accent)',
                  opacity: 0.14,
                  animation: 'invitePing 1.6s ease-out infinite',
                }}
              />
              <span
                className="absolute inset-[-4px] rounded-full"
                style={{
                  background: 'var(--theme-accent)',
                  opacity: 0.08,
                  animation: 'invitePing 1.6s ease-out 0.5s infinite',
                }}
              />
              <style>{`
                @keyframes invitePing {
                  0%   { transform: scale(0.85); opacity: 0.16; }
                  70%  { transform: scale(1.4); opacity: 0; }
                  100% { transform: scale(1.4); opacity: 0; }
                }
              `}</style>
            </>
          )}
          <div
            className="relative w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-base font-bold select-none"
            style={{
              background: 'rgba(var(--theme-accent-rgb, 16,185,129), 0.15)',
              border: '1.5px solid var(--theme-accent)',
              color: 'var(--theme-accent)',
            }}
          >
            {data.inviterAvatar?.startsWith('http') ? (
              <img
                src={data.inviterAvatar}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              data.inviterAvatar || data.inviterName.charAt(0).toUpperCase()
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--theme-secondary-text)]/80">
            Gelen Çağrı
          </p>
          <p className="text-[13.5px] font-semibold text-[var(--theme-text)] truncate leading-tight mt-0.5">
            {data.inviterName}
          </p>
          <p className="text-[11px] text-[var(--theme-secondary-text)] truncate mt-0.5">
            <span style={{ color: 'var(--theme-accent)' }} className="font-medium">{data.roomName}</span>
          </p>
        </div>

        <button
          onClick={onMute}
          title={isMuted ? 'Zili aç' : 'Sesi kapat (daveti reddetmez)'}
          aria-label={isMuted ? 'Zili aç' : 'Zili kapat'}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--theme-panel-hover)]"
          style={{ color: isMuted ? 'var(--theme-secondary-text)' : 'var(--theme-text)' }}
        >
          {isMuted ? <BellOff size={15} /> : <Bell size={15} />}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Action row: Reject / Accept */}
      <div className="px-3 py-2.5 flex gap-2">
        <button
          onClick={onDecline}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-semibold transition-all"
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.30)',
            color: '#f87171',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgb(239,68,68)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)';
            (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
          }}
        >
          <PhoneOff size={14} />
          Reddet
        </button>
        <button
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-semibold transition-all"
          style={{
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.35)',
            color: '#34d399',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgb(16,185,129)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.15)';
            (e.currentTarget as HTMLButtonElement).style.color = '#34d399';
          }}
        >
          <PhoneCall size={14} />
          Kabul
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
