import React, { useEffect, useState } from 'react';
import {
  Crown, Users, Hash, Lock, Link2, AlertCircle, Activity,
  Sparkles, ArrowUpRight, Settings as SettingsIcon, Trash2, ChevronRight,
  TrendingUp, Gauge, ShieldAlert, Zap, ShieldCheck, BarChart3, Clock,
} from 'lucide-react';
import {
  getServerOverview, getModerationConfig, getModerationStats, getServerInsights,
  type ServerOverview, type Server,
  type ModerationConfigResponse, type ModerationStats, type InsightsResponse,
} from '../../../lib/serverService';
import { PLAN_LIMITS, PLAN_NAME, PLAN_TAGLINE, type PlanKey } from '../../../lib/planLimits';

interface Props {
  serverId: string;
  server: Server;
  isOwner: boolean;
  initialOverview?: ServerOverview | null;
  onSwitchTab?: (tab: 'general' | 'invites' | 'automod' | 'insights') => void;
}

// ══════════════════════════════════════════════════════════
// Plan visual tokens — PlanSummaryRow için tek yer
// ══════════════════════════════════════════════════════════

interface PlanVisual {
  accent: string;
  rgb: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const PLAN_VISUAL: Record<PlanKey, PlanVisual> = {
  free:  { accent: '#34d399', rgb: '16,185,129',  icon: Sparkles },
  pro:   { accent: '#60a5fa', rgb: '96,165,250',  icon: Zap },
  ultra: { accent: '#c084fc', rgb: '192,132,252', icon: Crown },
};

function audioQualityLabel(plan: PlanKey): string {
  if (plan === 'ultra') return 'Stüdyo kalitesinde ses';
  if (plan === 'pro') return 'Yüksek kaliteli ses';
  return 'Standart ses';
}

// ══════════════════════════════════════════════════════════
// Oto-Mod insight — config + 24s stats
// ══════════════════════════════════════════════════════════

interface AutoModSummary {
  activeCount: number;   // 0-3: flood + profanity + spam
  blocked24h: number;    // son 24 saatte engellenen toplam olay
  autoPunishEnabled: boolean;
}

function useAutoModSummary(serverId: string): AutoModSummary | null {
  const [data, setData] = useState<AutoModSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, s] = await Promise.allSettled([
          getModerationConfig(serverId),
          getModerationStats(serverId, '24h'),
        ]);
        if (cancelled) return;
        const cfg: ModerationConfigResponse | null = c.status === 'fulfilled' ? c.value : null;
        const stats: ModerationStats | null = s.status === 'fulfilled' ? s.value : null;
        const activeCount = cfg
          ? (cfg.flood.enabled ? 1 : 0) + (cfg.profanity.enabled ? 1 : 0) + (cfg.spam.enabled ? 1 : 0)
          : 0;
        const blocked24h = stats
          ? stats.floodBlocked + stats.profanityBlocked + stats.spamBlocked
          : 0;
        setData({
          activeCount,
          blocked24h,
          autoPunishEnabled: !!cfg?.autoPunishment?.flood?.enabled,
        });
      } catch {
        if (!cancelled) setData({ activeCount: 0, blocked24h: 0, autoPunishEnabled: false });
      }
    })();
    return () => { cancelled = true; };
  }, [serverId]);
  return data;
}

// ══════════════════════════════════════════════════════════
// İçgörüler özeti — 7 günlük heatmap'ten peak + toplam aktivite
// ══════════════════════════════════════════════════════════

interface InsightsSummary {
  peakDow: number;          // 0-6 (0 = Pazar)
  peakHour: number;         // 0-23
  totalActivitySec: number; // 7 gün toplam saniye
  activeDays: number;       // aktivite görülen gün sayısı (0-7)
  hasData: boolean;         // MIN eşik üstünde mi
}

const INSIGHTS_MIN_SEC = 10 * 60; // 10 dk altı → veri yok kabul

