import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Settings, Users, Mail, ShieldOff, Crown, Shield, ScrollText, Gauge, Gavel, ShieldCheck, Save, RotateCcw } from 'lucide-react';
import type { AutoModActions } from './settings/AutoModerationTab';
import {
  type Server, type ServerOverview,
  getServerDetails, updateServer, deleteServer, leaveServer,
  countPendingJoinRequests, getServerOverview,
} from '../../lib/serverService';
import { useChannel } from '../../contexts/ChannelContext';
import OverviewTab from './settings/OverviewTab';
import RolesTab from './settings/RolesTab';
import AuditTab from './settings/AuditTab';
import GeneralTab from './settings/GeneralTab';
import MembersTab from './settings/MembersTab';
import InvitesTab, { type InvitesSubTab } from './settings/InvitesTab';
import ModerationTab from './settings/ModerationTab';
import AutoModerationTab from './settings/AutoModerationTab';
import { displaySlug } from './settings/shared';

type Tab = 'general' | 'overview' | 'members' | 'roles' | 'invites' | 'moderation' | 'automod' | 'audit';
// Legacy initialTab input:
//   'bans'     → 'moderation' tab
//   'requests' → 'invites' tab + Başvurular sub-section
type TabInput = Tab | 'bans' | 'requests';

interface ResolvedInitial {
  tab: Tab;
  invitesSubTab?: InvitesSubTab;
}

function resolveInitial(t: TabInput | undefined): ResolvedInitial {
  if (!t) return { tab: 'overview' };
  if (t === 'bans') return { tab: 'moderation' };
  if (t === 'requests') return { tab: 'invites', invitesSubTab: 'requests' };
  return { tab: t };
}

