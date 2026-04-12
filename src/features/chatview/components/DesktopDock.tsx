import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
  Search,
  Plus,
  X,
  Users,
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
      className={`${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} fixed bottom-4 z-30 items-center gap-1.5 px-3 py-2 rounded-2xl min-h-[48px]`}
      /* Sidebar'lar arası content alanının tam ortası */
      style={{ left: 'calc(50% + 8px)', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(var(--glass-tint), 0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)' }}
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

        {/* Search butonu */}
        <div className="relative shrink-0" ref={searchPanelRef}>
          <button onClick={() => {
              if (!serverSearchOpen) measurePanelOrientation();
              setServerSearchOpen(prev => !prev);
              setServerListOpen(false);
            }} title="Sunucu bul"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-100 border ${
              serverSearchOpen ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] border-[var(--theme-accent)]/20' : 'bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)]/40 border-[rgba(var(--glass-tint),0.06)] hover:bg-[var(--theme-accent)]/8 hover:text-[var(--theme-accent)]'
            }`}>
            {serverSearchOpen ? <X size={12} /> : <Search size={13} strokeWidth={1.5} />}
          </button>
          {/* Search panel — viewport'a göre yukarı/aşağı açılır */}
          <AnimatePresence>
            {serverSearchOpen && (
              <motion.div
                ref={panelContentRef}
                initial={{ opacity: 0, y: openUpwards ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: openUpwards ? 6 : -6 }}
                transition={{ duration: 0.12 }}
                className={`absolute left-1/2 -translate-x-1/2 w-[240px] rounded-xl z-[100] overflow-hidden ${openUpwards ? 'bottom-full mb-2' : 'top-full mt-2'}`}
                style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.95)', backdropFilter: 'blur(24px)', border: '1px solid rgba(var(--glass-tint), 0.1)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center h-9 px-3 gap-1.5 border-b border-[rgba(var(--glass-tint),0.06)]">
                  <Search size={11} className="text-[var(--theme-secondary-text)]/30 shrink-0" />
                  <input ref={searchInputRef} value={serverSearch} onChange={e => setServerSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setServerSearchOpen(false); setServerSearch(''); return; }
                      if (e.key === 'ArrowDown') {
                        if (discoverResults.length === 0) return;
                        e.preventDefault();
                        setHighlightedIndex(i => {
                          if (i < 0) return 0;
                          return Math.min(i + 1, discoverResults.length - 1);
                        });
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        if (discoverResults.length === 0) return;
                        e.preventDefault();
                        setHighlightedIndex(i => {
                          if (i < 0) return discoverResults.length - 1;
                          return Math.max(i - 1, 0);
                        });
                        return;
                      }
                      if (e.key === 'Enter' && discoverResults.length > 0) {
                        e.preventDefault();
                        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
                        const target = discoverResults[idx];
                        if (target) selectSearchResult(target);
                      }
                    }}
                    placeholder="Sunucu ara..." className="flex-1 bg-transparent text-[10px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/25 outline-none min-w-0" />
                  {serverSearch && !searchLoading && (
                    <button
                      type="button"
                      onClick={() => { setServerSearch(''); searchInputRef.current?.focus(); }}
                      className="w-4 h-4 flex items-center justify-center rounded text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.08)] transition-colors shrink-0"
                      title="Temizle"
                    >
                      <X size={10} />
                    </button>
                  )}
                  {searchLoading && <div className="w-3 h-3 border border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin shrink-0" />}
                </div>
                {searchQueried && serverSearch.trim() && (
                  <div ref={resultsListRef} className="overflow-y-auto" style={{ maxHeight: 'min(60vh, 400px)' }}>
                    {discoverResults.length === 0 ? (
                      <div className="px-4 py-4 text-center text-[10px] text-[var(--theme-secondary-text)]/40">Sonuç bulunamadı</div>
                    ) : discoverResults.map((s, idx) => {
                      const isHighlighted = idx === highlightedIndex;
                      return (
                        <div
                          key={s.id}
                          ref={el => { resultItemRefs.current[idx] = el; }}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => selectSearchResult(s)}
                          className={`flex items-center gap-2.5 px-3 py-2 transition-colors cursor-pointer border-b border-[rgba(var(--glass-tint),0.04)] last:border-b-0 ${
                            isHighlighted
                              ? 'bg-[var(--theme-accent)]/8 border-l-2 border-l-[var(--theme-accent)]/60 pl-[10px]'
                              : 'hover:bg-[rgba(var(--glass-tint),0.06)]'
                          }`}
                        >
                          <div className="w-7 h-7 rounded-[8px] overflow-hidden flex items-center justify-center shrink-0" style={{ background: s.avatarUrl ? 'none' : 'rgba(var(--glass-tint), 0.08)' }}>
                            {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-7 h-7 rounded-[8px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} /> : null}
                            <span className={`text-[9px] font-bold text-[var(--theme-accent)] ${s.avatarUrl ? 'hidden' : ''}`}>{s.shortName || s.name.slice(0, 2).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{s.name}</div>
                            <div className="text-[8px] text-[var(--theme-secondary-text)]/40 truncate">{s.memberCount} üye</div>
                          </div>
                          {s.role ? (
                            <span className="text-[8px] text-[var(--theme-secondary-text)]/40 shrink-0">Üye</span>
                          ) : (
                            <button onClick={e => { e.stopPropagation(); onJoinServer(s.id); setServerSearchOpen(false); setServerSearch(''); }}
                              className="text-[8px] font-bold text-[var(--theme-accent)] px-2 py-0.5 rounded bg-[var(--theme-accent)]/10 hover:bg-[var(--theme-accent)]/20 shrink-0">Katıl</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sunucu oluştur — modern ikon */}
        <button onClick={() => onShowCreateModal()} title="Sunucu oluştur"
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100 border bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)]/40 border-[rgba(var(--glass-tint),0.06)] hover:bg-emerald-500/8 hover:text-emerald-400 hover:border-emerald-500/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>

      </div>
      <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />
      </>}
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