function useInsightsSummary(serverId: string): InsightsSummary | null {
  const [data, setData] = useState<InsightsSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: InsightsResponse = await getServerInsights(serverId, 7);
        if (cancelled) return;
        const total = res.peakHours.reduce((s, c) => s + c.totalSec, 0);
        const peak = res.peakHours.reduce<null | { dow: number; hour: number; totalSec: number }>(
          (acc, c) => (!acc || c.totalSec > acc.totalSec ? c : acc), null);
        const activeDays = new Set(res.peakHours.filter(c => c.totalSec > 0).map(c => c.dow)).size;
        setData({
          peakDow: peak?.dow ?? 0,
          peakHour: peak?.hour ?? 0,
          totalActivitySec: total,
          activeDays,
          hasData: total >= INSIGHTS_MIN_SEC && !!peak,
        });
      } catch {
        if (!cancelled) setData({ peakDow: 0, peakHour: 0, totalActivitySec: 0, activeDays: 0, hasData: false });
      }
    })();
    return () => { cancelled = true; };
  }, [serverId]);
  return data;
}

const DOW_FULL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function formatActivity(sec: number): string {
  if (sec < 60) return `${sec} sn`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  return `${h} saat`;
}

// ══════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════

export default function OverviewTab({ serverId, server, isOwner, initialOverview, onSwitchTab }: Props) {
  const [data, setData] = useState<ServerOverview | null>(initialOverview ?? null);
  const [error, setError] = useState('');
  const autoModSummary = useAutoModSummary(serverId);
  const insightsSummary = useInsightsSummary(serverId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getServerOverview(serverId);
        if (!cancelled) { setData(d); setError(''); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Özet alınamadı');
      }
    })();
    return () => { cancelled = true; };
  }, [serverId]);

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg text-[11px] text-red-400/85"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}
      >
        <AlertCircle size={12} />
        <span>{error}</span>
      </div>
    );
  }
  if (!data) {
    return <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Yükleniyor...</div>;
  }

  const memberPct = pct(data.counts.members, data.limits.maxMembers);
  const channelPct = pct(data.counts.channels, data.limits.maxTotalRooms);
  const persistentPct = pct(data.counts.persistentRooms, data.limits.extraPersistentRooms);
  const peakPct = Math.max(memberPct, channelPct, persistentPct);

  const status = computeStatus({ memberPct, channelPct, peakPct, dailyInvite: data.counts.inviteLinksLast24h });
  const has24hInviteActivity = data.counts.inviteLinksLast24h > 0;
  const hasActiveInvite = data.counts.activeInviteLinks > 0;

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* ── HERO ── */}
      <Hero server={server} data={data} status={status} />

      {/* ── AKILLI KARTLAR (2x2 + featured İçgörüler) ── */}
      <Section title="Akıllı Kartlar" icon={<Sparkles size={11} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CapacityCard memberPct={memberPct} channelPct={channelPct} peakPct={peakPct} plan={data.plan} />
          <AutoModCard
            summary={autoModSummary}
            onOpen={onSwitchTab ? () => onSwitchTab('automod') : undefined}
          />
          <ActivityCard
            invites24h={data.counts.inviteLinksLast24h}
            activeInvites={data.counts.activeInviteLinks}
            limit24h={data.limits.maxInviteLinksPerDay}
          />
          <InviteStateCard
            has24h={has24hInviteActivity}
            hasActive={hasActiveInvite}
            count={data.counts.activeInviteLinks}
            onOpen={onSwitchTab ? () => onSwitchTab('invites') : undefined}
          />
          <div className="sm:col-span-2">
            <InsightsSummaryCard
              summary={insightsSummary}
              onOpen={onSwitchTab ? () => onSwitchTab('insights') : undefined}
            />
          </div>
        </div>
      </Section>

      {/* ── PLAN · AYARLAR · TEHLİKELİ BÖLGE (yan yana) ── */}
      <div className={`grid grid-cols-1 ${isOwner ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-5`}>
        <Section title="Plan" icon={<Crown size={11} />} hint="Plan değişikliği için sistem yönetimine başvurun">
          <PlanSummaryRow plan={data.plan} />
        </Section>

        <Section title="Ayarlar" icon={<SettingsIcon size={11} />}>
          <NavRow
            icon={<SettingsIcon size={14} />}
            iconBg="rgba(var(--theme-accent-rgb), 0.12)"
            iconColor="var(--theme-accent)"
            title="Sunucu Kimliği & Erişim"
            hint="Ad, adres, açıklama, motto, görünürlük ve katılım politikası"
            onClick={() => onSwitchTab?.('general')}
          />
        </Section>

        {isOwner && (
          <Section title="Tehlikeli Bölge" icon={<ShieldAlert size={11} />} danger>
            <NavRow
              icon={<Trash2 size={14} />}
              iconBg="rgba(239,68,68,0.15)"
              iconColor="#f87171"
              title="Sunucuyu Sil"
              hint="Tüm kanallar, üyeler, mesajlar ve davetler kalıcı olarak silinir. Bu işlem geri alınamaz."
              tone="danger"
              onClick={() => onSwitchTab?.('general')}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// HERO
// ══════════════════════════════════════════════════════════

function Hero({ server, data, status }: { server: Server; data: ServerOverview; status: StatusInfo }) {
  const planKey = ((): PlanKey => {
    if (data.plan === 'pro' || data.plan === 'ultra') return data.plan;
    return 'free';
  })();
  const tone = {
    text: PLAN_VISUAL[planKey].accent,
    chip: `rgba(${PLAN_VISUAL[planKey].rgb}, 0.15)`,
  };

  const statusStyle =
    status.tone === 'full' ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : status.tone === 'near' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    : status.tone === 'growing' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]/85 border-[rgba(var(--glass-tint),0.10)]';

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{
        background: `radial-gradient(ellipse 80% 100% at 0% 0%, rgba(var(--theme-accent-rgb), 0.10), transparent 55%), rgba(var(--glass-tint), 0.04)`,
        border: '1px solid rgba(var(--glass-tint), 0.08)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(var(--theme-accent-rgb), 0.06)',
      }}
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: server.avatarUrl ? 'transparent' : 'rgba(var(--theme-accent-rgb), 0.12)', border: '1px solid rgba(var(--glass-tint), 0.10)' }}>
            {server.avatarUrl
              ? <img src={server.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="text-[18px] font-bold text-[var(--theme-accent)]">{server.shortName}</span>}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-bold text-[var(--theme-text)] truncate tracking-tight">{server.name}</h2>
              <span
                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md leading-none"
                style={{ background: tone.chip, color: tone.text }}
              >
                <Crown size={9} /> {PLAN_NAME[planKey] ?? data.plan}
              </span>
            </div>
            <div className="text-[11px] font-mono text-[var(--theme-secondary-text)]/55 mt-0.5">{server.slug}</div>
            {server.motto && (
              <div className="text-[10.5px] text-[var(--theme-secondary-text)]/70 mt-1 italic truncate max-w-[280px]">
                {server.motto}
              </div>
            )}
          </div>
        </div>

        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide border ${statusStyle}`}>
          <Activity size={10} /> {status.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <HeroStat icon={<Users size={11} />} label="Üyeler" current={data.counts.members} limit={data.limits.maxMembers} />
        <HeroStat icon={<Hash size={11} />} label="Toplam Oda" current={data.counts.channels} limit={data.limits.maxTotalRooms} />
        <HeroStat icon={<Lock size={11} />} label="Kalıcı Oda" current={data.counts.persistentRooms} limit={data.limits.extraPersistentRooms} />
        <HeroStat icon={<Link2 size={11} />} label="24s Davet" current={data.counts.inviteLinksLast24h} limit={data.limits.maxInviteLinksPerDay} />
      </div>
    </div>
  );
}

function HeroStat({ icon, label, current, limit }: { icon: React.ReactNode; label: string; current: number; limit: number }) {
  const p = pct(current, limit);
  const cls = p >= 100 ? 'bg-red-500/70' : p >= 80 ? 'bg-amber-500/70' : 'bg-[var(--theme-accent)]/60';
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[var(--theme-secondary-text)]/70">
        <span className="opacity-80">{icon}</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-[16px] font-bold text-[var(--theme-text)] tabular-nums">{current.toLocaleString('tr-TR')}</span>
        <span className="text-[10px] text-[var(--theme-secondary-text)]/55">/ {limit.toLocaleString('tr-TR')}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden mt-1.5" style={{ background: 'rgba(var(--glass-tint), 0.10)' }}>
        <div className={`h-full transition-all duration-500 ${cls}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Section wrapper
// ══════════════════════════════════════════════════════════

function Section({ title, icon, hint, danger, children }: { title: string; icon: React.ReactNode; hint?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${danger ? 'text-red-400' : 'text-[var(--theme-secondary-text)]/75'}`}>
          <span className="opacity-80">{icon}</span>
          {title}
        </div>
        {hint && <span className="text-[9.5px] text-[var(--theme-secondary-text)]/55 truncate ml-3">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// ══════════════════════════════════════════════════════════
// Insight card wrapper
// ══════════════════════════════════════════════════════════

type InsightTone = 'accent' | 'amber' | 'red' | 'purple' | 'neutral';

function InsightCard({ title, icon, tone, children }: { title: string; icon: React.ReactNode; tone: InsightTone; children: React.ReactNode }) {
  const ringCls =
    tone === 'red' ? 'border-red-500/25 bg-red-500/[0.04]'
    : tone === 'amber' ? 'border-amber-500/25 bg-amber-500/[0.04]'
    : tone === 'accent' ? 'border-[rgba(var(--theme-accent-rgb),0.20)] bg-[rgba(var(--theme-accent-rgb),0.04)]'
    : tone === 'purple' ? 'border-[rgba(167,139,250,0.25)] bg-[rgba(167,139,250,0.04)]'
    : 'border-[rgba(var(--glass-tint),0.08)] bg-[rgba(var(--glass-tint),0.03)]';
  const titleCls =
    tone === 'red' ? 'text-red-400'
    : tone === 'amber' ? 'text-amber-400'
    : tone === 'accent' ? 'text-[var(--theme-accent)]'
    : tone === 'purple' ? 'text-purple-400'
    : 'text-[var(--theme-secondary-text)]/75';
  return (
    <div className={`p-3.5 rounded-xl border ${ringCls}`}>
      <div className={`flex items-center gap-1.5 mb-2 text-[9.5px] font-bold uppercase tracking-[0.12em] ${titleCls}`}>
        <span className="opacity-90">{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Insight cards
// ══════════════════════════════════════════════════════════

function CapacityCard({ memberPct, channelPct, peakPct, plan }: { memberPct: number; channelPct: number; peakPct: number; plan: string }) {
  const tone: InsightTone = peakPct >= 100 ? 'red' : peakPct >= 80 ? 'amber' : 'accent';
  const hint =
    peakPct >= 100 ? 'Limit doldu — plan yükseltme şart'
    : peakPct >= 80 ? `Kapasitenin %${Math.round(peakPct)}'ine ulaştın, ${plan === 'ultra' ? 'optimize et' : 'plan yükseltme önerilir'}`
    : peakPct >= 40 ? 'Sağlıklı kullanım'
    : 'Düşük kullanım — büyüme alanı geniş';

  return (
    <InsightCard title="Kapasite Kullanımı" icon={<Gauge size={12} />} tone={tone}>
      <div className="flex items-end gap-2 mb-2">
        <span className={`text-[24px] font-bold leading-none tabular-nums ${tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : 'text-[var(--theme-text)]'}`}>%{Math.round(peakPct)}</span>
        <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none mb-0.5">peak</span>
      </div>
      <div className="space-y-1 mb-2">
        <MiniBar label="Üye" pct={memberPct} />
        <MiniBar label="Kanal" pct={channelPct} />
      </div>
      <p className="text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-snug">{hint}</p>
    </InsightCard>
  );
}

function AutoModCard({
  summary, onOpen,
}: { summary: AutoModSummary | null; onOpen?: () => void }) {
  if (!summary) {
    return (
      <InsightCard title="Oto-Mod" icon={<ShieldCheck size={12} />} tone="neutral">
        <div className="flex items-end gap-2 mb-2">
          <span className="text-[24px] font-bold leading-none text-[var(--theme-secondary-text)]/30 tabular-nums">–</span>
          <span className="text-[10px] text-[var(--theme-secondary-text)]/40 leading-none mb-0.5">yükleniyor</span>
        </div>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 leading-snug">Oto-Mod durumu okunuyor…</p>
      </InsightCard>
    );
  }

  const { activeCount, blocked24h, autoPunishEnabled } = summary;
  const allActive = activeCount === 3;
  const tone: InsightTone =
    activeCount === 0 ? 'amber'
    : blocked24h > 0 ? 'accent'
    : allActive ? 'accent'
    : 'amber';
  const valueCls =
    tone === 'amber' ? 'text-amber-400'
    : tone === 'accent' ? 'text-[var(--theme-text)]'
    : 'text-[var(--theme-text)]';

  return (
    <InsightCard title="Oto-Mod" icon={<ShieldCheck size={12} />} tone={tone}>
      <div className="flex items-end gap-2 mb-2">
        <span className={`text-[24px] font-bold leading-none tabular-nums ${valueCls}`}>{activeCount}</span>
        <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none mb-0.5">/ 3 kural aktif</span>
      </div>

      <p className="text-[10.5px] text-[var(--theme-secondary-text)]/80 leading-snug mb-2">
        {activeCount === 0
          ? 'Hiç kural aktif değil — sunucu korumasız.'
          : allActive
            ? (blocked24h > 0 ? `Tüm kurallar aktif, son 24s ${blocked24h} engelleme.` : 'Tüm kurallar aktif, sakin geçti.')
            : (blocked24h > 0 ? `${activeCount}/3 kural aktif · son 24s ${blocked24h} engelleme.` : `${activeCount}/3 kural aktif — bazı katmanlar kapalı.`)}
      </p>

      {autoPunishEnabled && (
        <div className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wide text-[var(--theme-accent)]/85 mb-2">
          <ShieldCheck size={9} /> Otomatik ceza aktif
        </div>
      )}

      {onOpen && (
        <div>
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--theme-accent)] hover:underline"
          >
            Oto-Mod'u aç <ArrowUpRight size={10} />
          </button>
        </div>
      )}
    </InsightCard>
  );
}

