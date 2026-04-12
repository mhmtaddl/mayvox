import React, { useEffect, useState } from 'react';
import { Crown, Users, Hash, Lock, Link2, AlertCircle } from 'lucide-react';
import { getServerOverview, type ServerOverview } from '../../../lib/serverService';

interface Props {
  serverId: string;
}

const PLAN_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', ultra: 'Ultra' };
const PLAN_BADGE_STYLE: Record<string, string> = {
  free: 'bg-[rgba(var(--glass-tint),0.08)] text-[var(--theme-secondary-text)]',
  pro: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  ultra: 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
};

export default function OverviewTab({ serverId }: Props) {
  const [data, setData] = useState<ServerOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getServerOverview(serverId);
        if (!cancelled) setData(d);
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
  if (!data) return <div className="text-[11px] text-[var(--theme-secondary-text)]/40 py-8 text-center">Yükleniyor...</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Crown size={15} className="text-[var(--theme-accent)]" />
        <span className="text-[13px] font-bold text-[var(--theme-text)]">Plan</span>
        <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-lg ${PLAN_BADGE_STYLE[data.plan] ?? PLAN_BADGE_STYLE.free}`}>
          {PLAN_LABEL[data.plan] ?? data.plan}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon={<Users size={13} />} label="Üyeler" current={data.counts.members} limit={data.limits.maxMembers} />
        <MetricCard icon={<Hash size={13} />} label="Kanallar" current={data.counts.channels} limit={data.limits.maxChannels} />
        <MetricCard icon={<Lock size={13} />} label="Özel kanallar" current={data.counts.privateChannels} limit={data.limits.maxPrivateChannels} />
        <MetricCard icon={<Link2 size={13} />} label="Son 24s davet" current={data.counts.inviteLinksLast24h} limit={data.limits.maxInviteLinksPerDay} />
      </div>

      <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg text-[10.5px] text-[var(--theme-secondary-text)]/55"
        style={{ background: 'rgba(var(--glass-tint), 0.04)' }}
      >
        <span>Aktif davet linki:</span>
        <span className="font-semibold text-[var(--theme-text)]/80">{data.counts.activeInviteLinks}</span>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, current, limit }: { icon: React.ReactNode; label: string; current: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const near = pct >= 80;
  const full = pct >= 100;
  return (
    <div className="p-2.5 rounded-xl"
      style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.07)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[var(--theme-secondary-text)]/50">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-secondary-text)]/50">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <span className={`text-[16px] font-bold ${full ? 'text-red-400' : near ? 'text-amber-400' : 'text-[var(--theme-text)]'}`}>{current}</span>
        <span className="text-[10px] text-[var(--theme-secondary-text)]/45">/ {limit}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--glass-tint), 0.08)' }}>
        <div
          className={`h-full transition-all duration-200 ${full ? 'bg-red-500/70' : near ? 'bg-amber-500/70' : 'bg-[var(--theme-accent)]/50'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
