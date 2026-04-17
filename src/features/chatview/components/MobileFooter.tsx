import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Mic } from 'lucide-react';
import MobileUpdateHub from '../../update/components/MobileUpdateHub';
import DesktopDock from './DesktopDock';
import { useAudio } from '../../../contexts/AudioContext';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useAppState } from '../../../contexts/AppStateContext';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUser } from '../../../contexts/UserContext';
import { FORCE_MOBILE } from '../constants';
import { type CardStyle } from '../../../components/chat/cardStyles';
import { type Server } from '../../../lib/serverService';

interface Props {
  listenerToastRef: React.MutableRefObject<number>;
  onOpenBell?: () => void;
  dockToastHoveredRef: React.MutableRefObject<boolean>;
  cardStyle: CardStyle;
  cycleCardStyle: () => void;
  serverList: Server[];
  activeServerId: string;
  onSelectServer: (id: string) => void;
  onJoinServer: (code: string) => Promise<void>;
  onLeaveServer: (serverId: string) => Promise<void>;
  onShowCreateModal: () => void;
  canCreateServer?: boolean;
}

export default function MobileFooter({
  listenerToastRef,
  dockToastHoveredRef,
  cardStyle,
  cycleCardStyle,
  serverList,
  activeServerId,
  onSelectServer,
  onJoinServer,
  onLeaveServer,
  onShowCreateModal,
  canCreateServer,
}: Props) {
  const { currentUser } = useUser();
  const { activeChannel } = useChannel();
  const { isPttPressed, setIsPttPressed, volumeLevel } = useAudio();
  const { voiceMode, noiseThreshold, setNoiseThreshold } = useSettings();
  const {
    isMuted,
    view, appVersion, showReleaseNotes, setShowReleaseNotes,
  } = useAppState();

  const isAdminMuted = currentUser.isMuted === true;
  const isVoiceBanned = !!currentUser.isVoiceBanned;

  const [muteRemaining, setMuteRemaining] = useState<string | null>(null);
  const muteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync mute remaining with currentUser.muteExpires
  React.useEffect(() => {
    if (muteTimerRef.current) clearInterval(muteTimerRef.current);
    if (!isAdminMuted || !currentUser.muteExpires) { setMuteRemaining(null); return; }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((currentUser.muteExpires! - Date.now()) / 1000));
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setMuteRemaining(m > 0 ? `${m}d ${s}s` : `${s}s`);
    };
    tick();
    muteTimerRef.current = setInterval(tick, 1000);
    return () => { if (muteTimerRef.current) clearInterval(muteTimerRef.current); };
  }, [isAdminMuted, currentUser.muteExpires]);

  const [vadSliderOpen, setVadSliderOpen] = useState(false);

  return (
    <footer className={`${FORCE_MOBILE ? '' : 'lg:hidden'} shrink-0 pb-[env(safe-area-inset-bottom)] mx-2 mb-2 rounded-2xl`}
      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(var(--glass-tint), 0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      {/* PTT / VAD buton alanı */}
      {activeChannel && view !== 'settings' && (() => {
        const pttDisabled = isMuted || isAdminMuted || isVoiceBanned;
        const isVad = voiceMode === 'vad';

        const pttLabel = isAdminMuted
          ? (muteRemaining ?? 'Susturuldu')
          : isMuted
            ? 'Mikrofon Kapalı'
            : isVoiceBanned
              ? 'Ses Yasağı'
              : isVad
                ? (isPttPressed ? 'Konuşuyorsun' : 'Ses Algılama Aktif')
                : isPttPressed
                  ? 'Konuşuyorsun'
                  : 'Basılı Tut — Konuş';

        if (isVad) {
          return (
            <div className="flex flex-col items-center pt-3 pb-1 px-4 gap-2">
              <div
                onClick={() => { if (!pttDisabled) setVadSliderOpen(p => !p); }}
                className={`relative w-full max-w-xs rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer ${pttDisabled ? 'opacity-50' : ''}`}
              >
                <div className={`absolute inset-0 rounded-2xl transition-all duration-200 ${
                  pttDisabled
                    ? 'bg-[var(--theme-border)]/20 border border-[var(--theme-border)]/30'
                    : isPttPressed
                      ? 'bg-[var(--theme-accent)] shadow-[0_0_25px_rgba(var(--theme-accent-rgb),0.4)]'
                      : 'bg-emerald-500/10 border border-emerald-500/25'
                }`} />
                {isPttPressed && !pttDisabled && (
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--theme-accent)]/50 ring-offset-2 ring-offset-transparent" />
                )}
                <div className="relative z-10 py-4 px-6">
                  <div className="flex items-center justify-center gap-3">
                    <Mic size={20} strokeWidth={2.5} className={`transition-all ${
                      pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-emerald-400'
                    }`} />
                    <span className={`font-bold text-[13px] tracking-wide transition-all ${
                      pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-emerald-400'
                    }`}>
                      {pttLabel}
                    </span>
                  </div>
                  {!pttDisabled && (
                    <div className="flex items-end justify-center gap-[3px] mt-3 h-4">
                      {[...Array(7)].map((_, i) => {
                        const base = volumeLevel > 0 ? Math.max(0.2, Math.min(1, volumeLevel / 80)) : 0.15;
                        const h = i % 2 === 0 ? base * 1.1 : base * 0.85;
                        return (
                          <div
                            key={i}
                            className={`w-[3px] rounded-full origin-bottom transition-all duration-150 ${
                              isPttPressed ? 'bg-white/80' : 'bg-emerald-400/40'
                            }`}
                            style={{ height: `${Math.min(100, h * 100)}%` }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {vadSliderOpen && !pttDisabled && (
                <div className="flex items-center gap-3 w-full max-w-xs px-2 py-1 rounded-xl bg-[var(--theme-sidebar)]/80 border border-[var(--theme-border)]/20">
                  <span className="text-[10px] text-[var(--theme-secondary-text)]/60 shrink-0">Hassasiyet</span>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={noiseThreshold}
                    onChange={(e) => setNoiseThreshold(parseInt(e.target.value))}
                    className="flex-1 h-1 accent-emerald-400 rounded-full"
                  />
                  <span className="text-[10px] text-emerald-400 font-bold w-5 text-right shrink-0">{noiseThreshold}</span>
                </div>
              )}
            </div>
          );
        }

        // PTT modu
        return (
          <div className="flex items-center justify-center pt-3 pb-1 px-4">
            <button
              onPointerDown={(e) => {
                if (pttDisabled) return;
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setIsPttPressed(true);
              }}
              onPointerUp={(e) => {
                if (pttDisabled) return;
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                setIsPttPressed(false);
              }}
              onPointerCancel={() => { if (!pttDisabled) setIsPttPressed(false); }}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative w-full max-w-xs select-none touch-none transition-all duration-150 rounded-2xl overflow-hidden ${
                pttDisabled ? 'opacity-50' : isPttPressed ? 'scale-[0.97]' : 'scale-100'
              }`}
            >
              <div className={`absolute inset-0 transition-all duration-150 rounded-2xl ${
                pttDisabled
                  ? 'bg-[var(--theme-border)]/20 border border-[var(--theme-border)]/30'
                  : isPttPressed
                    ? 'bg-[var(--theme-accent)] shadow-[0_0_30px_rgba(var(--theme-accent-rgb),0.5)]'
                    : 'bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/25'
              }`} />
              {isPttPressed && !pttDisabled && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--theme-accent)]/60 ring-offset-2 ring-offset-transparent" />
              )}
              <div className="relative z-10 py-5 px-6">
                <div className="flex items-center justify-center gap-3">
                  <Mic size={22} strokeWidth={2.5} className={`transition-all duration-150 ${
                    pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-[var(--theme-accent)]'
                  }`} />
                  <span className={`font-bold text-[14px] tracking-wide transition-all duration-150 ${
                    pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-[var(--theme-accent)]'
                  }`}>
                    {pttLabel}
                  </span>
                </div>
                {isPttPressed && !pttDisabled && (
                  <div className="flex items-center justify-center gap-[3px] mt-3 h-4">
                    {[...Array(7)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ scaleY: [0.3, 1, 0.3] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
                        className="w-[3px] h-full bg-white/80 rounded-full origin-center"
                      />
                    ))}
                  </div>
                )}
              </div>
            </button>
          </div>
        );
      })()}

      {/* Desktop dock ile aynı — user card + server + mic + hp + audio lines + voice mode + room controls */}
      <div style={{ borderTop: '1px solid rgba(var(--glass-tint), 0.08)' }}>
        <DesktopDock
          layout="inline"
          dockToastHoveredRef={dockToastHoveredRef}
          listenerToastRef={listenerToastRef}
          cardStyle={cardStyle}
          cycleCardStyle={cycleCardStyle}
          serverList={serverList}
          activeServerId={activeServerId}
          onSelectServer={onSelectServer}
          onJoinServer={onJoinServer}
          onLeaveServer={onLeaveServer}
          onShowCreateModal={onShowCreateModal}
          canCreateServer={canCreateServer}
        />
        {FORCE_MOBILE && (
          <div className="flex justify-center pb-1">
            <MobileUpdateHub currentVersion={appVersion} isAdmin={currentUser.isAdmin} autoShowNotes={showReleaseNotes} onNotesShown={() => setShowReleaseNotes(false)} />
          </div>
        )}
      </div>
    </footer>
  );
}
