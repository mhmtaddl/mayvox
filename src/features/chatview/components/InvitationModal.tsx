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
  /** Yalnızca ses ikonunun ve ping animasyonunun stilini etkiler. */
  isMuted: boolean;
}

// Premium glass card — Apple-style notification.
// Position: top-14 right-6 — window controls ile clash yok, macOS Notification Center feel.
// Animasyon: spring entrance, hover scale, tactile active — hepsi decorative, logic etkilenmez.
export default function InvitationModal({ data, onAccept, onDecline, onMute, isMuted }: Props) {
  const [avatarError, setAvatarError] = useState(false);
  const hasValidAvatar = !!data.inviterAvatar?.startsWith('http') && !avatarError;
  const initials = (data.inviterName || '?').trim().charAt(0).toUpperCase();

  // Format: "Server • Room"  — Apple-style middot separator.
  const locationLine = data.serverName
    ? `${data.serverName} • ${data.roomName}`
    : data.roomName;

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
      transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
      className="fixed top-14 right-6 z-[400] w-[340px] pointer-events-auto"
      style={{
        // Apple dark glass: 72% rgba neutral + saturation + strong blur
        background: 'linear-gradient(180deg, rgba(38,38,42,0.80) 0%, rgba(28,28,32,0.78) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        borderRadius: 24,
        boxShadow: [
          '0 20px 50px -10px rgba(0, 0, 0, 0.55)',
          '0 6px 16px -4px rgba(0, 0, 0, 0.30)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.08)', // üst kenarda ince glint
        ].join(', '),
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      }}
    >
      {/* ── Header: avatar + metadata ── */}
      <div className="px-5 pt-4 pb-4 flex items-start gap-3.5">
        {/* Avatar: 52px daire, ping glow */}
        <div className="relative w-[52px] h-[52px] shrink-0">
          {!isMuted && (
            <>
              <span
                className="absolute inset-[-6px] rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(16,185,129,0.35) 0%, rgba(16,185,129,0) 70%)',
                  animation: 'callPulse 1.8s ease-out infinite',
                }}
              />
              <span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  boxShadow: '0 0 0 0 rgba(16,185,129,0.45)',
                  animation: 'callRing 1.8s ease-out infinite',
                }}
              />
              <style>{`
                @keyframes callRing {
                  0%   { box-shadow: 0 0 0 0   rgba(16,185,129,0.45); }
                  70%  { box-shadow: 0 0 0 14px rgba(16,185,129,0);    }
                  100% { box-shadow: 0 0 0 0   rgba(16,185,129,0);    }
                }
                @keyframes callPulse {
                  0%   { transform: scale(0.95); opacity: 0.85; }
                  70%  { transform: scale(1.25); opacity: 0; }
                  100% { transform: scale(1.25); opacity: 0; }
                }
              `}</style>
            </>
          )}
          <div
            className="relative w-[52px] h-[52px] rounded-full overflow-hidden flex items-center justify-center text-[19px] font-semibold select-none"
            style={{
              background: hasValidAvatar
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(135deg, rgba(16,185,129,0.35) 0%, rgba(5,150,105,0.28) 100%)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#ffffff',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
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

        {/* Metadata stack */}
        <div className="min-w-0 flex-1 pt-0.5">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'rgba(255,255,255,0.50)' }}
          >
            Gelen Çağrı
          </p>
          <p
            className="text-[16px] font-semibold truncate leading-tight mt-1"
            style={{
              color: 'rgba(255,255,255,0.96)',
              letterSpacing: '-0.01em',
            }}
            title={data.inviterName}
          >
            {data.inviterName}
          </p>
          <p
            className="text-[12px] font-medium truncate mt-1"
            style={{ color: 'rgba(255,255,255,0.62)' }}
            title={locationLine}
          >
            {locationLine}
          </p>
        </div>
      </div>

      {/* ── Action row: 3 circular icon-only buttons ── */}
      <div className="px-5 pb-5 pt-1 flex items-center justify-center gap-5">
        <IconButton
          onClick={onMute}
          kind={isMuted ? 'mute-active' : 'mute'}
          title={isMuted ? 'Zil sesini aç' : 'Zil sesini kapat'}
          aria-label={isMuted ? 'Zil sesini aç' : 'Zil sesini kapat'}
          aria-pressed={isMuted}
        >
          {isMuted ? <VolumeX size={18} strokeWidth={2.1} /> : <Volume2 size={18} strokeWidth={2.1} />}
        </IconButton>
        <IconButton
          onClick={onDecline}
          kind="reject"
          title="Reddet"
          aria-label="Daveti reddet"
        >
          <PhoneOff size={18} strokeWidth={2.2} />
        </IconButton>
        <IconButton
          onClick={onAccept}
          kind="accept"
          title="Kabul et"
          aria-label="Daveti kabul et"
        >
          <PhoneCall size={18} strokeWidth={2.2} />
        </IconButton>
      </div>
    </motion.div>,
    document.body,
  );
}

// ── IconButton ──────────────────────────────────────────────────────────
type ButtonKind = 'accept' | 'reject' | 'mute' | 'mute-active';

const BUTTON_STYLES: Record<ButtonKind, {
  bg: string; border: string; color: string;
  hoverBg: string; hoverColor: string; glow: string;
}> = {
  accept: {
    bg: 'rgba(16,185,129,0.18)',
    border: 'rgba(16,185,129,0.42)',
    color: '#4ade80',
    hoverBg: 'rgb(16,185,129)',
    hoverColor: '#ffffff',
    glow: '0 6px 20px -4px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
  },
  reject: {
    bg: 'rgba(239,68,68,0.18)',
    border: 'rgba(239,68,68,0.42)',
    color: '#f87171',
    hoverBg: 'rgb(239,68,68)',
    hoverColor: '#ffffff',
    glow: '0 6px 20px -4px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
  },
  mute: {
    bg: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.14)',
    color: 'rgba(255,255,255,0.80)',
    hoverBg: 'rgba(255,255,255,0.12)',
    hoverColor: '#ffffff',
    glow: '0 4px 14px -4px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
  },
  'mute-active': {
    bg: 'rgba(239,68,68,0.22)',
    border: 'rgba(239,68,68,0.50)',
    color: '#fca5a5',
    hoverBg: 'rgba(239,68,68,0.32)',
    hoverColor: '#ffffff',
    glow: '0 4px 14px -4px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
  },
};

type IconButtonProps = {
  onClick: () => void;
  kind: ButtonKind;
  children: React.ReactNode;
  title: string;
  'aria-label': string;
  'aria-pressed'?: boolean;
};

function IconButton({ onClick, kind, children, title, ...aria }: IconButtonProps) {
  const s = BUTTON_STYLES[kind];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 480, damping: 24 }}
      className="w-[52px] h-[52px] rounded-full flex items-center justify-center"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        boxShadow: s.glow,
        transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease',
      }}
      onMouseEnter={e => {
        const btn = e.currentTarget as HTMLButtonElement;
        btn.style.background = s.hoverBg;
        btn.style.color = s.hoverColor;
      }}
      onMouseLeave={e => {
        const btn = e.currentTarget as HTMLButtonElement;
        btn.style.background = s.bg;
        btn.style.color = s.color;
      }}
      aria-label={aria['aria-label']}
      aria-pressed={aria['aria-pressed']}
    >
      {children}
    </motion.button>
  );
}
