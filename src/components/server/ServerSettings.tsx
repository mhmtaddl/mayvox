import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Settings, Users, Mail, ShieldOff, Save, Trash2, Plus, Copy, UserX, Ban, Camera, Crown, Zap, Star, Search, MoreHorizontal, Shield, ChevronDown, Link2, ScrollText, Gauge } from 'lucide-react';
import {
  type Server, type ServerMember, type ServerInvite, type ServerBan, type SentInvite,
  getServerDetails, updateServer, getMembers, kickMember, changeRole, banMember,
  getInvites, createInvite, deleteInvite, getBans, unbanMember, deleteServer,
  sendServerInvite, getSentInvites, cancelSentInvite,
} from '../../lib/serverService';
import { uploadServerLogo, supabase } from '../../lib/supabase';
import AvatarCropModal from '../AvatarCropModal';
import { useChannel } from '../../contexts/ChannelContext';
import OverviewTab from './settings/OverviewTab';
import RolesTab from './settings/RolesTab';
import InviteLinksTab from './settings/InviteLinksTab';
import AuditTab from './settings/AuditTab';

type Tab = 'general' | 'overview' | 'members' | 'roles' | 'invites' | 'invite-links' | 'bans' | 'audit';

const ROLE_TR: Record<string, string> = { owner: 'Sahip', admin: 'Yönetici', mod: 'Moderatör', member: 'Üye' };
const ROLE_CLS: Record<string, string> = { owner: 'bg-amber-500/12 text-amber-400', admin: 'bg-blue-500/12 text-blue-400', mod: 'bg-purple-500/12 text-purple-400', member: 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]/45' };

function fmtDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'][d.getMonth()]} ${d.getFullYear()}`;
}

function displaySlug(slug: string): string {
  return slug.endsWith('.mv') ? slug : slug + '.mv';
}

function memberDisplayName(m: ServerMember): string {
  if (m.username) return m.username;
  const full = [m.firstName, m.lastName].filter(Boolean).join(' ');
  return full || 'Kullanıcı';
}

function memberInitials(m: ServerMember): string {
  if (m.firstName && m.lastName) return (m.firstName[0] + m.lastName[0]).toUpperCase();
  if (m.username) return m.username.slice(0, 2).toUpperCase();
  return '?';
}

// ══════════════════════════════════════
interface Props {
  serverId: string;
  onClose: () => void;
  onServerUpdated: () => void;
  onServerDeleted?: () => void;
}

