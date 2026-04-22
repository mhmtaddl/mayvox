import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, TrendingUp, TrendingDown, Minus, RefreshCw, Download,
  Users as UsersIcon, Hash as HashIcon, Gavel, Zap, Filter, MessageSquareWarning,
  ScrollText, ArrowUpRight,
} from 'lucide-react';
import {
  type ModerationEvent, type ActiveAutoPunishment,
  getModerationEvents, getActiveAutoPunishments, exportModerationEventsXlsx,
} from '../../../lib/serverService';
import { useUser } from '../../../contexts/UserContext';
import { getStatusAvatar, hasCustomAvatar } from '../../../lib/statusAvatar';
import cevrimdisiPng from '../../../assets/profil/cevrimdisi.png';
import { timeAgo } from './shared';

interface Props {
  serverId: string;
  /** Oto-Mod sekmesine deep-link — user 'detaylı ayarlar için' tıklarsa. */
  onOpenAutomod?: () => void;
}

type Range = '24h' | '7d' | '30d';
const RANGE_LABEL: Record<Range, string> = { '24h': '24 saat', '7d': '7 gün', '30d': '30 gün' };
const RANGE_MS: Record<Range, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};
const RANGE_BUCKETS: Record<Range, number> = { '24h': 24, '7d': 7, '30d': 30 };

type Kind = 'flood' | 'profanity' | 'spam' | 'auto_punish';
const KIND_META: Record<Kind, { label: string; color: string; rgb: string; icon: React.ReactNode }> = {
  flood:       { label: 'Flood',     color: '#22d3ee', rgb: '34,211,238',  icon: <Zap size={12} /> },
  profanity:   { label: 'Küfür',     color: '#f472b6', rgb: '244,114,182', icon: <Filter size={12} /> },
  spam:        { label: 'Spam',      color: '#a78bfa', rgb: '167,139,250', icon: <MessageSquareWarning size={12} /> },
  auto_punish: { label: 'Auto Ceza', color: '#fbbf24', rgb: '251,191,36',  icon: <Gavel size={12} /> },
};
const KIND_ORDER: Kind[] = ['flood', 'profanity', 'spam', 'auto_punish'];

// ── Aggregation helpers ──
interface KindCounts { flood: number; profanity: number; spam: number; auto_punish: number; }
const ZERO_COUNTS: KindCounts = { flood: 0, profanity: 0, spam: 0, auto_punish: 0 };

function countByKind(events: ModerationEvent[]): KindCounts {
  const out: KindCounts = { ...ZERO_COUNTS };
  for (const ev of events) {
    if (ev.kind === 'flood')       out.flood++;
    else if (ev.kind === 'profanity')  out.profanity++;
    else if (ev.kind === 'spam')       out.spam++;
    else if (ev.kind === 'auto_punish') out.auto_punish++;
  }
  return out;
}

interface TrendBucket { t: number; flood: number; profanity: number; spam: number; auto_punish: number; }

function bucketize(events: ModerationEvent[], range: Range, nowMs: number): TrendBucket[] {
  const windowMs = RANGE_MS[range];
  const n = RANGE_BUCKETS[range];
  const bucketMs = windowMs / n;
  const start = nowMs - windowMs;
  const buckets: TrendBucket[] = Array.from({ length: n }, (_, i) => ({
    t: start + i * bucketMs,
    flood: 0, profanity: 0, spam: 0, auto_punish: 0,
  }));
  for (const ev of events) {
    const t = Date.parse(ev.createdAt);
    if (!Number.isFinite(t) || t < start || t > nowMs) continue;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((t - start) / bucketMs)));
    const k = ev.kind as Kind;
    if (k in buckets[idx]) (buckets[idx] as any)[k]++;
  }
  return buckets;
}

