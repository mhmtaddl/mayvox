import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CalendarDays, CheckCircle2, Circle, Clock3, Crown, Gem, Globe2, Hash, LockKeyhole, Search, Users } from 'lucide-react';
import { searchServers, joinServer, createJoinRequest, type DiscoverServer } from '../../lib/serverService';
import { subscribeServerEvents, type ServerEvent } from '../../lib/chatService';
import { getPlanVisual } from '../../lib/planStyles';

const DISCOVER_PLAN_TONE: Record<string, { rgb: string; bgA: number; bgB: number; borderA: number; shadowA: number }> = {
  free: { rgb: '75, 85, 99', bgA: 0.08, bgB: 0.035, borderA: 0.18, shadowA: 0.06 },
  pro: { rgb: '234, 179, 8', bgA: 0.16, bgB: 0.055, borderA: 0.36, shadowA: 0.10 },
  ultra: { rgb: '168, 85, 247', bgA: 0.18, bgB: 0.065, borderA: 0.42, shadowA: 0.12 },
};

function formatSince(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return String(date.getFullYear());
}

interface Props {
  /** serverId — katılım sonrası veya mevcut üye olunan sunucuya geçiş için parent'a iletilir. */
  onJoinSuccess: (serverId: string) => void;
  onCreateServer: () => void;
  onJoinModal: () => void;
  activeServerId?: string;
  /** App-level rol + 0 aktif sahip sunucu yoksa false — CTA gizlenir. */
  canCreate?: boolean;
}

