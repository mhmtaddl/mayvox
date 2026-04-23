import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Mail, Search, Plus, Copy, Trash2,
  Link2, UserCheck, Check, Infinity as InfinityIcon,
} from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import {
  type ServerInvite, type SentInvite,
  getInvites, createInvite, deleteInvite,
  getMembers, sendServerInvite, getSentInvites, cancelSentInvite,
} from '../../../lib/serverService';
import { supabase } from '../../../lib/supabase';
import { fmtDate, Empty, Loader } from './shared';
import JoinRequestsTab from './JoinRequestsTab';

export type InvitesSubTab = 'links' | 'sent' | 'requests';

interface Props {
  serverId: string;
  showToast: (m: string) => void;
  /** Başvurular sub-tab yetkisi — sadece canManageServer (admin+) görür */
  canManageServer: boolean;
  /** Başvurular chip + parent tab badge için */
  pendingRequestCount: number;
  /** Lifted state — sub-tab ServerSettings'te tutulur */
  mode: InvitesSubTab;
  onModeChange: (m: InvitesSubTab) => void;
}

// ══════════════════════════════════════════════════════════
// InvitesTab — 3 sub-section: Davet Linkleri / Gönderilen / Başvurular
// ══════════════════════════════════════════════════════════
export default function InvitesTab({
  serverId, showToast, canManageServer, pendingRequestCount, mode, onModeChange,
}: Props) {
  // Guard: mode='requests' ama canManageServer=false → 'links'e düş
  const effectiveMode: InvitesSubTab =
    mode === 'requests' && !canManageServer ? 'links' : mode;

  // Parent state'i de senkronla — mod değişirse parent bilir
  useEffect(() => {
    if (mode === 'requests' && !canManageServer) onModeChange('links');
  }, [mode, canManageServer, onModeChange]);

  return (
    <div className="space-y-4 pb-4">
      <SubNav
        mode={effectiveMode}
        onChange={onModeChange}
        showRequests={canManageServer}
        pendingCount={pendingRequestCount}
      />

      {effectiveMode === 'links' && <CodeInvites serverId={serverId} showToast={showToast} />}
      {effectiveMode === 'sent' && <UserInvites serverId={serverId} showToast={showToast} />}
      {effectiveMode === 'requests' && canManageServer && (
        <JoinRequestsTab serverId={serverId} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Sub-navigation — 3 segmented pill
// ══════════════════════════════════════════════════════════

interface SubNavOption {
  value: InvitesSubTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

function SubNav({
  mode, onChange, showRequests, pendingCount,
}: {
  mode: InvitesSubTab;
  onChange: (m: InvitesSubTab) => void;
  showRequests: boolean;
  pendingCount: number;
}) {
  const options: SubNavOption[] = [
    { value: 'links', label: 'Davet Linkleri', icon: <Link2 size={13} strokeWidth={1.8} /> },
    { value: 'sent', label: 'Gönderilen', icon: <Mail size={13} strokeWidth={1.8} /> },
    ...(showRequests ? [{
      value: 'requests' as InvitesSubTab,
      label: 'Başvurular',
      icon: <UserCheck size={13} strokeWidth={1.8} />,
      badge: pendingCount,
    }] : []),
  ];

  return (
    <div
      className="inline-flex p-1 rounded-xl w-full gap-0.5"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
      }}
    >
      {options.map(opt => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 h-9 px-3 rounded-lg text-[11.5px] font-semibold transition-all duration-200 ease-out inline-flex items-center justify-center gap-1.5 ${
              active
                ? 'text-[#e8ecf4]'
                : 'text-[#7b8ba8]/55 hover:text-[#e8ecf4]/85'
            }`}
            style={active ? {
              background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.14), ' +
                '0 1px 2px rgba(0,0,0,0.08), ' +
                '0 2px 6px rgba(0,0,0,0.04)',
            } : undefined}
          >
            <span className={active ? 'text-[var(--theme-accent)]' : ''}>{opt.icon}</span>
            <span className="truncate">{opt.label}</span>
            {typeof opt.badge === 'number' && opt.badge > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold shrink-0"
                style={{
                  background: 'var(--theme-accent)',
                  color: '#0a0f1e',
                  boxShadow: '0 0 6px rgba(var(--theme-accent-rgb),0.45)',
                }}
              >
                {opt.badge > 99 ? '99+' : opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// 1) Davet Linkleri (kod ile)
// ══════════════════════════════════════════════════════════

function CodeInvites({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expHrs, setExpHrs] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setInvites(await getInvites(serverId)); }
    catch { showToast('Davetler yüklenemedi'); }
    finally { setLoading(false); }
  }, [serverId, showToast]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createInvite(
        serverId,
        maxUses ? parseInt(maxUses, 10) : null,
        expHrs ? parseInt(expHrs, 10) : null,
      );
      setMaxUses(''); setExpHrs('');
      await load();
      showToast('Davet kodu oluşturuldu');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteInvite(serverId, id);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast('Kopyalandı');
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-3">
      {/* Create form */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.06), rgba(var(--theme-accent-rgb),0.02))',
          border: '1px solid rgba(var(--theme-accent-rgb),0.18)',
          boxShadow: 'inset 0 1px 0 rgba(var(--theme-accent-rgb),0.08)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(var(--theme-accent-rgb),0.14)', border: '1px solid rgba(var(--theme-accent-rgb),0.22)' }}
          >
            <Plus size={13} className="text-[var(--theme-accent)]" strokeWidth={2} />
          </div>
          <span className="text-[11.5px] font-bold text-[#e8ecf4] tracking-tight">Yeni Davet Kodu</span>
          <span className="ml-auto text-[10px] text-[#7b8ba8]/55">Boş bırakılanlar sınırsız</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <InviteField
            label="Maks. kullanım"
            value={maxUses}
            onChange={v => setMaxUses(v.replace(/\D/g, ''))}
            placeholder="∞"
          />
          <InviteField
            label="Süre (saat)"
            value={expHrs}
            onChange={v => setExpHrs(v.replace(/\D/g, ''))}
            placeholder="∞"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="h-10 px-5 rounded-xl text-[12px] font-semibold text-white inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] hover:brightness-[1.08] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 self-end"
            style={{
              // Tema accent — düz renk + inset highlight/shadow ile depth, tema değişimine uyumlu.
              background: 'var(--theme-accent)',
              color: 'var(--theme-text-on-accent, #fff)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.22), ' +
                'inset 0 -1px 0 rgba(0,0,0,0.10), ' +
                '0 1px 2px rgba(0,0,0,0.10), ' +
                '0 6px 18px rgba(var(--theme-accent-rgb), 0.30)',
            }}
          >
            {creating
              ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <Plus size={13} strokeWidth={2.2} />}
            Oluştur
          </button>
        </div>
      </div>

      {/* List */}
      {invites.length === 0 ? (
        <Empty text="Aktif davet kodu yok" sub="Yukarıdan yeni bir kod oluştur" />
      ) : (
        <ul className="space-y-1.5">
          {invites.map(inv => (
            <CodeInviteRow
              key={inv.id}
              invite={inv}
              onCopy={() => handleCopy(inv.code)}
              onDelete={() => handleDelete(inv.id)}
              busy={deletingId === inv.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-[9.5px] font-semibold uppercase tracking-[0.10em] text-[#7b8ba8]/55 mb-1.5">
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 bg-[rgba(255,255,255,0.035)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3.5 text-[12.5px] text-[#e8ecf4] placeholder:text-[#7b8ba8]/30 outline-none transition-all duration-200 ease-out hover:border-[rgba(255,255,255,0.14)] focus:border-[var(--theme-accent)]/45 focus:bg-[rgba(255,255,255,0.055)] focus:shadow-[0_0_0_4px_rgba(var(--theme-accent-rgb),0.10)]"
      />
    </div>
  );
}

function CodeInviteRow({
  invite, onCopy, onDelete, busy,
}: { invite: ServerInvite; onCopy: () => void; onDelete: () => void; busy: boolean; key?: React.Key }) {
  const usage = invite.maxUses
    ? `${invite.usedCount}/${invite.maxUses}`
    : `${invite.usedCount}`;
  const expiryText = invite.expiresAt ? fmtDate(invite.expiresAt) : null;

  return (
    <li
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors duration-150 group"
      style={{
        background: busy ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: 'rgba(var(--theme-accent-rgb),0.10)', border: '1px solid rgba(var(--theme-accent-rgb),0.18)' }}
      >
        <Link2 size={14} className="text-[var(--theme-accent)]/80" strokeWidth={1.8} />
      </div>

      {/* Code + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[12.5px] font-mono font-bold text-[#e8ecf4] tracking-wider select-all"
            title={invite.code}
          >
            {invite.code}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="text-[var(--theme-accent)]/60 hover:text-[var(--theme-accent)] transition-colors shrink-0 active:scale-[0.92]"
            aria-label="Kodu kopyala"
          >
            <Copy size={11} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#7b8ba8]/55">
          <span className="inline-flex items-center gap-1">
            {!invite.maxUses && <InfinityIcon size={10} className="opacity-60" />}
            Kullanım: <span className="text-[#e8ecf4]/70 font-semibold">{usage}</span>
          </span>
          <span className="text-[#7b8ba8]/30">·</span>
          <span>
            {expiryText ? <>Biter: <span className="text-[#e8ecf4]/70 font-semibold">{expiryText}</span></> : 'Süresiz'}
          </span>
        </div>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 active:scale-[0.94] opacity-70 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Daveti sil"
      >
        {busy
          ? <div className="w-3.5 h-3.5 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
          : <Trash2 size={13} />}
      </button>
    </li>
  );
}

// ══════════════════════════════════════════════════════════
// 2) Gönderilen Davetler (uygulama-içi, kullanıcıya direkt)
// ══════════════════════════════════════════════════════════

interface SearchedUser {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  avatar: string | null;
}

function UserInvites({ serverId, showToast }: { serverId: string; showToast: (m: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const seqRef = useRef(0);

  // İlk yüklemede üye listesi + gönderilmiş davetler
  useEffect(() => {
    void getMembers(serverId)
      .then(m => setMemberIds(new Set(m.map(x => x.userId))))
      .catch(() => {});
    void getSentInvites(serverId)
      .then(inv => {
        setSentInvites(inv);
        setSentIds(new Set(inv.map(i => i.invitedUserId)));
      })
      .catch(() => {});
  }, [serverId]);

  // Debounced arama
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, first_name, last_name, avatar')
          .or(`name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
          .order('name')
          .limit(10);
        if (seq !== seqRef.current) return;
        setResults((data ?? []) as SearchedUser[]);
      } catch {
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleInvite = async (userId: string) => {
    setInvitingId(userId);
    try {
      await sendServerInvite(serverId, userId);
      setSentIds(prev => new Set(prev).add(userId));
      // Gönderilen davetler listesini de yenile
      void getSentInvites(serverId).then(setSentInvites).catch(() => {});
      showToast('Davet gönderildi');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setInvitingId(null);
    }
  };

  const handleCancel = async (inviteId: string, invitedUserId: string) => {
    setCancelingId(inviteId);
    try {
      await cancelSentInvite(serverId, inviteId);
      setSentInvites(p => p.filter(i => i.id !== inviteId));
      setSentIds(p => {
        const n = new Set(p);
        n.delete(invitedUserId);
        return n;
      });
      showToast('Davet iptal edildi');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'İptal edilemedi');
    } finally {
      setCancelingId(null);
    }
  };

  // Zaten üye olmuş kullanıcıları arama sonuçlarından çıkar
  const filtered = results.filter(u => !memberIds.has(u.id));
  const trimmedQuery = query.trim();

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div
        className="flex items-center gap-2 h-10 rounded-xl px-3.5"
        style={{
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <Search size={13} className="text-[#7b8ba8]/45 shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Kullanıcı adı ile ara..."
          className="flex-1 bg-transparent text-[12px] text-[#e8ecf4] placeholder:text-[#7b8ba8]/40 outline-none"
        />
        {searching && (
          <div className="w-3.5 h-3.5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin shrink-0" />
        )}
        {query && !searching && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-[#7b8ba8]/45 hover:text-[#e8ecf4] transition-colors"
            aria-label="Aramayı temizle"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Content states */}
      {!trimmedQuery ? (
        // Query yok → bekleyen davetler listesi
        sentInvites.length === 0 ? (
          <Empty
            text="Henüz davet göndermedin"
            sub="Kullanıcı adı yazarak ara, kabul ederse sunucuna katılır"
          />
        ) : (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#7b8ba8]/60 mb-2">
              Bekleyen Davetler ({sentInvites.length})
            </div>
            <ul className="space-y-1.5">
              {sentInvites.map(inv => (
                <SentInviteRow
                  key={inv.id}
                  invite={inv}
                  busy={cancelingId === inv.id}
                  onCancel={() => handleCancel(inv.id, inv.invitedUserId)}
                />
              ))}
            </ul>
          </div>
        )
      ) : filtered.length === 0 && !searching ? (
        <Empty text="Kullanıcı bulunamadı" sub={`"${trimmedQuery}" için sonuç yok`} />
      ) : (
        <ul className="space-y-1">
          {filtered.map(u => (
            <SearchResultRow
              key={u.id}
              user={u}
              sent={sentIds.has(u.id)}
              inviting={invitingId === u.id}
              onInvite={() => handleInvite(u.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SentInviteRow({
  invite, busy, onCancel,
}: { invite: SentInvite; busy: boolean; onCancel: () => void; key?: React.Key }) {
  return (
    <li
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors duration-150 group"
      style={{
        background: busy ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.16)' }}
      >
        <Mail size={13} className="text-amber-400/80" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[#e8ecf4] truncate">{invite.invitedUserName}</div>
        <div className="text-[10px] text-[#7b8ba8]/55 mt-0.5">{fmtDate(invite.createdAt)}</div>
      </div>
      <span
        className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
        style={{
          background: 'rgba(251,191,36,0.12)',
          color: '#fbbf24',
          border: '1px solid rgba(251,191,36,0.22)',
        }}
      >
        Bekliyor
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 active:scale-[0.94] opacity-70 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Daveti iptal et"
      >
        {busy
          ? <div className="w-3.5 h-3.5 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
          : <X size={13} />}
      </button>
    </li>
  );
}

function SearchResultRow({
  user, sent, inviting, onInvite,
}: {
  user: SearchedUser;
  sent: boolean;
  inviting: boolean;
  onInvite: () => void;
  key?: React.Key;
}) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.035)] transition-colors duration-150">
      <div
        className="w-9 h-9 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <AvatarContent
          avatar={user.avatar}
          statusText="Online"
          firstName={user.first_name}
          name={user.name}
          letterClassName="text-[10px] font-bold text-[#7b8ba8]/60"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[#e8ecf4] truncate">{user.name}</div>
        {fullName && (
          <div className="text-[10px] text-[#7b8ba8]/55 truncate mt-0.5">{fullName}</div>
        )}
      </div>
      {sent ? (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
          style={{
            background: 'rgba(251,191,36,0.12)',
            color: '#fbbf24',
            border: '1px solid rgba(251,191,36,0.22)',
          }}
        >
          <Check size={10} strokeWidth={3} /> Gönderildi
        </span>
      ) : (
        <button
          type="button"
          onClick={onInvite}
          disabled={inviting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[10.5px] font-semibold shrink-0 transition-all duration-150 active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'rgba(var(--theme-accent-rgb),0.12)',
            color: 'var(--theme-accent)',
            border: '1px solid rgba(var(--theme-accent-rgb),0.22)',
          }}
        >
          {inviting
            ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <Plus size={11} strokeWidth={2.2} />}
          {inviting ? '...' : 'Davet Et'}
        </button>
      )}
    </li>
  );
}
