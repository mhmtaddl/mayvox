import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Zap, MessageSquareWarning, ListFilter, Filter, BookLock, Search, X, ChevronLeft, ChevronRight, ScrollText, Download, Gavel } from 'lucide-react';
import {
  type ModerationConfigResponse, type FloodConfig,
  type ModerationStats, type ModStatRange,
  type ModerationEvent,
  type AutoPunishmentFloodConfig,
  type ActiveAutoPunishment,
  getModerationConfig, updateModerationConfig, getModerationStats, getModerationEvents,
  getActiveAutoPunishments, getServerDetails,
} from '../../../lib/serverService';
import ExportDialog, { type ExportMode, type DateRange } from './ExportDialog';
import { buildModEventsXlsx } from '../../../lib/buildModEventsXlsx';
import AutoPunishmentCard from './AutoPunishmentCard';
import { Loader } from './shared';
import { useUser } from '../../../contexts/UserContext';
import { getStatusAvatar, hasCustomAvatar } from '../../../lib/statusAvatar';
import cevrimdisiPng from '../../../assets/profil/cevrimdisi.png';
// Sistem kara listesi — tek gerçek kaynak (chat-server ile aynı dosya).
// Vite JSON import native; build-time inline olur, runtime fetch yok.
// Shape: { [langCode]: string[] }  (multi-language object)
import SYSTEM_BLACKLIST_RAW from '../../../../system-profanity.json';
const SYSTEM_BLACKLIST_BY_LANG = SYSTEM_BLACKLIST_RAW as Record<string, string[]>;
const SYSTEM_BLACKLIST_TOTAL = Object.values(SYSTEM_BLACKLIST_BY_LANG).reduce((a, arr) => a + arr.length, 0);

// Dil kodu → (ad, bayrak emoji). Liste user'ın verdiği kod tablosu ile senkron.
const LANG_META: Record<string, { name: string; flag: string }> = {
  tr:                 { name: 'Türkçe',               flag: '🇹🇷' },
  en:                 { name: 'English',              flag: '🇬🇧' },
  ar:                 { name: 'العربية',              flag: '🇸🇦' },
  cs:                 { name: 'Čeština',              flag: '🇨🇿' },
  da:                 { name: 'Dansk',                flag: '🇩🇰' },
  de:                 { name: 'Deutsch',              flag: '🇩🇪' },
  eo:                 { name: 'Esperanto',            flag: '🌐' },
  es:                 { name: 'Español',              flag: '🇪🇸' },
  fa:                 { name: 'فارسی',                flag: '🇮🇷' },
  fi:                 { name: 'Suomi',                flag: '🇫🇮' },
  fil:                { name: 'Filipino',             flag: '🇵🇭' },
  fr:                 { name: 'Français',             flag: '🇫🇷' },
  'fr-CA-u-sd-caqc':  { name: 'Français (Québec)',    flag: '🇨🇦' },
  hi:                 { name: 'हिन्दी',                flag: '🇮🇳' },
  hu:                 { name: 'Magyar',               flag: '🇭🇺' },
  it:                 { name: 'Italiano',             flag: '🇮🇹' },
  ja:                 { name: '日本語',               flag: '🇯🇵' },
  kab:                { name: 'Taqbaylit',            flag: '🏳️' },
  ko:                 { name: '한국어',               flag: '🇰🇷' },
  nl:                 { name: 'Nederlands',           flag: '🇳🇱' },
  no:                 { name: 'Norsk',                flag: '🇳🇴' },
  pl:                 { name: 'Polski',               flag: '🇵🇱' },
  pt:                 { name: 'Português',            flag: '🇵🇹' },
  ru:                 { name: 'Русский',              flag: '🇷🇺' },
  sv:                 { name: 'Svenska',              flag: '🇸🇪' },
  th:                 { name: 'ไทย',                  flag: '🇹🇭' },
  tlh:                { name: 'Klingon',              flag: '🖖' },
  zh:                 { name: '中文',                 flag: '🇨🇳' },
};

const WORDS_PER_PAGE = 60;

// Moderation stats — time-range selector
const RANGE_LABELS: Record<ModStatRange, string> = { '5m': '5 dk', '1h': '1 saat', '24h': '24 saat' };
const STATS_REFRESH_MS = 30_000;
const EMPTY_STATS: ModerationStats = { floodBlocked: 0, profanityBlocked: 0, spamBlocked: 0 };

export interface AutoModActions {
  onSave: () => void;
  onReset: () => void;
}

interface Props {
  serverId: string;
  showToast: (m: string) => void;
  /** Parent'a dirty/saving state'ini iletir — tab bar sağında action pill göstermek için. */
  onStateChange?: (state: { dirty: boolean; saving: boolean }) => void;
  /** Parent'ın action pill'leri tetiklemesi için handler ref. Her render'da güncellenir. */
  actionsRef?: React.MutableRefObject<AutoModActions | null>;
}

const FLOOD_DEFAULT: FloodConfig = { enabled: true, cooldownMs: 3000, limit: 5, windowMs: 5000 };
const AUTOPUNISH_FLOOD_DEFAULT: AutoPunishmentFloodConfig = {
  enabled: false,
  threshold: 3,
  windowMinutes: 5,
  action: 'chat_timeout',
  durationMinutes: 10,
};

// UI'de gösterilecek limit/aralık sınırları — backend validation ile aynı.
const BOUNDS = {
  cooldownMs: { min: 1000, max: 60_000, step: 500 },
  limit:      { min: 1,    max: 50,     step: 1 },
  // windowMs min 6s — çok dar pencere normal konuşmayı yanlış pozitif flood sayar.
  windowMs:   { min: 6000, max: 60_000, step: 500 },
};