export default function ServerSettings({ serverId, onClose, onServerUpdated, onServerDeleted }: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const { accessContext } = useChannel();
  // Aynı serverId ise accessContext'in flag'lerini kullan; farklı server settings açıldıysa
  // capability fallback server.role üzerinden (legacy baseRole).
  const sameServerCtx = accessContext && accessContext.serverId === serverId ? accessContext : null;

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); }, []);

  const loadServer = useCallback(async () => {
    try { setLoading(true); setServer(await getServerDetails(serverId)); }
    catch { showToast('Sunucu bilgileri yüklenemedi'); }
    finally { setLoading(false); }
  }, [serverId, showToast]);

  useEffect(() => { loadServer(); }, [loadServer]);

  if (loading || !server) return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin" />
    </div>
  );

  const canEdit = server.role === 'owner' || server.role === 'admin';
  const isOwner = server.role === 'owner';
  // Capability gates — aynı server context varsa flag, yoksa legacy role fallback
  const canManageServer = sameServerCtx?.flags.canManageServer ?? (server.role === 'owner' || server.role === 'admin');
  const canCreateInvite = sameServerCtx?.flags.canCreateInvite ?? (server.role === 'owner' || server.role === 'admin');
  const canRevokeInvite = sameServerCtx?.flags.canRevokeInvite ?? (server.role === 'owner' || server.role === 'admin' || server.role === 'mod');
  const canKickMembers = sameServerCtx?.flags.canKickMembers ?? (server.role === 'owner' || server.role === 'admin' || server.role === 'mod');

  // Tabs dinamik — capability'ye göre görünür
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'Genel', icon: <Settings size={13} /> },
    ...(canManageServer ? [{ id: 'overview' as Tab, label: 'Özet', icon: <Gauge size={13} /> }] : []),
    ...(canKickMembers ? [{ id: 'members' as Tab, label: 'Üyeler', icon: <Users size={13} /> }] : []),
    ...(canManageServer ? [{ id: 'roles' as Tab, label: 'Roller', icon: <Shield size={13} /> }] : []),
    ...(canCreateInvite || canRevokeInvite ? [{ id: 'invites' as Tab, label: 'Davetler', icon: <Mail size={13} /> }] : []),
    ...(canCreateInvite || canRevokeInvite ? [{ id: 'invite-links' as Tab, label: 'Linkler', icon: <Link2 size={13} /> }] : []),
    ...(canKickMembers ? [{ id: 'bans' as Tab, label: 'Yasaklar', icon: <ShieldOff size={13} /> }] : []),
    ...(canManageServer ? [{ id: 'audit' as Tab, label: 'Denetim', icon: <ScrollText size={13} /> }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="max-w-[95vw] max-h-[90vh] rounded-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}
        style={{ width: 'min(92vw, 860px)', background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)', border: '1px solid rgba(var(--glass-tint), 0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.65)' }}>
        {/* Header */}
        <div className="flex items-center gap-4 px-8 py-5 border-b border-[rgba(var(--glass-tint),0.06)]">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: server.avatarUrl ? 'none' : 'rgba(var(--theme-accent-rgb), 0.1)' }}>
            {server.avatarUrl ? <img src={server.avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover" /> : <span className="text-[15px] font-bold text-[var(--theme-accent)]">{server.shortName}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-bold text-[var(--theme-text)] truncate">{server.name}</h2>
            <span className="text-[11px] font-mono text-[var(--theme-secondary-text)]/55 tracking-wide">{displaySlug(server.slug)}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/30 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"><X size={17} /></button>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 px-8 py-2.5 border-b border-[rgba(var(--glass-tint),0.04)] overflow-x-auto custom-scrollbar">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all shrink-0 ${tab === t.id ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {tab === 'general' && <GeneralTab server={server} canEdit={canEdit} isOwner={isOwner}
            onSave={async u => { try { await updateServer(serverId, u); await loadServer(); onServerUpdated(); showToast('Kaydedildi'); } catch (e: any) { showToast(e.message); } }}
            onDelete={async () => { try { await deleteServer(serverId); onClose(); onServerDeleted?.(); } catch (e: any) { showToast(e.message); } }}
            showToast={showToast} />}
          {tab === 'overview' && canManageServer && <OverviewTab serverId={serverId} />}
          {tab === 'members' && canKickMembers && <MembersTab serverId={serverId} myRole={server.role ?? 'member'} showToast={showToast} />}
          {tab === 'roles' && canManageServer && <RolesTab serverId={serverId} />}
          {tab === 'invites' && (canCreateInvite || canRevokeInvite) && <InvitesTab serverId={serverId} showToast={showToast} />}
          {tab === 'invite-links' && (canCreateInvite || canRevokeInvite) && <InviteLinksTab serverId={serverId} canCreate={canCreateInvite} canRevoke={canRevokeInvite} />}
          {tab === 'bans' && canKickMembers && <BansTab serverId={serverId} showToast={showToast} />}
          {tab === 'audit' && canManageServer && <AuditTab serverId={serverId} />}
        </div>
        {toast && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-[11px] font-semibold text-[var(--theme-text)] z-50" style={{ background: 'rgba(var(--theme-accent-rgb), 0.15)', border: '1px solid rgba(var(--theme-accent-rgb), 0.2)', backdropFilter: 'blur(12px)' }}>{toast}</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// GENEL — 2 kolon kompakt
// ══════════════════════════════════════
function GeneralTab({ server, canEdit, isOwner, onSave, onDelete, showToast }: {
  server: Server; canEdit: boolean; isOwner: boolean;
  onSave: (u: Record<string, unknown>) => Promise<void>; onDelete: () => Promise<void>; showToast: (m: string) => void;
}) {
  const [name, setName] = useState(server.name);
  const [desc, setDesc] = useState(server.description);
  const [motto, setMotto] = useState(server.motto ?? '');
  const [isPublic, setIsPublic] = useState(server.isPublic ?? true);
  const [joinPolicy, setJoinPolicy] = useState(server.joinPolicy ?? 'invite_only');
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);

  // Otomatik slug — backend `generateBaseSlug` ile paralel: max 6 karakter, no hyphen.
  // Not: gerçek çakışma suffix'ini (1, 2, 3...) yalnız backend kararlaştırır; bu preview
  // sadece base'i gösterir.
  const autoSlug = name.trim().toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6);

  const dirty = name !== server.name || desc !== server.description || motto !== (server.motto ?? '') || isPublic !== (server.isPublic ?? true) || joinPolicy !== (server.joinPolicy ?? 'invite_only');

  const save = async () => {
    if (!dirty || saving) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 15) { showToast('Sunucu adı 3-15 karakter olmalı'); return; }
    setSaving(true);
    const u: Record<string, unknown> = {};
    if (trimmedName !== server.name) u.name = trimmedName;
    if (desc !== server.description) u.description = desc.trim();
    if (motto !== (server.motto ?? '')) u.motto = motto.trim();
    if (isPublic !== (server.isPublic ?? true)) u.isPublic = isPublic;
    if (joinPolicy !== (server.joinPolicy ?? 'invite_only')) u.joinPolicy = joinPolicy;
    await onSave(u); setSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* 2 kolon layout */}
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        {/* ── Sol: Kimlik + Erişim ── */}
        <div className="space-y-4">
          {/* Logo + Ad */}
          <div className="flex items-start gap-5">
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden cursor-pointer group shrink-0 mt-1"
              style={{ background: server.avatarUrl ? 'none' : 'rgba(var(--theme-accent-rgb), 0.08)', border: server.avatarUrl ? 'none' : '2px dashed rgba(var(--theme-accent-rgb), 0.1)' }}
              onClick={() => canEdit && logoRef.current?.click()}>
              {server.avatarUrl ? <img src={server.avatarUrl} alt="" className="w-14 h-14 object-cover" /> : <span className="flex items-center justify-center w-14 h-14 text-[18px] font-bold text-[var(--theme-accent)]/50">{server.shortName}</span>}
              {canEdit && <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">{logoLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={16} className="text-white" />}</div>}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ''; if (f.size > 5 * 1024 * 1024) { showToast('Maks 5 MB'); return; } const r = new FileReader(); r.onload = () => setCropSrc(r.result as string); r.readAsDataURL(f); }} />
            </div>
            <div className="flex-1 min-w-0 space-y-2.5">
              <Fld label="Sunucu Adı" off={!canEdit}><input value={name} onChange={e => setName(e.target.value)} maxLength={15} disabled={!canEdit} className={IC} /></Fld>
              {/* Otomatik adres — badge kart.
                  İsim değiştirilmediyse gerçek DB slug'ı (suffix dahil); değişmişse preview. */}
              {(() => {
                const nameChanged = name.trim() !== server.name;
                const realSlug = (server.slug || '').replace(/\.mv$/, '');
                const shown = nameChanged ? autoSlug : (realSlug || autoSlug);
                return (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl" style={{ background: 'rgba(var(--theme-accent-rgb), 0.04)', border: '1px solid rgba(var(--theme-accent-rgb), 0.08)' }}>
                    <span className="text-[8px] font-bold text-[var(--theme-secondary-text)]/30 uppercase tracking-widest shrink-0">Adres</span>
                    <span className="text-[12px] font-mono font-semibold text-[var(--theme-accent)]/70 flex-1 truncate">{shown || '...'}<span className="opacity-50">.mv</span>{nameChanged && <span className="opacity-40 ml-1">(önizleme)</span>}</span>
                    <button onClick={() => { navigator.clipboard.writeText((shown || '') + '.mv'); showToast('Adres kopyalandı'); }} className="text-[var(--theme-secondary-text)]/25 hover:text-[var(--theme-accent)] transition-colors shrink-0"><Copy size={11} /></button>
                  </div>
                );
              })()}
            </div>
          </div>

          <Fld label="Açıklama" off={!canEdit}><input value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} disabled={!canEdit} placeholder="Kısa açıklama" className={IC} /></Fld>
          <Fld label="Motto" off={!canEdit}><input value={motto} onChange={e => setMotto(e.target.value.slice(0, 15))} maxLength={15} disabled={!canEdit} placeholder="voice & chat" className={IC} /></Fld>

          {/* Erişim */}
          <div className="pt-1">
            <Sec title="Erişim">
              <div className="grid grid-cols-2 gap-4">
                <Fld label="Görünürlük" off={!canEdit}><div className="flex gap-2"><Pill a={isPublic} o={() => canEdit && setIsPublic(true)}>Açık</Pill><Pill a={!isPublic} o={() => canEdit && setIsPublic(false)}>Gizli</Pill></div></Fld>
                <Fld label="Katılım" off={!canEdit}><div className="flex gap-2"><Pill a={joinPolicy === 'invite_only'} o={() => canEdit && setJoinPolicy('invite_only')}>Davetli</Pill><Pill a={joinPolicy === 'open'} o={() => canEdit && setJoinPolicy('open')}>Açık</Pill></div></Fld>
              </div>
            </Sec>
          </div>
        </div>

        {/* ── Sağ: Davet + Bilgi + Premium ── */}
        <div className="space-y-4">
          {/* Davet kodu bölümü kaldırıldı — "Linkler" sekmesi altında Invite V2 var (tek kaynak). */}

          {/* Bilgiler */}
          <Sec title="Sunucu Bilgileri">
            <div className="grid grid-cols-3 gap-3">
              <IC2 label="Üyeler" value={String(server.memberCount)} accent />
              <IC2 label="Kapasite" value={String(server.capacity)} />
              <IC2 label="Kuruluş" value={fmtDate(server.createdAt)} small />
            </div>
          </Sec>

          {/* Sağ kolon spacer — premium kart aşağıya taşındı */}
        </div>
      </div>

      {/* ── Planlar — tam genişlik paket karşılaştırma ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Crown size={16} className="text-[var(--theme-accent)]" />
          <div>
            <div className="text-[13px] font-bold text-[var(--theme-text)]">Sunucuyu Yükselt</div>
            <div className="text-[10px] text-[var(--theme-text)] opacity-40">Sunucunun gücünü artır, daha fazla kullanıcı ve oda kapasitesine ulaş</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* FREE */}
          <div className="rounded-xl p-4 flex flex-col" style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
            <div className="text-[12px] font-bold text-[var(--theme-text)] mb-1">Free</div>
            <div className="text-[9px] text-[var(--theme-secondary-text)] opacity-40 mb-3">Varsayılan plan</div>
            <div className="space-y-2 flex-1">
              <PlanFeature text="4 sistem odası (20 kişi)" />
              <PlanFeature text="2 özel oda (10 kişi)" />
              <PlanFeature text="100 kullanıcı kapasitesi" />
              <PlanFeature text="Standart ses kalitesi" />
            </div>
            <button disabled className="w-full h-9 mt-4 rounded-lg text-[11px] font-semibold text-[var(--theme-secondary-text)]/40 cursor-default" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>Mevcut Plan</button>
          </div>

          {/* PRO */}
          <div className="rounded-xl p-4 flex flex-col relative" style={{ background: 'linear-gradient(160deg, rgba(var(--theme-accent-rgb), 0.08), rgba(var(--theme-accent-rgb), 0.03))', border: '1px solid rgba(var(--theme-accent-rgb), 0.15)', boxShadow: '0 0 24px rgba(var(--theme-accent-rgb), 0.06)' }}>
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[8px] font-bold tracking-wider uppercase" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}>En Popüler</span>
            <div className="text-[12px] font-bold text-[var(--theme-accent)] mb-0.5 mt-1">Pro</div>
            <div className="text-[9px] text-[var(--theme-accent)] opacity-60 mb-3">+140 kullanıcı kapasitesi</div>
            <div className="space-y-2 flex-1">
              <PlanFeature text="4 sistem odası (40 kişi)" accent />
              <PlanFeature text="4 özel oda (20 kişi)" accent />
              <PlanFeature text="240 kullanıcı kapasitesi" accent />
              <PlanFeature text="Yüksek ses kalitesi" accent />
              <PlanFeature text="Daha düşük gecikme" accent />
              <PlanFeature text="Pro rozeti" accent />
            </div>
            <button onClick={() => showToast('Pro plan yakında aktif olacak')}
              className="w-full h-9 mt-4 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)', boxShadow: '0 4px 12px rgba(var(--theme-accent-rgb), 0.25)' }}>
              <Zap size={12} /> Yükselt
            </button>
          </div>

          {/* ULTRA */}
          <div className="rounded-xl p-4 flex flex-col opacity-60" style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px dashed rgba(var(--glass-tint), 0.08)' }}>
            <div className="text-[12px] font-bold text-[var(--theme-text)] mb-1">Ultra</div>
            <div className="text-[9px] text-[var(--theme-secondary-text)] opacity-40 mb-3">Maksimum performans</div>
            <div className="space-y-2 flex-1">
              <PlanFeature text="Pro'nun tüm özellikleri ×2" />
              <PlanFeature text="En düşük gecikme" />
              <PlanFeature text="Öncelikli performans" />
              <PlanFeature text="Premium görünüm" />
            </div>
            <button disabled title="Yakında aktif olacak" className="w-full h-9 mt-4 rounded-lg text-[11px] font-semibold text-[var(--theme-secondary-text)]/30 cursor-not-allowed" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>Yakında</button>
          </div>
        </div>
      </div>

      {/* Kaydet */}
      {canEdit && dirty && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 h-9 px-5 rounded-lg text-[12px] font-semibold disabled:opacity-40 transition-all hover:opacity-90" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}>
            <Save size={13} /> {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      )}

      {/* Sunucuyu Sil */}
      {isOwner && (
        <div className="pt-3 border-t border-red-500/6">
          <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.08)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/8 flex items-center justify-center shrink-0"><ShieldOff size={14} className="text-red-400/50" /></div>
              <div><div className="text-[12px] font-semibold text-[var(--theme-text)]">Sunucuyu Sil</div><div className="text-[10px] text-red-400/30 mt-0.5">Bu işlem geri alınamaz, tüm veriler silinir</div></div>
            </div>
            <button onClick={() => setDeleteModal(true)} className="h-9 px-5 rounded-lg text-[11px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/25 border border-red-500/15 transition-colors shrink-0">Sil</button>
          </div>
        </div>
      )}

      {/* Silme onay modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteModal(false)}>
          <div className="w-[340px] rounded-2xl p-5" onClick={e => e.stopPropagation()} style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)', border: '1px solid rgba(239,68,68,0.12)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <h3 className="text-[13px] font-bold text-red-400 mb-1">Sunucuyu Sil</h3>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/45 mb-4"><strong className="text-[var(--theme-text)]">{server.name}</strong> ve tüm verileri kalıcı olarak silinecek.</p>
            <label className="block text-[9px] font-semibold text-[var(--theme-secondary-text)]/35 uppercase tracking-wider mb-1">Onay için sunucu adını yaz</label>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={server.name} className={IC + ' !border-red-500/15 mb-3'} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setDeleteModal(false); setDeleteConfirm(''); }} className="h-8 px-3 rounded-lg text-[10px] font-semibold text-[var(--theme-secondary-text)]" style={{ background: 'rgba(var(--glass-tint), 0.06)' }}>Vazgeç</button>
              <button onClick={async () => { setDeleting(true); await onDelete(); }} disabled={deleteConfirm !== server.name || deleting} className="h-8 px-3 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">{deleting ? 'Siliniyor...' : 'Kalıcı Olarak Sil'}</button>
            </div>
          </div>
        </div>
      )}

      {cropSrc && <AvatarCropModal imageSrc={cropSrc} onCancel={() => setCropSrc(null)} onConfirm={async blob => {
        setCropSrc(null); setLogoLoading(true);
        try { const url = await uploadServerLogo(server.id, new File([blob], 'logo.jpg', { type: 'image/jpeg' })); await onSave({ avatarUrl: url }); showToast('Logo güncellendi'); }
        catch { showToast('Logo yüklenemedi'); } finally { setLogoLoading(false); }
      }} />}
    </div>
  );
}

// ══════════════════════════════════════
// ÜYELER — yönetim paneli
// ══════════════════════════════════════
const ROLE_HIERARCHY: Record<string, number> = { owner: 4, admin: 3, mod: 2, member: 1 };
const ROLE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tümü' }, { value: 'owner', label: 'Sahip' }, { value: 'admin', label: 'Yönetici' }, { value: 'mod', label: 'Moderatör' }, { value: 'member', label: 'Üye' },
];

function MembersTab({ serverId, myRole, showToast }: { serverId: string; myRole: string; showToast: (m: string) => void }) {
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setMembers(await getMembers(serverId)); } catch { showToast('Üyeler yüklenemedi'); } finally { setLoading(false); }
  }, [serverId, showToast]);
  useEffect(() => { load(); }, [load]);

  // Dış tıklama ile menü kapat
  useEffect(() => {
    if (!actionMenuId) return;
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setActionMenuId(null); };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 30);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [actionMenuId]);

  const myLevel = ROLE_HIERARCHY[myRole] ?? 1;
  const canManage = myLevel >= 3; // admin+
  const isOwner = myRole === 'owner';

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); load(); showToast(msg); } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'İşlem başarısız'); } finally { setActionMenuId(null); }
  };

  // Filtreleme
  const q = searchQuery.toLowerCase().trim();
  const filtered = members.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (!q) return true;
    return memberDisplayName(m).toLowerCase().includes(q) || m.username?.toLowerCase().includes(q);
  });

  // Rol sıralaması
  const sorted = [...filtered].sort((a, b) => (ROLE_HIERARCHY[b.role] ?? 0) - (ROLE_HIERARCHY[a.role] ?? 0));

  if (loading) return <Loader />;

  return (
    <div className="space-y-4">
      {/* Üst bar: Arama + Filtre + Sayaç */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 h-10 rounded-xl px-3.5" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
          <Search size={13} className="text-[var(--theme-secondary-text)]/25 shrink-0" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Üye ara..." className="flex-1 bg-transparent text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/20 outline-none" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-[var(--theme-secondary-text)]/25 hover:text-[var(--theme-text)]"><X size={12} /></button>}
        </div>
        <div className="flex gap-1 shrink-0">
          {ROLE_FILTERS.map(rf => (
            <button key={rf.value} onClick={() => setRoleFilter(rf.value)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${roleFilter === rf.value ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/30 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`}>
              {rf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sayaç */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--theme-secondary-text)]/35">{sorted.length === members.length ? `${members.length} üye` : `${sorted.length} / ${members.length} üye`}</span>
      </div>

      {/* Liste */}
      {sorted.length === 0 ? (
        <Empty text={q ? 'Aramayla eşleşen üye yok' : 'Bu rolde üye bulunmuyor'} />
      ) : (
        <div className="space-y-1">
          {sorted.map(m => {
            const dn = memberDisplayName(m);
            const ini = memberInitials(m);
            const showMenu = actionMenuId === m.userId;
            const targetLevel = ROLE_HIERARCHY[m.role] ?? 1;
            const canActOn = canManage && m.role !== 'owner' && myLevel > targetLevel;

            return (
              <div key={m.userId} className="flex items-center gap-3.5 px-4 py-3 rounded-xl hover:bg-[rgba(var(--glass-tint),0.04)] transition-colors group">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'rgba(var(--glass-tint), 0.08)' }}>
                  {m.avatar ? (
                    <img src={m.avatar} alt="" className="w-9 h-9 rounded-[10px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                  ) : null}
                  <span className={`text-[10px] font-bold text-[var(--theme-secondary-text)]/50 ${m.avatar ? 'hidden' : ''}`}>{ini}</span>
                </div>

                {/* İsim + bilgi */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-[var(--theme-text)] truncate">{dn}</span>
                    {m.isMuted && <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/60">Susturulmuş</span>}
                  </div>
                  <div className="text-[10px] text-[var(--theme-secondary-text)]/30 mt-0.5">
                    {m.username && m.username !== dn ? <span className="mr-2">@{m.username}</span> : null}
                    <span>{fmtDate(m.joinedAt)}</span>
                  </div>
                </div>

                {/* Rol rozeti */}
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${ROLE_CLS[m.role] ?? ROLE_CLS.member}`}>
                  {m.role === 'owner' && <Crown size={10} className="inline mr-1 -mt-0.5" />}
                  {m.role === 'admin' && <Shield size={10} className="inline mr-1 -mt-0.5" />}
                  {ROLE_TR[m.role] ?? m.role}
                </span>

                {/* Aksiyon menüsü */}
                {canActOn ? (
                  <div className="relative" ref={showMenu ? menuRef : undefined}>
                    <button onClick={() => setActionMenuId(showMenu ? null : m.userId)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/20 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] opacity-0 group-hover:opacity-100 transition-all">
                      <MoreHorizontal size={14} />
                    </button>
                    {showMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1.5 z-50" style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)', border: '1px solid rgba(var(--glass-tint), 0.1)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}>
                        <div className="px-3 py-1.5 text-[8px] font-bold text-[var(--theme-secondary-text)]/25 uppercase tracking-widest">{dn}</div>
                        {isOwner && m.role !== 'admin' && <MBtn onClick={() => act(() => changeRole(serverId, m.userId, 'admin'), `${dn} yönetici yapıldı`)}>Yönetici Yap</MBtn>}
                        {isOwner && m.role !== 'mod' && <MBtn onClick={() => act(() => changeRole(serverId, m.userId, 'mod'), `${dn} moderatör yapıldı`)}>Moderatör Yap</MBtn>}
                        {isOwner && m.role !== 'member' && <MBtn onClick={() => act(() => changeRole(serverId, m.userId, 'member'), `${dn} üyeye düşürüldü`)}>Üyeye Düşür</MBtn>}
                        {isOwner && <div className="mx-2.5 my-1 h-px bg-[rgba(var(--glass-tint),0.06)]" />}
                        <MBtn onClick={() => act(() => kickMember(serverId, m.userId), `${dn} sunucudan çıkarıldı`)} danger>Sunucudan Çıkar</MBtn>
                        <MBtn onClick={() => act(() => banMember(serverId, m.userId, ''), `${dn} yasaklandı`)} danger>Yasakla</MBtn>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-7" /> /* Hizalama spacer */
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// DAVETLER — Kod + Kullanıcı
// ══════════════════════════════════════
function InvitesTab({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [mode, setMode] = useState<'code' | 'user'>('code');
  return (
    <div className="space-y-3">
      <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: 'rgba(var(--glass-tint), 0.03)' }}>
        <button onClick={() => setMode('code')} className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${mode === 'code' ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/30 hover:text-[var(--theme-text)]'}`}>Kod ile Davet</button>
        <button onClick={() => setMode('user')} className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${mode === 'user' ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/30 hover:text-[var(--theme-text)]'}`}>Kullanıcı Davet Et</button>
      </div>
      {mode === 'code' ? <CodeInvites serverId={serverId} showToast={showToast} /> : <UserInvites serverId={serverId} showToast={showToast} />}
    </div>
  );
}

function CodeInvites({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expHrs, setExpHrs] = useState('');

  const load = useCallback(async () => { try { setLoading(true); setInvites(await getInvites(serverId)); } catch { showToast('Yüklenemedi'); } finally { setLoading(false); } }, [serverId, showToast]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;
  return (
    <>
      <div className="p-3 rounded-lg" style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px solid rgba(var(--glass-tint), 0.05)' }}>
        <div className="flex gap-2 items-end">
          <div className="flex-1"><label className="text-[8px] text-[var(--theme-secondary-text)]/25 mb-0.5 block">Maks kullanım</label><input value={maxUses} onChange={e => setMaxUses(e.target.value.replace(/\D/g, ''))} placeholder="∞" className={IC + ' !text-[10px] !py-1.5'} /></div>
          <div className="flex-1"><label className="text-[8px] text-[var(--theme-secondary-text)]/25 mb-0.5 block">Süre (saat)</label><input value={expHrs} onChange={e => setExpHrs(e.target.value.replace(/\D/g, ''))} placeholder="∞" className={IC + ' !text-[10px] !py-1.5'} /></div>
          <button onClick={async () => { try { setCreating(true); await createInvite(serverId, maxUses ? parseInt(maxUses) : null, expHrs ? parseInt(expHrs) : null); setMaxUses(''); setExpHrs(''); load(); showToast('Oluşturuldu'); } catch (e: any) { showToast(e.message); } finally { setCreating(false); } }} disabled={creating} className="h-8 px-3 rounded text-[9px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-40" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}><Plus size={10} /> Oluştur</button>
        </div>
      </div>
      {invites.length === 0 ? <Empty text="Aktif davet kodu yok" /> : invites.map(inv => (
        <div key={inv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] group transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="text-[11px] font-mono font-bold text-[var(--theme-text)] tracking-wider">{inv.code}</span><button onClick={() => { navigator.clipboard.writeText(inv.code); showToast('Kopyalandı'); }} className="text-[var(--theme-accent)]/40 hover:text-[var(--theme-accent)]"><Copy size={9} /></button></div>
            <div className="text-[8px] text-[var(--theme-secondary-text)]/25">{inv.usedCount}{inv.maxUses ? `/${inv.maxUses}` : ''} · {inv.expiresAt ? fmtDate(inv.expiresAt) : 'Süresiz'}</div>
          </div>
          <button onClick={() => deleteInvite(serverId, inv.id).then(load).catch((e: Error) => showToast(e.message))} className="w-5 h-5 rounded flex items-center justify-center text-red-400/25 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={10} /></button>
        </div>
      ))}
    </>
  );
}

interface SearchedUser { id: string; name: string; first_name: string; last_name: string; avatar: string | null; }

function UserInvites({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const seqRef = useRef(0);

  // Mevcut üyeler + gönderilmiş davetler
  useEffect(() => {
    getMembers(serverId).then(m => setMemberIds(new Set(m.map(x => x.userId)))).catch(() => {});
    getSentInvites(serverId).then(inv => { setSentInvites(inv); setSentIds(new Set(inv.map(i => i.invitedUserId))); }).catch(() => {});
  }, [serverId]);

  // Debounced arama
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase.from('profiles').select('id, name, first_name, last_name, avatar').or(`name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`).order('name').limit(10);
        if (seq !== seqRef.current) return;
        setResults((data ?? []) as SearchedUser[]);
      } catch { if (seq === seqRef.current) setResults([]); }
      finally { if (seq === seqRef.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleInvite = async (userId: string) => {
    try { setInvitingId(userId); await sendServerInvite(serverId, userId); setSentIds(prev => new Set(prev).add(userId)); showToast('Davet gönderildi'); }
    catch (e: any) { showToast(e.message); } finally { setInvitingId(null); }
  };

  const filtered = results.filter(u => !memberIds.has(u.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 h-9 rounded-lg px-3" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
        <Search size={12} className="text-[var(--theme-secondary-text)]/20 shrink-0" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kullanıcı adı ile ara..." className="flex-1 bg-transparent text-[10px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/20 outline-none" />
        {loading && <div className="w-3 h-3 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin shrink-0" />}
      </div>

      {!query.trim() ? (
        sentInvites.length > 0 ? (
          <div>
            <div className="text-[8px] font-bold text-[var(--theme-secondary-text)]/25 uppercase tracking-wider mb-2">Bekleyen Davetler</div>
            {sentInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] group transition-colors">
                <div className="w-7 h-7 rounded-[8px] bg-[rgba(var(--glass-tint),0.08)] flex items-center justify-center shrink-0"><Mail size={11} className="text-[var(--theme-accent)]/40" /></div>
                <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{inv.invitedUserName}</div><div className="text-[8px] text-[var(--theme-secondary-text)]/25">{fmtDate(inv.createdAt)}</div></div>
                <span className="text-[8px] font-semibold text-amber-400/60 px-2 py-0.5 rounded-full bg-amber-500/8">Bekliyor</span>
                <button onClick={() => cancelSentInvite(serverId, inv.id).then(() => { setSentInvites(p => p.filter(i => i.id !== inv.id)); setSentIds(p => { const n = new Set(p); n.delete(inv.invitedUserId); return n; }); showToast('İptal edildi'); }).catch((e: Error) => showToast(e.message))}
                  className="w-5 h-5 rounded flex items-center justify-center text-red-400/25 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"><X size={10} /></button>
              </div>
            ))}
          </div>
        ) : <Empty text="Kullanıcı adı yazarak ara" sub="Davet gönder, kabul ederse sunucuna katılır" />
      ) : filtered.length === 0 && !loading ? <Empty text="Kullanıcı bulunamadı" /> : (
        <div className="space-y-0.5">
          {filtered.map(u => {
            const full = [u.first_name, u.last_name].filter(Boolean).join(' ');
            const alreadySent = sentIds.has(u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] transition-colors">
                <div className="w-7 h-7 rounded-[8px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'rgba(var(--glass-tint), 0.08)' }}>
                  {u.avatar ? <img src={u.avatar} alt="" className="w-7 h-7 rounded-[8px] object-cover" /> : <span className="text-[8px] font-bold text-[var(--theme-secondary-text)]/40">{(u.first_name || u.name || '?')[0].toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{u.name}</div>{full && <div className="text-[8px] text-[var(--theme-secondary-text)]/25 truncate">{full}</div>}</div>
                {alreadySent ? <span className="text-[8px] font-semibold text-amber-400/60 shrink-0">Gönderildi</span> : (
                  <button onClick={() => handleInvite(u.id)} disabled={invitingId === u.id} className="text-[8px] font-bold text-[var(--theme-accent)] px-2.5 py-1 rounded bg-[var(--theme-accent)]/8 hover:bg-[var(--theme-accent)]/15 transition-colors shrink-0 disabled:opacity-40">{invitingId === u.id ? '...' : 'Davet Et'}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// YASAKLAR
// ══════════════════════════════════════
function BansTab({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setLoading(true); setBans(await getBans(serverId)); } catch { showToast('Yüklenemedi'); } finally { setLoading(false); } }, [serverId, showToast]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <Loader />;
  return bans.length === 0 ? <Empty text="Yasaklı kullanıcı yok" /> : (
    <div className="space-y-0.5">{bans.map(b => (
      <div key={b.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(var(--glass-tint),0.04)] group transition-colors">
        <div className="w-7 h-7 rounded-[8px] bg-red-500/8 flex items-center justify-center shrink-0"><Ban size={11} className="text-red-400/40" /></div>
        <div className="flex-1 min-w-0"><div className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{b.userId.slice(0, 8)}</div><div className="text-[8px] text-[var(--theme-secondary-text)]/25">{b.reason || 'Neden belirtilmedi'} · {fmtDate(b.createdAt)}</div></div>
        <button onClick={() => unbanMember(serverId, b.userId).then(load).catch((e: Error) => showToast(e.message))} className="text-[8px] font-semibold px-2 py-0.5 rounded bg-emerald-500/8 text-emerald-400/60 hover:bg-emerald-500/15 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all">Kaldır</button>
      </div>
    ))}</div>
  );
}

// ══════════════════════════════════════
// YARDIMCILAR
// ══════════════════════════════════════
const IC = 'w-full bg-[rgba(var(--glass-tint),0.04)] border border-[rgba(var(--glass-tint),0.06)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/20 outline-none focus:border-[var(--theme-accent)]/20 transition-colors';
function Sec({ title, children }: { title: string; children: React.ReactNode }) { return <div><div className="text-[10px] font-bold text-[var(--theme-secondary-text)]/35 uppercase tracking-widest mb-3">{title}</div><div className="space-y-3">{children}</div></div>; }
function Fld({ label, children, off }: { label: string; children: React.ReactNode; off?: boolean }) { return <div className={off ? 'opacity-40 pointer-events-none' : ''}><label className="block text-[11px] font-semibold text-[var(--theme-secondary-text)]/45 mb-1.5">{label}</label>{children}</div>; }
function Pill({ a, o, children }: { a: boolean; o: () => void; children: React.ReactNode }) { return <button onClick={o} className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${a ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border border-[var(--theme-accent)]/15' : 'bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)]/30 border border-transparent hover:bg-[rgba(var(--glass-tint),0.06)]'}`}>{children}</button>; }
function IC2({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) { return <div className="p-3.5 rounded-xl text-center" style={{ background: 'rgba(var(--glass-tint), 0.03)', border: '1px solid rgba(var(--glass-tint), 0.04)' }}><div className={`${small ? 'text-[12px]' : 'text-[16px]'} font-bold ${accent ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]'}`}>{value}</div><div className="text-[9px] text-[var(--theme-secondary-text)]/30 mt-1 uppercase tracking-wider">{label}</div></div>; }
function Empty({ text, sub }: { text: string; sub?: string }) { return <div className="text-center py-8"><div className="text-[12px] text-[var(--theme-secondary-text)]/30">{text}</div>{sub && <div className="text-[10px] text-[var(--theme-secondary-text)]/20 mt-1.5">{sub}</div>}</div>; }
function Loader() { return <div className="flex items-center justify-center py-10"><div className="w-5 h-5 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin" /></div>; }
function MBtn({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) { return <button onClick={onClick} className={`w-full text-left px-3.5 py-2 text-[12px] font-medium transition-colors ${danger ? 'text-red-400/70 hover:text-red-400 hover:bg-red-500/8' : 'text-[var(--theme-text)]/70 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)]'}`}>{children}</button>; }
function PlanFeature({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 mt-0.5 ${accent ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/30'}`}><polyline points="20 6 9 17 4 12" /></svg>
      <span className={`text-[11px] leading-tight ${accent ? 'text-[var(--theme-text)] opacity-75' : 'text-[var(--theme-text)] opacity-50'}`}>{text}</span>
    </div>
  );
}
