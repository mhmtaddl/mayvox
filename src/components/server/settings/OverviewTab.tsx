import React, { useEffect, useMemo, useState } from 'react';
import {
  Crown, Users, Hash, Lock, Link2, AlertCircle, Activity,
  Sparkles, ArrowUpRight, Settings as SettingsIcon, Trash2, ChevronRight,
  TrendingUp, Gauge, ShieldAlert,
} from 'lucide-react';
import { getServerOverview, type ServerOverview, type Server } from '../../../lib/serverService';
import { PLAN_LIMITS, PLAN_NAME, PLAN_TAGLINE, planFeatureList, PLAN_RANK, type PlanKey } from '../../../lib/planLimits';

interface Props {
  serverId: string;
  server: Server;
  isOwner: boolean;
  initialOverview?: ServerOverview | null;
  onSwitchTab?: (tab: 'general' | 'invites') => void;
}

const PLAN_LABEL = PLAN_NAME;

const PLAN_TONE: Record<string, { ring: string; bg: string; text: string; chip: string }> = {
  free: { ring: 'border-emerald-500/35', bg: 'bg-emerald-500/8', text: 'text-emerald-400', chip: 'bg-emerald-500/15' },
  pro: { ring: 'border-sky-500/35', bg: 'bg-sky-500/8', text: 'text-sky-400', chip: 'bg-sky-500/15' },
  ultra: { ring: 'border-violet-500/35', bg: 'bg-violet-500/8', text: 'text-violet-400', chip: 'bg-violet-500/15' },
};

