import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Mic,
  Settings,
  Check,
  Headphones,
  PhoneOff,
  Shield,
  ShieldOff,
  Home,
  Download,
  AlertCircle,
  Info,
} from 'lucide-react';
import { type CardStyle, CARD_STYLES } from '../../../components/chat/cardStyles';
import { getRoomModeConfig } from '../../../lib/roomModeConfig';
import { useAudio } from '../../../contexts/AudioContext';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useUI } from '../../../contexts/UIContext';
import { useAppState } from '../../../contexts/AppStateContext';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUser } from '../../../contexts/UserContext';
import { FORCE_MOBILE } from '../constants';

interface Props {
  dockToastHoveredRef: React.MutableRefObject<boolean>;
  listenerToastRef: React.MutableRefObject<number>;
  cardStyle: CardStyle;
  cycleCardStyle: () => void;
}

export default function DesktopDock({
  dockToastHoveredRef,
  listenerToastRef,
  cardStyle,
  cycleCardStyle,
}: Props) {
  const { toastMsg, setToastMsg } = useUI();
  const { currentUser } = useUser();
  const {
    showInputSettings, setShowInputSettings, showOutputSettings, setShowOutputSettings,
    inputDevices, outputDevices, selectedInput, setSelectedInput, selectedOutput, setSelectedOutput,
  } = useAudio();
  const {
    isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled,
    voiceMode, setVoiceMode, pttKey, isListeningForKey, setIsListeningForKey,
  } = useSettings();
  const {
    isMuted, setIsMuted, isDeafened, setIsDeafened,
    isBroadcastListener, disconnectFromLiveKit, view, setView,
  } = useAppState();
  const { activeChannel, setActiveChannel, channels } = useChannel();

  const isAdminMuted = currentUser.isMuted === true;

  return (
    <div
      className={`${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} fixed bottom-4 left-1/2 -translate-x-1/2 z-30 items-center gap-1.5 px-3 py-2 rounded-2xl min-h-[48px]`}
      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(var(--glass-tint), 0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)' }}
      onMouseEnter={() => { if (toastMsg) dockToastHoveredRef.current = true; }}
      onMouseLeave={() => { dockToastHoveredRef.current = false; }}
    >
      {toastMsg ? (
        <div
          className="relative flex items-center justify-center gap-2 px-5 h-10 cursor-pointer select-none whitespace-nowrap"
          style={{ animation: 'dock-notify-in 180ms ease-out' }}
          onClick={() => setToastMsg(null)}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ animation: 'dock-notify-ring 450ms ease-out forwards' }} />
          <span className="shrink-0 text-[var(--theme-accent)]" style={{ animation: 'dock-notify-icon 180ms ease-out' }}>
            {toastMsg.includes('indiriliyor') ? <Download size={12} /> : toastMsg.includes('hazır') ? <Check size={12} /> : toastMsg.includes('hata') || toastMsg.includes('Hata') || toastMsg.includes('başarısız') ? <AlertCircle size={12} /> : <Info size={12} />}
          </span>
          <span className="text-[11px] font-semibold text-[var(--theme-text)]">{toastMsg}</span>
        </div>
      ) : <>
      {/* Mikrofon + ayar */}
      <div className="relative group/mic">
        <button
          onClick={() => {
            if (isBroadcastListener) { if (Date.now() - (listenerToastRef.current || 0) > 3000) { setToastMsg('Bu odada yalnızca konuşmacılar yayın yapabilir.'); listenerToastRef.current = Date.now(); } return; }
            if (isAdminMuted) return;
            if (isMuted && isDeafened) setIsDeafened(false);
            setIsMuted(!isMuted);
          }}
          className={`w-10 h-10 rounded-xl flex items-center justify-center btn-haptic ${
            isAdminMuted ? 'bg-orange-500/20 text-orange-400 border border-orange-500/25'
            : isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/25'
            : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'
          }`}
          title={isAdminMuted ? 'Susturuldu' : isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
        >
          <Mic size={16} />
        </button>
        <div onClick={(e) => { e.stopPropagation(); setShowInputSettings(!showInputSettings); setShowOutputSettings(false); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgba(var(--glass-tint),0.15)] flex items-center justify-center cursor-pointer opacity-0 group-hover/mic:opacity-100 transition-opacity hover:bg-[rgba(var(--glass-tint),0.25)]">
          <Settings size={8} className="text-[var(--theme-text)]" />
        </div>
        <AnimatePresence>
          {showInputSettings && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 mb-2 w-64 popup-surface p-3 shadow-2xl z-50" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">Giriş Cihazı</h4>
              <div className="space-y-1">
                {inputDevices.map(device => (
                  <button key={device.deviceId} onClick={() => { setSelectedInput(device.deviceId); setShowInputSettings(false); }} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${selectedInput === device.deviceId ? 'bg-[var(--theme-accent)] text-[var(--theme-badge-text)]' : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] hover:text-[var(--theme-text)]'}`}>
                    <span className="truncate">{device.label || `Mikrofon ${device.deviceId.slice(0, 5)}`}</span>
                    {selectedInput === device.deviceId && <Check size={12} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Kulaklık + ayar */}
      <div className="relative group/hp">
        <button
          onClick={() => setIsDeafened(!isDeafened)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center btn-haptic ${
            isDeafened ? 'bg-red-500/20 text-red-400 border border-red-500/25' : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'
          }`}
          title={isDeafened ? 'Sağırlığı kaldır' : 'Hoparlörü kapat'}
        >
          <Headphones size={16} />
        </button>
        <div onClick={(e) => { e.stopPropagation(); setShowOutputSettings(!showOutputSettings); setShowInputSettings(false); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgba(var(--glass-tint),0.15)] flex items-center justify-center cursor-pointer opacity-0 group-hover/hp:opacity-100 transition-opacity hover:bg-[rgba(var(--glass-tint),0.25)]">
          <Settings size={8} className="text-[var(--theme-text)]" />
        </div>
        <AnimatePresence>
          {showOutputSettings && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 mb-2 w-64 popup-surface p-3 shadow-2xl z-50" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">Çıkış Cihazı</h4>
              <div className="space-y-1">
                {outputDevices.map(device => (
                  <button key={device.deviceId} onClick={() => { setSelectedOutput(device.deviceId); setShowOutputSettings(false); }} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${selectedOutput === device.deviceId ? 'bg-[var(--theme-accent)] text-[var(--theme-badge-text)]' : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] hover:text-[var(--theme-text)]'}`}>
                    <span className="truncate">{device.label || `Hoparlör ${device.deviceId.slice(0, 5)}`}</span>
                    {selectedOutput === device.deviceId && <Check size={12} className="shrink-0" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Gürültü Susturma */}
      <button onClick={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)} className={`w-10 h-10 rounded-xl flex items-center justify-center btn-haptic ${isNoiseSuppressionEnabled ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25' : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.06)]'}`} title={isNoiseSuppressionEnabled ? 'Gürültü Susturma: Açık' : 'Gürültü Susturma: Kapalı'}>
        {isNoiseSuppressionEnabled ? <Shield size={16} /> : <ShieldOff size={16} />}
      </button>
      {/* Ses modu butonu */}
      {activeChannel && (() => {
        const isVad = voiceMode === 'vad';
        const activeCh = channels.find(c => c.id === activeChannel);
        const vc = activeCh ? getRoomModeConfig(activeCh.mode).voice : null;
        const canSwitch = vc ? vc.allowedModes.length > 1 : true;

        return (
          <div className="relative group/vmode">
            {isVad ? (
              <div
                className="h-10 px-3 rounded-xl flex items-center gap-1.5 text-[10px] font-bold whitespace-nowrap bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                title="Ses Etkinliği modu aktif"
              >
                <Mic size={13} />
                <span>Ses Etkinliği</span>
              </div>
            ) : (
              <button
                onClick={() => setIsListeningForKey(true)}
                className={`min-w-10 h-10 px-2.5 rounded-xl flex items-center justify-center btn-haptic text-[10px] font-black whitespace-nowrap transition-all duration-150 active:scale-[0.97] ${
                  isListeningForKey
                    ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] border border-[var(--theme-accent)]/30 animate-pulse'
                    : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'
                }`}
                title="Bas-Konuş tuşu — tıkla değiştir"
              >
                {isListeningForKey ? '...' : pttKey}
              </button>
            )}
            {canSwitch && (
              <div
                onClick={(e) => { e.stopPropagation(); setVoiceMode(isVad ? 'ptt' : 'vad'); }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgba(var(--glass-tint),0.15)] flex items-center justify-center cursor-pointer opacity-0 group-hover/vmode:opacity-100 transition-opacity hover:bg-[rgba(var(--glass-tint),0.25)]"
                title={isVad ? 'Bas-Konuş\'a geç' : 'Ses Etkinliği\'ne geç'}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--theme-text)]"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>
              </div>
            )}
          </div>
        );
      })()}
      {/* Oda kontrolleri */}
      {activeChannel && view !== 'settings' && (
        <>
          <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />
          <button
            onClick={cycleCardStyle}
            className="w-10 h-10 flex items-center justify-center btn-haptic"
            style={{
              borderRadius: cardStyle === 'revolt' ? 8 : cardStyle === 'linear' ? 12 : cardStyle === 'apple' ? 14 : 12,
              background: cardStyle === 'revolt'
                ? 'rgba(var(--theme-bg-rgb), 0.85)'
                : cardStyle === 'linear'
                  ? 'rgba(var(--theme-bg-rgb), 0.75)'
                  : cardStyle === 'apple'
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(var(--glass-tint), 0.025)',
              border: cardStyle === 'linear'
                ? '1px solid rgba(var(--theme-accent-rgb), 0.12)'
                : cardStyle === 'apple'
                  ? '1px solid rgba(255,255,255,0.1)'
                  : '1px solid rgba(var(--glass-tint), 0.06)',
              boxShadow: cardStyle === 'linear'
                ? '0 2px 8px rgba(0,0,0,0.15)'
                : '0 1px 3px rgba(0,0,0,0.06)',
              backdropFilter: cardStyle === 'apple' ? 'blur(12px)' : undefined,
              transition: 'all 0.2s ease',
            }}
            title={`Görünüm: ${CARD_STYLES.find(s => s.key === cardStyle)?.label}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              {cardStyle === 'current' ? (
                <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" className="text-[var(--theme-secondary-text)]" />
              ) : cardStyle === 'revolt' ? (
                <><rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-[var(--theme-accent)]" opacity="0.5" /><rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor" className="text-[var(--theme-accent)]" opacity="0.3" /></>
              ) : cardStyle === 'linear' ? (
                <><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.2" className="text-[var(--theme-accent)]" /><circle cx="8" cy="8" r="2.5" fill="currentColor" className="text-[var(--theme-accent)]" opacity="0.5" /><circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="0.8" className="text-[var(--theme-accent)]" opacity="0.25" /></>
              ) : (
                <><rect x="2" y="2" width="12" height="12" rx="4" stroke="currentColor" strokeWidth="1.2" className="text-[var(--theme-accent)]" opacity="0.6" /><rect x="4.5" y="4.5" width="7" height="7" rx="2.5" fill="currentColor" className="text-[var(--theme-accent)]" opacity="0.15" /></>
              )}
            </svg>
          </button>
          <button onClick={async () => { await disconnectFromLiveKit(); setActiveChannel(null); }} className="w-10 h-10 rounded-xl flex items-center justify-center btn-haptic bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500 hover:text-white" title="Odadan Ayrıl">
            <PhoneOff size={16} />
          </button>
        </>
      )}
      {/* Ayarlardayken ana sayfa butonu */}
      {view === 'settings' && (
        <>
          <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />
          <button onClick={() => setView('chat')} className="w-10 h-10 rounded-xl flex items-center justify-center btn-haptic bg-[rgba(var(--glass-tint),0.07)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.08)] hover:text-[var(--theme-text)]" title="Ana Sayfa">
            <Home size={16} />
          </button>
        </>
      )}
      </>}
    </div>
  );
}