export default function AutoModerationTab({ serverId, showToast, onStateChange, actionsRef }: Props) {
  // Presence: kullanıcıların anlık durumları (statusText) avatar fallback'te kullanılır.
  const { allUsers } = useUser();
  const userStatusMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const u of allUsers) m.set(u.id, u.statusText ?? null);
    return m;
  }, [allUsers]);
  const resolveStatusAvatar = useCallback(
    (userId: string | null): string => {
      if (!userId) return cevrimdisiPng;
      const statusText = userStatusMap.get(userId) ?? null;
      return getStatusAvatar(statusText) ?? cevrimdisiPng;
    },
    [userStatusMap],
  );

  const [initial, setInitial] = useState<ModerationConfigResponse | null>(null);
  const [flood, setFlood] = useState<FloodConfig>(FLOOD_DEFAULT);
  const [profanityEnabled, setProfanityEnabled] = useState(false);
  // Textarea'da her satır bir kelime — state string olarak tutulur, save'de split edilir.
  const [profanityText, setProfanityText] = useState('');
  const [spamEnabled, setSpamEnabled] = useState(false);
  const [autoPunishFlood, setAutoPunishFlood] = useState<AutoPunishmentFloodConfig>(AUTOPUNISH_FLOOD_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const cfg = await getModerationConfig(serverId);
      setInitial(cfg);
      setFlood(cfg.flood);
      setProfanityEnabled(cfg.profanity.enabled);
      setProfanityText((cfg.profanity.words || []).join('\n'));
      setSpamEnabled(cfg.spam.enabled);
      setAutoPunishFlood(cfg.autoPunishment?.flood ?? AUTOPUNISH_FLOOD_DEFAULT);
    } catch (err: any) {
      showToast(err?.message || 'Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [serverId, showToast]);

  useEffect(() => { load(); }, [load]);

  // Textarea → temiz kelime listesi (boş satır at, trim, dedup).
  const parseProfanityWords = useCallback(() => {
    const set = new Set<string>();
    const out: string[] = [];
    for (const raw of profanityText.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (set.has(key)) continue;
      set.add(key);
      out.push(t);
    }
    return out;
  }, [profanityText]);

  const currentWords = parseProfanityWords();
  const initialWordsStr = initial ? (initial.profanity.words || []).join('\n') : '';

  const dirty = initial != null && (
    flood.enabled    !== initial.flood.enabled ||
    flood.cooldownMs !== initial.flood.cooldownMs ||
    flood.limit      !== initial.flood.limit ||
    flood.windowMs   !== initial.flood.windowMs ||
    profanityEnabled !== initial.profanity.enabled ||
    profanityText    !== initialWordsStr ||
    spamEnabled      !== initial.spam.enabled ||
    autoPunishFlood.enabled         !== initial.autoPunishment.flood.enabled ||
    autoPunishFlood.threshold       !== initial.autoPunishment.flood.threshold ||
    autoPunishFlood.windowMinutes   !== initial.autoPunishment.flood.windowMinutes ||
    autoPunishFlood.durationMinutes !== initial.autoPunishment.flood.durationMinutes ||
    autoPunishFlood.action          !== initial.autoPunishment.flood.action
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateModerationConfig(serverId, {
        flood,
        profanity: { enabled: profanityEnabled, words: currentWords },
        spam: { enabled: spamEnabled },
        autoPunishment: { flood: autoPunishFlood },
      });
      setInitial(prev => prev ? {
        ...prev,
        flood,
        profanity: { enabled: profanityEnabled, words: currentWords },
        spam: { enabled: spamEnabled },
        autoPunishment: { flood: autoPunishFlood },
      } : prev);
      // UI'yi normalize sonuç ile hizala (dedup/trim eksik satır varsa).
      setProfanityText(currentWords.join('\n'));
      showToast('Oto-Mod ayarları kaydedildi');
    } catch (err: any) {
      showToast(err?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!initial) return;
    setFlood(initial.flood);
    setProfanityEnabled(initial.profanity.enabled);
    setProfanityText((initial.profanity.words || []).join('\n'));
    setSpamEnabled(initial.spam.enabled);
    setAutoPunishFlood(initial.autoPunishment?.flood ?? AUTOPUNISH_FLOOD_DEFAULT);
  };

  // Parent'a dirty/saving state'ini ve save/reset handler'larını ilet.
  // Bu sayede ServerSettings tab bar'ındaki Kaydet/Sıfırla pill'leri dirty-aware olur.
  useEffect(() => {
    onStateChange?.({ dirty, saving });
  }, [dirty, saving, onStateChange]);
  if (actionsRef) {
    actionsRef.current = { onSave: handleSave, onReset: handleReset };
  }

  // Refactor: Rules merged card — sadece bir sekme açık
  const [activeRuleTab, setActiveRuleTab] = useState<'flood' | 'profanity' | 'spam'>('flood');
  // Refactor: Aktif cezalar compact liste toggle
  const [showAllActive, setShowAllActive] = useState(false);

  // Moderation stats — time range + gerçek backend fetch + 30s refresh
  const [timeRange, setTimeRange] = useState<ModStatRange>('5m');
  const [stats, setStats] = useState<ModerationStats>(EMPTY_STATS);
  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const s = await getModerationStats(serverId, timeRange);
        if (!cancelled) setStats(s);
      } catch {
        // Sessizce yut — UI sayaçlar 0'da kalır, zero-state helper devreye girer.
      }
    };
    fetchStats();
    const t = setInterval(fetchStats, STATS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [serverId, timeRange]);

  // Moderation events — fetch (limit 1000 — UI tavanı) + client-side filter/search/paginate.
  const [events, setEvents] = useState<ModerationEvent[] | null>(null);
  const [eventsDenied, setEventsDenied] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventSearch, setEventSearch] = useState('');
  const [eventKindFilter, setEventKindFilter] = useState<'all' | 'flood' | 'profanity' | 'spam' | 'auto_punish'>('all');
  const [eventPage, setEventPage] = useState(1);
  useEffect(() => {
    let cancelled = false;
    const fetchEvents = async () => {
      try {
        const list = await getModerationEvents(serverId, { limit: 1000 });
        if (!cancelled) { setEvents(list); setEventsDenied(false); }
      } catch (err: any) {
        if (!cancelled && /yetkin yok|üyesi değil/i.test(err?.message || '')) {
          setEventsDenied(true);
        }
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    };
    fetchEvents();
    const t = setInterval(fetchEvents, STATS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [serverId]);

  // Filter/search uygulanır → pagination (15/sayfa)
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    const q = eventSearch.trim().toLowerCase();
    return events.filter(ev => {
      if (eventKindFilter !== 'all' && ev.kind !== eventKindFilter) return false;
      if (q) {
        const hay = [ev.userName || '', ev.channelName || ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, eventSearch, eventKindFilter]);
  const EVENTS_PER_PAGE = 10;
  const eventTotalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const eventCurrentPage = Math.min(eventPage, eventTotalPages);
  const pagedEvents = filteredEvents.slice((eventCurrentPage - 1) * EVENTS_PER_PAGE, eventCurrentPage * EVENTS_PER_PAGE);
  // Filter/search değişince sayfa 1'e reset
  useEffect(() => { setEventPage(1); }, [eventSearch, eventKindFilter]);

  // Aktif auto-ceza listesi — 30s refresh. 403 → section gizli (eventsDenied ile aynı gate).
  const [activePunishments, setActivePunishments] = useState<ActiveAutoPunishment[]>([]);
  useEffect(() => {
    if (eventsDenied) return;
    let cancelled = false;
    const fetchActive = async () => {
      try {
        const list = await getActiveAutoPunishments(serverId);
        if (!cancelled) setActivePunishments(list);
      } catch {
        // 403 eventsDenied ile zaten yakalanıyor; diğer hataları sessiz yut
      }
    };
    fetchActive();
    const t = setInterval(fetchActive, STATS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [serverId, eventsDenied]);

  // XLSX export — ExportDialog (tek takvim + Tüm log kaydı)
  const [exportOpen, setExportOpen] = useState(false);
  const [serverName, setServerName] = useState('Sunucu');
  useEffect(() => {
    getServerDetails(serverId).then(s => setServerName(s.name)).catch(() => {});
  }, [serverId]);

  // Kara liste modal (dil-tab + sayfalama)
  const [showBlacklist, setShowBlacklist] = useState(false);

  if (loading) return <Loader />;

  return (
    <div className="max-w-[1280px] mx-auto space-y-3 pb-8">
      {/* ── Summary Bar — 3 stat pill + range, tek satır ── */}
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          background: 'rgba(var(--glass-tint), 0.04)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
        }}
      >
        <ShieldCheck size={16} className="text-[var(--theme-accent)]/80 shrink-0" strokeWidth={2} />
        <div className="flex-1 grid grid-cols-3 gap-2 min-w-0">
          <HeroStat color="cyan"   value={stats.floodBlocked}     label="Flood"  active={flood.enabled} />
          <HeroStat color="rose"   value={stats.profanityBlocked} label="Küfür"  active={profanityEnabled} />
          <HeroStat color="violet" value={stats.spamBlocked}      label="Spam"   active={spamEnabled} />
        </div>
        <div
          className="inline-flex items-center gap-0.5 rounded-lg p-1 shrink-0"
          style={{
            background: 'rgba(var(--glass-tint),0.05)',
            border: '1px solid rgba(var(--glass-tint),0.08)',
          }}
        >
          {(['5m', '1h', '24h'] as ModStatRange[]).map(r => {
            const active = timeRange === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`rangeBtn px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${active ? 'rangeBtn--active' : ''}`}
                style={active ? {
                  background: 'rgba(var(--theme-accent-rgb),0.18)',
                  color: 'var(--theme-accent)',
                } : {
                  color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.58)',
                }}
              >
                {RANGE_LABELS[r]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Rules (merged card — tab system) ── */}
      <section
        className="automod-card rounded-2xl"
        style={{
          background: 'rgba(var(--glass-tint), 0.04)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
        }}
      >
        {/* Tab header + aktif tab toggle */}
        <div
          className="flex items-center justify-between px-3 pt-2.5 pb-2"
          style={{ borderBottom: '1px solid rgba(var(--glass-tint),0.06)' }}
        >
          <div className="inline-flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(var(--glass-tint),0.04)' }}>
            {([
              { k: 'flood',     label: 'Flood',   icon: <Zap size={11} />,                 rgb: '34,211,238',  enabled: flood.enabled },
              { k: 'profanity', label: 'Küfür',   icon: <Filter size={11} />,              rgb: '251,113,133', enabled: profanityEnabled },
              { k: 'spam',      label: 'Spam',    icon: <MessageSquareWarning size={11} />, rgb: '167,139,250', enabled: spamEnabled },
            ] as const).map(t => {
              const active = activeRuleTab === t.k;
              return (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setActiveRuleTab(t.k)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                  style={active ? {
                    background: `rgba(${t.rgb}, 0.14)`,
                    color: `rgb(${t.rgb})`,
                    border: `1px solid rgba(${t.rgb}, 0.24)`,
                  } : {
                    color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.70)',
                    border: '1px solid transparent',
                  }}
                >
                  {t.icon} {t.label}
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full ml-0.5"
                    style={{
                      background: t.enabled ? `rgb(${t.rgb})` : 'rgba(var(--glass-tint), 0.25)',
                      boxShadow: t.enabled ? `0 0 4px rgba(${t.rgb}, 0.6)` : 'none',
                    }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
          {/* Aktif tab'ın toggle'ı */}
          {activeRuleTab === 'flood' && (
            <button
              type="button"
              onClick={() => setFlood(prev => ({ ...prev, enabled: !prev.enabled }))}
              role="switch"
              aria-checked={flood.enabled}
              className={`relative w-9 h-5 rounded-full transition-colors ${flood.enabled ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.15)]'}`}
            >
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: flood.enabled ? 'translateX(16px)' : 'translateX(0)' }} />
            </button>
          )}
          {activeRuleTab === 'profanity' && (
            <button
              type="button"
              onClick={() => setProfanityEnabled(v => !v)}
              role="switch"
              aria-checked={profanityEnabled}
              className={`relative w-9 h-5 rounded-full transition-colors ${profanityEnabled ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.15)]'}`}
            >
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: profanityEnabled ? 'translateX(16px)' : 'translateX(0)' }} />
            </button>
          )}
          {activeRuleTab === 'spam' && (
            <button
              type="button"
              onClick={() => setSpamEnabled(v => !v)}
              role="switch"
              aria-checked={spamEnabled}
              className={`relative w-9 h-5 rounded-full transition-colors ${spamEnabled ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.15)]'}`}
            >
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: spamEnabled ? 'translateX(16px)' : 'translateX(0)' }} />
            </button>
          )}
        </div>

        {/* Flood tab — 3 blok yan yana (grid) */}
        {activeRuleTab === 'flood' && (
          <div className="p-3.5">
            <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 transition-opacity ${flood.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
              <SliderBlock
                icon={<MessageSquareWarning size={12} />}
                label="Mesaj limiti"
                unit={`${flood.limit} mesaj`}
                value={flood.limit}
                min={BOUNDS.limit.min}
                max={BOUNDS.limit.max}
                step={BOUNDS.limit.step}
                onChange={v => setFlood(prev => ({ ...prev, limit: v }))}
              />
              <SliderBlock
                icon={<ListFilter size={12} />}
                label="Zaman penceresi"
                unit={`${(flood.windowMs / 1000).toFixed(1)} sn`}
                value={flood.windowMs}
                min={BOUNDS.windowMs.min}
                max={BOUNDS.windowMs.max}
                step={BOUNDS.windowMs.step}
                onChange={v => setFlood(prev => ({ ...prev, windowMs: v }))}
              />
              <SliderBlock
                icon={<Zap size={12} />}
                label="Cooldown"
                unit={`${(flood.cooldownMs / 1000).toFixed(1)} sn`}
                value={flood.cooldownMs}
                min={BOUNDS.cooldownMs.min}
                max={BOUNDS.cooldownMs.max}
                step={BOUNDS.cooldownMs.step}
                onChange={v => setFlood(prev => ({ ...prev, cooldownMs: v }))}
              />
            </div>
            <div
              className={`mt-3 px-3 py-2 rounded-lg text-[11px] text-[var(--theme-secondary-text)]/75 leading-snug transition-opacity ${flood.enabled ? '' : 'opacity-50'}`}
              style={{ background: 'rgba(var(--theme-accent-rgb),0.05)', border: '1px solid rgba(var(--theme-accent-rgb),0.10)' }}
            >
              {(flood.windowMs / 1000).toFixed(1)} saniyede <strong className="text-[var(--theme-text)]">{flood.limit}</strong> mesaj limiti · Aşanlar <strong className="text-[var(--theme-text)]">{(flood.cooldownMs / 1000).toFixed(1)} sn</strong> bekler
            </div>
          </div>
        )}

        {/* Profanity tab */}
        {activeRuleTab === 'profanity' && (
          <div className="p-3.5">
            <p className="text-[11px] text-[var(--theme-secondary-text)]/65 mb-2.5 leading-snug">
              <strong className="text-[var(--theme-text)]">Sistem kara listesi ({SYSTEM_BLACKLIST_TOTAL} kelime) her zaman aktif.</strong> Toggle yalnızca sunucu-özel listeyi açar/kapatır.
            </p>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-[var(--theme-text)]">
                Kelime listesi
                <span className="ml-1.5 text-[10px] font-normal text-[var(--theme-secondary-text)]/55 tabular-nums">
                  ({currentWords.length})
                </span>
              </label>
              <button
                type="button"
                onClick={() => setShowBlacklist(true)}
                title="Küfür filtresi aktifken her sunucuda çalışan sistem listesi"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 transition-colors"
                style={{
                  background: 'rgba(var(--glass-tint),0.06)',
                  border: '1px solid rgba(var(--glass-tint),0.12)',
                  color: 'var(--theme-secondary-text)',
                }}
              >
                <BookLock size={10} /> Sistem listesi
              </button>
            </div>
            <textarea
              value={profanityText}
              onChange={e => setProfanityText(e.target.value)}
              disabled={!profanityEnabled}
              rows={5}
              placeholder={'Her satıra bir kelime…'}
              className="w-full rounded-lg px-3 py-2 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/35 outline-none focus:border-[var(--theme-accent)]/30 transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed font-mono"
              style={{
                background: 'rgba(var(--glass-tint), 0.05)',
                border: '1px solid rgba(var(--glass-tint), 0.10)',
              }}
            />
            <p className="mt-1.5 text-[10px] text-[var(--theme-secondary-text)]/50 leading-snug">
              Büyük/küçük harf farkı yok · Türkçe ekler otomatik uyumlu
            </p>
          </div>
        )}

        {/* Spam tab */}
        {activeRuleTab === 'spam' && (
          <div className="p-3.5">
            <p className="text-[11px] text-[var(--theme-secondary-text)]/65 mb-2 leading-snug">
              Şu şablonlar engellenir:
            </p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-[var(--theme-secondary-text)]/75">
              <li className="flex items-start gap-1.5"><span className="text-[var(--theme-accent)]/70 shrink-0">•</span><span><strong className="text-[var(--theme-text)]">Tekrar</strong> — 60sn içinde 3+ aynı mesaj</span></li>
              <li className="flex items-start gap-1.5"><span className="text-[var(--theme-accent)]/70 shrink-0">•</span><span><strong className="text-[var(--theme-text)]">ALL CAPS</strong> — 10+ harf, %80+ büyük</span></li>
              <li className="flex items-start gap-1.5"><span className="text-[var(--theme-accent)]/70 shrink-0">•</span><span><strong className="text-[var(--theme-text)]">Zincir emoji</strong> — 10+ emoji</span></li>
              <li className="flex items-start gap-1.5"><span className="text-[var(--theme-accent)]/70 shrink-0">•</span><span><strong className="text-[var(--theme-text)]">Link spam</strong> — tek mesajda 3+ URL</span></li>
            </ul>
          </div>
        )}
      </section>

      {showBlacklist && <BlacklistModal onClose={() => setShowBlacklist(false)} />}

      {exportOpen && events && (
        <ExportDialog
          title="Log indir"
          totalCount={events.length}
          countInRange={(range: DateRange) => countRangeModEvents(events, range)}
          onClose={() => setExportOpen(false)}
          onDownload={async (mode: ExportMode, range: DateRange) => {
            const kindLabel = eventKindFilter === 'all' ? undefined : `Tür: ${eventKindFilter}`;
            await buildModEventsXlsx({
              mode, range,
              events: eventKindFilter === 'all' ? events : events.filter(e => e.kind === eventKindFilter),
              serverName,
              kindFilterLabel: kindLabel,
            });
          }}
          allHint="Maksimum 1000 kayıt — daha fazlası için takvimden aralık seçebilirsin."
        />
      )}

      {/* ── Desktop: 2-kolon (Events solda | Auto Punishment sağda). Events yoksa tek kolon. ── */}
      <div className={eventsDenied ? '' : 'grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-3 items-stretch'}>

      {/* ── Son moderasyon olayları (mod+ görür) ── */}
      {!eventsDenied && (
        <section
          className="automod-card rounded-2xl p-3.5 h-full flex flex-col"
          style={{
            background: 'rgba(var(--glass-tint), 0.04)',
            border: '1px solid rgba(var(--glass-tint), 0.08)',
          }}
        >
          <div className="flex items-center justify-between mb-2.5 gap-2">
            <div className="flex items-center gap-2">
              <ScrollText size={14} className="text-[var(--theme-accent)]/80" />
              <h4 className="text-[13px] font-bold text-[var(--theme-text)]">Son moderasyon olayları</h4>
            </div>
            <div className="flex items-center gap-2">
              {events && events.length > 0 && (
                <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/55">
                  {filteredEvents.length === events.length
                    ? `${events.length} olay`
                    : `${filteredEvents.length} / ${events.length} olay`}
                  {eventTotalPages > 1 && <span className="text-[var(--theme-secondary-text)]/35"> · sayfa {eventCurrentPage}/{eventTotalPages}</span>}
                </span>
              )}
              {events && events.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExportOpen(true)}
                  title="Log indir (tarih aralığı / tüm log kaydı)"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-colors"
                  style={{
                    background: 'rgba(var(--theme-accent-rgb),0.10)',
                    border: '1px solid rgba(var(--theme-accent-rgb),0.22)',
                    color: 'var(--theme-accent)',
                  }}
                >
                  <Download size={11} /> Log indir
                </button>
              )}
            </div>
          </div>

          {/* Toolbar — search + kind filter */}
          {events && events.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div
                className="flex-1 min-w-[180px] flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{
                  background: 'rgba(var(--glass-tint), 0.04)',
                  border: '1px solid rgba(var(--glass-tint), 0.08)',
                }}
              >
                <Search size={11} className="text-[var(--theme-secondary-text)]/40 shrink-0" />
                <input
                  type="text"
                  value={eventSearch}
                  onChange={e => setEventSearch(e.target.value)}
                  placeholder="Kullanıcı veya kanal ara..."
                  className="flex-1 bg-transparent text-[11.5px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none min-w-0"
                />
                {eventSearch && (
                  <button
                    type="button"
                    onClick={() => setEventSearch('')}
                    className="text-[var(--theme-secondary-text)]/45 hover:text-[var(--theme-text)] transition-colors shrink-0"
                    title="Temizle"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              {/* Kind filter — segmented control */}
              <div
                className="inline-flex items-center gap-0.5 rounded-lg p-0.5 shrink-0"
                style={{
                  background: 'rgba(var(--glass-tint), 0.04)',
                  border: '1px solid rgba(var(--glass-tint), 0.08)',
                }}
              >
                {([
                  { k: 'all',         label: 'Tümü',      rgb: null },
                  { k: 'flood',       label: 'Flood',     rgb: '34,211,238' },
                  { k: 'profanity',   label: 'Küfür',     rgb: '251,113,133' },
                  { k: 'spam',        label: 'Spam',      rgb: '167,139,250' },
                  { k: 'auto_punish', label: 'Auto Ceza', rgb: '251,191,36' },
                ] as const).map(opt => {
                  const active = eventKindFilter === opt.k;
                  return (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => setEventKindFilter(opt.k)}
                      className="rangeBtn px-2 py-0.5 rounded-md text-[10px] font-bold transition-all"
                      style={active && opt.rgb ? {
                        background: `rgba(${opt.rgb}, 0.18)`,
                        color: `rgb(${opt.rgb})`,
                        boxShadow: `0 0 8px rgba(${opt.rgb}, 0.14)`,
                      } : active ? {
                        background: 'rgba(var(--theme-accent-rgb),0.18)',
                        color: 'var(--theme-accent)',
                      } : {
                        color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.62)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {eventsLoading && events === null ? (
            <div className="space-y-1.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="h-9 rounded-lg animate-pulse"
                  style={{ background: 'rgba(var(--glass-tint),0.04)' }}
                />
              ))}
            </div>
          ) : !events || events.length === 0 ? (
            <div
              className="px-3 py-8 rounded-lg text-center text-[11px] text-[var(--theme-secondary-text)]/50"
              style={{ background: 'rgba(var(--glass-tint),0.03)' }}
            >
              Henüz moderasyon olayı yok
            </div>
          ) : filteredEvents.length === 0 ? (
            <div
              className="px-3 py-8 rounded-lg text-center text-[11px] text-[var(--theme-secondary-text)]/50"
              style={{ background: 'rgba(var(--glass-tint),0.03)' }}
            >
              Bu filtrelerle eşleşen moderasyon olayı yok
            </div>
          ) : (
            <>
              <ul className="space-y-0.5">
                {pagedEvents.map(ev => <ModEventRow key={ev.id} ev={ev} resolveStatusAvatar={resolveStatusAvatar} />)}
              </ul>
              {eventTotalPages > 1 && (
                <div
                  className="mt-3 pt-3 flex items-center justify-between gap-2"
                  style={{ borderTop: '1px solid rgba(var(--glass-tint),0.06)' }}
                >
                  <button
                    type="button"
                    disabled={eventCurrentPage <= 1}
                    onClick={() => setEventPage(p => Math.max(1, p - 1))}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                    style={{
                      background: 'rgba(var(--glass-tint),0.05)',
                      border: '1px solid rgba(var(--glass-tint),0.10)',
                      color: 'var(--theme-text)',
                    }}
                  >
                    <ChevronLeft size={11} /> Önceki
                  </button>
                  <div className="flex items-center gap-0.5">
                    {buildPageNumbers(eventCurrentPage, eventTotalPages).map((n, i) =>
                      n === '…' ? (
                        <span key={`pg-dots-${i}`} className="px-1 text-[10px] text-[var(--theme-secondary-text)]/35">…</span>
                      ) : (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setEventPage(n as number)}
                          className="w-6 h-6 rounded-md text-[10px] font-bold tabular-nums transition-colors"
                          style={n === eventCurrentPage ? {
                            background: 'var(--theme-accent)',
                            color: 'var(--theme-text-on-accent, #000)',
                          } : {
                            background: 'rgba(var(--glass-tint),0.04)',
                            color: 'var(--theme-secondary-text)',
                          }}
                        >
                          {n}
                        </button>
                      )
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={eventCurrentPage >= eventTotalPages}
                    onClick={() => setEventPage(p => Math.min(eventTotalPages, p + 1))}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                    style={{
                      background: 'rgba(var(--glass-tint),0.05)',
                      border: '1px solid rgba(var(--glass-tint),0.10)',
                      color: 'var(--theme-text)',
                    }}
                  >
                    Sonraki <ChevronRight size={11} />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Sağ kolon: Auto Punishment + Aktif cezalar (seamless) ── */}
      <div className={`smart-punish h-full flex flex-col ${!eventsDenied && activePunishments.length > 0 ? 'has-active' : ''}`}>
        <AutoPunishmentCard value={autoPunishFlood} onChange={setAutoPunishFlood} />
        {!eventsDenied && activePunishments.length > 0 && (
          <ActivePunishmentsCompact
            items={activePunishments}
            resolveStatusAvatar={resolveStatusAvatar}
            showAll={showAllActive}
            onToggleShowAll={() => setShowAllActive(v => !v)}
          />
        )}
      </div>
      </div>

      {/* Action bar parent'a (ServerSettings tab bar sağı) taşındı —
          dirty/saving state parent'a iletilir, user "aşağıda görünmüyor" dedi. */}

      {/* Global keyframes + hover rules (saf CSS, library yok) */}
      <style>{`
        @keyframes statusChipPulse {
          0%   { transform: scale(1);   opacity: 0.55; }
          70%  { transform: scale(2.2); opacity: 0;    }
          100% { transform: scale(2.2); opacity: 0;    }
        }
        /* Hero stat — value değişiminde yumuşak fade-in (React key change trigger) */
        @keyframes statValueIn {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .statValue { animation: statValueIn 220ms ease-out; display: inline-block; }
        /* Hero stat pill hover */
        .statPill {
          transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
        }
        .statPill:hover {
          background: var(--statpill-hover-bg, rgba(255,255,255,0.04));
          border-color: var(--statpill-hover-border, rgba(255,255,255,0.12));
          transform: translateY(-1px);
        }
        /* Range selector */
        .rangeBtn { cursor: pointer; }
        .rangeBtn:not(.rangeBtn--active):hover {
          background: rgba(var(--glass-tint), 0.10);
          color: var(--theme-text);
        }
        /* StatusChip hover: cursor default, glow hafif artar */
        .statusChip { cursor: default; }
        .statusChip--active:hover {
          box-shadow: var(--chip-hover-glow, none), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        /* Modül kartı hover lift (Flood / Küfür / Spam) */
        .automod-card {
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
        }
        .automod-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04);
        }
        /* Aktif ceza kartı hover — hafif scale + bg vurgusu */
        .apCard { transition: background 150ms ease, transform 150ms ease, border-color 150ms ease; }
        .apCard:hover {
          background: rgba(255,255,255,0.06) !important;
          transform: scale(1.01);
          border-color: rgba(255,255,255,0.10);
        }
        /* Aktif ceza kartı mount — fade + hafif yukarı kaydır */
        @keyframes apCardIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        /* Progress bar shimmer — parlak band akar */
        .apProgressFill { overflow: hidden; }
        .apProgressFill::after {
          content: '';
          position: absolute;
          top: 0; bottom: 0; left: 0;
          width: 55%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
          animation: apShimmer 2.4s linear infinite;
          pointer-events: none;
        }
        @keyframes apShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(220%);  }
        }
        /* Countdown <60sn pulse */
        @keyframes apUrgentPulse {
          0%, 100% { opacity: 1;    transform: scale(1);    }
          50%      { opacity: 0.55; transform: scale(1.04); }
        }
        .apCountdown--urgent { animation: apUrgentPulse 1s ease-in-out infinite; transform-origin: right center; }
        /* Event list — auto_punish satırına hafif amber highlight */
        .modEventRow--auto {
          background: linear-gradient(90deg, rgba(251,191,36,0.06), rgba(251,191,36,0.015) 60%, transparent);
          border-left: 2px solid rgba(251,191,36,0.55);
          padding-left: calc(0.625rem - 2px);
        }
        /* Smart punishment card — AutoPunishmentCard + ActivePunishmentsCompact seamless */
        .smart-punish.has-active > section:first-child {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          border-bottom: 1px solid rgba(var(--glass-tint), 0.05);
        }
      `}</style>
    </div>
  );
}

// ── Status chip: modül aktif/pasif göstergesi (hero için) ──
const CHIP_COLOR_MAP: Record<string, { rgb: string }> = {
  cyan:   { rgb: '34,211,238'  },
  rose:   { rgb: '251,113,133' },
  violet: { rgb: '167,139,250' },
};

function StatusChip({ color, label, active }: { color: 'cyan' | 'rose' | 'violet'; label: string; active: boolean }) {
  const c = CHIP_COLOR_MAP[color];
  // Inline style'daki --rgb ve --active-* değerlerini CSS class (statusChip) hover rule'u için CSS vars olarak verir.
  const activeStyle: React.CSSProperties = active ? {
    background: `rgba(${c.rgb}, 0.18)`,
    border: `1px solid rgba(${c.rgb}, 0.45)`,
    color: `rgb(${c.rgb})`,
    boxShadow: `0 0 14px rgba(${c.rgb}, 0.22), inset 0 1px 0 rgba(255,255,255,0.05)`,
    ['--chip-hover-glow' as any]: `0 0 22px rgba(${c.rgb}, 0.34)`,
  } : {
    background: 'rgba(var(--glass-tint),0.04)',
    border: '1px solid rgba(var(--glass-tint),0.10)',
    color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.72)',
    ['--chip-hover-glow' as any]: 'none',
  };
  return (
    <span
      className={`statusChip relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all duration-150 ${active ? 'statusChip--active' : ''}`}
      style={activeStyle}
    >
      <span className="relative flex items-center justify-center w-2 h-2">
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: active ? `rgb(${c.rgb})` : 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.35)',
            boxShadow: active ? `0 0 8px rgba(${c.rgb}, 0.90)` : 'none',
          }}
        />
        {active && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: `rgba(${c.rgb}, 0.55)`,
              animation: 'statusChipPulse 2.4s ease-out infinite',
            }}
            aria-hidden="true"
          />
        )}
      </span>
      {label}
    </span>
  );
}

/**
 * Güvenli avatar — öncelik: (1) userAvatar varsa & yüklenebilirse onu, (2) aksi halde
 * kullanıcının anlık statusText'ine göre varsayılan PNG (online/pasif/dinliyor/
 * duymuyor/afk/cevrimdisi), (3) status da yoksa cevrimdisi PNG.
 *
 * status prop'u UserContext'ten resolve edilir; modal render sırasında user kaydı
 * bulunamayan (sunucudan ayrılmış, cache dışı) kullanıcılar için default 'cevrimdisi'.
 */
function SafeAvatar({
  src, statusAvatar, userName, variant,
}: { src: string | null; statusAvatar: string; userName: string | null; variant: 'chip' | 'card' }) {
  const [failed, setFailed] = useState(false);
  const showCustom = !!src && !failed && hasCustomAvatar(src);
  const finalSrc = showCustom ? src! : statusAvatar;
  if (variant === 'chip') {
    return (
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
        style={{
          background: 'rgba(var(--glass-tint),0.08)',
          border: '1px solid rgba(var(--glass-tint),0.12)',
        }}
        aria-label={userName || 'Bilinmiyor'}
      >
        <img
          src={finalSrc}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }
  // card (36)
  return (
    <div
      className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
      style={{
        background: 'rgba(255,255,255,0.04)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
      aria-label={userName || 'Bilinmiyor'}
    >
      <img
        src={finalSrc}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

// ── Şu an cezalı bölümü ──
function formatRemaining(expiresIso: string, nowMs: number): string {
  const exp = Date.parse(expiresIso);
  if (!Number.isFinite(exp)) return '';
  const diff = Math.max(0, Math.floor((exp - nowMs) / 1000));
  if (diff === 0) return 'bitti';
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}s ${mm}dk`;
  }
  if (m === 0) return `${s} sn`;
  return `${m}dk ${s}sn`;
}

/**
 * Compact aktif cezalar listesi — AutoPunishmentCard'ın altına seamless bitişik olarak
 * render edilir (ortak wrapper içinde). Üst border yok, alt köşeler rounded.
 * Default: max 2 görünür kart + "daha fazla" toggle.
 */
function ActivePunishmentsCompact({
  items, resolveStatusAvatar, showAll, onToggleShowAll,
}: {
  items: ActiveAutoPunishment[];
  resolveStatusAvatar: (userId: string | null) => string;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const live = items.filter(ev => Date.parse(ev.expiresAt) > nowMs);
  if (live.length === 0) return null;

  const visible = showAll ? live : live.slice(0, 2);
  const hiddenCount = live.length - visible.length;

  return (
    <div
      className="rounded-b-2xl -mt-[1px] px-3.5 pt-2.5 pb-3"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.08)',
        borderTop: '1px solid rgba(var(--glass-tint), 0.05)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Gavel size={11} className="text-amber-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/70">
            Aktif Cezalar
          </span>
          <span
            className="text-[9.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
            style={{
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.22)',
              color: 'rgb(251,191,36)',
            }}
          >
            {live.length}
          </span>
        </div>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="text-[10px] font-semibold text-[var(--theme-accent)] hover:underline transition-colors"
          >
            {showAll ? 'Daha az göster' : `+${hiddenCount} daha göster`}
          </button>
        )}
        {showAll && hiddenCount === 0 && live.length > 2 && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="text-[10px] font-semibold text-[var(--theme-accent)] hover:underline transition-colors"
          >
            Daha az göster
          </button>
        )}
      </div>
      <ul className={`space-y-1.5 ${showAll ? 'max-h-[240px] overflow-y-auto custom-scrollbar pr-1' : ''}`}>
        {visible.map(ev => <ActivePunishmentCard key={ev.userId} ev={ev} nowMs={nowMs} resolveStatusAvatar={resolveStatusAvatar} />)}
      </ul>
    </div>
  );
}

// ── Tek cezalı kullanıcı kart ──
const ActivePunishmentCard: React.FC<{ ev: ActiveAutoPunishment; nowMs: number; resolveStatusAvatar: (userId: string | null) => string }> = ({ ev, nowMs, resolveStatusAvatar }) => {
  const start = Date.parse(ev.bannedAt);
  const end = Date.parse(ev.expiresAt);
  const total = Math.max(1, end - start);
  const remaining = Math.max(0, end - nowMs);
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const remainingSec = Math.floor(remaining / 1000);
  const urgent = remainingSec <= 60;

  return (
    <li
      className="apCard relative rounded-xl px-3 py-2.5"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.08)',
        animation: 'apCardIn 260ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      <div className="flex items-center gap-3">
        <SafeAvatar src={ev.userAvatar} statusAvatar={resolveStatusAvatar(ev.userId)} userName={ev.userName} variant="card" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold text-[var(--theme-text)] truncate">
              {ev.userName || 'Bilinmiyor'}
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
              style={{
                background: 'rgba(251,191,36,0.12)',
                color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.24)',
              }}
            >
              Yazma Engeli
            </span>
          </div>

          <div
            className="apProgress mt-2 h-1 rounded-full overflow-hidden relative"
            style={{ background: 'rgba(var(--glass-tint), 0.08)' }}
          >
            <div
              className="apProgressFill h-full rounded-full relative"
              style={{
                width: `${pct}%`,
                background: '#fbbf24',
                transition: 'width 1s linear',
              }}
            />
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div
            className={`text-[14px] font-semibold tabular-nums leading-none ${urgent ? 'apCountdown--urgent' : ''}`}
            style={{ color: '#fbbf24' }}
          >
            {formatRemaining(ev.expiresAt, nowMs)}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.10em] text-[var(--theme-secondary-text)]/45 mt-1">
            ceza bitimine
          </div>
        </div>
      </div>
    </li>
  );
};

// ── Moderation event tek satır ──
const EVENT_KIND_META: Record<string, { rgb: string; label: string }> = {
  flood:       { rgb: '34,211,238',  label: 'flood' },
  profanity:   { rgb: '251,113,133', label: 'küfür' },
  spam:        { rgb: '167,139,250', label: 'spam' },
  auto_punish: { rgb: '251,191,36',  label: 'auto ceza' },
};

// Auto-punish rozetinin tooltip'inde gösterilecek trigger metni.
const TRIGGER_LABEL: Record<string, string> = {
  flood:     'flood',
  profanity: 'küfür',
  spam:      'spam',
};

// Rozet metni — kısa ve sabit. Auto-punish → "auto ceza".
function buildEventLabel(ev: ModerationEvent): string {
  if (ev.kind === 'auto_punish') return 'auto ceza';
  return EVENT_KIND_META[ev.kind]?.label || ev.kind;
}

// Tooltip metni — hover'da uzun açıklama.
function buildEventTooltip(ev: ModerationEvent): string {
  if (ev.kind === 'auto_punish') {
    const tk = ev.triggerKind ? TRIGGER_LABEL[ev.triggerKind] : null;
    return tk
      ? `${tk.charAt(0).toUpperCase()}${tk.slice(1)} ihlalinden otomatik yazma engeli`
      : 'Otomatik yazma engeli';
  }
  if (ev.kind === 'flood')     return 'Flood (hız) engeli — aynı kullanıcı kısa sürede çok mesaj attı';
  if (ev.kind === 'profanity') return 'Küfür/hakaret filtresi — mesaj engellendi';
  if (ev.kind === 'spam')      return 'Spam filtresi — link/tekrar/CAPS heuristic';
  return '';
}

function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec} sn önce`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

const ModEventRow: React.FC<{ ev: ModerationEvent; resolveStatusAvatar: (userId: string | null) => string }> = ({ ev, resolveStatusAvatar }) => {
  const meta = EVENT_KIND_META[ev.kind] || { rgb: '123,139,168', label: ev.kind };
  const userLabel = ev.userName || (ev.userId ? ev.userId.slice(0, 8) : 'bilinmiyor');
  const channelLabel = ev.channelName ? `#${ev.channelName}` : '';
  const tooltip = buildEventTooltip(ev);
  const isAuto = ev.kind === 'auto_punish';
  return (
    <li
      className={`flex items-center gap-2.5 px-2.5 py-1 rounded-md transition-colors hover:bg-[rgba(var(--glass-tint),0.05)] ${isAuto ? 'modEventRow--auto' : ''}`}
    >
      {/* Avatar — bozuk URL veya null → kullanıcı durum PNG'si (online/pasif/dinliyor/...) */}
      <SafeAvatar src={ev.userAvatar} statusAvatar={resolveStatusAvatar(ev.userId)} userName={ev.userName} variant="chip" />

      <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[11.5px]">
        <span className="font-semibold text-[var(--theme-text)] truncate">{userLabel}</span>
        <span className="text-[var(--theme-secondary-text)]/35">·</span>
        <span
          className="font-bold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide shrink-0 cursor-help"
          style={{
            color: `rgb(${meta.rgb})`,
            background: `rgba(${meta.rgb}, 0.10)`,
            border: `1px solid rgba(${meta.rgb}, 0.22)`,
          }}
          title={tooltip}
        >
          {buildEventLabel(ev)}
        </span>
        {channelLabel && (
          <>
            <span className="text-[var(--theme-secondary-text)]/35">·</span>
            <span className="text-[var(--theme-secondary-text)]/70 truncate">{channelLabel}</span>
          </>
        )}
      </div>

      <span className="text-[10px] text-[var(--theme-secondary-text)]/45 tabular-nums shrink-0">
        {formatRelativeTime(ev.createdAt)}
      </span>
    </li>
  );
};

// ── Hero istatistik pill (kompakt: renk noktası + sayı + label + durum) ──
// Hover rules + value fade animasyonu için className kullanır (statPill + statValue).
function HeroStat({
  color, value, label, active,
}: { color: 'cyan' | 'rose' | 'violet'; value: number; label: string; active: boolean }) {
  const c = CHIP_COLOR_MAP[color];
  return (
    <div
      className="statPill relative flex items-center gap-2.5 rounded-lg px-3 py-2.5"
      style={{
        background: active ? `rgba(${c.rgb}, 0.04)` : 'rgba(var(--glass-tint),0.03)',
        border: active ? `1px solid rgba(${c.rgb}, 0.12)` : '1px solid rgba(var(--glass-tint),0.08)',
        opacity: active ? 1 : 0.55,
        ['--statpill-hover-bg' as any]: active ? `rgba(${c.rgb}, 0.08)` : 'rgba(var(--glass-tint),0.06)',
        ['--statpill-hover-border' as any]: active ? `rgba(${c.rgb}, 0.22)` : 'rgba(var(--glass-tint),0.14)',
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          background: active ? `rgb(${c.rgb})` : 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.45)',
          boxShadow: active ? `0 0 8px rgba(${c.rgb}, 0.75)` : 'none',
        }}
        aria-hidden="true"
      />
      {/* Key = value → sayı değişiminde React remount + CSS fade-in animation */}
      <span
        key={value}
        className="statValue text-[17px] font-bold tabular-nums leading-none"
        style={{ color: active ? `rgb(${c.rgb})` : 'var(--theme-secondary-text)' }}
      >
        {value}
      </span>
      <span className="text-[11px] font-semibold text-[var(--theme-secondary-text)]/65">
        {label}
      </span>
      <span className="ml-auto text-[9.5px] font-semibold uppercase tracking-[0.1em] pl-1.5 shrink-0"
        style={{ color: active ? `rgb(${c.rgb})` : 'var(--theme-secondary-text)', opacity: active ? 0.75 : 0.4 }}>
        {active ? 'açık' : 'kapalı'}
      </span>
    </div>
  );
}

// ── Slider block — card-wrapped (horizontal grid layout için) ──
function SliderBlock({
  icon, label, unit, value, min, max, step, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div
      className="rounded-xl px-3 py-2.5 flex flex-col gap-2"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.07)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--theme-text)] min-w-0 truncate">
          <span className="text-[var(--theme-accent)]/75 shrink-0">{icon}</span>
          {label}
        </label>
        <span className="text-[11px] font-bold tabular-nums text-[var(--theme-accent)] px-2 py-0.5 rounded-md bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 shrink-0">
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer automod-slider"
        style={{
          background: `linear-gradient(to right, var(--theme-accent) 0%, var(--theme-accent) ${pct}%, rgba(var(--glass-tint),0.15) ${pct}%, rgba(var(--glass-tint),0.15) 100%)`,
        }}
      />
    </div>
  );
}

// ── Sistem kara listesi modal (dil tab + sayfalama + search) ──
// Stil: ChannelAccessModal ile paritet (tema-aware, solid bg, blur yok).
function BlacklistModal({ onClose }: { onClose: () => void }) {
  const langs = useMemo(() => Object.keys(SYSTEM_BLACKLIST_BY_LANG), []);
  const [activeLang, setActiveLang] = useState<string>(langs[0] || 'tr');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Dil değişince sayfa 1'e dön, search temizle
  useEffect(() => { setPage(1); setQuery(''); }, [activeLang]);
  // Search değişince sayfa 1'e dön
  useEffect(() => { setPage(1); }, [query]);

  // ESC ile kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const langWords = SYSTEM_BLACKLIST_BY_LANG[activeLang] || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return langWords;
    return langWords.filter(w => w.toLowerCase().includes(q));
  }, [langWords, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / WORDS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageWords = filtered.slice((currentPage - 1) * WORDS_PER_PAGE, currentPage * WORDS_PER_PAGE);

  const activeMeta = LANG_META[activeLang] || { name: activeLang, flag: '🏳️' };

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.72)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[680px] max-w-[94vw] rounded-2xl overflow-hidden flex flex-col"
        style={{
          maxHeight: 'min(85vh, 720px)',
          background: 'var(--theme-surface-card, rgba(var(--theme-bg-rgb, 6,10,20), 0.97))',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center gap-4 shrink-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.18), rgba(var(--theme-accent-rgb), 0.08))',
            }}
          >
            <BookLock size={18} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-[var(--theme-text)] truncate">Sistem Kara Listesi</h3>
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-55 mt-0.5 truncate">
              {SYSTEM_BLACKLIST_TOTAL} kelime · {langs.length} dil — her zaman aktif, kaldırılamaz
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.05)] transition-colors shrink-0"
            title="Kapat"
          >
            <X size={15} />
          </button>
        </div>

        {/* Dil tab bar — horizontal scroll */}
        <div
          className="px-4 pb-3 overflow-x-auto custom-scrollbar shrink-0"
          style={{ borderBottom: '1px solid rgba(var(--glass-tint),0.06)' }}
        >
          <div className="flex gap-1.5 min-w-max">
            {langs.map(code => {
              const meta = LANG_META[code] || { name: code, flag: '🏳️' };
              const count = SYSTEM_BLACKLIST_BY_LANG[code]?.length ?? 0;
              const active = code === activeLang;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveLang(code)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-semibold shrink-0 transition-colors"
                  style={active ? {
                    background: 'rgba(var(--theme-accent-rgb),0.14)',
                    border: '1px solid rgba(var(--theme-accent-rgb),0.30)',
                    color: 'var(--theme-accent)',
                  } : {
                    background: 'transparent',
                    border: '1px solid rgba(var(--glass-tint),0.08)',
                    color: 'var(--theme-secondary-text)',
                  }}
                >
                  <span className="text-[12px]">{meta.flag}</span>
                  <span>{meta.name}</span>
                  <span className="tabular-nums opacity-65">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: 'rgba(var(--glass-tint), 0.04)',
              border: '1px solid rgba(var(--glass-tint), 0.08)',
            }}
          >
            <Search size={12} className="text-[var(--theme-secondary-text)]/40 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              placeholder={`${activeMeta.name} içinde ara...`}
              className="flex-1 bg-transparent text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none min-w-0"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] transition-colors shrink-0"
                title="Temizle"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 mt-1.5">
            {query
              ? `${filtered.length} eşleşti / ${langWords.length} kelime`
              : `${langWords.length} kelime`}
            {totalPages > 1 && ` · Sayfa ${currentPage}/${totalPages}`}
          </p>
        </div>

        {/* Kelime grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar">
          {pageWords.length === 0 ? (
            <div className="text-center py-10 text-[11px] text-[var(--theme-secondary-text)]/40">
              {query ? 'Bu arama için eşleşme yok' : 'Bu dilde kelime yok'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {pageWords.map((w, i) => (
                <span
                  key={`${activeLang}-${(currentPage - 1) * WORDS_PER_PAGE + i}`}
                  className="px-2.5 py-1.5 rounded-md text-[11.5px] text-[var(--theme-text)]/90 font-mono truncate"
                  style={{
                    background: 'rgba(var(--theme-accent-rgb), 0.06)',
                    border: '1px solid rgba(var(--theme-accent-rgb), 0.12)',
                  }}
                  title={w}
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div
            className="px-6 py-3 flex items-center justify-between gap-2 shrink-0"
            style={{ borderTop: '1px solid rgba(var(--glass-tint),0.06)' }}
          >
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(var(--glass-tint),0.06)',
                border: '1px solid rgba(var(--glass-tint),0.10)',
                color: 'var(--theme-text)',
              }}
            >
              <ChevronLeft size={12} /> Önceki
            </button>

            <div className="flex items-center gap-1">
              {buildPageNumbers(currentPage, totalPages).map((n, i) =>
                n === '…' ? (
                  <span key={`dots-${i}`} className="px-1 text-[11px] text-[var(--theme-secondary-text)]/40">…</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n as number)}
                    className="w-7 h-7 rounded-md text-[11px] font-bold tabular-nums transition-colors"
                    style={n === currentPage ? {
                      background: 'var(--theme-accent)',
                      color: 'var(--theme-text-on-accent, #000)',
                    } : {
                      background: 'rgba(var(--glass-tint),0.04)',
                      color: 'var(--theme-secondary-text)',
                    }}
                  >
                    {n}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(var(--glass-tint),0.06)',
                border: '1px solid rgba(var(--glass-tint),0.10)',
                color: 'var(--theme-text)',
              }}
            >
              Sonraki <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Sayfa numaraları — kompakt pattern: 1 … (n-1) n (n+1) … last
function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

// Export dialog için — tarih aralığında kaç event var
function countRangeModEvents(events: ModerationEvent[], range: [string, string]): number {
  const s = Date.parse(range[0] + 'T00:00:00');
  const e = Date.parse(range[1] + 'T23:59:59');
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  const lo = Math.min(s, e), hi = Math.max(s, e);
  return events.filter(ev => {
    const t = Date.parse(ev.createdAt);
    return t >= lo && t <= hi;
  }).length;
}