function InsightsSummaryCard({
  summary, onOpen,
}: { summary: InsightsSummary | null; onOpen?: () => void }) {
  if (!summary) {
    return (
      <InsightCard title="İçgörüler" icon={<BarChart3 size={12} />} tone="purple">
        <div className="flex items-end gap-2 mb-2">
          <span className="text-[24px] font-bold leading-none text-[var(--theme-secondary-text)]/30 tabular-nums">–</span>
          <span className="text-[10px] text-[var(--theme-secondary-text)]/40 leading-none mb-0.5">yükleniyor</span>
        </div>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 leading-snug">Son 7 günün özeti hazırlanıyor…</p>
      </InsightCard>
    );
  }

  if (!summary.hasData) {
    return (
      <InsightCard title="İçgörüler" icon={<BarChart3 size={12} />} tone="neutral">
        <div className="text-[13px] font-bold text-[var(--theme-secondary-text)]/75 mb-1">Henüz yeterli veri yok</div>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/70 leading-snug mb-2">
          Ses odaları kullanılmaya başladığında burada saatlik yoğunluk ve sosyal eşleşmeler görünecek.
        </p>
        {onOpen && (
          <button onClick={onOpen} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--theme-secondary-text)]/75 hover:text-[var(--theme-text)] transition-colors">
            İçgörüleri aç <ArrowUpRight size={10} />
          </button>
        )}
      </InsightCard>
    );
  }

  const hourRange = `${String(summary.peakHour).padStart(2, '0')}:00-${String((summary.peakHour + 1) % 24).padStart(2, '0')}:00`;

  return (
    <InsightCard title="İçgörüler" icon={<BarChart3 size={12} />} tone="purple">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 mb-2">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] text-[var(--theme-secondary-text)]/65 mb-0.5">
            <Clock size={10} /> En yoğun saat
          </div>
          <div className="text-[16px] font-bold text-[var(--theme-text)] tracking-tight leading-none">
            {DOW_FULL[summary.peakDow]} · {hourRange}
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[16px] font-bold text-[var(--theme-text)] tabular-nums leading-none">{formatActivity(summary.totalActivitySec)}</span>
          <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none">son 7 gün</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[16px] font-bold text-[var(--theme-text)] tabular-nums leading-none">{summary.activeDays}</span>
          <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none">/ 7 aktif gün</span>
        </div>
      </div>

      <p className="text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-snug mb-2">
        Ses odası aktivitesi özetlendi — detaylı harita, kişi ve grup kırılımı için İçgörüler sekmesine bak.
      </p>

      {onOpen && (
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-purple-400 hover:underline"
        >
          İçgörüleri aç <ArrowUpRight size={10} />
        </button>
      )}
    </InsightCard>
  );
}