export default function DiscoverPanel({ onJoinSuccess, onCreateServer, onJoinModal, activeServerId, canCreate = true }: Props) {
  const [query, setQuery] = useState('');
  const [apiServers, setApiServers] = useState<DiscoverServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const seqRef = useRef(0);

  // Responsive breakpoints:
  //  - 'xs' (< 380px, eski 5" telefonlar)  → 1 sütun
  //  - 'narrow' (380–560px, 5.5" telefon)  → 2 sütun
  //  - 'wide' (>= 560px, tablet+)          → 3 sütun
  type Breakpoint = 'xs' | 'narrow' | 'wide';
  const [bp, setBp] = useState<Breakpoint>('wide');
  const roRef = useRef<ResizeObserver | null>(null);
  const gridRefCb = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setBp(w < 380 ? 'xs' : w < 560 ? 'narrow' : 'wide');
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);
  const gridCols = bp === 'xs' ? 'grid-cols-1' : bp === 'narrow' ? 'grid-cols-2' : 'grid-cols-3';

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); }, []);

  useEffect(() => {
    setLoading(true);
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await searchServers(query.trim());
        if (seq !== seqRef.current) return;
        setApiServers(data);
      } catch { if (seq === seqRef.current) setApiServers([]); }
      finally { if (seq === seqRef.current) setLoading(false); }
    }, query.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  // Başvuru kabul/red → kartın badge'ini (Yanıt Bekleniyor / Üyesin) refresh et.
  useEffect(() => {
    const unsub = subscribeServerEvents((event: ServerEvent) => {
      if (typeof event.type !== 'string') return;
      if (event.type !== 'server:join_request:accepted' && event.type !== 'server:join_request:rejected') return;
      const seq = ++seqRef.current;
      (async () => {
        try {
          const data = await searchServers(query.trim());
          if (seq !== seqRef.current) return;
          setApiServers(data);
        } catch { /* no-op */ }
      })();
    });
    return () => { unsub(); };
  }, [query]);

  // Sadece gerçek sunucular — mock'lar kaldırıldı.
  const servers = apiServers;

  const handleJoin = async (serverId: string) => {
    try {
      setJoining(serverId);
      await joinServer(serverId);
      showToast('Sunucuya katıldın');
      onJoinSuccess(serverId);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Katılınamadı');
    } finally { setJoining(null); }
  };

  // Davetli sunucu → başvuru gönder (davet kodu değil).
  const handleRequest = async (serverId: string) => {
    try {
      setJoining(serverId);
      await createJoinRequest(serverId);
      showToast('İsteğiniz iletildi.');
      // Local state: kartı anında 'Yanıt Bekleniyor' yap — full refresh yok.
      setApiServers(prev => prev.map(s => s.id === serverId ? { ...s, myJoinRequestStatus: 'pending' } : s));
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Başvuru gönderilemedi');
    } finally { setJoining(null); }
  };

  const isFrictionless = (s: DiscoverServer) =>
    s.isPublic === true && (s.joinPolicy === 'open' || !s.joinPolicy);

  // Zaten üye olunan sunucu kartına tıklayınca sunucuya geç.
  const handleCardClick = (s: DiscoverServer) => {
    if (!isMember(s)) return;
    onJoinSuccess(s.id);
  };

  const isMember = (s: DiscoverServer) => !!s.role;
  const isActive = (s: DiscoverServer) => s.id === activeServerId;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-8 lg:py-6">
      <div className="max-w-[860px] mx-auto w-full space-y-4">

        {/* Hero */}
        <div>
          <h1 className="text-[18px] font-bold text-[var(--theme-text)] tracking-tight">Topluluklara Katıl</h1>
          <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-75 mt-1">Açık sunucuları keşfet, anında katıl veya kendi topluluğunu oluştur.</p>
        </div>

        {/* Search + Davet kodu — dar ekranda buton ikon+kısa metin, geniş ekranda tam metin */}
        <div className="flex gap-2">
          <div className="discover-search-shell flex-1 min-w-0 flex items-center gap-2 h-10 rounded-lg px-3" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}>
            <Search size={14} className="text-[var(--theme-secondary-text)] opacity-65 shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Sunucu ara"
              className="search-input-field flex-1 min-w-0 text-[12px] outline-none" />
            {loading && query.trim() && <div className="w-3 h-3 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin shrink-0" />}
          </div>
          <button onClick={onJoinModal} className="h-10 px-3 sm:px-4 rounded-lg flex items-center gap-1.5 text-[10px] font-semibold shrink-0 hover:bg-[rgba(var(--glass-tint),0.08)] transition-colors"
            style={{ background: 'rgba(var(--glass-tint), 0.05)', border: '1px solid rgba(var(--glass-tint), 0.08)', color: 'var(--theme-text)' }}
            title="Davet Kodu ile Katıl">
            <Hash size={12} className="text-[var(--theme-accent)] opacity-60" />
            <span className="hidden sm:inline">Davet Kodu ile Katıl</span>
            <span className="sm:hidden">Davet Kodu</span>
          </button>
        </div>

        {/* Başlık */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-[var(--theme-secondary-text)] opacity-70 uppercase tracking-widest">
            {query.trim() ? 'Eşleşen Sunucular' : 'Popüler Sunucular'}
          </span>
          <span className="text-[9px] text-[var(--theme-secondary-text)] opacity-60">{servers.length} sunucu</span>
        </div>

        {/* Grid — 3 kolon */}
        {loading && !query.trim() ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin" />
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Search size={18} className="text-[var(--theme-secondary-text)] opacity-15 mb-2" />
            <div className="text-[11px] text-[var(--theme-secondary-text)] opacity-30">Eşleşen sunucu bulunamadı</div>
          </div>
        ) : (
          <div ref={gridRefCb} className={`grid gap-3 ${gridCols}`}>
            {servers.map(s => {
              const member = isMember(s);
              const active = isActive(s);
              const isJoining = joining === s.id;
              const plan = (s as DiscoverServer & { plan?: string }).plan ?? 'free';
              const pv = getPlanVisual(plan);
              const planKey = plan === 'pro' || plan === 'ultra' ? plan : 'free';
              const tone = DISCOVER_PLAN_TONE[planKey];
              const clickable = member || active;
              const since = formatSince(s.createdAt);
              const PlanIcon = plan === 'ultra' ? Gem : plan === 'pro' ? Crown : Circle;
              return (
                <div key={s.id}
                  onClick={clickable ? () => handleCardClick(s) : undefined}
                  className={`group/c relative min-h-[150px] overflow-hidden rounded-xl p-3 transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-[1px] ${active ? 'ring-1 ring-[var(--theme-accent)]/16' : ''} ${clickable ? 'cursor-pointer' : ''}`}
                  style={{
                    background: active
                      ? 'rgba(var(--theme-accent-rgb),0.070)'
                      : 'rgba(var(--glass-tint),0.040)',
                    border: `1px solid ${active ? 'rgba(var(--theme-accent-rgb),0.20)' : `rgba(${tone.rgb},${Math.min(tone.borderA, 0.16)})`}`,
                    boxShadow: `0 10px 28px rgba(0,0,0,0.105), inset 0 1px 0 rgba(var(--glass-tint),0.060)`,
                  }}>


                  {/* Hover overlay */}
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/c:opacity-100" style={{ background: `rgba(${tone.rgb},0.035)` }} />

                  {/* 1. Logo + İsim + Badge */}
                  <div className="relative mb-2 flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
                      style={{
                        background: s.avatarUrl ? 'rgba(var(--glass-tint),0.035)' : `linear-gradient(135deg, rgba(${tone.rgb},0.18), rgba(var(--glass-tint),0.045))`,
                        border: '1px solid rgba(var(--glass-tint),0.08)',
                        boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.08)',
                      }}>
                      {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="h-9 w-9 rounded-[10px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} /> : null}
                      <span className={`text-[10px] font-black tracking-[0.08em] text-[var(--theme-accent)]/80 ${s.avatarUrl ? 'hidden' : ''}`}>{s.shortName}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-1.5">
                        <span className="min-w-0 truncate text-[12.5px] font-bold leading-5 text-[var(--theme-text)]">{s.name}</span>
                        <span
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                          style={{ background: 'rgba(var(--glass-tint),0.040)', color: pv.badgeText, border: '1px solid rgba(var(--glass-tint),0.065)' }}
                          title={`Plan: ${plan}`}
                        >
                          <PlanIcon size={10.5} strokeWidth={2.3} />
                        </span>
                      </div>
                      {s.motto && <div className="mt-0.5 truncate text-[9.5px] font-medium text-[var(--theme-secondary-text)]/58">{s.motto}</div>}
                    </div>
                  </div>

                  {/* 2. Açıklama */}
                  <div className="relative mb-2 min-h-[30px] text-[10.5px] leading-[1.45] text-[var(--theme-secondary-text)]/62 line-clamp-2">
                    {s.description || 'Henüz açıklama yok.'}
                  </div>

                  {/* 3. Meta + Aksiyon */}
                  <div className="relative flex items-end justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className="inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[9px] font-bold text-[var(--theme-secondary-text)]/66"
                        style={{ background: 'rgba(var(--glass-tint),0.045)', border: '1px solid rgba(var(--glass-tint),0.065)' }}>
                        <Users size={9.5} />
                        <span className="tabular-nums">{s.memberCount}</span>
                      </span>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                        style={{
                          background: isFrictionless(s) ? 'rgba(16,185,129,0.075)' : 'rgba(var(--theme-accent-rgb),0.075)',
                          border: isFrictionless(s) ? '1px solid rgba(16,185,129,0.13)' : '1px solid rgba(var(--theme-accent-rgb),0.13)',
                          color: isFrictionless(s) ? 'rgba(110,231,183,0.88)' : 'var(--theme-accent)',
                        }}
                        title={isFrictionless(s) ? 'Açık katılım' : 'Davetli sunucu'}>
                        {isFrictionless(s) ? <Globe2 size={9.5} /> : <LockKeyhole size={9.5} />}
                      </span>
                      {since && (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[8.5px] font-bold text-[var(--theme-secondary-text)]/48">
                          <CalendarDays size={9} />
                          {since}
                        </span>
                      )}
                    </div>
                    {member ? (
                      <span
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-emerald-300/80"
                        style={{ background: 'rgba(16,185,129,0.075)', border: '1px solid rgba(16,185,129,0.14)' }}
                        title="Üyesin"
                      >
                        <CheckCircle2 size={12} />
                      </span>
                    ) : s.myJoinRequestStatus === 'pending' ? (
                      <span className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[9px] font-bold"
                        style={{ background: 'rgba(var(--theme-accent-rgb),0.08)', color: 'var(--theme-accent)', border: '1px solid rgba(var(--theme-accent-rgb),0.15)' }}>
                        <Clock3 size={10} />
                        Bekliyor
                      </span>
                    ) : isFrictionless(s) ? (
                      <button onClick={() => handleJoin(s.id)} disabled={isJoining}
                        className="join-btn flex h-6 shrink-0 items-center rounded-full px-2.5 text-[9.5px] font-bold transition-[border-color,background-color,color,filter] duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                        style={{ background: 'rgba(var(--theme-accent-rgb),0.10)', border: '1px solid rgba(var(--theme-accent-rgb),0.18)', color: 'var(--theme-accent)' }}>
                        {isJoining ? <div className="w-2.5 h-2.5 border-[1.5px] border-current/30 border-t-current rounded-full animate-spin mr-1" /> : null}
                        {isJoining ? '...' : 'Katıl'}
                      </button>
                    ) : (
                      <button onClick={() => handleRequest(s.id)} disabled={isJoining}
                        className="flex h-6 shrink-0 items-center rounded-full px-2.5 text-[9.5px] font-bold transition-[border-color,background-color,color,filter] duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                        style={{ background: 'rgba(var(--glass-tint),0.045)', border: '1px solid rgba(var(--glass-tint),0.08)', color: 'var(--theme-text)' }}
                        title="Bu sunucuya başvuru gönder — yönetici onayı gerekir">
                        {isJoining ? <div className="w-2.5 h-2.5 border-[1.5px] border-current/30 border-t-current rounded-full animate-spin mr-1" /> : null}
                        {isJoining ? '...' : 'İstek'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Oluştur CTA — yalnız app-level yetkili + 0 sahip sunucu varsa */}
        {canCreate && (
          <div className="rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-all duration-150 hover:-translate-y-[1px] group"
            onClick={onCreateServer}
            style={{ background: 'rgba(var(--glass-tint), 0.035)', border: '1px solid rgba(var(--glass-tint), 0.07)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.14), rgba(var(--theme-accent-rgb), 0.06))' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--theme-accent)]">
                <rect x="3" y="3" width="18" height="18" rx="4" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-[var(--theme-text)] group-hover:text-[var(--theme-accent)] transition-colors">Kendi topluluğunu oluştur</div>
              <div className="text-[9px] text-[var(--theme-secondary-text)] opacity-35 mt-0.5">Sunucunu kur, arkadaşlarını davet et ve odalarını yönet.</div>
            </div>
            <div className="h-7 px-3.5 rounded-lg text-[10px] font-bold flex items-center shrink-0"
              style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)', border: '1px solid rgba(var(--theme-accent-rgb), 0.1)', color: 'var(--theme-accent)' }}>
              Sunucu Oluştur
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
          <div className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-[var(--theme-text)] pointer-events-auto"
            style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.92)', border: '1px solid rgba(var(--theme-accent-rgb), 0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(16px)' }}>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
