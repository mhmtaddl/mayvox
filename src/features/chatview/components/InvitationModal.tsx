import React from 'react';
import { motion } from 'motion/react';
import { PhoneCall, PhoneOff } from 'lucide-react';

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
}

export default function InvitationModal({ data, onAccept, onDecline }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gradient-to-b from-black/15 via-black/25 to-black/35"
    >
      <motion.div
        initial={{ scale: 0.90, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.90, opacity: 0, y: 24 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-xs overflow-hidden rounded-3xl shadow-2xl border border-white/10"
        style={{ background: 'linear-gradient(160deg, #0f1623 0%, var(--theme-bg) 60%)' }}
      >
        {/* Header */}
        <div className="pt-10 pb-7 px-8 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-secondary-text)] mb-7">
            Gelen Çağrı
          </p>

          {/* Pulsing avatar */}
          <div className="relative w-20 h-20 mx-auto mb-5">
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: 'var(--theme-accent)',
                opacity: 0.12,
                animation: 'invitePing 1.6s ease-out infinite',
              }}
            />
            <span
              className="absolute inset-[-8px] rounded-full"
              style={{
                background: 'var(--theme-accent)',
                opacity: 0.07,
                animation: 'invitePing 1.6s ease-out 0.5s infinite',
              }}
            />
            <style>{`
              @keyframes invitePing {
                0%   { transform: scale(0.85); opacity: 0.16; }
                70%  { transform: scale(1.35); opacity: 0; }
                100% { transform: scale(1.35); opacity: 0; }
              }
            `}</style>
            <div
              className="relative w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold select-none"
              style={{
                background: 'rgba(var(--theme-accent-rgb, 16,185,129), 0.15)',
                border: '2px solid var(--theme-accent)',
                boxShadow: '0 0 24px var(--theme-accent, #10b981)33',
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

          <h3 className="text-xl font-bold text-[var(--theme-text)] leading-tight">
            {data.inviterName}
          </h3>
          <p className="mt-1.5 text-sm text-[var(--theme-secondary-text)]">
            <span className="font-semibold" style={{ color: 'var(--theme-accent)' }}>
              {data.roomName}
            </span>{' '}
            odasına davet ediyor
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-white/8" />

        {/* Action buttons */}
        <div className="py-8 flex justify-center gap-16">
          {/* Decline */}
          <div className="flex flex-col items-center gap-2.5">
            <button
              onClick={onDecline}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 group"
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '2px solid rgba(239,68,68,0.35)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgb(239,68,68)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(239,68,68)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.35)'; }}
            >
              <PhoneOff size={22} className="text-red-400 group-hover:text-white transition-colors" />
            </button>
            <span className="text-[11px] text-[var(--theme-secondary-text)]">Reddet</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-2.5">
            <button
              onClick={onAccept}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 group"
              style={{
                background: 'rgba(16,185,129,0.12)',
                border: '2px solid rgba(16,185,129,0.35)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgb(16,185,129)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(16,185,129)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.12)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,185,129,0.35)'; }}
            >
              <PhoneCall size={22} className="text-emerald-400 group-hover:text-white transition-colors" />
            </button>
            <span className="text-[11px] text-[var(--theme-secondary-text)]">Kabul</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