function ActivityCard({ invites24h, activeInvites, limit24h }: { invites24h: number; activeInvites: number; limit24h: number }) {
  const trend: InsightTone = invites24h > 0 ? 'accent' : 'neutral';
  const usage = pct(invites24h, limit24h);
  return (
    <InsightCard title="Davet Aktivitesi" icon={<TrendingUp size={12} />} tone={trend}>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-[24px] font-bold leading-none tabular-nums text-[var(--theme-text)]">{invites24h}</span>
        <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none mb-0.5">son 24s</span>
        {invites24h > 0 && (
          <span className="text-[10px] text-emerald-400 leading-none mb-0.5 ml-auto inline-flex items-center gap-0.5">
            <TrendingUp size={9} /> aktif
          </span>
        )}
      </div>
      <div className="text-[10.5px] text-[var(--theme-secondary-text)]/70 mb-1.5">
        Aktif davet linki: <span className="font-semibold text-[var(--theme-text)]/85">{activeInvites}</span>
      </div>
      {limit24h > 0 && (
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--glass-tint), 0.08)' }}>
          <div className={`h-full ${usage >= 80 ? 'bg-amber-500/70' : 'bg-[var(--theme-accent)]/55'}`} style={{ width: `${usage}%` }} />
        </div>
      )}
    </InsightCard>
  );
}

