import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, AlertCircle, RefreshCw, RotateCw } from 'lucide-react';
import { getAllProfiles } from '../../../lib/backendClient';
import {
  getServerInsights,
  refreshServerInsights,
  type InsightsResponse,
  type InsightsRangeDays,
} from '../../../lib/serverService';
import ActivityHeatmap from './ActivityHeatmap';
import TopUsersCard from './TopUsersCard';
import SocialGroupsCard from './SocialGroupsCard';
import AiInsightsRow from './AiInsightsRow';

type Phase = 'loading' | 'ready' | 'empty' | 'error';

interface ProfileRecord { id: string; displayName: string | null; avatar: string | null; }

interface Props {
  serverId: string;
}

// Apple easing + 5 dk memory cache. Range değişiminde invalidate.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: InsightsResponse; ts: number }>();

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'az önce';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dakika önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

export default function InsightsTab({ serverId }: Props) {
  const [range, setRange] = useState<InsightsRangeDays>(30);
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [profiles, setProfiles] = useState<Map<string, ProfileRecord>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = useCallback(async (force = false) => {
    const key = `${serverId}:${range}`;
    const cached = cache.get(key);
    if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setData(cached.data);
      setPhase(isEmpty(cached.data) ? 'empty' : 'ready');
      return;
    }
    setPhase('loading');
    setError('');
    try {
      const res = await getServerInsights(serverId, range);
      cache.set(key, { data: res, ts: Date.now() });
      setData(res);
      setPhase(isEmpty(res) ? 'empty' : 'ready');
    } catch (err: any) {
      setError(err?.message || 'Bağlantı hatası, tekrar deneyin');
      setPhase('error');
    }
  }, [serverId, range]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  // Manuel MV refresh — backend tarafında da tek in-flight promise ile serialize;
  // frontend guard'ı concurrent buton spam'ını engeller (disabled + early return).
  const handleManualRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { refreshedAt } = await refreshServerInsights(serverId);
      // "Son güncelleme" etiketini anında güncelle — fetch dönmeden kullanıcı görsün.
      setData(prev => prev ? { ...prev, heatmapRefreshedAt: refreshedAt } : prev);
      // Tüm range cache'lerini invalidate et (MV global refresh olduğu için).
      for (const k of Array.from(cache.keys())) {
        if (k.startsWith(`${serverId}:`)) cache.delete(k);
      }
      await fetchInsights(true);
    } catch (err: any) {
      setError(err?.message || 'Yenileme başarısız');
    } finally {
      setRefreshing(false);
    }
  }, [serverId, refreshing, fetchInsights]);

  // Profile enrichment — backend user_id'lere name + avatar ekle.
  useEffect(() => {
    if (!data) return;
    const ids = new Set<string>();
    data.topActiveUsers.forEach(u => ids.add(u.userId));
    data.topSocialPairs.forEach(p => { ids.add(p.userA.id); ids.add(p.userB.id); });
    (data.topSocialGroups ?? []).forEach(g => g.members.forEach(m => ids.add(m.id)));
    Object.keys(data.userActivityMap).forEach(id => ids.add(id));
    if (ids.size === 0) return;

    const needed = Array.from(ids).filter(id => !profiles.has(id));
    if (needed.length === 0) return;

    getAllProfiles().then(({ data: allProfiles }) => {
      const rows = (allProfiles ?? []).filter((profile: any) => needed.includes(profile.id));
      if (!rows) return;
      setProfiles(prev => {
        const next = new Map(prev);
        for (const r of rows as any[]) {
          const full = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
          next.set(r.id, { id: r.id, displayName: r.display_name || full || r.name || null, avatar: r.avatar ?? null });
        }
        return next;
      });
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const enrichedUsers = useMemo(() => {
    if (!data) return [];
    return data.topActiveUsers.map(u => {
      const p = profiles.get(u.userId);
      return { ...u, displayName: p?.displayName ?? u.displayName, avatarUrl: p?.avatar ?? u.avatarUrl };
    });
  }, [data, profiles]);

  const enrichedGroups = useMemo(() => {
    if (!data) return [];
    return (data.topSocialGroups ?? []).map(g => ({
      ...g,
      members: g.members.map(m => {
        const p = profiles.get(m.id);
        return { ...m, name: p?.displayName ?? m.name, avatar: p?.avatar ?? m.avatar };
      }),
    }));
  }, [data, profiles]);

  return (
    <div className="max-w-[1040px] mx-auto space-y-4">
      {/* Header: başlık + range pills */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--theme-text)] tracking-tight leading-none flex items-center gap-2">
            <BarChart3 size={14} className="text-[var(--theme-accent)]" /> İçgörüler
          </h2>
          <p className="text-[11px] text-[var(--theme-secondary-text)]/55 mt-1.5 tracking-wide">
            Ses odası aktivitesi ve sosyal etkileşim özetleri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={handleManualRefresh} pending={refreshing} disabled={phase === 'loading'} />
          <RangePills value={range} onChange={setRange} disabled={phase === 'loading' || refreshing} />
        </div>
      </div>

      {/* İçerik */}
      {phase === 'loading' && <LoadingSkeleton />}
      {phase === 'error' && <ErrorState message={error} onRetry={() => fetchInsights(true)} />}
      {phase === 'empty' && <EmptyState />}
      {phase === 'ready' && data && (
        <>
          {/* 1) Aktivite Haritası — en üstte, full-width */}
          <ActivityHeatmap peakHours={data.peakHours} />

          {/* 2) Sadece Aktivite Paterni — tek kart, full-width bar */}
          <AiInsightsRow narratives={data.narratives?.filter(n => n.id === 'peak-pattern')} />

          {/* 3) Detay: TopUsers + SocialGroups, eşit boy */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopUsersCard users={enrichedUsers} />
            <SocialGroupsCard groups={enrichedGroups} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-1.5 pt-2 pb-1">
            <span
              className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--theme-secondary-text)]/60 tracking-wide tabular-nums cursor-default"
              title="Veriler periyodik olarak güncellenir"
            >
              <RotateCw size={10} className="opacity-70" />
              Son güncelleme: {relativeTime(data.heatmapRefreshedAt)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function isEmpty(d: InsightsResponse): boolean {
  return d.topActiveUsers.length === 0
      && d.topSocialPairs.length === 0
      && d.peakHours.length === 0;
}

// ── Yenile butonu — MV refresh tetikler, pending state + concurrent guard ──
function RefreshButton({ onClick, pending, disabled }: {
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
}) {
  const isDisabled = !!disabled || pending;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title={pending ? 'Yenileniyor…' : 'Aktivite haritasını yenile'}
      aria-busy={pending}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide disabled:cursor-default"
      style={{
        color: 'var(--theme-text)',
        background: pending
          ? 'rgba(var(--theme-accent-rgb), 0.18)'
          : 'rgba(var(--glass-tint), 0.04)',
        border: `1px solid rgba(var(--${pending ? 'theme-accent-rgb' : 'glass-tint'}), ${pending ? 0.32 : 0.08})`,
        opacity: isDisabled && !pending ? 0.5 : 1,
        transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <RefreshCw size={12} className={pending ? 'animate-spin' : ''} />
      {pending ? 'Yenileniyor' : 'Yenile'}
    </button>
  );
}

// ── Range Pills (segmented control) ──
function RangePills({ value, onChange, disabled }: {
  value: InsightsRangeDays;
  onChange: (v: InsightsRangeDays) => void;
  disabled?: boolean;
}) {
  const options: { v: InsightsRangeDays; label: string }[] = [
    { v: 7, label: '7 gün' },
    { v: 30, label: '30 gün' },
    { v: 90, label: '90 gün' },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl"
      style={{
        background: 'rgba(var(--glass-tint), 0.04)',
        border: '1px solid rgba(var(--glass-tint), 0.08)',
      }}
    >
      {options.map(o => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            onClick={() => !disabled && onChange(o.v)}
            disabled={disabled}
            className="relative px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide disabled:opacity-50"
            style={{
              color: active ? 'var(--theme-text)' : 'var(--theme-secondary-text)',
              background: active ? 'rgba(var(--theme-accent-rgb), 0.12)' : 'transparent',
              boxShadow: active ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.25)' : 'none',
              transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Loading skeleton ──
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-[220px] rounded-[18px] animate-pulse" style={{ background: 'rgba(var(--glass-tint), 0.04)' }} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[280px] rounded-[18px] animate-pulse" style={{ background: 'rgba(var(--glass-tint), 0.04)' }} />
        <div className="h-[280px] rounded-[18px] animate-pulse" style={{ background: 'rgba(var(--glass-tint), 0.04)' }} />
      </div>
    </div>
  );
}

// ── Empty state — iki satır premium ──
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{
          background: 'rgba(var(--glass-tint), 0.05)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
          boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.02)',
        }}
      >
        <BarChart3 size={22} className="text-[var(--theme-secondary-text)]/45" />
      </div>
      <p className="text-[13px] font-semibold text-[var(--theme-text)]/85 mb-1.5 tracking-tight">Henüz yeterli veri yok</p>
      <p className="text-[11px] text-[var(--theme-secondary-text)]/55 max-w-[380px] leading-relaxed">
        Ses odaları kullanılmaya başladığında<br />burada saatlik yoğunluk ve sosyal eşleşmeler görünecek.
      </p>
    </div>
  );
}

// ── Error state ──
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.18)' }}
      >
        <AlertCircle size={22} className="text-amber-400/70" />
      </div>
      <p className="text-[13px] font-semibold text-[var(--theme-text)]/80 mb-1.5">İçgörüler yüklenemedi</p>
      <p className="text-[11px] text-[var(--theme-secondary-text)]/55 max-w-[380px] leading-relaxed mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold"
        style={{
          color: 'var(--theme-text)',
          background: 'rgba(var(--theme-accent-rgb), 0.12)',
          border: '1px solid rgba(var(--theme-accent-rgb), 0.25)',
          transition: 'all 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <RefreshCw size={12} /> Tekrar dene
      </button>
    </div>
  );
}
