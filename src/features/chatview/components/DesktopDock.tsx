import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Mic,
  MicOff,
  Settings,
  Check,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  AudioLines,
  Home,
  Undo2,
  Download,
  AlertCircle,
  Info,
  Search,
  Plus,
  X,
  Users,
} from 'lucide-react';
import VoiceControlButton from './VoiceControlButton';
import InactivityCountdownBanner from './InactivityCountdownBanner';
import { formatFullName } from '../../../lib/formatName';
import AvatarContent from '../../../components/AvatarContent';
import { type CardStyle, CARD_STYLES } from '../../../components/chat/cardStyles';
import { getRoomModeConfig } from '../../../lib/roomModeConfig';
import { useAudio } from '../../../contexts/AudioContext';
import { useSettings } from '../../../contexts/SettingsCtx';
import { getFrameTier, getFrameStyle, getFrameClassName } from '../../../lib/avatarFrame';
import { useUI } from '../../../contexts/UIContext';
import { useAppState } from '../../../contexts/AppStateContext';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUser } from '../../../contexts/UserContext';
import { FORCE_MOBILE } from '../constants';
import { searchServers, type Server, type DiscoverServer } from '../../../lib/serverService';

interface Props {
  dockToastHoveredRef: React.MutableRefObject<boolean>;
  listenerToastRef: React.MutableRefObject<number>;
  cardStyle: CardStyle;
  cycleCardStyle: () => void;
  serverList: Server[];
  activeServerId: string;
  onSelectServer: (id: string) => void;
  onJoinServer: (code: string) => Promise<void>;
  onLeaveServer: (serverId: string) => Promise<void>;
  onShowCreateModal: () => void;
  /** App-level rol + 0 sahip sunucu varsa true; değilse + buton gizlenir. */
  canCreateServer?: boolean;
  /** 'fixed' (default): desktop bottom-center sabit pill. 'inline': parent container içinde normal akışta. */
  layout?: 'fixed' | 'inline';
  /** Navigation state machine — dock butonlarının visibility'sini belirler. */
  currentView?: 'room' | 'server_home' | 'discover' | 'settings';
  /** Kullanıcıyı sunucu ana sayfasına götürür (her view'den). */
  onGoHome?: () => void;
  /** Kullanıcıyı aktif odaya geri döndürür (activeChannel set değilse çalışmaz). */
  onReturnToRoom?: () => void;
}