function InviteStateCard({
  hasActive, count, onOpen,
}: { has24h: boolean; hasActive: boolean; count: number; onOpen?: () => void }) {
  return (
    <InsightCard title="Davet Durumu" icon={<Link2 size={12} />} tone={hasActive ? 'accent' : 'amber'}>
      {hasActive ? (
        <>
          <div className="flex items-end gap-2 mb-1">
            <span className="text-[24px] font-bold leading-none tabular-nums text-[var(--theme-text)]">{count}</span>
            <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none mb-0.5">aktif link</span>
          </div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-snug mb-2">
            Davet sistemi aktif. Linkler hâlâ kullanılabiliyor.
          </p>
          {onOpen && (
            <button onClick={onOpen} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--theme-accent)] hover:underline">
              Davetleri yönet <ArrowUpRight size={10} />
            </button>
          )}
        </>
      ) : (
        <>
          <div className="text-[13px] font-bold text-amber-400 mb-1">Aktif davet yok</div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-snug mb-2">
            Yeni üye almak için Davetler sekmesinden bir link oluştur.
          </p>
          <button
            onClick={onOpen}
            disabled={!onOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/20 transition-colors disabled:opacity-40"
          >
            Davet oluştur <ArrowUpRight size={10} />
          </button>
        </>
      )}
    </InsightCard>
  );
}

