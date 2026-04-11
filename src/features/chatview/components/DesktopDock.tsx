import React, { useState, useRef, useEffect } from 'react';
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
  Layers,
  Users,
  Calendar,
  Star,
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
import { searchServers, type Server } from '../../../lib/serverService';

interface Props {
  dockToastHoveredRef: React.MutableRefObject<boolean>;
  listenerToastRef: React.MutableRefObject<number>;
  cardStyle: CardStyle;
  cycleCardStyle: () => void;
  serverList: Server[];
  activeServerId: string;
  onSelectServer: (id: string) => void;
}

export default function DesktopDock({
  dockToastHoveredRef,
  listenerToastRef,
  cardStyle,
  cycleCardStyle,
  serverList,
  activeServerId,
  onSelectServer,
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

  // ── Sunucu dock-expand state ──
  const [serversExpanded, setServersExpanded] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [serverSearchOpen, setServerSearchOpen] = useState(false);
  const [serverInfoId, setServerInfoId] = useState<string | null>(null);
  const [leaveConfirmId, setLeaveConfirmId] = useState<string | null>(null);
  const [showAllServers, setShowAllServers] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const serverAreaRef = useRef<HTMLDivElement>(null);

  // Aktif sunucu her zaman ilk sırada
  const activeServer = serverList.find(s => s.id === activeServerId) ?? serverList[0];
  const otherServers = serverList.filter(s => s.id !== activeServerId);

  // Overflow: varsayılan 3 görünür, tıklanınca hepsi
  const MAX_VISIBLE = 3;
  const displayedServers = showAllServers ? otherServers : otherServers.slice(0, MAX_VISIBLE);
  const overflowCount = otherServers.length - MAX_VISIBLE;

  const handleSelectServer = (id: string) => {
    onSelectServer(id);
    setShowAllServers(false);
  };

  // Sunucu arama sonuçları
  const [discoverResults, setDiscoverResults] = useState<Array<{ id: string; name: string; shortName: string; description: string; memberCount: number }>>([]);
  useEffect(() => {
    if (!serverSearchOpen) return;
    searchServers(serverSearch).then(setDiscoverResults).catch(() => setDiscoverResults([]));
  }, [serverSearch, serverSearchOpen]);

  useEffect(() => {
    if (serverSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [serverSearchOpen]);

  // Info panel dış tıklama ile kapanma
  useEffect(() => {
    if (!serverInfoId) return;
    const handler = (e: MouseEvent) => {
      if (infoPanelRef.current?.contains(e.target as Node)) return;
      setServerInfoId(null);
      setLeaveConfirmId(null);
    };
    // Küçük gecikme — info butonunun kendi click'iyle çakışmasın
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [serverInfoId]);

  // Sunucu expand alanı dış tıklama ile kapanma
  useEffect(() => {
    if (!serversExpanded) return;
    const handler = (e: MouseEvent) => {
      if (serverAreaRef.current?.contains(e.target as Node)) return;
      if (infoPanelRef.current?.contains(e.target as Node)) return;
      setServersExpanded(false);
      setServerSearchOpen(false);
      setServerSearch('');
      setShowAllServers(false);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [serversExpanded]);

  const infoServer = serverInfoId ? serverList.find(s => s.id === serverInfoId) : null;

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
      {/* ── Sunucu alanı — dock içinde expand/collapse ── */}
      {serverList.length > 0 && activeServer && <>
      <div ref={serverAreaRef} className="relative flex items-center gap-1 shrink-0">
        {/* Aktif sunucu — tıkla expand/collapse */}
        <div className="relative group/active shrink-0">
          <button
            onClick={() => { setServersExpanded(prev => !prev); setServerSearchOpen(false); setServerSearch(''); setServerInfoId(null); }}
            title={activeServer.name}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 btn-haptic ${
              serversExpanded
                ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'
                : 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] border border-[var(--theme-accent)]/20'
            }`}
          >
            {activeServer.avatarUrl
              ? <img src={activeServer.avatarUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
              : <span className="text-[11px] font-bold tracking-wide">{activeServer.shortName}</span>
            }
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setServerInfoId(serverInfoId === activeServerId ? null : activeServerId); }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgba(var(--glass-tint),0.15)] flex items-center justify-center opacity-0 group-hover/active:opacity-100 transition-opacity hover:bg-[rgba(var(--glass-tint),0.25)]"
          >
            <Layers size={8} className="text-[var(--theme-text)]" />
          </button>
        </div>

        {/* Expand: görünür sunucular + overflow + search */}
        <AnimatePresence>
          {serversExpanded && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
              className="flex items-center gap-1 overflow-hidden"
            >
              {/* Sunucular — görünür + overflow genişleme */}
              {displayedServers.map(server => (
                <div key={server.id} className="relative group/sv shrink-0">
                  <button
                    onClick={() => handleSelectServer(server.id)}
                    title={server.name}
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-100 text-[var(--theme-secondary-text)] bg-[rgba(var(--glass-tint),0.04)] border border-[rgba(var(--glass-tint),0.05)] hover:bg-[rgba(var(--glass-tint),0.08)] hover:text-[var(--theme-text)]"
                  >
                    {server.avatarUrl
                      ? <img src={server.avatarUrl} alt="" className="w-6 h-6 rounded-md object-cover" />
                      : <span className="text-[10px] font-bold">{server.shortName}</span>
                    }
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setServerInfoId(serverInfoId === server.id ? null : server.id); }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgba(var(--glass-tint),0.15)] flex items-center justify-center opacity-0 group-hover/sv:opacity-100 transition-opacity hover:bg-[rgba(var(--glass-tint),0.25)]"
                  >
                    <Layers size={8} className="text-[var(--theme-text)]" />
                  </button>
                </div>
              ))}

              {/* +N butonu — dock içinde genişletir */}
              {overflowCount > 0 && !showAllServers && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAllServers(true); }}
                  title={`${overflowCount} sunucu daha`}
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100 bg-[rgba(var(--glass-tint),0.04)] text-[var(--theme-secondary-text)]/60 border border-[rgba(var(--glass-tint),0.05)] hover:bg-[rgba(var(--glass-tint),0.08)] hover:text-[var(--theme-text)]"
                >
                  <span className="text-[9px] font-bold">+{overflowCount}</span>
                </button>
              )}

              {/* Sunucu ara / ekle */}
              <button
                onClick={(e) => { e.stopPropagation(); setServerSearchOpen(prev => !prev); setServerInfoId(null); }}
                title="Sunucu bul veya ekle"
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100 border ${
                  serverSearchOpen
                    ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] border-[var(--theme-accent)]/20'
                    : 'bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)]/40 border-dashed border-[rgba(var(--glass-tint),0.08)] hover:bg-[var(--theme-accent)]/8 hover:text-[var(--theme-accent)] hover:border-[var(--theme-accent)]/15'
                }`}
              >
                {serverSearchOpen ? <X size={12} /> : <Search size={13} strokeWidth={1.5} />}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search input — dock içinde, + butonuna basınca açılır */}
        <AnimatePresence>
          {serverSearchOpen && serversExpanded && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 180, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
              className="relative overflow-hidden"
            >
              <div className="flex items-center h-9 rounded-lg bg-[rgba(var(--glass-tint),0.05)] border border-[rgba(var(--glass-tint),0.08)] px-2.5 gap-1.5">
                <Search size={11} className="text-[var(--theme-secondary-text)]/30 shrink-0" />
                <input
                  ref={searchInputRef}
                  value={serverSearch}
                  onChange={(e) => setServerSearch(e.target.value)}
                  placeholder="Sunucu ara..."
                  className="flex-1 bg-transparent text-[10px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/25 outline-none min-w-0"
                />
              </div>

              {/* Search sonuçları — yukarı doğru floating */}
              {discoverResults.length > 0 && (
                <div
                  className="absolute bottom-full left-0 mb-1.5 w-full rounded-lg overflow-hidden z-50"
                  style={{
                    background: 'rgba(var(--theme-sidebar-rgb), 0.94)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(var(--glass-tint), 0.07)',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
                  }}
                >
                  {discoverResults.length === 0 ? (
                    <div className="px-3 py-3 text-[10px] text-[var(--theme-secondary-text)]/40">Sonuç yok</div>
                  ) : (
                    discoverResults.map(s => (
                      <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[rgba(var(--glass-tint),0.05)] transition-colors cursor-pointer">
                        <div className="w-7 h-7 rounded-md bg-[rgba(var(--glass-tint),0.06)] flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]">{s.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{s.name}</div>
                          <div className="text-[8px] text-[var(--theme-secondary-text)]/40 truncate">{s.description} · {s.memberCount} kişi</div>
                        </div>
                        <button className="text-[8px] font-bold text-[var(--theme-accent)] px-2 py-0.5 rounded bg-[var(--theme-accent)]/8 hover:bg-[var(--theme-accent)]/15 transition-colors shrink-0">
                          Katıl
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Sunucu bilgi kartı ── */}
        <AnimatePresence>
          {infoServer && (
            <motion.div
              ref={infoPanelRef}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="absolute bottom-full left-0 mb-2.5 w-60 rounded-2xl z-50 overflow-hidden"
              style={{
                background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.92)',
                backdropFilter: 'blur(40px) saturate(1.5)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
                border: '1px solid rgba(var(--theme-accent-rgb), 0.18)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 6px 16px rgba(0,0,0,0.3), 0 1px 0 rgba(var(--glass-tint), 0.1) inset',
              }}
            >
              {/* Top edge highlight */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--theme-accent-rgb),0.08)] to-transparent" />

              {/* Header */}
              <div className="px-4 pt-4 pb-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/15 flex items-center justify-center shrink-0">
                  {infoServer.avatarUrl
                    ? <img src={infoServer.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                    : <span className="text-[13px] font-bold text-[var(--theme-accent)]">{infoServer.shortName}</span>
                  }
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="text-[13px] font-bold text-[var(--theme-text)] truncate leading-tight">{infoServer.name}</div>
                  <div className="text-[9px] text-[var(--theme-secondary-text)]/55 truncate mt-0.5">{infoServer.description}</div>
                </div>
                {/* Ayrıl butonu — her zaman kırmızı */}
                <button
                  onClick={() => setLeaveConfirmId(leaveConfirmId === infoServer.id ? null : infoServer.id)}
                  title="Sunucudan ayrıl"
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-all duration-150 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
                  </svg>
                </button>
              </div>

              {/* Ayrılma onayı */}
              <AnimatePresence>
                {leaveConfirmId === infoServer.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 mb-3 px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}>
                      <span className="text-[9px] text-[var(--theme-text)]/60 flex-1">Ayrılmak istiyor musun?</span>
                      <button onClick={() => { setLeaveConfirmId(null); setServerInfoId(null); }} className="px-2.5 py-1 rounded-md text-[8px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                        Ayrıl
                      </button>
                      <button onClick={() => setLeaveConfirmId(null)} className="px-2.5 py-1 rounded-md text-[8px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                        Vazgeç
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Separator */}
              <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.12), transparent)' }} />

              {/* İstatistikler */}
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="flex items-center gap-2 text-[var(--theme-secondary-text)]/60"><Users size={11} strokeWidth={1.6} /> Üyeler</span>
                  <span className="font-semibold text-[var(--theme-text)]">{infoServer.memberCount}<span className="text-[var(--theme-secondary-text)]/40 font-normal">/{infoServer.capacity}</span></span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="flex items-center gap-2 text-[var(--theme-secondary-text)]/60"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> Çevrimiçi</span>
                  <span className="font-semibold text-emerald-400">{infoServer.activeCount}</span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="flex items-center gap-2 text-[var(--theme-secondary-text)]/60"><Star size={11} strokeWidth={1.6} /> Seviye</span>
                  <span className="font-semibold text-[var(--theme-accent)]">{infoServer.level}</span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="flex items-center gap-2 text-[var(--theme-secondary-text)]/60"><Calendar size={11} strokeWidth={1.6} /> Oluşturulma</span>
                  <span className="font-medium text-[var(--theme-secondary-text)]/50">{infoServer.createdAt}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