export default function DesktopDock({
  dockToastHoveredRef,
  listenerToastRef,
  cardStyle,
  cycleCardStyle,
  serverList,
  activeServerId,
  onSelectServer,
  onJoinServer,
  onLeaveServer,
  onShowCreateModal,
  canCreateServer = true,
  layout = 'fixed',
  currentView,
  onGoHome,
  onReturnToRoom,
}: Props) {
  const isInline = layout === 'inline';
  const { toastMsg, setToastMsg, setSettingsTarget } = useUI();
  const { currentUser, setCurrentUser, setAllUsers, getEffectiveStatus, getStatusColor } = useUser();
  const {
    showInputSettings, setShowInputSettings, showOutputSettings, setShowOutputSettings,
    inputDevices, outputDevices, selectedInput, setSelectedInput, selectedOutput, setSelectedOutput,
    isPttPressed,
  } = useAudio();
  const {
    isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled,
    voiceMode, setVoiceMode, pttKey, isListeningForKey, setIsListeningForKey,
    avatarBorderColor,
  } = useSettings();
  const {
    isMuted, setIsMuted, isDeafened, setIsDeafened,
    isBroadcastListener, disconnectFromLiveKit, view, setView,
    countdownActive, broadcastModeration,
  } = useAppState();
  const { activeChannel, setActiveChannel, channels } = useChannel();

  const isAdminMuted = currentUser.isMuted === true;

  // ── Self control panel ──
  const [selfPanelOpen, setSelfPanelOpen] = useState(false);
  const selfPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selfPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (selfPanelRef.current?.contains(e.target as Node)) return;
      setSelfPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selfPanelOpen]);

  const setSelfStatus = (next: string) => {
    if (!currentUser.id) return;
    const updated = { ...currentUser, statusText: next };
    setCurrentUser(updated);
    setAllUsers(prev => prev.map(u => u.id === currentUser.id ? updated : u));
    broadcastModeration(currentUser.id, { statusText: next });
  };

  // ── Sunucu dock state ──
  const [serverSearch, setServerSearch] = useState('');
  const [serverSearchOpen, setServerSearchOpen] = useState(false);
  const [serverListOpen, setServerListOpen] = useState(false);
  const [leaveConfirmId, setLeaveConfirmId] = useState<string | null>(null);
  const [openUpwards, setOpenUpwards] = useState(true);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const resultItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const serverListRef = useRef<HTMLDivElement>(null);
  const serverAreaRef = useRef<HTMLDivElement>(null);

  // Orientation: wrapper (anchor) + gerçek panel yüksekliği. Panel henüz mount
  // olmadığında (ilk açılış) 320 fallback; useLayoutEffect sonrası gerçek
  // ölçüme göre gerekirse flicker'sız düzeltilir.
  const PANEL_FALLBACK_HEIGHT = 320;
  const measurePanelOrientation = () => {
    const wrapper = searchPanelRef.current;
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const panelHeight = panelContentRef.current?.getBoundingClientRect().height ?? PANEL_FALLBACK_HEIGHT;
    const spaceAbove = wrapperRect.top;
    const spaceBelow = window.innerHeight - wrapperRect.bottom;
    if (spaceBelow >= panelHeight) setOpenUpwards(false);
    else if (spaceAbove >= panelHeight) setOpenUpwards(true);
    else setOpenUpwards(spaceAbove > spaceBelow);
  };

  const activeServer = serverList.find(s => s.id === activeServerId) ?? serverList[0];
  const activeId = activeServer?.id;
  const otherServers = serverList.filter(s => s.id !== activeId);

  const handleSelectServer = (id: string) => {
    onSelectServer(id);
    setServerListOpen(false);
  };

  // Sunucu arama
  const [discoverResults, setDiscoverResults] = useState<DiscoverServer[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQueried, setSearchQueried] = useState(false);
  useEffect(() => {
    if (!serverSearchOpen) { setDiscoverResults([]); setSearchQueried(false); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      searchServers(serverSearch)
        .then(r => { setDiscoverResults(r); setSearchQueried(true); })
        .catch(() => { setDiscoverResults([]); setSearchQueried(true); })
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [serverSearch, serverSearchOpen]);

  // Panel açıldığında input'a güvenilir autofocus: rAF ile mount + motion
  // commit sonrasına geciktir; magic setTimeout yerine paint-sync.
  useEffect(() => {
    if (!serverSearchOpen) return;
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [serverSearchOpen]);

  // Panel açıkken resize olursa orientation'ı yeniden hesapla — viewport safe.
  useEffect(() => {
    if (!serverSearchOpen) return;
    const onResize = () => measurePanelOrientation();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [serverSearchOpen]);

  // Panel mount sonrası gerçek yüksekliği ölç ve gerekirse orientation'ı
  // düzelt. useLayoutEffect paint'ten önce çalıştığı için kullanıcı flicker
  // görmez. Sonuç sayısı değişince panel yüksekliği değişir — tekrar ölçeriz.
  useLayoutEffect(() => {
    if (!serverSearchOpen) return;
    measurePanelOrientation();
  }, [serverSearchOpen, discoverResults.length]);

  // ── Klavye navigasyonu: highlightedIndex reset/clamp ──
  useEffect(() => { setHighlightedIndex(-1); }, [serverSearchOpen]);
  useEffect(() => { setHighlightedIndex(-1); }, [serverSearch]);
  useEffect(() => {
    if (highlightedIndex >= discoverResults.length) setHighlightedIndex(-1);
  }, [discoverResults.length, highlightedIndex]);

  // Highlight değişince ilgili satırı scroll alanı içine getir (sadece panel scroll'u).
  useEffect(() => {
    if (highlightedIndex < 0) return;
    const item = resultItemRefs.current[highlightedIndex];
    const container = resultsListRef.current;
    if (!item || !container) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (itemTop < viewTop) container.scrollTop = itemTop;
    else if (itemBottom > viewBottom) container.scrollTop = itemBottom - container.clientHeight;
  }, [highlightedIndex]);

  const selectSearchResult = (s: DiscoverServer) => {
    if (s.role) {
      setServerSearchOpen(false);
      setServerSearch('');
      return;
    }
    void onJoinServer(s.id);
    setServerSearchOpen(false);
    setServerSearch('');
  };

  // Dış tıklama — search paneli
  useEffect(() => {
    if (!serverSearchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchPanelRef.current?.contains(e.target as Node)) return;
      setServerSearchOpen(false);
      setServerSearch('');
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [serverSearchOpen]);

  // Dış tıklama — sunucu listesi
  useEffect(() => {
    if (!serverListOpen) return;
    const handler = (e: MouseEvent) => {
      if (serverListRef.current?.contains(e.target as Node)) return;
      if (serverAreaRef.current?.contains(e.target as Node)) return;
      setServerListOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [serverListOpen]);

  return (
    <div
      className={
        isInline
          ? 'flex flex-wrap items-center justify-center gap-1.5 px-2 py-2 min-h-[48px]'
          : `${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} fixed bottom-4 z-30 items-center gap-1.5 px-3 py-2 rounded-2xl min-h-[48px]`
      }
      /* fixed mode: sidebar'lar arası content alanının tam ortası. inline mode: parent (MobileFooter) styling'i kullanır. */
      style={isInline
        ? undefined
        : { left: 'calc(50% + 8px)', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(var(--glass-tint), 0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)' }
      }
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
      ) : countdownActive ? (
        <InactivityCountdownBanner compact />
      ) : <>
      {/* ── Kendi kullanıcı kartı — avatar + isim + effective status ── */}
      {(() => {
        const effStatus = getEffectiveStatus();
        const statusColorClass = getStatusColor(effStatus);
        const displayName = formatFullName(currentUser.firstName, currentUser.lastName) || currentUser.name;
        return (
          <div className="relative shrink-0" ref={selfPanelRef}>
            <button
              onClick={() => setSelfPanelOpen(o => !o)}
              className="flex items-center gap-2 pr-2.5 pl-1 py-1 mr-1 border-r border-[rgba(var(--glass-tint),0.08)] rounded-lg hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
              title={`${displayName} — ${effStatus}`}
            >
              {(() => {
                const ft = getFrameTier(currentUser.userLevel, { isPrimaryAdmin: !!currentUser.isPrimaryAdmin, isAdmin: !!currentUser.isAdmin });
                const isSpeakingInline = isInline && isPttPressed;
                return (
                  <div
                    className={`relative shrink-0 ${getFrameClassName(ft)}`}
                    style={{ ...getFrameStyle(avatarBorderColor, ft), borderRadius: 12 }}
                  >
                    {/* Mobil: konuşma sırasında avatar etrafına accent glow — desktop'ta gösterilmez */}
                    {isSpeakingInline && (
                      <div
                        aria-hidden="true"
                        className="absolute pointer-events-none animate-pulse"
                        style={{
                          inset: -3,
                          borderRadius: 14,
                          boxShadow: '0 0 0 2px var(--theme-accent), 0 0 14px rgba(var(--theme-accent-rgb), 0.55)',
                        }}
                      />
                    )}
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-[var(--theme-accent)]/10 flex items-center justify-center">
                      <AvatarContent avatar={currentUser.avatar} statusText={effStatus} firstName={currentUser.firstName} name={currentUser.name} imgClassName="w-9 h-9 object-cover" letterClassName="text-[12px] font-bold text-[var(--theme-accent)]" />
                    </div>
                    {/* Mobil: avatar sağ-alt köşe status dot — desktop'ta gösterilmez */}
                    {isInline && (
                      <div
                        aria-hidden="true"
                        className={`absolute -bottom-[2px] -right-[2px] w-[11px] h-[11px] rounded-full ${getStatusDotClass(effStatus)}`}
                        style={{ border: '2px solid var(--theme-bg)', zIndex: 2 }}
                      />
                    )}
                  </div>
                );
              })()}
              <div className="flex flex-col leading-tight min-w-0 max-w-[120px] text-left">
                <span className="text-[11px] font-semibold text-[var(--theme-text)] truncate">{displayName}</span>
                <span className={`text-[9px] font-medium ${statusColorClass} truncate`}>{effStatus}</span>
              </div>
            </button>
            <AnimatePresence>
              {selfPanelOpen && (
                <SelfControlPanel
                  currentStatus={currentUser.statusText ?? 'Online'}
                  canInvisible={
                    !!currentUser.isAdmin
                    || !!currentUser.isModerator
                    || currentUser.userLevel === '2'
                    || currentUser.userLevel === '3'
                  }
                  isInRoom={!!activeChannel}
                  onStatusChange={(s) => { setSelfStatus(s); setSelfPanelOpen(false); }}
                  onOpenSettings={() => { setSettingsTarget('account'); setView('settings'); setSelfPanelOpen(false); }}
                  onClose={() => setSelfPanelOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>
        );
      })()}
      {/* ── Sunucu alanı — kompakt default ── */}
      {serverList.length > 0 && activeServer && <>
      <div ref={serverAreaRef} className="relative flex items-center gap-1 shrink-0">
        {/* Aktif sunucu — tıkla → diğer sunucular yukarı açılır */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setServerListOpen(prev => !prev); setServerSearchOpen(false); setServerSearch(''); }}
            title={activeServer.name}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 btn-haptic border ${
              serverListOpen ? 'bg-[var(--theme-accent)]/15 border-[var(--theme-accent)]/25' : 'bg-[var(--theme-accent)]/10 border-[var(--theme-accent)]/20'
            } text-[var(--theme-accent)]`}
          >
            {activeServer.avatarUrl
              ? <img src={activeServer.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
              : <span className="text-[11px] font-bold tracking-wide">{activeServer.shortName}</span>
            }
          </button>
          {/* Sunucu sayısı badge */}
          {otherServers.length > 0 && !serverListOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--theme-accent)] text-[7px] font-bold text-[var(--theme-text-on-accent,#000)] flex items-center justify-center">
              {otherServers.length}
            </span>
          )}
          {/* Sunucu listesi — yukarı açılır */}
          <AnimatePresence>
            {serverListOpen && otherServers.length > 0 && (
              <motion.div ref={serverListRef}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[200px] max-h-[280px] overflow-y-auto rounded-xl z-[100]"
                style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.95)', backdropFilter: 'blur(24px)', border: '1px solid rgba(var(--glass-tint), 0.1)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                <div className="px-3 py-2 text-[8px] font-semibold text-[var(--theme-secondary-text)]/30 uppercase tracking-wider">Sunucular</div>
                {otherServers.map(s => (
                  <button key={s.id} onClick={() => handleSelectServer(s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors text-left border-b border-[rgba(var(--glass-tint),0.04)] last:border-b-0">
                    <div className="w-7 h-7 rounded-[8px] overflow-hidden flex items-center justify-center shrink-0" style={{ background: s.avatarUrl ? 'none' : 'rgba(var(--glass-tint), 0.08)' }}>
                      {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-7 h-7 rounded-[8px] object-cover" /> : <span className="text-[9px] font-bold text-[var(--theme-accent)]">{s.shortName}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{s.name}</div>
                      <div className="text-[8px] text-[var(--theme-secondary-text)]/40">{s.memberCount} üye</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sunucu oluştur — mobilde gizli, LeftSidebar'da aynı aksiyon */}
        {!isInline && canCreateServer && (
          <button onClick={() => onShowCreateModal()} title="Sunucu oluştur"
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100 border bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)]/40 border-[rgba(var(--glass-tint),0.06)] hover:bg-emerald-500/8 hover:text-emerald-400 hover:border-emerald-500/15">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        )}

      </div>
      <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />
      </>}
      {/* Mikrofon + ayar */}
      <div className="relative group/mic">
        <VoiceControlButton
          active={!isMuted}
          icon={Mic}
          offIcon={MicOff}
          override={isAdminMuted ? 'warning' : null}
          onClick={() => {
            if (isBroadcastListener) { if (Date.now() - (listenerToastRef.current || 0) > 3000) { setToastMsg('Bu odada yalnızca konuşmacılar yayın yapabilir.'); listenerToastRef.current = Date.now(); } return; }
            if (isAdminMuted) return;
            if (isMuted && isDeafened) setIsDeafened(false);
            setIsMuted(!isMuted);
          }}
          title={isAdminMuted ? 'Susturuldu' : isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
        />
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
        <VoiceControlButton
          active={!isDeafened}
          icon={Headphones}
          offIcon={HeadphoneOff}
          onClick={() => setIsDeafened(!isDeafened)}
          title={isDeafened ? 'Sağırlığı kaldır' : 'Hoparlörü kapat'}
        />
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
      {/* Gürültü Susturma — mobilde gizli, Ayarlar → Ses'te aynı seçenek */}
      {!isInline && <button
        onClick={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center btn-haptic ${
          isNoiseSuppressionEnabled
            ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'
            : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.06)]'
        }`}
        title={isNoiseSuppressionEnabled ? 'Gürültü Susturma: Açık' : 'Gürültü Susturma: Kapalı'}
      >
        <AudioLines size={16} />
        {!isNoiseSuppressionEnabled && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span
              className="block w-[22px] h-[1.5px] rotate-45"
              style={{ background: 'currentColor', opacity: 0.55 }}
            />
          </span>
        )}
      </button>}
      {/* Ses modu butonu — mobilde gizli, Ayarlar → Ses'te PTT/VAD değişimi */}
      {!isInline && activeChannel && (() => {
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
      {/* Oda kontrolleri — activeChannel her view'de PhoneOff gösterir;
          CardStyle sadece currentView='room' iken. */}
      {activeChannel && (
        <>
          <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />
          {/* Kart stili döngüsü — sadece room view'inde (tek anlamlı yer). */}
          {currentView === 'room' && !isInline && <button
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
          </button>}
          {/* Çağrıdan Ayrıl — voice disconnect + kanaldan tam çık.
              Kullanıcı gerçekten ayrılsın: voice bağlantısı kapanır, activeChannel
              null'a döner, voice avatar listesinden düşer. Home butonu "peek" için. */}
          <button
            onClick={async () => { await disconnectFromLiveKit(); setActiveChannel(null); }}
            className="w-10 h-10 rounded-xl flex items-center justify-center btn-haptic bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500 hover:text-white transition-colors duration-150"
            title="Çağrıdan Ayrıl"
          >
            <PhoneOff size={16} />
          </button>
        </>
      )}
      {/* ── Navigation state machine buttons ──
          Matrix:              Home  Return
            room                ✅     ❌
            server_home         ❌     ✅ (activeChannel gerek)
            discover            ✅     ✅
            settings            ✅     ✅
          Divider: activeChannel varsa yukarıdaki PhoneOff bloğu zaten ekledi,
          burada duplicate önlemek için sadece activeChannel yoksa eklenir. */}
      {(() => {
        if (!currentView) return null;
        const showHome = currentView !== 'server_home';
        const showReturn = !!activeChannel && currentView !== 'room';
        if (!showHome && !showReturn) return null;
        return (
          <>
            {!activeChannel && <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />}
            {/* Return (Undo2) daima Home'un solunda — "geri" aksiyonu sol, "ileri" sağ. */}
            {showReturn && onReturnToRoom && (
              <button
                onClick={onReturnToRoom}
                className="w-10 h-10 rounded-xl flex items-center justify-center btn-haptic bg-[rgba(var(--glass-tint),0.07)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.08)] hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.12)] transition-colors duration-150"
                title="Sohbet odasına dön"
              >
                <Undo2 size={16} />
              </button>
            )}
            {showHome && onGoHome && (
              <button
                onClick={onGoHome}
                className="w-10 h-10 rounded-xl flex items-center justify-center btn-haptic bg-[rgba(var(--glass-tint),0.07)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.08)] hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.12)] transition-colors duration-150"
                title="Sunucu ana sayfası"
              >
                <Home size={16} />
              </button>
            )}
          </>
        );
      })()}
      </>}
    </div>
  );
}

// ── Status dot bg sınıfı (mobil avatar overlay için) ─────────────────────
// App.tsx'teki getStatusColor text-* sınıflarını bg-* karşılıklarına çevirir.
// Tek kullanım yeri bu dosyada (inline avatar dot) olduğu için burada duruyor.
function getStatusDotClass(statusText: string): string {
  if (statusText === 'Online' || statusText === 'Aktif') return 'bg-emerald-400';
  if (statusText === 'Dinliyor') return 'bg-orange-500';
  if (statusText === 'Sessiz') return 'bg-[var(--theme-secondary-text)]';
  if (statusText === 'AFK') return 'bg-violet-400';
  if (statusText === 'Pasif') return 'bg-yellow-500';
  if (statusText === 'Duymuyor' || statusText === 'Rahatsız Etmeyin') return 'bg-red-400';
  if (statusText === 'Çevrimdışı') return 'bg-[var(--theme-secondary-text)]/60';
  return 'bg-blue-500';
}

// ── Self Control Panel ──────────────────────────────────────────────────
// Dock user chip'inden anchor'lı compact quick actions: status, mic/deafen,
// settings. Modal yok, dropdown tarzı.
// Status seçenekleri. 'Çevrimdışı' = premium/staff-only "appear offline" —
// presence normalize'dan muaf (usePresence.ts'te Aktif→Online haricinde
// koruma yok). Gating SelfControlPanel'de `canInvisible` ile uygulanır.
const STATUS_OPTIONS: Array<{ key: string; label: string; dot: string; premium?: boolean }> = [
  { key: 'Online', label: 'Çevrimiçi', dot: 'bg-emerald-400' },
  { key: 'AFK', label: 'AFK', dot: 'bg-violet-400' },
  { key: 'Rahatsız Etmeyin', label: 'Rahatsız Etmeyin', dot: 'bg-red-400' },
  { key: 'Çevrimdışı', label: 'Çevrimdışı', dot: 'bg-[var(--theme-secondary-text)]/40', premium: true },
];

function SelfControlPanel({
  currentStatus,
  canInvisible,
  isInRoom,
  onStatusChange,
  onOpenSettings,
}: {
  currentStatus: string;
  canInvisible: boolean;
  /** Kullanıcı bir sohbet/ses odasında mı — Çevrimdışı seçimini bloklar. */
  isInRoom: boolean;
  onStatusChange: (s: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const visibleOptions = STATUS_OPTIONS.filter(o => !o.premium || canInvisible);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.1 } }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-full left-0 mb-2 w-[240px] rounded-2xl overflow-hidden z-50"
      style={{
        background: 'var(--theme-bg)',
        border: '1px solid var(--theme-border)',
        boxShadow:
          '0 24px 56px -16px rgba(var(--shadow-base),0.55),' +
          ' 0 6px 16px -4px rgba(var(--shadow-base),0.22),' +
          ' inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Status section */}
      <div className="px-2 pt-2 pb-1">
        <span className="px-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/60 block mb-1">
          Durum
        </span>
        <div className="flex flex-col">
          {visibleOptions.map(opt => {
            const active = currentStatus === opt.key;
            // Oda içindeyken Çevrimdışı seçilemez — presence broadcast'i canlı
            // kullanıcılar için "invisible" semantiğini bozmasın diye kilitlenir.
            const disabled = isInRoom && opt.key === 'Çevrimdışı';
            return (
              <button
                key={opt.key}
                onClick={() => { if (!disabled) onStatusChange(opt.key); }}
                disabled={disabled}
                aria-disabled={disabled}
                title={disabled ? 'Oda içindeyken Çevrimdışı seçilemez' : undefined}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : active
                      ? 'bg-[var(--theme-accent)]/10'
                      : 'hover:bg-[var(--theme-panel-hover)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                  <span className={`text-[11.5px] ${active ? 'font-semibold text-[var(--theme-accent)]' : 'text-[var(--theme-text)]/85'}`}>
                    {opt.label}
                  </span>
                </span>
                {active && !disabled && <Check size={11} className="text-[var(--theme-accent)]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px" style={{ background: 'rgba(var(--glass-tint), 0.10)' }} />

      {/* Settings */}
      <div className="px-2 py-2">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11.5px] text-[var(--theme-text)]/85 hover:bg-[var(--theme-panel-hover)] transition-colors"
        >
          <Settings size={12} className="text-[var(--theme-secondary-text)]/70" />
          <span>Hesap Ayarları</span>
        </button>
      </div>
    </motion.div>
  );
}