function MiniBar({ label, pct: value }: { label: string; pct: number }) {
  const cls = value >= 100 ? 'bg-red-500/70' : value >= 80 ? 'bg-amber-500/70' : 'bg-[var(--theme-accent)]/55';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--theme-secondary-text)]/55 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--glass-tint), 0.08)' }}>
        <div className={`h-full transition-all duration-500 ${cls}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[9.5px] tabular-nums text-[var(--theme-secondary-text)]/65 w-9 text-right">%{Math.round(value)}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Plan — tek satırlık özet
// ══════════════════════════════════════════════════════════

function PlanSummaryRow({ plan }: { plan: string }) {
  const key: PlanKey = (plan === 'pro' || plan === 'ultra') ? plan : 'free';
  const visual = PLAN_VISUAL[key];
  const limits = PLAN_LIMITS[key];
  const Icon = visual.icon;
  const audio = audioQualityLabel(key);

  return (
    <div
      className="flex items-center gap-3.5 p-3.5 rounded-xl"
      style={{
        background: `linear-gradient(180deg, rgba(${visual.rgb}, 0.05), rgba(${visual.rgb}, 0.015))`,
        border: `1px solid rgba(${visual.rgb}, 0.18)`,
        boxShadow: `inset 0 1px 0 rgba(${visual.rgb}, 0.08)`,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: `rgba(${visual.rgb}, 0.14)`,
          border: `1px solid rgba(${visual.rgb}, 0.25)`,
          color: visual.accent,
          boxShadow: `inset 0 1px 0 rgba(${visual.rgb}, 0.12)`,
        }}
      >
        <Icon size={17} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-bold tracking-tight" style={{ color: visual.accent }}>
            {PLAN_NAME[key]}
          </span>
          <span className="text-[10px] text-[var(--theme-secondary-text)]/60 italic truncate">
            {PLAN_TAGLINE[key]}
          </span>
        </div>
        <div className="text-[10.5px] text-[var(--theme-secondary-text)]/70 mt-0.5 tabular-nums">
          {limits.maxMembers.toLocaleString('tr-TR')} üye · {limits.maxTotalRooms} oda · {audio}
        </div>
      </div>

      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[10.5px] font-semibold shrink-0 cursor-not-allowed"
        style={{
          background: 'rgba(var(--glass-tint), 0.05)',
          color: 'var(--theme-secondary-text)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
        }}
        title="Plan değişikliği yakında"
      >
        Yakında <ArrowUpRight size={10} />
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// NavRow — Settings + Danger CTA paylaşımlı
// ══════════════════════════════════════════════════════════

function NavRow({
  icon, iconBg, iconColor, title, hint, tone, onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  hint: string;
  tone?: 'danger';
  onClick?: () => void;
}) {
  const baseCls = tone === 'danger'
    ? 'bg-red-500/[0.06] border-red-500/25 hover:bg-red-500/[0.10] hover:border-red-500/40'
    : 'bg-[rgba(var(--glass-tint),0.04)] border-[rgba(var(--glass-tint),0.08)] hover:bg-[rgba(var(--glass-tint),0.07)] hover:border-[rgba(var(--theme-accent-rgb),0.25)]';
  const titleCls = tone === 'danger' ? 'text-red-300' : 'text-[var(--theme-text)]';
  const chevronCls = tone === 'danger' ? 'text-red-400/60' : 'text-[var(--theme-secondary-text)]/50';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${baseCls}`}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] font-semibold ${titleCls}`}>{title}</div>
        <div className="text-[10.5px] text-[var(--theme-secondary-text)]/70 mt-0.5 leading-snug">{hint}</div>
      </div>
      <ChevronRight size={14} className={`${chevronCls} shrink-0`} />
    </button>
  );
}

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function pct(c: number, l: number): number {
  return l > 0 ? Math.min(100, (c / l) * 100) : 0;
}

interface StatusInfo { label: string; tone: 'low' | 'growing' | 'near' | 'full'; }

function computeStatus(args: { memberPct: number; channelPct: number; peakPct: number; dailyInvite: number }): StatusInfo {
  if (args.peakPct >= 100) return { label: 'Limit dolu', tone: 'full' };
  if (args.peakPct >= 80) return { label: 'Kapasiteye yakın', tone: 'near' };
  if (args.peakPct >= 30 || args.dailyInvite >= 3) return { label: 'Büyüyor', tone: 'growing' };
  return { label: 'Düşük kullanım', tone: 'low' };
}
