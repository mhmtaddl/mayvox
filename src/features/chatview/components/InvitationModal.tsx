import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { PhoneCall, PhoneOff, VolumeX, Volume2 } from 'lucide-react';

interface InvitationData {
  inviterId: string;
  inviterName: string;
  inviterAvatar?: string;
  roomName: string;
  roomId: string;
  serverName?: string;
  serverAvatar?: string | null;
}

interface Props {
  data: InvitationData;
  onAccept: () => void;
  onDecline: () => void;
  onMute: () => void;
  /** Yalnızca ses ikonunun stilini etkiler — state cb ile toggle ayrıştırıldı. */
  isMuted: boolean;
}

// Top-right floating call card — fullscreen overlay değil, non-blocking.
// 35s auto-close timer + missed-call push: ChatView tarafında wire edilir.
// Offset güvenli: Electron titlebar/window controls 40-48px, top-14 (56px) → clash yok.
export default function InvitationModal({ data, onAccept, onDecline, onMute, isMuted }: Props) {
  const [avatarError, setAvatarError] = useState(false);
  const hasValidAvatar = !!data.inviterAvatar?.startsWith('http') && !avatarError;
  const initials = (data.inviterName || '?').trim().charAt(0).toUpperCase();

  const locationLine = data.serverName
    ? `${data.serverName} - ${data.roomName}`
    : data.roomName;

  return createPortal(
    <motion.div
      initial={{ opacity: 0, x: 20, y: -8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 20, y: -8, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className="fixed top-14 right-4 z-[400] w-[340px] rounded-2xl overflow-hidden pointer-events-auto"
      style={{
        background: 'var(--theme-surface-card, rgba(var(--theme-bg-rgb, 6,10,20), 0.97))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.5), 0 3px 10px rgba(0, 0, 0, 0.28)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      {/* Üst satır: avatar + isim hierarchy + mute */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        {/* Avatar with ping (mute olunca ping durur) */}
        <div className="relative w-12 h-12 shrink-0">
          {!isMuted && (
            <>
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'var(--theme-accent)',
                  opacity: 0.16,
                  animation: 'invitePing 1.6s ease-out infinite',
                }}
              />
              <span
                className="absolute inset-[-4px] rounded-full"
                style={{
                  background: 'var(--theme-accent)',
                  opacity: 0.09,
                  animation: 'invitePing 1.6s ease-out 0.5s infinite',
                }}
              />
              <style>{`
                @keyframes invitePing {
                  0%   { transform: scale(0.88); opacity: 0.18; }
                  70%  { transform: scale(1.4);  opacity: 0; }
                  100% { transform: scale(1.4);  opacity: 0; }
                }
              `}</style>
            </>
          )}
          <div
            className="relative w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-[17px] font-bold select-none"
            style={{
              background: 'rgba(var(--theme-accent-rgb, 16,185,129), 0.15)',
              border: '1.5px solid var(--theme-accent)',
              color: 'var(--theme-accent)',
            }}
          >
            {hasValidAvatar ? (
              <img
                src={data.inviterAvatar}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
        </div>

        {/* Name + location prominent */}
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--theme-secondary-text)]/75">
            Gelen Çağrı
          </p>
          <p
            className="text-[15px] font-bold text-[var(--theme-text)] truncate leading-tight mt-1"
            title={data.inviterName}
          >
            {data.inviterName}
          </p>
          <p
            className="text-[12px] font-semibold truncate mt-1.5"
            style={{ color: 'var(--theme-accent)' }}
            title={locationLine}
          >
            {locationLine}
          </p>
        </div>

        {/* Mute/unmute — VolumeX/Volume2 daha net "sessize al" sinyali verir */}
        <button
          onClick={onMute}
          title={isMuted ? 'Zili aç' : 'Zil sesini kapat (daveti reddetmez)'}
          aria-label={isMuted ? 'Zil sesini aç' : 'Zil sesini kapat'}
          aria-pressed={isMuted}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{
            background: isMuted ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
            color: isMuted ? '#f87171' : 'var(--theme-secondary-text)',
            border: `1px solid ${isMuted ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.06)'}`,
          }}
          onMouseEnter={e => {
            if (isMuted) return;
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
          }}
          onMouseLeave={e => {
            if (isMuted) return;
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
          }}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>

      {/* Sentence line — inviter sizi X odasına davet ediyor */}
      <div className="px-4 pb-3 -mt-1">
        <p className="text-[11.5px] text-[var(--theme-secondary-text)] leading-snug">
          <span className="font-semibold text-[var(--theme-text)]">{data.inviterName}</span>
          {' sizi '}
          <span className="font-semibold" style={{ color: 'var(--theme-accent)' }}>{locationLine}</span>
          {' odasına davet ediyor'}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Actions: icon-only circular */}
      <div className="px-4 py-3 flex justify-center items-center gap-4">
        {/* Reject */}
        <button
          onClick={onDecline}
          title="Reddet"
          aria-label="Daveti reddet"
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-95"
          style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1.5px solid rgba(239,68,68,0.4)',
            color: '#f87171',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgb(239,68,68)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)';
            (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
          }}
        >
          <PhoneOff size={17} />
        </button>
        {/* Accept */}
        <button
          onClick={onAccept}
          title="Kabul et"
          aria-label="Daveti kabul et"
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-95"
          style={{
            background: 'rgba(16,185,129,0.18)',
            border: '1.5px solid rgba(16,185,129,0.45)',
            color: '#34d399',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgb(16,185,129)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.18)';
            (e.currentTarget as HTMLButtonElement).style.color = '#34d399';
          }}
        >
          <PhoneCall size={17} />
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