interface UserStat {
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  total: number;
  kindCounts: Partial<Record<Kind, number>>;
  dominantKind: Kind;
}
function aggregateTopUsers(events: ModerationEvent[], limit = 5): UserStat[] {
  const m = new Map<string, UserStat>();
  for (const ev of events) {
    if (!ev.userId) continue;
    const prev = m.get(ev.userId) ?? {
      userId: ev.userId,
      userName: ev.userName,
      userAvatar: ev.userAvatar,
      total: 0,
      kindCounts: {},
      dominantKind: ev.kind as Kind,
    };
    prev.total++;
    const k = ev.kind as Kind;
    prev.kindCounts[k] = (prev.kindCounts[k] ?? 0) + 1;
    // dominantKind: en yüksek sayılı kind
    let best: Kind = prev.dominantKind;
    let bestN = prev.kindCounts[best] ?? 0;
    for (const kk of KIND_ORDER) {
      const n = prev.kindCounts[kk] ?? 0;
      if (n > bestN) { best = kk; bestN = n; }
    }
    prev.dominantKind = best;
    // userName/avatar: boş değilse ilkinden al (aynı id için sabit)
    if (!prev.userName && ev.userName) prev.userName = ev.userName;
    if (!prev.userAvatar && ev.userAvatar) prev.userAvatar = ev.userAvatar;
    m.set(ev.userId, prev);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

interface ChannelStat {
  channelId: string;
  channelName: string | null;
  total: number;
}
function aggregateTopChannels(events: ModerationEvent[], limit = 5): ChannelStat[] {
  const m = new Map<string, ChannelStat>();
  for (const ev of events) {
    if (!ev.channelId) continue;
    const prev = m.get(ev.channelId) ?? {
      channelId: ev.channelId, channelName: ev.channelName, total: 0,
    };
    prev.total++;
    if (!prev.channelName && ev.channelName) prev.channelName = ev.channelName;
    m.set(ev.channelId, prev);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

// ── Delta formatter ──
function formatDelta(d: number): { text: string; tone: 'up' | 'down' | 'neutral'; icon: React.ReactNode } {
  if (d > 0)  return { text: `+${d}`, tone: 'up',   icon: <TrendingUp   size={10} /> };
  if (d < 0)  return { text: `${d}`,  tone: 'down', icon: <TrendingDown size={10} /> };
  return       { text: '±0',          tone: 'neutral', icon: <Minus     size={10} /> };
}

// ═══════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════
export default function DenetimTab({ serverId, onOpenAutomod }: Props) {
  const [range, setRange] = useState<Range>('24h');
  const [events, setEvents] = useState<ModerationEvent[] | null>(null);
  const [active, setActive] = useState<ActiveAutoPunishment[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchData = useCallback(async () => {
    try {
      const [evs, act] = await Promise.all([
        getModerationEvents(serverId, { limit: 1000 }),
        getActiveAutoPunishments(serverId).catch(() => [] as ActiveAutoPunishment[]),
      ]);
      setEvents(evs);
      setActive(act);
      setDenied(false);
    } catch (err: any) {
      if (/yetkin yok|üyesi değil/i.test(err?.message || '')) setDenied(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // "now" referansı 60s'de bir güncellensin — bucket sınırları kaymasın
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setNowMs(Date.now());
    fetchData();
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportModerationEventsXlsx(serverId, {});
    } catch {/* sessiz */}
    finally { setExporting(false); }
  };

  // Current vs previous window split
  const { current, previous } = useMemo(() => {
    if (!events) return { current: [] as ModerationEvent[], previous: [] as ModerationEvent[] };
    const win = RANGE_MS[range];
    const curStart = nowMs - win;
    const prevStart = nowMs - 2 * win;
    const current: ModerationEvent[] = [];
    const previous: ModerationEvent[] = [];
    for (const ev of events) {
      const t = Date.parse(ev.createdAt);
      if (!Number.isFinite(t)) continue;
      if (t >= curStart && t <= nowMs) current.push(ev);
      else if (t >= prevStart && t < curStart) previous.push(ev);
    }
    return { current, previous };
  }, [events, range, nowMs]);

  const kpi = useMemo(() => countByKind(current), [current]);
  const prevKpi = useMemo(() => countByKind(previous), [previous]);
  const totalCurrent = kpi.flood + kpi.profanity + kpi.spam + kpi.auto_punish;
  const buckets = useMemo(() => bucketize(current, range, nowMs), [current, range, nowMs]);
  const topUsers = useMemo(() => aggregateTopUsers(current), [current]);
  const topChannels = useMemo(() => aggregateTopChannels(current), [current]);
  const recent = useMemo(() => current.slice(0, 8), [current]);

  if (denied) {
    return (
      <div className="max-w-[1280px] mx-auto py-12 text-center">
        <ShieldCheck size={24} className="mx-auto mb-2 text-[var(--theme-secondary-text)]/40" />
        <div className="text-[13px] font-semibold text-[var(--theme-text)]/75">Yetkin yok</div>
        <div className="text-[11px] text-[var(--theme-secondary-text)]/55 mt-1">
          Denetim sekmesi sadece sunucu yöneticilerine görünür.
        </div>
      </div>
    );
  }

  if (loading && !events) {
    return (
      <div className="max-w-[1280px] mx-auto space-y-3">
        <div className="h-[88px] rounded-2xl animate-pulse" style={{ background: 'rgba(var(--glass-tint),0.04)' }} />
        <div className="h-[260px] rounded-2xl animate-pulse" style={{ background: 'rgba(var(--glass-tint),0.04)' }} />
        <div className="grid grid-cols-2 gap-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-[180px] rounded-2xl animate-pulse" style={{ background: 'rgba(var(--glass-tint),0.04)' }} />
          ))}
        </div>
      </div>
    );
  }

  const hasAny = events && events.length > 0 && totalCurrent > 0;

  return (
    <div className="max-w-[1280px] mx-auto space-y-3 pb-8">
      {/* ── Utility row — range + refresh + export ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ScrollText size={14} className="text-[var(--theme-accent)]/80" />
          <h3 className="text-[13px] font-bold text-[var(--theme-text)] tracking-tight">Moderasyon Analizi</h3>
          <span className="text-[10px] text-[var(--theme-secondary-text)]/50 ml-1">
            · son {RANGE_LABEL[range]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <RangeSelector value={range} onChange={setRange} />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Yenile"
            aria-label="Yenile"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/80 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-40 transition-colors"
            style={{ background: 'rgba(var(--glass-tint),0.04)', border: '1px solid rgba(var(--glass-tint),0.08)' }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !hasAny}
            title="Tüm olay kayıtlarını XLSX olarak indir"
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[11px] font-semibold text-[var(--theme-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(var(--theme-accent-rgb),0.08)',
              border: '1px solid rgba(var(--theme-accent-rgb),0.20)',
            }}
          >
            <Download size={12} /> {exporting ? 'Hazırlanıyor…' : 'Dışa Aktar'}
          </button>
        </div>
      </div>

      {/* ── 1. KPI BAR ── */}
      <KpiBar
        kpi={kpi}
        prev={prevKpi}
      />

      {/* ── 2. TREND CHART ── */}
      <TrendChart buckets={buckets} range={range} hasAny={hasAny} />

      {/* ── 3. INSIGHT GRID 2x2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TopUsersCard users={topUsers} />
        <TopChannelsCard channels={topChannels} totalCurrent={totalCurrent} />
        <AutoPunishImpactCard
          autoPunishCount={kpi.auto_punish}
          activeCount={active.length}
          floodBlocked={kpi.flood}
          range={range}
          onOpenAutomod={onOpenAutomod}
        />
        <RecentEventsCard events={recent} />
      </div>

      {/* Micro-interactions — hover lift, peak pulse, tooltip + legend fade */}
      <style>{`
        .denetim-kpi {
          transition: transform 160ms cubic-bezier(0.2,0.8,0.2,1),
                      box-shadow 160ms ease,
                      border-color 160ms ease;
        }
        .denetim-kpi:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.04) inset;
        }
        .denetim-card {
          transition: transform 160ms cubic-bezier(0.2,0.8,0.2,1),
                      border-color 160ms ease;
        }
        .denetim-card:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--glass-tint), 0.12);
        }
        .denetim-leader {
          transition: background 160ms ease, transform 160ms ease;
        }
        .denetim-leader:hover {
          background: rgba(var(--glass-tint),0.045);
        }
        @keyframes denetim-peak-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 0.18; transform: scale(1.35); }
        }
        .denetim-peak-pulse {
          transform-box: fill-box;
          transform-origin: center;
          animation: denetim-peak-pulse 2.4s ease-in-out infinite;
        }
        @keyframes denetim-tooltip-in {
          from { opacity: 0; transform: translateY(-2px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .denetim-tooltip { animation: denetim-tooltip-in 140ms ease-out; }
        @keyframes denetim-series-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .denetim-series { animation: denetim-series-in 220ms ease-out; }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// Range selector — segmented
// ═══════════════════════════════════════════
function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg p-0.5"
      style={{
        background: 'rgba(var(--glass-tint),0.04)',
        border: '1px solid rgba(var(--glass-tint),0.08)',
      }}
    >
      {(['24h', '7d', '30d'] as Range[]).map(r => {
        const active = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className="px-2.5 h-7 rounded-md text-[11px] font-bold transition-all"
            style={active ? {
              background: 'rgba(var(--theme-accent-rgb),0.16)',
              color: 'var(--theme-accent)',
            } : {
              color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.65)',
            }}
          >
            {RANGE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
// KPI bar — 4 cards horizontal
// ═══════════════════════════════════════════
function KpiBar({ kpi, prev }: { kpi: KindCounts; prev: KindCounts }) {
  const items: Array<{ kind: Kind; value: number; delta: number }> = [
    { kind: 'flood',       value: kpi.flood,       delta: kpi.flood       - prev.flood       },
    { kind: 'profanity',   value: kpi.profanity,   delta: kpi.profanity   - prev.profanity   },
    { kind: 'spam',        value: kpi.spam,        delta: kpi.spam        - prev.spam        },
    { kind: 'auto_punish', value: kpi.auto_punish, delta: kpi.auto_punish - prev.auto_punish },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {items.map(({ kind, value, delta }) => {
        const meta = KIND_META[kind];
        const d = formatDelta(delta);
        const increasing = delta > 0;
        const decreasing = delta < 0;
        return (
          <div
            key={kind}
            className="denetim-kpi rounded-xl px-3 py-2.5"
            style={{
              background: 'rgba(var(--glass-tint), 0.04)',
              border: `1px solid ${
                increasing ? `rgba(${meta.rgb}, 0.22)` : 'rgba(var(--glass-tint), 0.08)'
              }`,
              boxShadow: increasing
                ? `0 0 0 1px rgba(${meta.rgb}, 0.06), 0 1px 12px rgba(${meta.rgb}, 0.08)`
                : 'none',
              opacity: decreasing && value === 0 ? 0.65 : 1,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span style={{ color: meta.color, opacity: value === 0 ? 0.45 : 1 }}>{meta.icon}</span>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-[var(--theme-secondary-text)]/70">
                  {meta.label}
                </span>
              </div>
              <DeltaPill text={d.text} tone={d.tone} icon={d.icon} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[24px] font-bold tabular-nums leading-none tracking-tight"
                style={{ color: value === 0 ? 'var(--theme-secondary-text)' : meta.color }}
              >
                {value}
              </span>
              <span className="text-[10px] text-[var(--theme-secondary-text)]/45">olay</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeltaPill({ text, tone, icon }: { text: string; tone: 'up' | 'down' | 'neutral'; icon: React.ReactNode }) {
  const rgb = tone === 'up' ? '248,113,113' : tone === 'down' ? '52,211,153' : '148,163,184';
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold tabular-nums"
      style={{
        background: `rgba(${rgb}, 0.12)`,
        color: `rgb(${rgb})`,
        border: `1px solid rgba(${rgb}, 0.22)`,
      }}
    >
      {icon} {text}
    </span>
  );
}

// ═══════════════════════════════════════════
// Trend chart — SVG area, 4 series
// ═══════════════════════════════════════════
function TrendChart({ buckets, range, hasAny }: { buckets: TrendBucket[]; range: Range; hasAny: boolean }) {
  const [visible, setVisible] = useState<Record<Kind, boolean>>({ flood: true, profanity: true, spam: true, auto_punish: true });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const toggle = (k: Kind) => setVisible(v => ({ ...v, [k]: !v[k] }));

  const W = 1200, H = 200, PAD_T = 16, PAD_B = 24, PAD_L = 32, PAD_R = 12;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = buckets.length;
  const maxY = Math.max(
    1,
    ...buckets.map(b =>
      (visible.flood ? b.flood : 0) +
      (visible.profanity ? b.profanity : 0) +
      (visible.spam ? b.spam : 0) +
      (visible.auto_punish ? b.auto_punish : 0)
    )
  );
  // Basit peak (overlay için her series kendi değeri) — stacking değil, overlay.
  const maxSeries = Math.max(
    1,
    ...KIND_ORDER.flatMap(k => visible[k] ? buckets.map(b => (b as any)[k] as number) : [0])
  );
  const xOf = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number) => PAD_T + plotH - (v / maxSeries) * plotH;

  const buildPath = (key: Kind): string => {
    if (!visible[key]) return '';
    if (n === 0) return '';
    const pts = buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOf((b as any)[key]).toFixed(1)}`);
    return `M ${pts.join(' L ')}`;
  };
  const buildArea = (key: Kind): string => {
    if (!visible[key] || n === 0) return '';
    const pts = buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOf((b as any)[key]).toFixed(1)}`);
    const base = `${xOf(n - 1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} ${xOf(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)}`;
    return `M ${pts.join(' L ')} L ${base} Z`;
  };

  // Grid lines — 4 yatay
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(p => PAD_T + plotH - p * plotH);
  const gridLabels = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(p * maxSeries));

  // Peak detect — visible series içinde en yüksek nokta (tek bir kind/bucket)
  let peakKind: Kind | null = null;
  let peakIdx = -1;
  let peakVal = 0;
  for (const k of KIND_ORDER) {
    if (!visible[k]) continue;
    for (let i = 0; i < n; i++) {
      const v = (buckets[i] as any)[k] as number;
      if (v > peakVal) { peakVal = v; peakKind = k; peakIdx = i; }
    }
  }

  // X labels — başlangıç, orta, son
  const xTicks = [0, Math.floor(n / 2), n - 1].filter(i => i >= 0 && i < n);

  // Hover handler
  const svgRef = useRef<SVGSVGElement>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) * (W / r.width);
    if (x < PAD_L || x > PAD_L + plotW) { setHoverIdx(null); return; }
    const rel = (x - PAD_L) / plotW;
    const idx = Math.round(rel * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <section
      className="rounded-2xl p-4"
      style={{
        background: 'rgba(var(--glass-tint), 0.04)',
        border: '1px solid rgba(var(--glass-tint), 0.08)',
      }}
    >
      {/* Header: legend toggles */}
      <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/60">
            Trend
          </span>
          <span className="text-[10px] text-[var(--theme-secondary-text)]/40">· {RANGE_LABEL[range]}</span>
        </div>
        <div className="flex items-center gap-1">
          {KIND_ORDER.map(k => {
            const meta = KIND_META[k];
            const on = visible[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                className="flex items-center gap-1.5 px-2 h-6 rounded-full text-[10px] font-semibold transition-all"
                style={{
                  background: on ? `rgba(${meta.rgb}, 0.10)` : 'transparent',
                  color: on ? meta.color : 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.45)',
                  border: `1px solid ${on ? `rgba(${meta.rgb}, 0.24)` : 'rgba(var(--glass-tint), 0.08)'}`,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? meta.color : 'rgba(var(--glass-tint), 0.25)' }} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      {!hasAny ? (
        <EmptyState
          title="Sunucu şu anda sakin görünüyor"
          hint="Bu zaman aralığında moderasyon aktivitesi yok. Daha geniş bir range seçebilirsin."
        />
      ) : (
        <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height: 200, display: 'block' }}
            onMouseMove={onMove}
          >
            {/* Grid */}
            {gridLines.map((y, i) => (
              <line
                key={`g-${i}`}
                x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke="rgba(var(--glass-tint),0.12)"
                strokeWidth={1}
                strokeDasharray={i === 0 || i === gridLines.length - 1 ? '' : '3 4'}
              />
            ))}
            {/* Y axis labels */}
            {gridLabels.map((v, i) => (
              <text
                key={`yl-${i}`}
                x={PAD_L - 6}
                y={gridLines[i] + 3}
                textAnchor="end"
                style={{ fontSize: 9, fill: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.45)' }}
              >
                {v}
              </text>
            ))}
            {/* X axis labels */}
            {xTicks.map((i) => {
              const b = buckets[i];
              if (!b) return null;
              const d = new Date(b.t);
              const label = range === '24h'
                ? `${String(d.getHours()).padStart(2, '0')}:00`
                : `${d.getDate()}.${d.getMonth() + 1}`;
              return (
                <text
                  key={`xl-${i}`}
                  x={xOf(i)}
                  y={H - 6}
                  textAnchor="middle"
                  style={{ fontSize: 9, fill: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.55)' }}
                >
                  {label}
                </text>
              );
            })}
            {/* Series (overlay): area fill + line */}
            {KIND_ORDER.map(k => {
              if (!visible[k]) return null;
              const meta = KIND_META[k];
              return (
                <g key={k} className="denetim-series">
                  <path
                    d={buildArea(k)}
                    fill={`rgba(${meta.rgb}, 0.10)`}
                    stroke="none"
                  />
                  <path
                    d={buildPath(k)}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
            {/* Peak marker — en yüksek nokta (hover üzerinde ise hover alır) */}
            {peakKind && peakIdx >= 0 && peakVal > 0 && hoverIdx !== peakIdx && (
              <g className="denetim-peak">
                <circle
                  cx={xOf(peakIdx)}
                  cy={yOf(peakVal)}
                  r={5}
                  fill="none"
                  stroke={KIND_META[peakKind].color}
                  strokeWidth={1.2}
                  opacity={0.55}
                  className="denetim-peak-pulse"
                />
                <circle
                  cx={xOf(peakIdx)}
                  cy={yOf(peakVal)}
                  r={2.5}
                  fill={KIND_META[peakKind].color}
                />
              </g>
            )}
            {/* Hover vertical line + dots */}
            {hoverIdx !== null && buckets[hoverIdx] && (
              <g>
                <line
                  x1={xOf(hoverIdx)} x2={xOf(hoverIdx)}
                  y1={PAD_T} y2={PAD_T + plotH}
                  stroke="rgba(var(--theme-accent-rgb), 0.50)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                {KIND_ORDER.map(k => {
                  if (!visible[k]) return null;
                  const v = (buckets[hoverIdx] as any)[k] as number;
                  return (
                    <g key={`h-${k}`}>
                      <circle
                        cx={xOf(hoverIdx)}
                        cy={yOf(v)}
                        r={5.5}
                        fill={`rgba(${KIND_META[k].rgb}, 0.18)`}
                      />
                      <circle
                        cx={xOf(hoverIdx)}
                        cy={yOf(v)}
                        r={3.5}
                        fill={KIND_META[k].color}
                        stroke="var(--theme-bg)"
                        strokeWidth={1.5}
                      />
                    </g>
                  );
                })}
              </g>
            )}
            {/* Maxy display (top-left debug hint yok, maxY unused — TS için consume) */}
            <text x={0} y={0} style={{ display: 'none' }}>{maxY}</text>
          </svg>
          {/* Tooltip */}
          {hoverIdx !== null && buckets[hoverIdx] && (
            <HoverTooltip bucket={buckets[hoverIdx]} visible={visible} range={range} />
          )}
        </div>
      )}
    </section>
  );
}

function HoverTooltip({ bucket, visible, range }: { bucket: TrendBucket; visible: Record<Kind, boolean>; range: Range }) {
  const d = new Date(bucket.t);
  const label = range === '24h'
    ? `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} ${String(d.getHours()).padStart(2, '0')}:00`
    : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
  const total = KIND_ORDER.reduce((a, k) => a + (visible[k] ? (bucket as any)[k] as number : 0), 0);
  return (
    <div
      className="denetim-tooltip absolute top-2 right-2 px-3 py-2 rounded-lg text-[11px] pointer-events-none min-w-[160px]"
      style={{
        background: 'rgba(12,14,20,0.96)',
        border: '1px solid rgba(var(--glass-tint),0.10)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[var(--theme-secondary-text)]/75 font-semibold">{label}</span>
        <span className="text-[10px] tabular-nums font-bold text-[var(--theme-text)]/85">
          Σ {total}
        </span>
      </div>
      <div
        className="h-px w-full mb-1.5"
        style={{ background: 'rgba(var(--glass-tint),0.08)' }}
      />
      <ul className="space-y-1">
        {KIND_ORDER.map(k => {
          if (!visible[k]) return null;
          const meta = KIND_META[k];
          const v = (bucket as any)[k] as number;
          return (
            <li key={k} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color, boxShadow: `0 0 4px ${meta.color}88` }} />
              <span className="text-[var(--theme-text)]/85 text-[11px]">{meta.label}</span>
              <span className="ml-auto font-bold tabular-nums text-[12px]" style={{ color: v > 0 ? meta.color : 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.4)' }}>
                {v}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════
// Insight cards
// ═══════════════════════════════════════════
function InsightCardShell({ title, icon, action, children }: {
  title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section
      className="denetim-card rounded-2xl p-3 flex flex-col"
      style={{
        background: 'rgba(var(--glass-tint), 0.04)',
        border: '1px solid rgba(var(--glass-tint), 0.08)',
        minHeight: 190,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--theme-accent)]/80">{icon}</span>
          <h4 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--theme-secondary-text)]/80">{title}</h4>
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

function TopUsersCard({ users }: { users: UserStat[] }) {
  const { allUsers } = useUser();
  const resolveStatusPng = (userId: string): string => {
    const st = allUsers.find(u => u.id === userId)?.statusText ?? null;
    return getStatusAvatar(st) ?? cevrimdisiPng;
  };
  return (
    <InsightCardShell title="En çok ihlal yapan kullanıcılar" icon={<UsersIcon size={13} />}>
      {users.length === 0 ? (
        <EmptyMini text="Kullanıcı ihlali yok — sunucu sakin" />
      ) : (
        <ul className="space-y-1">
          {users.map((u, i) => {
            const dom = KIND_META[u.dominantKind];
            const isTop = i === 0;
            return (
              <li
                key={u.userId}
                className="denetim-leader flex items-center gap-2.5 px-1.5 py-1 rounded-md transition-all"
                style={isTop ? {
                  background: `rgba(${dom.rgb}, 0.04)`,
                } : undefined}
              >
                <span
                  className={`text-[10px] font-bold tabular-nums w-4 shrink-0 ${isTop ? '' : 'text-[var(--theme-secondary-text)]/40'}`}
                  style={isTop ? { color: dom.color } : undefined}
                >
                  #{i + 1}
                </span>
                <SafeTinyAvatar
                  src={u.userAvatar}
                  statusPng={resolveStatusPng(u.userId)}
                  alt={u.userName || 'Kullanıcı'}
                />
                <span
                  className={`flex-1 min-w-0 text-[12px] truncate ${isTop ? 'font-bold text-[var(--theme-text)]' : 'font-semibold text-[var(--theme-text)]/90'}`}
                >
                  {u.userName || u.userId.slice(0, 8)}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide shrink-0"
                  style={{
                    color: dom.color,
                    background: `rgba(${dom.rgb}, 0.14)`,
                    border: `1px solid rgba(${dom.rgb}, 0.26)`,
                  }}
                >
                  {dom.label}
                </span>
                <span className="text-[12.5px] font-bold tabular-nums shrink-0 w-7 text-right" style={{ color: isTop ? dom.color : 'var(--theme-text)' }}>
                  {u.total}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCardShell>
  );
}

function TopChannelsCard({ channels, totalCurrent }: { channels: ChannelStat[]; totalCurrent: number }) {
  const max = channels[0]?.total ?? 1;
  return (
    <InsightCardShell title="En problemli kanallar" icon={<HashIcon size={13} />}>
      {channels.length === 0 ? (
        <EmptyMini text="Kanal bazında ihlal kaydı yok" />
      ) : (
        <ul className="space-y-1.5">
          {channels.map((c, i) => {
            const pct = Math.round((c.total / Math.max(1, max)) * 100);
            const share = totalCurrent > 0 ? Math.round((c.total / totalCurrent) * 100) : 0;
            const isTop = i === 0;
            return (
              <li key={c.channelId} className="denetim-leader px-1 py-0.5 rounded-md transition-all">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[10px] font-bold tabular-nums w-4 shrink-0"
                    style={isTop
                      ? { color: 'var(--theme-accent)' }
                      : { color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.40)' }}
                  >
                    #{i + 1}
                  </span>
                  <HashIcon size={10} className="text-[var(--theme-secondary-text)]/60 shrink-0" />
                  <span className={`flex-1 min-w-0 text-[12px] truncate ${isTop ? 'font-bold text-[var(--theme-text)]' : 'font-semibold text-[var(--theme-text)]/90'}`}>
                    {c.channelName || c.channelId.slice(0, 8)}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--theme-secondary-text)]/55 shrink-0">{share}%</span>
                  <span className="text-[12.5px] font-bold tabular-nums shrink-0 w-7 text-right" style={{ color: isTop ? 'var(--theme-accent)' : 'var(--theme-text)' }}>
                    {c.total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--glass-tint),0.06)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, rgba(var(--theme-accent-rgb),0.85), var(--theme-accent))`,
                      transition: 'width 400ms cubic-bezier(0.2,0.8,0.2,1)',
                      boxShadow: isTop ? '0 0 8px rgba(var(--theme-accent-rgb),0.30)' : 'none',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCardShell>
  );
}

function AutoPunishImpactCard({
  autoPunishCount, activeCount, floodBlocked, range, onOpenAutomod,
}: {
  autoPunishCount: number; activeCount: number; floodBlocked: number; range: Range;
  onOpenAutomod?: () => void;
}) {
  const rangeLabel = RANGE_LABEL[range];
  return (
    <InsightCardShell
      title="Auto Punishment etkisi"
      icon={<Gavel size={13} />}
      action={onOpenAutomod && (
        <button
          type="button"
          onClick={onOpenAutomod}
          className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--theme-accent)] hover:underline transition-colors"
        >
          Ayarla <ArrowUpRight size={10} />
        </button>
      )}
    >
      <div className="grid grid-cols-2 gap-2">
        <MetricTile
          color="#fbbf24"
          rgb="251,191,36"
          label={`Son ${rangeLabel}`}
          value={autoPunishCount}
          hint="otomatik ceza uygulandı"
        />
        <MetricTile
          color="#22d3ee"
          rgb="34,211,238"
          label="Şu an"
          value={activeCount}
          hint="aktif ceza"
        />
      </div>
      <div
        className="mt-2.5 px-2.5 py-1.5 rounded-lg text-[11px] leading-snug"
        style={{
          background: 'rgba(var(--glass-tint),0.03)',
          border: '1px solid rgba(var(--glass-tint),0.06)',
        }}
      >
        <InsightText
          autoPunishCount={autoPunishCount}
          activeCount={activeCount}
          floodBlocked={floodBlocked}
          rangeLabel={rangeLabel}
        />
      </div>
    </InsightCardShell>
  );
}

function InsightText({
  autoPunishCount, activeCount, floodBlocked, rangeLabel,
}: { autoPunishCount: number; activeCount: number; floodBlocked: number; rangeLabel: string }) {
  // Dur-dök karar ağacı — tek satır insight
  let tone: 'positive' | 'warn' | 'neutral' = 'neutral';
  let text: React.ReactNode;
  if (autoPunishCount > 0 && activeCount > 0) {
    tone = 'positive';
    text = <>Auto ceza <strong className="text-[var(--theme-text)]">{autoPunishCount}</strong> ihlal zincirini erken durdurdu · <strong className="text-[var(--theme-text)]">{activeCount}</strong> aktif</>;
  } else if (autoPunishCount > 0) {
    tone = 'positive';
    text = <>Auto ceza son {rangeLabel} içinde <strong className="text-[var(--theme-text)]">{autoPunishCount}</strong> kez tetiklendi — flood akışı stabilize oldu</>;
  } else if (floodBlocked >= 5) {
    tone = 'warn';
    text = <>Flood ihlali var ama eşik aşılmadı — eşiği düşürerek auto ceza aktive edilebilir</>;
  } else if (floodBlocked > 0) {
    tone = 'neutral';
    text = <>Sistem aktif, flood izleniyor — otomatik ceza tetiklenmedi</>;
  } else {
    tone = 'neutral';
    text = <>Sunucu şu anda sakin görünüyor · manuel müdahale gerekmiyor</>;
  }
  const dot = tone === 'positive' ? '#34d399' : tone === 'warn' ? '#fb923c' : 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.55)';
  return (
    <div className="flex items-start gap-2">
      <span className="inline-block w-1.5 h-1.5 rounded-full mt-[5px] shrink-0" style={{ background: dot, boxShadow: `0 0 4px ${dot}` }} />
      <span className="text-[var(--theme-text)]/78">{text}</span>
    </div>
  );
}

