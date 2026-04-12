import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Users, Hash } from 'lucide-react';
import { searchServers, joinServer, type DiscoverServer } from '../../lib/serverService';
import { getPlanVisual } from '../../lib/planStyles';

const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
function fmtSince(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// 9 mock sunucu — discover ekranı dolu görünsün
const MOCK_SERVERS: (DiscoverServer & { plan?: string })[] = [
  { id: 'm1', name: 'Gece Tayfa', shortName: 'GT', description: 'Gece gezmelerinin adresi', motto: 'Uyumak yasak', memberCount: 87, capacity: 100, createdAt: '2025-11-01', plan: 'free' },
  { id: 'm2', name: 'Kod Atölyesi', shortName: 'KA', description: 'Yazılım ve teknoloji sohbetleri', motto: 'Build & Ship', memberCount: 156, capacity: 240, createdAt: '2025-08-15', plan: 'pro' },
  { id: 'm3', name: 'Müzik Evi', shortName: 'ME', description: 'Canlı müzik dinle, paylaş', memberCount: 64, capacity: 100, createdAt: '2026-01-20', plan: 'free' },
  { id: 'm4', name: 'Oyun Dünyası', shortName: 'OD', description: 'Valorant, CS2, LoL takım bul', motto: 'GG WP', memberCount: 203, capacity: 240, createdAt: '2025-06-10', plan: 'pro' },
  { id: 'm5', name: 'Sanat Köşesi', shortName: 'SK', description: 'Dijital sanat ve tasarım', memberCount: 42, capacity: 100, createdAt: '2026-02-01', plan: 'free' },
  { id: 'm6', name: 'Spor Kulübü', shortName: 'SP', description: 'Maç izle, skor takip et', memberCount: 91, capacity: 100, createdAt: '2025-09-05', plan: 'ultra' },
  { id: 'm7', name: 'Film Severler', shortName: 'FS', description: 'Film ve dizi önerileri', motto: 'Lights Camera', memberCount: 38, capacity: 100, createdAt: '2026-03-12', plan: 'free' },
  { id: 'm8', name: 'Girişimciler', shortName: 'GR', description: 'Startup ve iş fikirleri', memberCount: 127, capacity: 240, createdAt: '2025-07-22', plan: 'pro' },
  { id: 'm9', name: 'Podcast Hub', shortName: 'PH', description: 'Podcast kayıt ve yayın', memberCount: 55, capacity: 100, createdAt: '2026-01-08', plan: 'free' },
];

interface Props {
  /** serverId — katılım sonrası veya mevcut üye olunan sunucuya geçiş için parent'a iletilir. */
  onJoinSuccess: (serverId: string) => void;
  onCreateServer: () => void;
  onJoinModal: () => void;
  activeServerId?: string;
}

export default function DiscoverPanel({ onJoinSuccess, onCreateServer, onJoinModal, activeServerId }: Props) {
  const [query, setQuery] = useState('');
  const [apiServers, setApiServers] = useState<DiscoverServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const seqRef = useRef(0);

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

  // Gerçek sunucular + mock (gerçek yoksa mock göster)
  const servers = query.trim()
    ? apiServers
    : apiServers.length > 0
      ? [...apiServers, ...MOCK_SERVERS.filter(m => !apiServers.some(a => a.id === m.id))].slice(0, 9)
      : MOCK_SERVERS;

  const handleJoin = async (serverId: string) => {
    if (serverId.startsWith('m')) { showToast('Bu bir örnek sunucudur'); return; }
    try {
      setJoining(serverId);
      await joinServer(serverId);
      showToast('Sunucuya katıldın');
      // Parent artık bu serverId'yi active yapıp discover'ı kapatır → odaya direkt gider.
      onJoinSuccess(serverId);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Katılınamadı');
    } finally { setJoining(null); }
  };

  // Zaten üye olunan sunucu kartına tıklayınca sunucuya geç (aksiyon butonu değil kart üstü).
  const handleCardClick = (s: DiscoverServer) => {
    if (isMock(s)) { showToast('Bu bir örnek sunucudur'); return; }
    if (!isMember(s)) return;
    onJoinSuccess(s.id);
  };

  const isMember = (s: DiscoverServer) => !!s.role;
  const isActive = (s: DiscoverServer) => s.id === activeServerId;
  const isMock = (s: DiscoverServer) => s.id.startsWith('m');

  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-4 py-5 lg:px-8 lg:py-6">
      <div className="max-w-[860px] mx-auto w-full space-y-4">

        {/* Hero */}
        <div>
          <h1 className="text-[18px] font-bold text-[var(--theme-text)] tracking-tight">Topluluklara Katıl</h1>
          <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-45 mt-1">Açık sunucuları keşfet, anında katıl veya kendi topluluğunu oluştur.</p>
        </div>

        {/* Search + Davet kodu */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 h-10 rounded-lg px-3" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}>
            <Search size={14} className="text-[var(--theme-secondary-text)] opacity-35 shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Sunucu adı veya adres ara"
              className="flex-1 bg-transparent text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/20 outline-none" />
            {loading && query.trim() && <div className="w-3 h-3 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin shrink-0" />}
          </div>
          <button onClick={onJoinModal} className="h-10 px-4 rounded-lg flex items-center gap-1.5 text-[10px] font-semibold shrink-0 hover:bg-[rgba(var(--glass-tint),0.08)] transition-colors"
            style={{ background: 'rgba(var(--glass-tint), 0.05)', border: '1px solid rgba(var(--glass-tint), 0.08)', color: 'var(--theme-text)' }}>
            <Hash size={12} className="text-[var(--theme-accent)] opacity-60" /> Davet Kodu ile Katıl
          </button>
        </div>

        {/* Başlık */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-[var(--theme-secondary-text)] opacity-25 uppercase tracking-widest">
            {query.trim() ? 'Eşleşen Sunucular' : 'Popüler Sunucular'}
          </span>
          <span className="text-[9px] text-[var(--theme-secondary-text)] opacity-20">{servers.length} sunucu</span>
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
          <div className="grid grid-cols-3 gap-2.5">
            {servers.map(s => {
              const member = isMember(s);
              const active = isActive(s);
              const isJoining = joining === s.id;
              const plan = (s as DiscoverServer & { plan?: string }).plan ?? 'free';
              const pv = getPlanVisual(plan);
              const isUltra = plan === 'ultra';
              const clickable = member || active;
              return (
                <div key={s.id}
                  onClick={clickable ? () => handleCardClick(s) : undefined}
                  className={`group/c relative rounded-xl p-4 transition-all duration-200 hover:-translate-y-[2px] ${active ? 'ring-1 ring-[var(--theme-accent)]/12' : ''} ${isUltra ? 'ultra-card' : ''} ${clickable ? 'cursor-pointer' : ''}`}
                  style={{ background: active ? 'rgba(var(--theme-accent-rgb), 0.025)' : pv.bg, border: `1px solid ${active ? 'rgba(var(--theme-accent-rgb), 0.1)' : pv.border}` }}>


                  {/* Hover overlay */}
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover/c:opacity-100 transition-opacity duration-200 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(var(--glass-tint), 0.03), transparent)' }} />

                  {/* 1. Logo + İsim + Badge */}
                  <div className="relative flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                      style={{ background: s.avatarUrl ? 'none' : 'rgba(var(--theme-accent-rgb), 0.08)' }}>
                      {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-10 h-10 rounded-lg object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} /> : null}
                      <span className={`text-[11px] font-bold text-[var(--theme-accent)] opacity-70 ${s.avatarUrl ? 'hidden' : ''}`}>{s.shortName}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{s.name}</span>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0"
                          style={{ background: pv.badgeBg, color: pv.badgeText, boxShadow: pv.badgeShadow }}>{plan}</span>
                      </div>
                      {s.motto && <div className="text-[10px] text-[var(--theme-secondary-text)] opacity-50 truncate mt-0.5">"{s.motto}"</div>}
                    </div>
                  </div>

                  {/* 2. Açıklama */}
                  <div className="relative text-[11px] text-[var(--theme-secondary-text)] opacity-40 leading-relaxed line-clamp-2 mb-3 min-h-[32px]">
                    {s.description || 'Henüz açıklama yok.'}
                  </div>

                  {/* 3. Meta + Aksiyon */}
                  <div className="relative flex items-center justify-between">
                    <span className="text-[10px] text-[var(--theme-secondary-text)] opacity-30">{s.memberCount} üye</span>
                    {active ? (
                      <span className="text-[9px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)', color: 'var(--theme-accent)' }}>Açık</span>
                    ) : member ? (
                      <span className="text-[9px] font-semibold px-2.5 py-0.5 rounded-full bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]/35">Üyesin</span>
                    ) : (
                      <button onClick={() => handleJoin(s.id)} disabled={isJoining}
                        className="join-btn h-7 px-3.5 rounded-lg text-[11px] font-medium flex items-center transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
                        style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.12)', color: 'var(--theme-text)' }}>
                        {isJoining ? <div className="w-2.5 h-2.5 border-[1.5px] border-current/30 border-t-current rounded-full animate-spin mr-1" /> : null}
                        {isJoining ? '...' : 'Katıl'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Oluştur CTA */}
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