export default function OverviewTab({ serverId, server, isOwner, initialOverview, onSwitchTab }: Props) {
  // initialOverview seed olarak görünür ama her tab açılışında taze veri çekilir
  // (kanal/davet/üye mutasyonları sonrası stale kalmasın).
  const [data, setData] = useState<ServerOverview | null>(initialOverview ?? null);
  const [error, setError] = useState('');

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
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}>
        <AlertCircle size={12} />
        <span>{error}</span>
      </div>
    );
  }
  if (!data) return <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Yükleniyor...</div>;

  const memberPct = pct(data.counts.members, data.limits.maxMembers);
  const channelPct = pct(data.counts.channels, data.limits.maxTotalRooms);
  // Persistent = kullanıcı kalıcı oda (sistem hariç); limit = extraPersistentRooms kotası.
  const persistentPct = pct(data.counts.persistentRooms, data.limits.extraPersistentRooms);
  const invitePct = pct(data.counts.inviteLinksLast24h, data.limits.maxInviteLinksPerDay);
  const peakPct = Math.max(memberPct, channelPct, persistentPct);

  const status = computeStatus({ memberPct, channelPct, peakPct, dailyInvite: data.counts.inviteLinksLast24h });
  const has24hInviteActivity = data.counts.inviteLinksLast24h > 0;
  const hasActiveInvite = data.counts.activeInviteLinks > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ───── HERO ───── */}
      <Hero server={server} data={data} status={status} />

      {/* ───── INSIGHTS ───── */}
      <Section title="Akıllı Kartlar" icon={<Sparkles size={11} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CapacityCard memberPct={memberPct} channelPct={channelPct} peakPct={peakPct} plan={data.plan} />
          <ActivityCard
            invites24h={data.counts.inviteLinksLast24h}
            activeInvites={data.counts.activeInviteLinks}
            limit24h={data.limits.maxInviteLinksPerDay}
          />
          <TopRoomCard channels={data.counts.channels} persistentRooms={data.counts.persistentRooms} />
          <InviteStateCard
            has24h={has24hInviteActivity}
            hasActive={hasActiveInvite}
            count={data.counts.activeInviteLinks}
            onCreate={() => onSwitchTab?.('invites')}
          />
        </div>
      </Section>

      {/* ───── PLAN ───── */}
      <Section title="Plan" icon={<Crown size={11} />} hint="Plan değişikliği için sistem yönetimine başvurun.">
        <PlanGrid currentPlan={data.plan} peakPct={peakPct} />
      </Section>

      {/* ───── AYARLAR CTA ───── */}
      <Section title="Ayarlar" icon={<SettingsIcon size={11} />}>
        <button
          onClick={() => onSwitchTab?.('general')}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[rgba(var(--glass-tint),0.04)] border border-[rgba(var(--glass-tint),0.08)] hover:bg-[rgba(var(--glass-tint),0.07)] hover:border-[rgba(var(--theme-accent-rgb),0.25)] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] flex items-center justify-center shrink-0">
            <SettingsIcon size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-[var(--theme-text)]">Sunucu Kimliği & Erişim</div>
            <div className="text-[10.5px] text-[var(--theme-secondary-text)]/70 mt-0.5">Ad, adres, açıklama, motto, görünürlük ve katılım politikası</div>
          </div>
          <ChevronRight size={14} className="text-[var(--theme-secondary-text)]/50 shrink-0" />
        </button>
      </Section>

      {/* ───── DANGER ZONE ───── */}
      {isOwner && (
        <Section title="Tehlikeli Bölge" icon={<ShieldAlert size={11} />} danger>
          <button
            onClick={() => onSwitchTab?.('general')}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-red-500/[0.06] border border-red-500/25 hover:bg-red-500/[0.10] hover:border-red-500/40 transition-all text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
              <Trash2 size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-red-300">Sunucuyu Sil</div>
              <div className="text-[10.5px] text-[var(--theme-secondary-text)] mt-0.5">Tüm kanallar, üyeler, mesajlar ve davetler kalıcı olarak silinir. Bu işlem geri alınamaz.</div>
            </div>
            <ChevronRight size={14} className="text-red-400/60 shrink-0" />
          </button>
        </Section>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// HERO
// ══════════════════════════════════════

function Hero({ server, data, status }: { server: Server; data: ServerOverview; status: { label: string; tone: 'low' | 'growing' | 'near' | 'full' } }) {
  const tone = PLAN_TONE[data.plan] ?? PLAN_TONE.free;
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
        {/* LEFT — identity */}
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
              <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md leading-none ${tone.chip} ${tone.text}`}>
                <Crown size={9} /> {PLAN_LABEL[data.plan] ?? data.plan}
              </span>
            </div>
            <div className="text-[11px] font-mono text-[var(--theme-secondary-text)]/55 mt-0.5">{server.slug}</div>
            {server.motto && <div className="text-[10.5px] text-[var(--theme-secondary-text)]/70 mt-1 italic truncate max-w-[280px]">{server.motto}</div>}
          </div>
        </div>

        {/* Status badge */}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide border ${statusStyle}`}>
          <Activity size={10} /> {status.label}
        </span>
      </div>

      {/* Inline stats with bars */}
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

// ══════════════════════════════════════
// SECTION
// ══════════════════════════════════════

function Section({ title, icon, hint, danger, children }: { title: string; icon: React.ReactNode; hint?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${danger ? 'text-red-400' : 'text-[var(--theme-secondary-text)]/75'}`}>
          <span className="opacity-80">{icon}</span>
          {title}
        </div>
        {hint && <span className="text-[9.5px] text-[var(--theme-secondary-text)]/55">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// ══════════════════════════════════════
// INSIGHT CARDS
// ══════════════════════════════════════

function CapacityCard({ memberPct, channelPct, peakPct, plan }: { memberPct: number; channelPct: number; peakPct: number; plan: string }) {
  const tone = peakPct >= 100 ? 'red' : peakPct >= 80 ? 'amber' : 'accent';
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

function ActivityCard({ invites24h, activeInvites, limit24h }: { invites24h: number; activeInvites: number; limit24h: number }) {
  const trend = invites24h > 0 ? 'up' : 'flat';
  const usage = pct(invites24h, limit24h);
  return (
    <InsightCard title="Davet Aktivitesi" icon={<TrendingUp size={12} />} tone={trend === 'up' ? 'accent' : 'neutral'}>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-[24px] font-bold leading-none tabular-nums text-[var(--theme-text)]">{invites24h}</span>
        <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none mb-0.5">son 24s</span>
        {trend === 'up' && <span className="text-[10px] text-emerald-400 leading-none mb-0.5 ml-auto inline-flex items-center gap-0.5"><TrendingUp size={9} /> aktif</span>}
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

function TopRoomCard({ channels, persistentRooms }: { channels: number; persistentRooms: number }) {
  // Toplam = sistem + kullanıcı-kalıcı. Sistem her zaman 4.
  const systemRooms = Math.max(0, channels - persistentRooms);
  return (
    <InsightCard title="Oda Dağılımı" icon={<Hash size={12} />} tone="neutral">
      <div className="flex items-end gap-2 mb-1.5">
        <span className="text-[24px] font-bold leading-none tabular-nums text-[var(--theme-text)]">{channels}</span>
        <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none mb-0.5">toplam</span>
      </div>
      <div className="flex items-center gap-3 text-[10.5px]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
          <span className="text-[var(--theme-secondary-text)]">Sistem:</span>
          <span className="font-semibold text-[var(--theme-text)]/85 tabular-nums">{systemRooms}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
          <span className="text-[var(--theme-secondary-text)]">Kalıcı:</span>
          <span className="font-semibold text-[var(--theme-text)]/85 tabular-nums">{persistentRooms}</span>
        </div>
      </div>
    </InsightCard>
  );
}

function InviteStateCard({ hasActive, count, onCreate }: { has24h: boolean; hasActive: boolean; count: number; onCreate?: () => void }) {
  return (
    <InsightCard title="Davet Durumu" icon={<Link2 size={12} />} tone={hasActive ? 'accent' : 'amber'}>
      {hasActive ? (
        <>
          <div className="flex items-end gap-2 mb-1">
            <span className="text-[24px] font-bold leading-none tabular-nums text-[var(--theme-text)]">{count}</span>
            <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-none mb-0.5">aktif link</span>
          </div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-snug mb-2">Davet sistemi aktif. Linkler hâlâ kullanılabiliyor.</p>
          {onCreate && (
            <button onClick={onCreate} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--theme-accent)] hover:underline">
              Davetleri yönet <ArrowUpRight size={10} />
            </button>
          )}
        </>
      ) : (
        <>
          <div className="text-[12px] font-semibold text-amber-400 mb-1">Aktif davet yok</div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/75 leading-snug mb-2">Yeni üye almak için Davetler sekmesinden bir link oluştur.</p>
          <button
            onClick={onCreate}
            disabled={!onCreate}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/20 transition-colors disabled:opacity-40"
          >
            Davet oluştur <ArrowUpRight size={10} />
          </button>
        </>
      )}
    </InsightCard>
  );
}

function InsightCard({ title, icon, tone, children }: { title: string; icon: React.ReactNode; tone: 'accent' | 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const ringCls =
    tone === 'red' ? 'border-red-500/25 bg-red-500/[0.04]'
    : tone === 'amber' ? 'border-amber-500/25 bg-amber-500/[0.04]'
    : tone === 'accent' ? 'border-[rgba(var(--theme-accent-rgb),0.20)] bg-[rgba(var(--theme-accent-rgb),0.04)]'
    : 'border-[rgba(var(--glass-tint),0.08)] bg-[rgba(var(--glass-tint),0.03)]';
  const titleCls =
    tone === 'red' ? 'text-red-400'
    : tone === 'amber' ? 'text-amber-400'
    : tone === 'accent' ? 'text-[var(--theme-accent)]'
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

// ══════════════════════════════════════
// PLAN GRID
// ══════════════════════════════════════

function PlanGrid({ currentPlan, peakPct }: { currentPlan: string; peakPct: number }) {
  const order: PlanKey[] = ['free', 'pro', 'ultra'];
  const currentRank = PLAN_RANK[currentPlan as PlanKey] ?? 0;
  const recommendUpgrade = peakPct >= 80 && currentRank < 2;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {order.map(p => {
        const isCurrent = p === currentPlan;
        const isHigher = (PLAN_RANK[p] ?? 0) > currentRank;
        const tone = PLAN_TONE[p];
        const highlight = recommendUpgrade && isHigher && PLAN_RANK[p] === currentRank + 1;
        const diff = useDiff(currentPlan as PlanKey, p);
        const features = planFeatureList(p);
        return (
          <div
            key={p}
            className={`relative p-4 rounded-xl border-2 transition-all ${
              isCurrent ? `${tone.ring} ${tone.bg}` :
              highlight ? 'border-[var(--theme-accent)]/50 bg-[var(--theme-accent)]/5 shadow-[0_4px_18px_rgba(var(--theme-accent-rgb),0.12)]' :
              'border-[var(--theme-border)]/60 bg-[var(--theme-surface-card)]'
            }`}
          >
            {isCurrent && (
              <span className={`absolute top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wide ${tone.chip} ${tone.text}`}>
                Mevcut
              </span>
            )}
            {highlight && !isCurrent && (
              <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wide bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]">
                Önerilen
              </span>
            )}

            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${tone.chip}`}>
              <Crown size={16} className={tone.text} />
            </div>
            <div className={`text-[15px] font-bold tracking-tight ${tone.text}`}>{PLAN_LABEL[p]}</div>
            <div className="text-[10.5px] text-[var(--theme-secondary-text)]/75 mt-0.5 leading-snug">{PLAN_TAGLINE[p]}</div>

            <ul className="mt-3 space-y-0.5 text-[10.5px] text-[var(--theme-secondary-text)]/90">
              {features.map(f => <li key={f}>· {f}</li>)}
            </ul>

            {!isCurrent && diff && (
              <div className={`mt-3 pt-2.5 border-t border-[rgba(var(--glass-tint),0.08)] text-[10px] font-semibold ${
                diff.kind === 'upgrade' ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {diff.kind === 'upgrade'
                  ? `↑ +${diff.members.toLocaleString('tr-TR')} üye, +${diff.persistentRooms} kalıcı oda hakkı`
                  : `↓ -${(-diff.members).toLocaleString('tr-TR')} üye limiti`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useDiff(from: PlanKey, to: PlanKey): { kind: 'upgrade' | 'downgrade'; members: number; persistentRooms: number } | null {
  return useMemo(() => {
    const a = PLAN_LIMITS[from];
    const b = PLAN_LIMITS[to];
    if (!a || !b) return null;
    const dm = b.maxMembers - a.maxMembers;
    const dp = b.extraPersistentRooms - a.extraPersistentRooms;
    if (dm === 0 && dp === 0) return null;
    return { kind: dm > 0 ? 'upgrade' : 'downgrade', members: dm, persistentRooms: dp };
  }, [from, to]);
}

// ══════════════════════════════════════
// HELPERS
// ══════════════════════════════════════

function pct(c: number, l: number): number {
  return l > 0 ? Math.min(100, (c / l) * 100) : 0;
}

function computeStatus(args: { memberPct: number; channelPct: number; peakPct: number; dailyInvite: number }): { label: string; tone: 'low' | 'growing' | 'near' | 'full' } {
  if (args.peakPct >= 100) return { label: 'Limit dolu', tone: 'full' };
  if (args.peakPct >= 80) return { label: 'Kapasiteye yakın', tone: 'near' };
  if (args.peakPct >= 30 || args.dailyInvite >= 3) return { label: 'Büyüyor', tone: 'growing' };
  return { label: 'Düşük kullanım', tone: 'low' };
}