function MetricTile({ color, rgb, label, value, hint }: {
  color: string; rgb: string; label: string; value: number; hint: string;
}) {
  return (
    <div
      className="rounded-lg px-2.5 py-2"
      style={{
        background: `rgba(${rgb}, 0.06)`,
        border: `1px solid rgba(${rgb}, 0.15)`,
      }}
    >
      <div className="text-[9.5px] font-bold uppercase tracking-[0.10em]" style={{ color: `rgba(${rgb}, 0.85)` }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[18px] font-bold tabular-nums leading-none" style={{ color }}>
          {value}
        </span>
        <span className="text-[9.5px] text-[var(--theme-secondary-text)]/55">{hint}</span>
      </div>
    </div>
  );
}

function RecentEventsCard({ events }: { events: ModerationEvent[] }) {
  return (
    <InsightCardShell
      title="Son olaylar"
      icon={<ScrollText size={13} />}
    >
      {events.length === 0 ? (
        <EmptyMini text="Henüz olay yok" />
      ) : (
        <ul className="space-y-0.5">
          {events.map(ev => {
            const meta = KIND_META[ev.kind as Kind];
            return (
              <li
                key={ev.id}
                className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-[rgba(var(--glass-tint),0.04)] transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="text-[11px] font-semibold text-[var(--theme-text)] truncate">
                  {ev.userName || (ev.userId ? ev.userId.slice(0, 8) : 'bilinmiyor')}
                </span>
                <span
                  className="px-1.5 py-px rounded text-[9.5px] font-bold uppercase tracking-wide shrink-0"
                  style={{
                    color: meta.color,
                    background: `rgba(${meta.rgb}, 0.10)`,
                  }}
                >
                  {ev.kind === 'auto_punish' ? 'auto' : meta.label.toLowerCase()}
                </span>
                {ev.channelName && (
                  <span className="text-[10.5px] text-[var(--theme-secondary-text)]/60 truncate">
                    #{ev.channelName}
                  </span>
                )}
                <span className="ml-auto text-[10px] tabular-nums text-[var(--theme-secondary-text)]/45 shrink-0">
                  {timeAgo(ev.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCardShell>
  );
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════
function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div
        className="w-10 h-10 rounded-full inline-flex items-center justify-center mb-2.5"
        style={{ background: 'rgba(var(--glass-tint),0.04)', border: '1px solid rgba(var(--glass-tint),0.08)' }}
      >
        <ShieldCheck size={16} className="text-[var(--theme-secondary-text)]/45" />
      </div>
      <div className="text-[12.5px] font-semibold text-[var(--theme-text)]/80">{title}</div>
      <div className="text-[10.5px] text-[var(--theme-secondary-text)]/45 mt-1 max-w-[360px] leading-relaxed">{hint}</div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="text-[11px] text-[var(--theme-secondary-text)]/45 text-center py-6 leading-relaxed">
      {text}
    </div>
  );
}

// Küçük avatar (24px) — initial/icon fallback YOK, kural: statusPng
function SafeTinyAvatar({ src, statusPng, alt }: { src: string | null; statusPng: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const useCustom = hasCustomAvatar(src) && !failed;
  const finalSrc = useCustom ? src! : statusPng;
  return (
    <div
      className="w-6 h-6 rounded-full overflow-hidden shrink-0"
      style={{
        background: 'rgba(var(--glass-tint),0.06)',
        border: '1px solid rgba(var(--glass-tint),0.10)',
      }}
      aria-label={alt}
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