// Identity strip'te plan/limit göstergesi — sadece bu dosyada kullanılıyor
function HeaderPill({ icon, value, limit, label }: { icon: React.ReactNode; value: number; limit: number; label: string }) {
  const p = limit > 0 ? Math.min(100, (value / limit) * 100) : 0;
  const tone = p >= 90 ? 'text-red-400 bg-red-500/10 border-red-500/25'
    : p >= 75 ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
    : 'text-[var(--theme-text)]/85 bg-[rgba(var(--glass-tint),0.06)] border-[rgba(var(--glass-tint),0.10)]';
  return (
    <span title={label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-bold tabular-nums border ${tone}`}>
      <span className="opacity-70">{icon}</span>
      {value.toLocaleString('tr-TR')}<span className="opacity-50">/{limit.toLocaleString('tr-TR')}</span>
    </span>
  );
}

// ══════════════════════════════════════
interface Props {
  serverId: string;
  onClose: () => void;
  onServerUpdated: () => void;
  onServerDeleted?: () => void;
  /** Legacy değerler: 'bans' → moderation, 'requests' → invites/Başvurular */
  initialTab?: TabInput;
}

export default function ServerSettings({ serverId, onClose, onServerUpdated, onServerDeleted, initialTab }: Props) {
  const initial = resolveInitial(initialTab);
  const [tab, setTab] = useState<Tab>(initial.tab);
  // Lifted sub-tab state: InvitesTab kullanıcı sekme değiştirip dönünce seçimi korusun.
  const [invitesMode, setInvitesMode] = useState<InvitesSubTab>(initial.invitesSubTab ?? 'links');
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const { accessContext } = useChannel();
  // Aynı serverId ise accessContext'in flag'lerini kullan; farklı server settings açıldıysa
  // capability fallback server.role üzerinden (legacy baseRole).
  const sameServerCtx = accessContext && accessContext.serverId === serverId ? accessContext : null;

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); }, []);

  // AutoMod tab — dirty/saving state + action handler'ları: butonları tab bar sağında göster.
  const [automodState, setAutomodState] = useState<{ dirty: boolean; saving: boolean }>({ dirty: false, saving: false });
  const automodActionsRef = useRef<AutoModActions | null>(null);
  // Tab AutoMod'dan çıkınca ref'i temizle — stale handler çağrılmasın.
  useEffect(() => {
    if (tab !== 'automod') {
      automodActionsRef.current = null;
      setAutomodState({ dirty: false, saving: false });
    }
  }, [tab]);

  const loadServer = useCallback(async () => {
    try { setLoading(true); setServer(await getServerDetails(serverId)); }
    catch { showToast('Sunucu bilgileri yüklenemedi'); }
    finally { setLoading(false); }
  }, [serverId, showToast]);

  useEffect(() => { loadServer(); }, [loadServer]);

  // Overview verisi — header strip ve OverviewTab paylaşımlı kullanır.
  const [overview, setOverview] = useState<ServerOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ov = await getServerOverview(serverId);
        if (!cancelled) setOverview(ov);
      } catch { /* sessizce geç — header stats sadece dolmaz */ }
    })();
    return () => { cancelled = true; };
  }, [serverId]);

  // Capability (server yüklenmeden geçici false — hook sırası sabit kalsın diye koşulsuz tanımlı)
  const role = server?.role;
  const canManageServerEarly = sameServerCtx?.flags.canManageServer ?? (role === 'owner' || role === 'admin');

  // Tab guard: 'overview' yetkisi yoksa 'general'a düş.
  useEffect(() => {
    if (!loading && tab === 'overview' && !canManageServerEarly) setTab('general');
  }, [loading, tab, canManageServerEarly]);

  // Pending join requests count — rozet için (erken return'ten ÖNCE, hook sırası stabil)
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  useEffect(() => {
    if (!canManageServerEarly) { setPendingRequestCount(0); return; }
    let cancelled = false;
    const tick = () => {
      countPendingJoinRequests(serverId)
        .then(c => { if (!cancelled) setPendingRequestCount(c); })
        .catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [serverId, canManageServerEarly]);

  if (loading || !server) return (
    <div className="flex-1 flex items-center justify-center min-h-0">
      <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin" />
    </div>
  );

  const canEdit = server.role === 'owner' || server.role === 'admin';
  const isOwner = server.role === 'owner';
  // Capability gates — aynı server context varsa flag, yoksa legacy role fallback
  const canManageServer = canManageServerEarly;
  const canCreateInvite = sameServerCtx?.flags.canCreateInvite ?? (server.role === 'owner' || server.role === 'admin');
  const canRevokeInvite = sameServerCtx?.flags.canRevokeInvite ?? (server.role === 'owner' || server.role === 'admin' || server.role === 'mod');
  const canKickMembers = sameServerCtx?.flags.canKickMembers ?? (server.role === 'owner' || server.role === 'admin' || server.role === 'mod');

  // Tabs dinamik — capability'ye göre görünür
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    ...(canManageServer ? [{ id: 'overview' as Tab, label: 'Özet', icon: <Gauge size={13} /> }] : []),
    { id: 'general', label: 'Genel', icon: <Settings size={13} /> },
    ...(canKickMembers ? [{ id: 'members' as Tab, label: 'Üyeler', icon: <Users size={13} /> }] : []),
    ...(canManageServer ? [{ id: 'roles' as Tab, label: 'Roller', icon: <Shield size={13} /> }] : []),
    ...(canCreateInvite || canRevokeInvite ? [{
      id: 'invites' as Tab,
      label: 'Davetler',
      icon: <Mail size={13} />,
      // Admin için pending başvuru sayısı rozet olarak Davetler tab'ında görünür
      badge: (canManageServer && pendingRequestCount > 0) ? pendingRequestCount : undefined,
    }] : []),
    ...(canKickMembers ? [{ id: 'moderation' as Tab, label: 'Moderasyon', icon: <Gavel size={13} /> }] : []),
    ...(canKickMembers ? [{ id: 'automod' as Tab, label: 'Oto-Mod', icon: <ShieldCheck size={13} /> }] : []),
    ...(canManageServer ? [{ id: 'audit' as Tab, label: 'Denetim', icon: <ScrollText size={13} /> }] : []),
  ];

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* ── Identity Strip — compact premium header ── */}
        <div
          className="relative px-6 md:px-8 py-4 border-b border-[rgba(var(--glass-tint),0.06)]"
          style={{ background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb), 0.04), transparent 80%)' }}
        >
          <div className="flex items-center gap-3 md:gap-4">
            {/* Avatar */}
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: server.avatarUrl ? 'transparent' : 'rgba(var(--theme-accent-rgb), 0.10)', border: '1px solid rgba(var(--glass-tint), 0.10)' }}>
              {server.avatarUrl ? <img src={server.avatarUrl} alt="" className="w-11 h-11 object-cover" /> : <span className="text-[15px] font-bold text-[var(--theme-accent)]">{server.shortName}</span>}
            </div>

            {/* Name + slug */}
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] md:text-[16px] font-bold text-[var(--theme-text)] truncate tracking-tight leading-none">{server.name}</h2>
              <span className="text-[11px] font-mono text-[var(--theme-secondary-text)]/55 tracking-wide block mt-1 truncate">{displaySlug(server.slug)}</span>
            </div>

            {/* Inline pill stats */}
            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              {(() => {
                const p = server.plan === 'pro' || server.plan === 'ultra' ? server.plan : 'free';
                const cls = p === 'pro'
                  ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                  : p === 'ultra'
                  ? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.10em] border ${cls}`}>
                    <Crown size={10} /> {p}
                  </span>
                );
              })()}
              {overview && (
                <>
                  <HeaderPill icon={<Users size={10} />} value={overview.counts.members} limit={overview.limits.maxMembers} label="Üyeler" />
                  <HeaderPill icon={<Settings size={10} />} value={overview.counts.channels} limit={overview.limits.maxTotalRooms} label="Odalar" />
                </>
              )}
            </div>

            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors shrink-0"
              aria-label="Kapat"
            ><X size={17} /></button>
          </div>

          {/* Mobile pills (under header) */}
          {overview && (
            <div className="md:hidden flex items-center gap-1.5 mt-3">
              {(() => {
                const p = server.plan === 'pro' || server.plan === 'ultra' ? server.plan : 'free';
                const cls = p === 'pro' ? 'bg-sky-500/15 text-sky-400' : p === 'ultra' ? 'bg-violet-500/15 text-violet-400' : 'bg-emerald-500/15 text-emerald-400';
                return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}><Crown size={9} /> {p}</span>;
              })()}
              <HeaderPill icon={<Users size={10} />} value={overview.counts.members} limit={overview.limits.maxMembers} label="Üyeler" />
              <HeaderPill icon={<Settings size={10} />} value={overview.counts.channels} limit={overview.limits.maxTotalRooms} label="Odalar" />
            </div>
          )}
        </div>

        {/* Restricted modunda tab navigasyonu render edilmez — settings tek kilitli panel olur. */}
        {!server.isBanned && (
          <div className="flex items-center gap-0.5 px-4 md:px-6 py-2 border-b border-[rgba(var(--glass-tint),0.04)] overflow-x-auto custom-scrollbar"
            style={{ background: 'rgba(var(--glass-tint), 0.015)' }}
          >
            {tabs.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all shrink-0 ${
                    active
                      ? 'text-[var(--theme-text)]'
                      : 'text-[var(--theme-secondary-text)]/55 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.05)]'
                  }`}
                >
                  <span className={`transition-colors ${active ? 'text-[var(--theme-accent)]' : ''}`}>{t.icon}</span>
                  {t.label}
                  {!!t.badge && t.badge > 0 && (
                    <span className="ml-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center bg-[var(--theme-accent)] text-[var(--theme-text-on-accent,#000)] shadow-[0_0_6px_rgba(var(--theme-accent-rgb),0.45)]">
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  )}
                  {active && (
                    <span className="absolute left-3 right-3 -bottom-[9px] h-[2px] bg-[var(--theme-accent)] rounded-full shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.45)]" />
                  )}
                </button>
              );
            })}
            {/* Tab-bar sağı: aktif tab'a özgü action pill'leri (şu an sadece Oto-Mod Kaydet/Sıfırla) */}
            {tab === 'automod' && canKickMembers && (
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => automodActionsRef.current?.onReset()}
                  disabled={!automodState.dirty || automodState.saving}
                  title="Değişiklikleri sıfırla"
                  aria-label="Değişiklikleri sıfırla"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/80 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => automodActionsRef.current?.onSave()}
                  disabled={!automodState.dirty || automodState.saving}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11.5px] font-bold transition-all disabled:opacity-40 disabled:pointer-events-none"
                  style={{
                    background: 'var(--theme-accent)',
                    color: 'var(--theme-text-on-accent, #000)',
                    boxShadow: automodState.dirty ? '0 2px 10px rgba(var(--theme-accent-rgb),0.28)' : 'none',
                  }}
                >
                  <Save size={12} /> {automodState.saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            )}
          </div>
        )}
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {server.isBanned ? (
            <RestrictedSettingsPanel server={server} />
          ) : (<>
          {tab === 'general' && <GeneralTab server={server} canEdit={canEdit} isOwner={isOwner}
            onSave={async u => { try { await updateServer(serverId, u); await loadServer(); onServerUpdated(); showToast('Kaydedildi'); } catch (e: any) { showToast(e.message); } }}
            onDelete={async () => { try { await deleteServer(serverId); onClose(); onServerDeleted?.(); } catch (e: any) { showToast(e.message); } }}
            onLeave={async () => { try { await leaveServer(serverId); onClose(); onServerDeleted?.(); } catch (e: any) { showToast(e.message); } }}
            showToast={showToast} />}
          {tab === 'overview' && canManageServer && <OverviewTab serverId={serverId} server={server} isOwner={isOwner} initialOverview={overview} onSwitchTab={(t) => setTab(t)} />}
          {tab === 'members' && canKickMembers && <MembersTab serverId={serverId} myRole={server.role ?? 'member'} showToast={showToast} />}
          {tab === 'roles' && canManageServer && <RolesTab serverId={serverId} />}
          {tab === 'invites' && (canCreateInvite || canRevokeInvite) && (
            <InvitesTab
              serverId={serverId}
              showToast={showToast}
              canManageServer={canManageServer}
              pendingRequestCount={pendingRequestCount}
              mode={invitesMode}
              onModeChange={setInvitesMode}
            />
          )}
          {tab === 'moderation' && canKickMembers && <ModerationTab serverId={serverId} showToast={showToast} />}
          {tab === 'automod' && canKickMembers && (
            <AutoModerationTab
              serverId={serverId}
              showToast={showToast}
              onStateChange={setAutomodState}
              actionsRef={automodActionsRef}
            />
          )}
          {tab === 'audit' && canManageServer && <AuditTab serverId={serverId} />}
          </>)}
        </div>
        {toast && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-[11px] font-semibold text-[var(--theme-text)] z-[100] pointer-events-none" style={{ background: 'rgba(var(--theme-accent-rgb), 0.15)', border: '1px solid rgba(var(--theme-accent-rgb), 0.2)', backdropFilter: 'blur(12px)' }}>{toast}</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// Restricted-mode locked panel — owner sadece bu ekranı görür
// ══════════════════════════════════════
function RestrictedSettingsPanel({ server }: { server: Server }) {
  const dateText = server.bannedAt
    ? new Date(server.bannedAt).toLocaleString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div className="max-w-[640px] mx-auto py-4">
      <div className="relative overflow-hidden rounded-2xl p-6"
        style={{
          background: 'linear-gradient(160deg, rgba(251,146,60,0.10), rgba(251,146,60,0.04))',
          border: '1px solid rgba(251,146,60,0.30)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.20)',
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
            <ShieldOff size={22} className="text-orange-400" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-block px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 mb-1.5">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-orange-400">Sistem Kısıtlaması Aktif</span>
            </div>
            <h3 className="text-[16px] md:text-[17px] font-bold text-[var(--theme-text)] tracking-tight leading-tight">
              {server.name} kısıtlama altında
            </h3>
            {dateText && (
              <div className="text-[10.5px] text-[var(--theme-secondary-text)]/65 mt-1 font-mono">{dateText}</div>
            )}
          </div>
        </div>

        {/* Owner-visible reason */}
        {server.bannedReason ? (
          <div className="mt-5 p-4 rounded-xl bg-[rgba(0,0,0,0.22)] border border-orange-500/20">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-orange-400/85 mb-1.5">Sistem Yönetimi Açıklaması</div>
            <p className="text-[12.5px] text-[var(--theme-text)] leading-relaxed whitespace-pre-wrap">{server.bannedReason}</p>
          </div>
        ) : (
          <div className="mt-5 p-4 rounded-xl bg-[rgba(0,0,0,0.18)] border border-orange-500/15">
            <p className="text-[11.5px] text-[var(--theme-secondary-text)] italic">Açıklama girilmemiş.</p>
          </div>
        )}

        {/* Disabled list */}
        <div className="mt-5">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--theme-secondary-text)]/85 mb-2">Bu süreçte devre dışı</div>
          <ul className="space-y-1.5">
            <DisabledItem>Odalara giriş ve sesli kanal bağlantıları</DisabledItem>
            <DisabledItem>Sunucu ayarları ve düzenleme kontrolleri</DisabledItem>
            <DisabledItem>Davet, üye yönetimi, rol ve kanal düzenlemeleri</DisabledItem>
            <DisabledItem>Denetim kayıtları ve başvuru yönetimi</DisabledItem>
          </ul>
        </div>

        <p className="mt-5 text-[11px] text-[var(--theme-secondary-text)]/70 leading-relaxed">
          Sunucu görünür kalmaya devam eder. Kısıtlama kaldırıldığında tüm sunucu ayarları ve özellikler yeniden erişilebilir olur. Ek bilgi için sistem yönetimi ile iletişime geçebilirsin.
        </p>
      </div>
    </div>
  );
}

function DisabledItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-[11.5px] text-[var(--theme-text)]/85">
      <span className="w-4 h-4 rounded-full bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
        <X size={9} className="text-orange-400" strokeWidth={2.5} />
      </span>
      {children}
    </li>
  );
}
