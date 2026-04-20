import React, { useCallback, useEffect, useState } from 'react';
import { Search, X, Crown, Shield, ChevronDown, UserX, Ban } from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import { useUser } from '../../../contexts/UserContext';
import {
  type ServerMember,
  getMembers, kickMember, changeRole, banMember,
} from '../../../lib/serverService';
import { ROLE_TR, ROLE_CLS, fmtDate, memberDisplayName, Empty, Loader } from './shared';

// Rol hiyerarşisi — aksiyon yetkisi için (yukarıdakiler aşağıdakilere aksiyon yapabilir)
const ROLE_HIERARCHY: Record<string, number> = { owner: 4, admin: 3, mod: 2, member: 1 };

const ROLE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'owner', label: 'Sahip' },
  { value: 'admin', label: 'Yönetici' },
  { value: 'mod', label: 'Moderatör' },
  { value: 'member', label: 'Üye' },
];

interface Props {
  serverId: string;
  myRole: string;
  showToast: (m: string) => void;
}

// ══════════════════════════════════════
// ÜYELER — yönetim paneli
// ══════════════════════════════════════
export default function MembersTab({ serverId, myRole, showToast }: Props) {
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  // Realtime presence haritası — admin/member DTO'larının statusText'i yok,
  // allUsers'tan live değeri çekip AvatarContent pipeline'ına veriyoruz.
  // Bulunmayan kullanıcılar için default 'Online' — pipeline initial yerine
  // online.png'ye düşer (user spec'i: PNG default, initial sadece son çare).
  const { allUsers } = useUser();
  const resolveStatus = (userId: string): string => {
    const u = allUsers.find(au => au.id === userId);
    return u?.statusText || 'Online';
  };

  const load = useCallback(async () => {
    try { setLoading(true); setMembers(await getMembers(serverId)); } catch { showToast('Üyeler yüklenemedi'); } finally { setLoading(false); }
  }, [serverId, showToast]);
  useEffect(() => { load(); }, [load]);

  const myLevel = ROLE_HIERARCHY[myRole] ?? 1;
  const canManage = myLevel >= 3; // admin+
  const isOwner = myRole === 'owner';

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); load(); showToast(msg); } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'İşlem başarısız'); }
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
            const targetLevel = ROLE_HIERARCHY[m.role] ?? 1;
            const canActOn = canManage && m.role !== 'owner' && myLevel > targetLevel;

            return (
              <div key={m.userId} className="flex items-center gap-3.5 px-4 py-3 rounded-xl hover:bg-[rgba(var(--glass-tint),0.04)] transition-colors group">
                {/* Avatar — shared pipeline: custom → status PNG → initial */}
                <div className="w-9 h-9 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'rgba(var(--glass-tint), 0.08)' }}>
                  <AvatarContent
                    avatar={m.avatar}
                    statusText={resolveStatus(m.userId)}
                    firstName={m.firstName}
                    name={dn}
                    letterClassName="text-[10px] font-bold text-[var(--theme-secondary-text)]/50"
                  />
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

                {/* Aksiyon ikonları — varsayılan görünür, hover'da güçlenir */}
                {canActOn ? (
                  <div className="flex items-center gap-0.5 shrink-0 opacity-65 group-hover:opacity-100 transition-opacity">
                    {isOwner && m.role !== 'admin' && (
                      <button onClick={() => act(() => changeRole(serverId, m.userId, 'admin'), `${dn} yönetici yapıldı`)}
                        title="Yönetici Yap"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-400/60 hover:text-amber-400 hover:bg-amber-400/10 transition-colors">
                        <Crown size={13} />
                      </button>
                    )}
                    {isOwner && m.role !== 'mod' && m.role !== 'member' && (
                      <button onClick={() => act(() => changeRole(serverId, m.userId, 'member'), `${dn} üyeye düşürüldü`)}
                        title="Üyeye Düşür"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.08)] transition-colors">
                        <ChevronDown size={13} />
                      </button>
                    )}
                    {isOwner && m.role !== 'mod' && m.role === 'member' && (
                      <button onClick={() => act(() => changeRole(serverId, m.userId, 'mod'), `${dn} moderatör yapıldı`)}
                        title="Moderatör Yap"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sky-400/60 hover:text-sky-400 hover:bg-sky-400/10 transition-colors">
                        <Shield size={13} />
                      </button>
                    )}
                    <button onClick={() => act(() => kickMember(serverId, m.userId), `${dn} sunucudan çıkarıldı`)}
                      title="Sunucudan Çıkar"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-orange-400/60 hover:text-orange-400 hover:bg-orange-400/10 transition-colors">
                      <UserX size={13} />
                    </button>
                    <button onClick={() => act(() => banMember(serverId, m.userId, ''), `${dn} yasaklandı`)}
                      title="Yasakla"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <Ban size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="w-7" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
