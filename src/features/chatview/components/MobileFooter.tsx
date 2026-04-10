import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Mic, Settings, Power, Headphones } from 'lucide-react';
import { ConnectionQualityIndicator } from '../../../components/chat';
import MobileUpdateHub from '../../update/components/MobileUpdateHub';
import { useAudio } from '../../../contexts/AudioContext';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useAppState } from '../../../contexts/AppStateContext';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUI } from '../../../contexts/UIContext';
import { useUser } from '../../../contexts/UserContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { FORCE_MOBILE } from '../constants';

interface Props {
  listenerToastRef: React.MutableRefObject<number>;
}

export default function MobileFooter({ listenerToastRef }: Props) {
  const { currentUser } = useUser();
  const { activeChannel, isConnecting } = useChannel();
  const { setToastMsg } = useUI();
  const { isPttPressed, setIsPttPressed, volumeLevel, connectionLevel } = useAudio();
  const { voiceMode, noiseThreshold, setNoiseThreshold, setAudioProfile } = useSettings();
  const {
    isMuted, setIsMuted, isDeafened, setIsDeafened,
    isBroadcastListener, view, setView, appVersion, showReleaseNotes, setShowReleaseNotes,
    handleLogout, passwordResetRequests, inviteRequests,
  } = useAppState();
  const { openConfirm } = useConfirm();

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

  const confirmLogout = () => {
    openConfirm({
      title: 'Çıkış yapmak istiyor musun?',
      description: 'Hesabından çıkış yapacaksın. Tekrar giriş yapman gerekecek.',
      confirmText: 'Çıkış Yap',
      cancelText: 'İptal',
      danger: true,
      onConfirm: () => {
        try { navigator.vibrate?.(300); } catch {}
        handleLogout();
      },
    });
  };

  const [vadSliderOpen, setVadSliderOpen] = useState(false);

  return (
    <footer className={`${FORCE_MOBILE ? '' : 'lg:hidden'} bg-[var(--theme-sidebar)] shrink-0 pb-[env(safe-area-inset-bottom)]`}>
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
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--theme-accent)]/50 ring-offset-2 ring-offset-[var(--theme-sidebar)]" />
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
                    onChange={(e) => { setNoiseThreshold(parseInt(e.target.value)); setAudioProfile('custom'); }}
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
                <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--theme-accent)]/60 ring-offset-2 ring-offset-[var(--theme-sidebar)]" />
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

      {/* Mobil kontrol çubuğu */}
      <div className="flex items-center justify-around px-3 py-2.5 border-t border-[var(--theme-border)]/20">
        <button
          onClick={() => setIsDeafened(!isDeafened)}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[52px] ${
            isDeafened ? 'bg-red-500/20 text-red-400' : 'text-[var(--theme-secondary-text)]'
          }`}
        >
          <Headphones size={18} />
          <span className="text-[9px] font-bold">{isDeafened ? 'Kapalı' : 'Hoparlör'}</span>
        </button>

        <button
          onClick={() => {
            if (isBroadcastListener) { if (Date.now() - (listenerToastRef.current || 0) > 3000) { setToastMsg('Bu odada yalnızca konuşmacılar yayın yapabilir.'); listenerToastRef.current = Date.now(); } return; }
            if (isAdminMuted) return;
            if (isMuted && isDeafened) setIsDeafened(false);
            setIsMuted(!isMuted);
          }}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[52px] ${
            isAdminMuted ? 'bg-orange-600/20 text-orange-400 cursor-not-allowed'
            : isMuted ? 'bg-red-500/20 text-red-400'
            : 'text-[var(--theme-secondary-text)]'
          }`}
        >
          <Mic size={18} />
          <span className="text-[9px] font-bold">{isAdminMuted ? (muteRemaining ?? 'Susturuldu') : isMuted ? 'Kapalı' : 'Mikrofon'}</span>
        </button>

        <div className="flex flex-col items-center gap-0.5 p-2 min-w-[52px]">
          <ConnectionQualityIndicator connectionLevel={connectionLevel} isConnecting={isConnecting} isActive={!!activeChannel} />
          {FORCE_MOBILE && <MobileUpdateHub currentVersion={appVersion} isAdmin={currentUser.isAdmin} autoShowNotes={showReleaseNotes} onNotesShown={() => setShowReleaseNotes(false)} />}
        </div>

        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[52px] ${
            view === 'settings' ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]'
          }`}
        >
          <span className="relative">
            <Settings size={18} />
            {(passwordResetRequests.length > 0 || inviteRequests.length > 0) && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
            )}
          </span>
          <span className="text-[9px] font-bold">Ayarlar</span>
        </button>

        <button
          onClick={confirmLogout}
          className="flex flex-col items-center gap-0.5 p-2 rounded-xl text-[var(--theme-secondary-text)] hover:text-red-400 transition-all min-w-[52px]"
        >
          <Power size={18} />
          <span className="text-[9px] font-bold">Çıkış</span>
        </button>
      </div>
    </footer>
  );
}
