import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, X, Crown, Shield, ShieldCheck, User as UserIcon,
  MoreHorizontal, MicOff, Clock, UserMinus, UserX, Ban,
  ChevronRight, DoorOpen,
} from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import { useUser } from '../../../contexts/UserContext';
import {
  type ServerMember,
  getMembers, kickMember, changeRole, banMember,
} from '../../../lib/serverService';
import {
  type ServerRole, ROLE_HIERARCHY, canActOn, canSetRole,
} from '../../../lib/permissionBundles';
import { fmtDate, memberDisplayName, Empty, Loader } from './shared';
import ActionMenu, { type ActionItem } from './ActionMenu';
import RolePicker from './RolePicker';
import ConfirmModal, { type ConfirmVariant } from './ConfirmModal';

interface Props {
  serverId: string;
  myRole: string;
  showToast: (m: string) => void;
}

const ROLE_FILTERS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'owner', label: 'Sahip' },
  { value: 'admin', label: 'Yönetici' },
  { value: 'mod', label: 'Moderatör' },
  { value: 'member', label: 'Üye' },
];

const ROLE_LABEL: Record<ServerRole, string> = {
  owner: 'Sahip', admin: 'Yönetici', mod: 'Moderatör', member: 'Üye',
};

const ROLE_CHIP: Record<ServerRole, { icon: React.ReactNode; bg: string; color: string; border: string }> = {
  owner: { icon: <Crown size={10} />, bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
  admin: { icon: <Shield size={10} />, bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  mod: { icon: <ShieldCheck size={10} />, bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: 'rgba(167,139,250,0.25)' },
  member: { icon: <UserIcon size={10} />, bg: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'rgba(255,255,255,0.08)' },
};

// ══════════════════════════════════════════════════════════
// MembersTab — premium üye yönetimi (kebab + role picker + modals)
// ══════════════════════════════════════════════════════════
export default function MembersTab({ serverId, myRole, showToast }: Props) {
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const { allUsers } = useUser();
  const resolveStatus = (userId: string): string => {
    const u = allUsers.find(au => au.id === userId);
    return u?.statusText || 'Online';
  };

  const load = useCallback(async () => {
    try { setLoading(true); setMembers(await getMembers(serverId)); }
    catch { showToast('Üyeler yüklenemedi'); }
    finally { setLoading(false); }
  }, [serverId, showToast]);
  useEffect(() => { load(); }, [load]);

  // ─── popover + modal state ───
  const [actionMenu, setActionMenu] = useState<{ member: ServerMember; rect: DOMRect } | null>(null);
  const [rolePicker, setRolePicker] = useState<{ member: ServerMember; rect: DOMRect } | null>(null);
  const [confirm, setConfirm] = useState<{ variant: ConfirmVariant; member: ServerMember } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const myRoleTyped: ServerRole = (ROLE_HIERARCHY[myRole as ServerRole] != null)
    ? (myRole as ServerRole)
    : 'member';

  const act = async (fn: () => Promise<unknown>, okMsg: string, userId: string) => {
    setBusyId(userId);
    try { await fn(); await load(); showToast(okMsg); }
    catch (e: unknown) { showToast(e instanceof Error ? e.message : 'İşlem başarısız'); }
    finally { setBusyId(null); }
  };

  const handleRoleChange = (member: ServerMember, nextRole: ServerRole) => {
    if (member.role === nextRole) { setRolePicker(null); return; }
    const dn = memberDisplayName(member);
    setRolePicker(null);
    void act(
      () => changeRole(serverId, member.userId, nextRole),
      `${dn} → ${ROLE_LABEL[nextRole]}`,
      member.userId,
    );
  };

  const handleKick = (member: ServerMember, reason: string) => {
    const dn = memberDisplayName(member);
    // kickMember reason parametresi almıyor; şimdilik çağrıyı olduğu gibi tut.
    // reason audit log için gelecekte backend'e eklenebilir.
    void reason;
    setConfirm(null);
    void act(() => kickMember(serverId, member.userId), `${dn} sunucudan çıkarıldı`, member.userId);
  };

  const handleBan = (member: ServerMember, reason: string) => {
    const dn = memberDisplayName(member);
    setConfirm(null);
    void act(() => banMember(serverId, member.userId, reason), `${dn} yasaklandı`, member.userId);
  };

  // ─── Filtre + sıralama ───
  const q = searchQuery.toLowerCase().trim();
  const filtered = members.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (!q) return true;
    return memberDisplayName(m).toLowerCase().includes(q) || m.username?.toLowerCase().includes(q);
  });
  const sorted = [...filtered].sort((a, b) => {
    const ra = ROLE_HIERARCHY[a.role as ServerRole] ?? 0;
    const rb = ROLE_HIERARCHY[b.role as ServerRole] ?? 0;
    return rb - ra;
  });

  if (loading) return <Loader />;

  return (
    <div className="space-y-4 pb-4">
      {/* Üst bar: arama + filtre */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="flex-1 min-w-[200px] flex items-center gap-2 h-10 rounded-xl px-3.5 transition-colors duration-200"
          style={{
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <Search size={13} className="text-[#7b8ba8]/45 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Üye ara..."
            className="flex-1 bg-transparent text-[12px] text-[#e8ecf4] placeholder:text-[#7b8ba8]/40 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-[#7b8ba8]/45 hover:text-[#e8ecf4] transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {ROLE_FILTERS.map(rf => {
            const active = roleFilter === rf.value;
            return (
              <button
                key={rf.value}
                onClick={() => setRoleFilter(rf.value)}
                className={`h-8 px-3 rounded-lg text-[10.5px] font-semibold transition-all duration-150 ${
                  active
                    ? 'text-[#60a5fa]'
                    : 'text-[#7b8ba8]/55 hover:text-[#e8ecf4] hover:bg-[rgba(255,255,255,0.04)]'
                }`}
                style={active ? {
                  background: 'rgba(59,130,246,0.12)',
                  boxShadow: 'inset 0 1px 0 rgba(59,130,246,0.08)',
                } : undefined}
              >
                {rf.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sayaç */}
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-[#7b8ba8]/55 font-medium">
          {sorted.length === members.length
            ? `${members.length} üye`
            : `${sorted.length} / ${members.length} üye`}
        </span>
      </div>

      {/* Liste */}
      {sorted.length === 0 ? (
        <Empty text={q ? 'Aramayla eşleşen üye yok' : 'Bu rolde üye bulunmuyor'} />
      ) : (
        <div className="space-y-1">
          {sorted.map(m => (
            <MemberRow
              key={m.userId}
              member={m}
              myRole={myRoleTyped}
              statusText={resolveStatus(m.userId)}
              busy={busyId === m.userId}
              onOpenKebab={(rect) => setActionMenu({ member: m, rect })}
              onOpenRolePicker={(rect) => setRolePicker({ member: m, rect })}
            />
          ))}
        </div>
      )}

      {/* ─── Portals ─── */}
      {actionMenu && (() => {
        const m = actionMenu.member;
        const dn = memberDisplayName(m);
        const targetRole = m.role as ServerRole;
        const canAct = canActOn(myRoleTyped, targetRole);
        const canRole = canAct && (myRoleTyped === 'owner' || myRoleTyped === 'admin');
        const canKick = canAct && ROLE_HIERARCHY[myRoleTyped] >= 2; // mod+
        const canBan = canAct && ROLE_HIERARCHY[myRoleTyped] >= 3; // admin+
        const canModerate = canAct && ROLE_HIERARCHY[myRoleTyped] >= 2; // mod+

        const items: ActionItem[] = [
          {
            id: 'role',
            label: 'Rolü Değiştir...',
            icon: <ChevronRight size={13} />,
            disabled: !canRole,
            onClick: () => {
              // Kebab anchor rect'ini role picker'a geçir
              setRolePicker({ member: m, rect: actionMenu.rect });
            },
          },
          {
            id: 'voice_mute',
            label: 'Sesini Sustur',
            icon: <MicOff size={13} />,
            onClick: () => {},
            pending: true,
            disabled: !canModerate,
            separatorBefore: true,
          },
          {
            id: 'timeout',
            label: 'Zaman Aşımı Ver',
            icon: <Clock size={13} />,
            onClick: () => {},
            pending: true,
            disabled: !canModerate,
          },
          {
            id: 'room_kick',
            label: 'Odadan Çıkar',
            icon: <DoorOpen size={13} />,
            onClick: () => {},
            pending: true,
            disabled: !canModerate,
          },
          {
            id: 'kick',
            label: 'Sunucudan At',
            icon: <UserX size={13} />,
            tone: 'warn',
            disabled: !canKick,
            separatorBefore: true,
            onClick: () => setConfirm({ variant: 'kick', member: m }),
          },
          {
            id: 'ban',
            label: 'Yasakla...',
            icon: <Ban size={13} />,
            tone: 'danger',
            disabled: !canBan,
            onClick: () => setConfirm({ variant: 'ban', member: m }),
          },
        ];

        void dn; // dn kullanılmıyor — action menu sadece m ile geçiyor
        return (
          <ActionMenu
            items={items}
            anchorRect={actionMenu.rect}
            onClose={() => setActionMenu(null)}
          />
        );
      })()}

      {rolePicker && (
        <RolePicker
          currentRole={rolePicker.member.role as ServerRole}
          actorRole={myRoleTyped}
          anchorRect={rolePicker.rect}
          busy={busyId === rolePicker.member.userId}
          onClose={() => setRolePicker(null)}
          onSelect={role => handleRoleChange(rolePicker.member, role)}
        />
      )}

      {confirm && (
        <ConfirmModal
          variant={confirm.variant}
          targetName={memberDisplayName(confirm.member)}
          open={true}
          busy={busyId === confirm.member.userId}
          onCancel={() => setConfirm(null)}
          onConfirm={reason => {
            if (confirm.variant === 'kick') handleKick(confirm.member, reason);
            else handleBan(confirm.member, reason);
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Member row — avatar + isim + mute badge + role chip + kebab
// ══════════════════════════════════════════════════════════
interface MemberRowProps {
  member: ServerMember;
  myRole: ServerRole;
  statusText: string;
  busy: boolean;
  onOpenKebab: (rect: DOMRect) => void;
  onOpenRolePicker: (rect: DOMRect) => void;
  key?: React.Key;
}

function MemberRow({ member, myRole, statusText, busy, onOpenKebab, onOpenRolePicker }: MemberRowProps) {
  const dn = memberDisplayName(member);
  const targetRole = member.role as ServerRole;
  const chip = ROLE_CHIP[targetRole] ?? ROLE_CHIP.member;
  const canChangeRole =
    canActOn(myRole, targetRole) &&
    (canSetRole(myRole, 'mod') || canSetRole(myRole, 'member') || canSetRole(myRole, 'admin'));
  const canAnyAction = canActOn(myRole, targetRole);

  const kebabRef = useRef<HTMLButtonElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 group"
      style={{
        background: busy ? 'rgba(59,130,246,0.04)' : 'transparent',
      }}
      onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'rgba(255,255,255,0.035)'; }}
      onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <AvatarContent
          avatar={member.avatar}
          statusText={statusText}
          firstName={member.firstName}
          name={dn}
          letterClassName="text-[11px] font-bold text-[#7b8ba8]/70"
        />
      </div>

      {/* İsim + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-semibold text-[#e8ecf4] truncate">{dn}</span>
          {member.isMuted && (
            <span
              className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(251,146,60,0.12)',
                color: '#fb923c',
                border: '1px solid rgba(251,146,60,0.25)',
              }}
              title="Sistem yönetimi tarafından susturulmuş"
            >
              <MicOff size={9} strokeWidth={2.2} /> Sesi kapalı
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {member.username && member.username !== dn && (
            <span className="text-[10px] text-[#7b8ba8]/50">@{member.username}</span>
          )}
          <span className="text-[10px] text-[#7b8ba8]/40">{fmtDate(member.joinedAt)}</span>
        </div>
      </div>

      {/* Rol chip (tıklanabilir → role picker) */}
      <button
        ref={chipRef}
        type="button"
        disabled={!canChangeRole || busy}
        onClick={() => {
          if (!chipRef.current) return;
          onOpenRolePicker(chipRef.current.getBoundingClientRect());
        }}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10.5px] font-bold transition-all duration-150 shrink-0 ${
          canChangeRole && !busy
            ? 'hover:brightness-[1.10] active:scale-[0.95] cursor-pointer'
            : 'cursor-default'
        }`}
        style={{
          background: chip.bg,
          color: chip.color,
          border: `1px solid ${chip.border}`,
        }}
      >
        {chip.icon}
        {ROLE_LABEL[targetRole] ?? targetRole}
        {canChangeRole && !busy && (
          <UserMinus size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ display: 'none' }} />
        )}
      </button>

      {/* Kebab */}
      <button
        ref={kebabRef}
        type="button"
        disabled={!canAnyAction || busy}
        onClick={() => {
          if (!kebabRef.current) return;
          onOpenKebab(kebabRef.current.getBoundingClientRect());
        }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 ${
          canAnyAction && !busy
            ? 'text-[#7b8ba8]/50 hover:text-[#e8ecf4] hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.94] opacity-60 group-hover:opacity-100'
            : 'text-[#7b8ba8]/20 cursor-default'
        }`}
        aria-label="Daha fazla aksiyon"
      >
        {busy
          ? <div className="w-3.5 h-3.5 border-2 border-[#60a5fa]/30 border-t-[#60a5fa] rounded-full animate-spin" />
          : <MoreHorizontal size={15} />}
      </button>
    </div>
  );
}
