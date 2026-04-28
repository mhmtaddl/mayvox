import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mic, ArrowLeftRight } from 'lucide-react';
import DesktopDock from './DesktopDock';
import { useAudio } from '../../../contexts/AudioContext';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useAppState } from '../../../contexts/AppStateContext';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUser } from '../../../contexts/UserContext';
import { FORCE_MOBILE } from '../constants';
import { getRoomModeConfig } from '../../../lib/roomModeConfig';
import { type CardStyle } from '../../../components/chat/cardStyles';
import { type Server } from '../../../lib/serverService';
import { formatRemainingFromIso } from '../../../lib/formatTimeout';
import { rangeVisualStyle } from '../../../lib/rangeStyle';

interface Props {
  listenerToastRef: React.MutableRefObject<number>;
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
  invitationData?: {
    inviterId: string;
    inviterName: string;
    inviterAvatar?: string;
    roomName: string;
    roomId: string;
    serverName?: string;
    serverAvatar?: string | null;
  } | null;
  onInvitationAccept?: () => void;
  onInvitationDecline?: () => void;
  onInvitationMute?: () => void;
  invitationMuted?: boolean;
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
  invitationData,
  onInvitationAccept,
  onInvitationDecline,
  onInvitationMute,
  invitationMuted,
}: Props) {
  const { currentUser } = useUser();
  const { activeChannel, channels } = useChannel();
  const { isPttPressed, setIsPttPressed, volumeLevel, mobileVoiceModeOverride, setMobileVoiceModeOverride } = useAudio();
  const { voiceMode, noiseThreshold, setNoiseThreshold } = useSettings();
  const { isMuted, view, voiceDisabledReason, timedOutUntil } = useAppState();
  // Server-side ses bloğu — mobile PTT / VAD tetiklenmesin, UI pasif görünsün.
  const isVoiceBlocked = voiceDisabledReason !== null;
  const timeoutRemStr = voiceDisabledReason === 'timeout' ? formatRemainingFromIso(timedOutUntil) : null;
  const voiceBlockedLabel =
    voiceDisabledReason === 'server_muted' ? 'Susturuldunuz'
    : voiceDisabledReason === 'timeout'    ? (timeoutRemStr ? `Zamanaşımı — ${timeoutRemStr}` : 'Zamanaşımı')
    : voiceDisabledReason === 'kicked'     ? 'Odadan çıkarıldınız'
    : voiceDisabledReason === 'banned'     ? 'Erişim kapalı'
    : '';

  // Oda default'u ile kullanıcı tercihi farklıysa 15 saniye boyunca "change" butonu göster.
  // Butona basılırsa kullanıcının tercihi override olarak set edilir, buton 5 sn daha görünüp kaybolur.
  const activeCh = channels.find(c => c.id === activeChannel);
  const vc = activeCh ? getRoomModeConfig(activeCh.mode).voice : null;
  const roomDefault = vc ? vc.defaultMode : null;
  const allowedModes = vc ? vc.allowedModes : [];
  // Mobilde effective mode = override ya da oda default (kullanıcı voiceMode setting'i değil)
  // App.tsx ile aynı logic — pill doğru branch'i render etsin diye burada da hesaplanıyor.
  const effectiveMode = FORCE_MOBILE && activeCh && vc
    ? (mobileVoiceModeOverride && vc.allowedModes.includes(mobileVoiceModeOverride) ? mobileVoiceModeOverride : vc.defaultMode)
    : (vc && vc.allowedModes.includes(voiceMode) ? voiceMode : (vc?.defaultMode ?? voiceMode));
  const canOfferChange = !!activeCh && allowedModes.length > 1 && roomDefault !== null && voiceMode !== roomDefault && allowedModes.includes(voiceMode);

  const [changeBtnVisible, setChangeBtnVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    if (!canOfferChange || mobileVoiceModeOverride) { setChangeBtnVisible(false); return; }
    // Odaya ilk girişte 15sn göster
    setChangeBtnVisible(true);
    hideTimerRef.current = setTimeout(() => { setChangeBtnVisible(false); hideTimerRef.current = null; }, 15000);
    return () => { if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; } };
  }, [activeChannel, canOfferChange, mobileVoiceModeOverride]);

  const onChangeModeClick = () => {
    // Kullanıcının Settings-Account tercihine geç (override set et)
    setMobileVoiceModeOverride(voiceMode);
    // 5 sn daha görünür kalsın sonra gizle
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => { setChangeBtnVisible(false); hideTimerRef.current = null; }, 5000);
  };

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
      style={{ background: 'var(--dock-bg, var(--surface-elevated))', border: '1px solid var(--dock-border, var(--border-subtle))', boxShadow: 'var(--dock-shadow, 0 4px 20px rgba(0,0,0,0.2))', backdropFilter: 'var(--dock-blur, blur(12px))', WebkitBackdropFilter: 'var(--dock-blur, blur(12px))' }}>
      {/* PTT / VAD buton alanı */}
      {activeChannel && view !== 'settings' && (() => {
        // pttDisabled: dokunma/konuşma tamamen bloklu. Server bloğu (mute/timeout/kick/ban)
        // da buraya dahil — UI opak, PTT pointer handler'ları erken return eder.
        const pttDisabled = isMuted || isAdminMuted || isVoiceBanned || isVoiceBlocked;
        const isVad = effectiveMode === 'vad';

        const pttLabel = isVoiceBlocked
          ? voiceBlockedLabel
          : isAdminMuted
            ? (muteRemaining ?? 'Susturuldu')
            : isMuted
              ? 'Mikrofon Kapalı'
              : isVoiceBanned
                ? 'Ses Yasağı'
                : isVad
                  ? (isPttPressed ? 'Konuşuyorsun' : 'Otomatik')
                  : isPttPressed
                    ? 'Konuşuyorsun'
                    : 'Basılı tut';

        if (isVad) {
          return (
            <div className="flex flex-col items-center pt-3 pb-1 px-4 gap-2">
              <div className="flex items-center gap-2 w-full max-w-[260px]">
              <div
                onClick={() => { if (!pttDisabled) setVadSliderOpen(p => !p); }}
                className={`relative flex-1 rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer ${pttDisabled ? 'opacity-50' : ''}`}
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
              {changeBtnVisible && !pttDisabled && (
                <button
                  onClick={onChangeModeClick}
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border active:scale-[0.95] transition-all btn-haptic"
                  style={{ background: 'rgba(var(--glass-tint), 0.08)', borderColor: 'rgba(var(--glass-tint), 0.15)', color: 'var(--theme-accent)' }}
                  title="Konuşma moduna geç"
                >
                  <ArrowLeftRight size={14} />
                </button>
              )}
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
                    className="premium-range flex-1"
                    style={rangeVisualStyle(noiseThreshold, 5, 50, { height: '4px' })}
                  />
                  <span className="text-[10px] text-emerald-400 font-bold w-5 text-right shrink-0">{noiseThreshold}</span>
                </div>
              )}
            </div>
          );
        }

        // PTT modu
        return (
          <div className="flex items-center justify-center pt-3 pb-1 px-4 gap-2">
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
              className={`relative w-full max-w-[220px] select-none touch-none transition-all duration-150 rounded-2xl overflow-hidden ${
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
            {changeBtnVisible && !pttDisabled && (
              <button
                onClick={onChangeModeClick}
                className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border active:scale-[0.95] transition-all btn-haptic"
                style={{ background: 'rgba(var(--glass-tint), 0.08)', borderColor: 'rgba(var(--glass-tint), 0.15)', color: 'var(--theme-accent)' }}
                title="Konuşma moduna geç"
              >
                <ArrowLeftRight size={14} />
              </button>
            )}
          </div>
        );
      })()}

      {/* Desktop dock ile aynı — user card + server + mic + hp + audio lines + voice mode + room controls */}
      <div style={{ borderTop: '1px solid var(--dock-divider, var(--dock-item-border, rgba(var(--glass-tint), 0.08)))' }}>
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
          invitationData={invitationData}
          onInvitationAccept={onInvitationAccept}
          onInvitationDecline={onInvitationDecline}
          onInvitationMute={onInvitationMute}
          invitationMuted={invitationMuted}
        />
      </div>
    </footer>
  );
}
