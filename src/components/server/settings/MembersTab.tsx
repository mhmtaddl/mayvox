import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, X, Crown, Shield, ShieldCheck, ShieldPlus, ShieldAlert,
  User as UserIcon, UserCheck,
  MoreHorizontal, MicOff, Mic, Clock, UserX, Ban,
  DoorOpen, History, MessageSquareOff, MessageSquare,
} from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import { useUser } from '../../../contexts/UserContext';
import {
  type ServerMember,
  type TimeoutPresetSeconds,
  getMembers, kickMember, changeRole, banMember,
  muteMember, unmuteMember,
  timeoutMember, clearTimeoutMember,
  kickFromRoom,
  chatBanMember, chatUnbanMember,
} from '../../../lib/serverService';
import {
  type ServerRole, ROLE_PRIORITY, ROLE_LABEL, canActOn, normalizeRole, isKnownRole,
} from '../../../lib/permissionBundles';
import { fmtDate, memberDisplayName, Empty, Loader } from './shared';
import { formatRemainingFromIso, getRemainingMs } from '../../../lib/formatTimeout';
import ActionMenu, { type ActionItem } from './ActionMenu';
import RolePicker from './RolePicker';
import TimeoutPicker from './TimeoutPicker';
import PunishmentHistoryModal from './PunishmentHistoryModal';
import ConfirmModal, { type ConfirmVariant } from './ConfirmModal';
import BannedUsersSection from './BannedUsersSection';

interface Props {
  serverId: string;
  myRole: string;
  showToast: (m: string) => void;
}

const ROLE_FILTERS: readonly { value: string; label: string }[] = [
  { value: 'all',           label: 'Tümü' },
  { value: 'owner',         label: 'Sahip' },
  { value: 'super_admin',   label: 'Süper Yön.' },
  { value: 'admin',         label: 'Yönetici' },
  { value: 'super_mod',     label: 'Süper Mod' },
  { value: 'mod',           label: 'Moderatör' },
  { value: 'super_member',  label: 'Süper Üye' },
  { value: 'member',        label: 'Üye' },
];

const ROLE_CHIP: Record<ServerRole, { icon: React.ReactNode; bg: string; color: string; border: string }> = {
  owner:        { icon: <Crown size={11} strokeWidth={1.9} />,       bg: 'rgba(245,158,11,0.10)',  color: '#a16207', border: 'rgba(245,158,11,0.24)' },
  super_admin:  { icon: <ShieldPlus size={11} strokeWidth={1.9} />,  bg: 'rgba(99,179,252,0.10)',  color: '#1d4ed8', border: 'rgba(99,179,252,0.24)' },
  admin:        { icon: <Shield size={11} strokeWidth={1.9} />,      bg: 'rgba(59,130,246,0.10)',  color: '#2563eb', border: 'rgba(59,130,246,0.24)' },
  super_mod:    { icon: <ShieldAlert size={11} strokeWidth={1.9} />, bg: 'rgba(139,92,246,0.10)',  color: '#6d28d9', border: 'rgba(139,92,246,0.24)' },
  mod:          { icon: <ShieldCheck size={11} strokeWidth={1.9} />, bg: 'rgba(167,139,250,0.10)', color: '#7c3aed', border: 'rgba(167,139,250,0.24)' },
  super_member: { icon: <UserCheck size={11} strokeWidth={1.9} />,   bg: 'rgba(148,180,220,0.10)', color: '#475569', border: 'rgba(148,180,220,0.22)' },
  member:       { icon: <UserIcon size={11} strokeWidth={1.9} />,    bg: 'rgba(var(--glass-tint),0.035)', color: 'var(--theme-secondary-text)', border: 'rgba(var(--glass-tint),0.08)' },
};

type PopoverState =
  | { kind: 'action'; member: ServerMember; rect: DOMRect }
  | { kind: 'role'; member: ServerMember; rect: DOMRect }
  | { kind: 'timeout'; member: ServerMember; rect: DOMRect }
  | { kind: 'history'; member: ServerMember; rect: DOMRect }
  | null;

/** Aktif voice mute var mı? Süresiz (voiceMutedBy dolu, voiceMutedUntil null) veya süreli. */
function isVoiceMuted(m: ServerMember): boolean {
  return m.voiceMutedBy !== null;
}

/** Aktif timeout var mı? Backend lazy-expiration uygular — null = yok. */
function isTimedOut(m: ServerMember): boolean {
  if (!m.timeoutUntil) return false;
  return getRemainingMs(m.timeoutUntil) > 0;
}

/** Aktif chat ban var mı? Süresiz (chatBannedBy dolu, chatBannedUntil null) veya süreli. */
function isChatBanned(m: ServerMember): boolean {
  return m.chatBannedBy !== null;
}

/**
 * Timeout canlı geri sayım — her saniye format'ı tazeler.
 * Süre dolunca null'a döner; parent re-render'ında badge kaybolur (lazy-expiration backend'de).
 */
function TimeoutCountdown({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const [remStr, setRemStr] = useState<string | null>(() => formatRemainingFromIso(until));
  useEffect(() => {
    const tick = () => {
      const s = formatRemainingFromIso(until);
      setRemStr(s);
      if (s === null) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until, onExpire]);
  if (!remStr) return null;
  return <span>{remStr}</span>;
}

// ══════════════════════════════════════════════════════════
// MembersTab — premium üye yönetimi (kebab + role picker + modals)
// ══════════════════════════════════════════════════════════
export default function MembersTab({ serverId, myRole, showToast }: Props) {
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const { allUsers, currentUser } = useUser();
  const resolveStatus = useCallback((userId: string): string => {
    const u = allUsers.find(au => au.id === userId);
    return u?.statusText || 'Online';
  }, [allUsers]);

  // showToast'u ref'e al — load useCallback'ının dep'ini kirletmesin.
  // Aksi halde App.tsx'in showToast prop identity'si değiştikçe load yeniden yaratılıyor →
  // focus listener re-mount + useEffect(load) yeniden fire → gereksiz refresh + loading flicker.
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  // Initial load flag — ilk yüklemede spinner göster, sonraki silent reload'larda gösterme.
  // Kullanıcı focus/refresh sırasında blank middle content görmesin.
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(async () => {
    const isInitial = !initialLoadDoneRef.current;
    try {
      if (isInitial) setLoading(true);
      setMembers(await getMembers(serverId));
    } catch {
      showToastRef.current('Üyeler yüklenemedi');
    } finally {
      if (isInitial) setLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, [serverId]); // SADECE serverId — showToast ref'te.

  useEffect(() => {
    // Server değişince initial flag sıfırla ki yeni sunucuda spinner görünsün.
    initialLoadDoneRef.current = false;
    void load();
  }, [load]);

  // Window focus / visibility change → silent reload (loading göstermiyor).
  // Moderator başka pencerede mute/timeout kaldırırsa stale state'i düzelt.
  // Throttle: 5sn.
  useEffect(() => {
    let lastAt = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastAt < 5_000) return;
      lastAt = now;
      void load();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  // ─── Popover state (tekil — kebab ve role picker aynı anda açılamaz) ───
  const [popover, setPopover] = useState<PopoverState>(null);
  const [confirm, setConfirm] = useState<{ variant: ConfirmVariant; member: ServerMember } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // myRole — string gelen prop'u ServerRole'a daralt (unknown → member fallback).
  // Legacy 'moderator' satırları normalizeRole tarafından 'mod'a maplenir.
  const myRoleTyped: ServerRole = normalizeRole(myRole);

  // ─── Aksiyon runner — busy state + reload + toast (SADECE hata) ───
  // Başarılı moderation aksiyonunda moderator'a confirmation toast/ses GÖSTERİLMEZ —
  // kullanıcı talebi. Moderator feedback'i row UI güncellemesinden zaten geliyor
  // (badge değişimi, mic ikonu vb.). Hedef kullanıcıya realtime broadcast gider.
  // Hata durumunda toast korunur — moderator işlem başarısızsa bilmeli.
  // okMsg parametresi geriye uyumluluk için tutuluyor; kullanılmıyor.
  const act = useCallback(async (fn: () => Promise<unknown>, _okMsg: string, userId: string) => {
    setBusyId(userId);
    try { await fn(); await load(); }
    catch (e: unknown) { showToastRef.current(e instanceof Error ? e.message : 'İşlem başarısız'); }
    finally { setBusyId(null); }
  }, [load]);

  const handleRoleChange = useCallback((member: ServerMember, nextRole: ServerRole) => {
    setPopover(null);
    if (member.role === nextRole) return;
    const dn = memberDisplayName(member);
    void act(
      () => changeRole(serverId, member.userId, nextRole),
      `${dn} → ${ROLE_LABEL[nextRole]}`,
      member.userId,
    );
  }, [act, serverId]);

  const handleKick = useCallback((member: ServerMember) => {
    setConfirm(null);
    const dn = memberDisplayName(member);
    // Backend kickMember(serverId, userId) — reason backend'de yok, modal'dan kaldırıldı
    void act(() => kickMember(serverId, member.userId), `${dn} sunucudan çıkarıldı`, member.userId);
  }, [act, serverId]);

  const handleBan = useCallback((member: ServerMember, reason: string) => {
    setConfirm(null);
    const dn = memberDisplayName(member);
    void act(() => banMember(serverId, member.userId, reason), `${dn} yasaklandı`, member.userId);
  }, [act, serverId]);

  // ─── Moderation voice action handler'ları (migration 023) ───

  const handleMuteToggle = useCallback((member: ServerMember) => {
    setPopover(null);
    const dn = memberDisplayName(member);
    if (isVoiceMuted(member)) {
      void act(() => unmuteMember(serverId, member.userId), `${dn} sunucu susturması kaldırıldı`, member.userId);
    } else {
      // MVP: süresiz mute. İleride süre seçici eklenebilir.
      void act(() => muteMember(serverId, member.userId, null), `${dn} sunucuda susturuldu`, member.userId);
    }
  }, [act, serverId]);

  const handleTimeoutSet = useCallback((member: ServerMember, durationSeconds: TimeoutPresetSeconds) => {
    setPopover(null);
    const dn = memberDisplayName(member);
    void act(
      () => timeoutMember(serverId, member.userId, durationSeconds),
      `${dn} zaman aşımına alındı`,
      member.userId,
    );
  }, [act, serverId]);

  const handleTimeoutClear = useCallback((member: ServerMember) => {
    setPopover(null);
    const dn = memberDisplayName(member);
    void act(() => clearTimeoutMember(serverId, member.userId), `${dn} zaman aşımı kaldırıldı`, member.userId);
  }, [act, serverId]);

  const handleRoomKick = useCallback((member: ServerMember) => {
    setPopover(null);
    const dn = memberDisplayName(member);
    void act(
      () => kickFromRoom(serverId, member.userId, null),
      `${dn} odadan çıkarıldı`,
      member.userId,
    );
  }, [act, serverId]);

  const handleChatBanToggle = useCallback((member: ServerMember) => {
    setPopover(null);
    const dn = memberDisplayName(member);
    if (isChatBanned(member)) {
      void act(() => chatUnbanMember(serverId, member.userId), `${dn} sohbet yasağı kaldırıldı`, member.userId);
    } else {
      // MVP: süresiz chat ban. İleride süre seçici eklenebilir (TimeoutPicker pattern).
      void act(() => chatBanMember(serverId, member.userId, null), `${dn} sohbet yasağı aldı`, member.userId);
    }
  }, [act, serverId]);

  // ─── Kebab menu items — popover açıkken hesaplanır ───
  const buildActionItems = (m: ServerMember, rect: DOMRect): ActionItem[] => {
    const targetRole = m.role as ServerRole;
    // canActOn hierarchy ile aksiyon yetkisini belirler (owner → hiçbiri, kendi seviyen/üst →
    // false). Ek olarak kendi satırına aksiyon: canActOn zaten owner=>false; normal case'te
    // self-check açık — myRoleTyped ile kendi role'un aynı olsa bile false dönebilmesi için.
    const isSelf = currentUser?.id === m.userId;
    const canAct = !isSelf && canActOn(myRoleTyped, targetRole);
    // Eşikler yeni 7-rol priority skalasında (mod=3, admin=5)
    const canKick = canAct && ROLE_PRIORITY[myRoleTyped] >= ROLE_PRIORITY.mod;
    const canBan = canAct && ROLE_PRIORITY[myRoleTyped] >= ROLE_PRIORITY.admin;
    const canModerate = canAct && ROLE_PRIORITY[myRoleTyped] >= ROLE_PRIORITY.mod;

    const muted = isVoiceMuted(m);
    const timedOut = isTimedOut(m);
    const chatBanned = isChatBanned(m);

    return [
      {
        id: 'voice_mute',
        label: muted ? 'Susturmayı Kaldır' : 'Sesini Sustur',
        icon: muted ? <Mic size={13} /> : <MicOff size={13} />,
        disabled: !canModerate,
        onClick: () => handleMuteToggle(m),
      },
      {
        id: 'timeout',
        label: timedOut ? 'Zaman Aşımını Kaldır' : 'Zaman Aşımı Ver...',
        icon: <Clock size={13} />,
        disabled: !canModerate,
        // timedOut=true yolu kapatır (handleTimeoutClear akışı), false yolu popover açar.
        // İkinci durumda menu kapanmamalı ki setPopover override edilmesin.
        closesMenu: false,
        onClick: () => {
          if (timedOut) handleTimeoutClear(m);
          else setPopover({ kind: 'timeout', member: m, rect });
        },
      },
      {
        id: 'room_kick',
        label: 'Odadan Çıkar',
        icon: <DoorOpen size={13} />,
        disabled: !canModerate,
        onClick: () => handleRoomKick(m),
      },
      {
        id: 'chat_ban',
        label: chatBanned ? 'Sohbet Yasağını Kaldır' : 'Sohbeti Yasakla',
        icon: chatBanned ? <MessageSquare size={13} /> : <MessageSquareOff size={13} />,
        disabled: !canModerate,
        onClick: () => handleChatBanToggle(m),
      },
      {
        id: 'kick',
        label: 'Sunucudan At',
        icon: <UserX size={13} />,
        tone: 'warn',
        disabled: !canKick,
        separatorBefore: true,
        onClick: () => { setPopover(null); setConfirm({ variant: 'kick', member: m }); },
      },
      {
        id: 'ban',
        label: 'Yasakla...',
        icon: <Ban size={13} />,
        tone: 'danger',
        disabled: !canBan,
        onClick: () => { setPopover(null); setConfirm({ variant: 'ban', member: m }); },
      },
    ];
  };

  // ─── Filtre + sıralama ───
  const q = searchQuery.toLowerCase().trim();
  const filtered = members.filter(m => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (!q) return true;
    return memberDisplayName(m).toLowerCase().includes(q)
      || (m.username?.toLowerCase().includes(q) ?? false);
  });
  const sorted = [...filtered].sort((a, b) => {
    const ra = isKnownRole(a.role) ? ROLE_PRIORITY[a.role] : 0;
    const rb = isKnownRole(b.role) ? ROLE_PRIORITY[b.role] : 0;
    return rb - ra;
  });

  if (loading) return <Loader />;

  return (
    <div className="space-y-6 pb-6 membersTab">
      {/* ── A) Top Control Bar — search · pills · count ── */}
      <header className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div
          className="flex-1 min-w-[220px] flex items-center gap-2.5 h-11 rounded-full px-4 searchInput"
          style={{
            background: 'rgba(var(--glass-tint),0.028)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.08)',
          }}
        >
          <Search size={14} className="text-[var(--theme-secondary-text)] shrink-0" strokeWidth={2} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Üye ara..."
            className="flex-1 bg-transparent text-[12.5px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/55 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors"
              aria-label="Aramayı temizle"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Role filter pills */}
        <div className="flex gap-1 overflow-x-auto custom-scrollbar min-w-0 lg:shrink-0">
          {ROLE_FILTERS.map(rf => {
            const active = roleFilter === rf.value;
            return (
              <button
                key={rf.value}
                onClick={() => setRoleFilter(rf.value)}
                className="filterPill h-9 px-3.5 rounded-full text-[11px] font-medium shrink-0 whitespace-nowrap"
                style={active ? {
                  background: 'rgba(var(--theme-accent-rgb),0.10)',
                  color: 'var(--theme-accent)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.22), 0 0 16px rgba(var(--theme-accent-rgb),0.10)',
                } : {
                  color: 'var(--theme-secondary-text)',
                  background: 'transparent',
                }}
              >
                {rf.label}
              </button>
            );
          })}
        </div>

        {/* Count — subtle */}
        <div className="text-[10.5px] font-medium text-[var(--theme-secondary-text)]/75 tabular-nums shrink-0 px-1">
          {sorted.length === members.length
            ? `${members.length} üye`
            : `${sorted.length} / ${members.length}`}
        </div>
      </header>

      {/* ── B) Members List (main focus) ── */}
      {sorted.length === 0 ? (
        <Empty
          text={
            q
              ? 'Aramayla eşleşen üye yok'
              : roleFilter !== 'all'
                ? 'Bu rolde üye bulunmuyor'
                : 'Henüz üye yok'
          }
          sub={
            q
              ? `"${searchQuery}" için sonuç yok`
              : roleFilter !== 'all'
                ? 'Başka bir filtre dene'
                : 'Davetler sekmesinden davet gönderebilirsin'
          }
        />
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(var(--glass-tint),0.018)',
            boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.06)',
          }}
        >
          <div className="divide-y divide-[rgba(var(--glass-tint),0.06)]">
            {sorted.map(m => {
              const targetRole = m.role as ServerRole;
              const isSelf = currentUser?.id === m.userId;
              const canModerate = !isSelf && canActOn(myRoleTyped, targetRole) && ROLE_PRIORITY[myRoleTyped] >= ROLE_PRIORITY.mod;
              return (
                <MemberRow
                  key={m.userId}
                  member={m}
                  myRole={myRoleTyped}
                  isSelf={isSelf}
                  statusText={resolveStatus(m.userId)}
                  busy={busyId === m.userId}
                  onOpenKebab={rect => setPopover({ kind: 'action', member: m, rect })}
                  onOpenRolePicker={rect => setPopover({ kind: 'role', member: m, rect })}
                  onOpenHistory={rect => setPopover({ kind: 'history', member: m, rect })}
                  canModerate={canModerate}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── C) Secondary — Banned users ── */}
      <BannedUsersSection serverId={serverId} showToast={showToast} />

      {/* ── Popovers (tekil) ── */}
      {popover?.kind === 'action' && (
        <ActionMenu
          items={buildActionItems(popover.member, popover.rect)}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
      {popover?.kind === 'role' && (
        <RolePicker
          currentRole={popover.member.role as ServerRole}
          actorRole={myRoleTyped}
          anchorRect={popover.rect}
          busy={busyId === popover.member.userId}
          onClose={() => setPopover(null)}
          onSelect={role => handleRoleChange(popover.member, role)}
        />
      )}
      {popover?.kind === 'timeout' && (
        <TimeoutPicker
          anchorRect={popover.rect}
          busy={busyId === popover.member.userId}
          onClose={() => setPopover(null)}
          onSelect={duration => handleTimeoutSet(popover.member, duration)}
        />
      )}
      {popover?.kind === 'history' && (
        <PunishmentHistoryModal
          serverId={serverId}
          member={popover.member}
          onClose={() => setPopover(null)}
          onToast={(m) => showToastRef.current(m)}
        />
      )}

      {/* ── Confirm modal ── */}
      {confirm && (
        <ConfirmModal
          variant={confirm.variant}
          targetName={memberDisplayName(confirm.member)}
          open={true}
          busy={busyId === confirm.member.userId}
          onCancel={() => setConfirm(null)}
          onConfirm={reason => {
            if (confirm.variant === 'kick') handleKick(confirm.member);
            else handleBan(confirm.member, reason);
          }}
        />
      )}

      <style>{`
        /* Apple-grade easing */
        .membersTab { --ease: cubic-bezier(0.22, 1, 0.36, 1); }

        /* Search — focus ring */
        .searchInput:focus-within {
          background: rgba(var(--glass-tint),0.045) !important;
          box-shadow:
            inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.30),
            0 0 0 4px rgba(var(--theme-accent-rgb),0.08) !important;
          transition: background 180ms var(--ease), box-shadow 220ms var(--ease);
        }
        .searchInput {
          transition: background 200ms var(--ease), box-shadow 240ms var(--ease);
        }

        /* Filter pills */
        .filterPill {
          transition:
            background 200ms var(--ease) 40ms,
            color 200ms var(--ease) 40ms,
            box-shadow 220ms var(--ease);
        }
        .filterPill:hover {
          color: var(--theme-text) !important;
          background: rgba(var(--glass-tint),0.035) !important;
        }
        .filterPill:active { transform: scale(0.97); }
        .filterPill:focus-visible {
          outline: none;
          box-shadow:
            inset 0 0 0 1px rgba(var(--theme-accent-rgb),0.35),
            0 0 0 4px rgba(var(--theme-accent-rgb),0.10);
        }

        /* Member row — hover glow + actions fade in */
        .memberRow {
          transition: background 220ms var(--ease) 50ms;
        }
        .memberRow.is-busy {
          background: rgba(var(--theme-accent-rgb),0.04);
        }
        .rowActions {
          opacity: 0.35;
          transform: translateX(4px);
          transition:
            opacity 200ms var(--ease) 40ms,
            transform 200ms var(--ease) 40ms;
        }
        .memberRow:hover .rowActions,
        .memberRow:focus-within .rowActions {
          opacity: 1;
          transform: translateX(0);
        }

        /* Role pill — glassy hover */
        .rolePill {
          transition: filter 180ms var(--ease) 40ms, transform 140ms var(--ease);
        }
        .rolePill.is-interactive:hover { filter: brightness(1.08); }
        .rolePill.is-interactive:active { transform: scale(0.96); }
        .rolePill:focus-visible {
          outline: none;
          box-shadow:
            inset 0 0 0 1px currentColor,
            0 0 0 4px rgba(var(--glass-tint),0.06);
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Member row — avatar + isim + mute badge + role chip + kebab
// ══════════════════════════════════════════════════════════
interface MemberRowProps {
  member: ServerMember;
  myRole: ServerRole;
  isSelf: boolean;
  statusText: string;
  busy: boolean;
  onOpenKebab: (rect: DOMRect) => void;
  onOpenRolePicker: (rect: DOMRect) => void;
  onOpenHistory: (rect: DOMRect) => void;
  canModerate: boolean;
  key?: React.Key;
}

function MemberRow({ member, myRole, isSelf, statusText, busy, onOpenKebab, onOpenRolePicker, onOpenHistory, canModerate }: MemberRowProps) {
  const dn = memberDisplayName(member);
  // Legacy/unknown rol → 'member' fallback, UI patlamaz.
  const targetRole: ServerRole = normalizeRole(member.role);
  const chip = ROLE_CHIP[targetRole];
  const muted = isVoiceMuted(member);
  const timedOut = isTimedOut(member);
  const chatBanned = isChatBanned(member);

  // Yetki gate'leri — kendi satırımda hiçbir aksiyon açılmaz.
  // 7-rol modelinde: member dışında herkesin atayabileceği en az bir alt rol var.
  // Picker kesin atanabilir rol listesini ayrıca filtreler (canAssignRole).
  const canAnyAction = !isSelf && canActOn(myRole, targetRole);
  const canChangeRole = canAnyAction && ROLE_PRIORITY[myRole] > ROLE_PRIORITY.member;

  const kebabRef = useRef<HTMLButtonElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLButtonElement>(null);

  const rowCls = busy
    ? 'is-busy'
    : 'hover:bg-[rgba(var(--glass-tint),0.032)]';

  return (
    <div className={`memberRow flex items-center gap-3.5 px-5 py-3.5 group ${rowCls}`}>
      {/* Avatar — rounded-xl + soft shadow, initials fallback styled by AvatarContent */}
      <div
        className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
        style={{
          background: 'linear-gradient(160deg, rgba(var(--glass-tint),0.06), rgba(var(--glass-tint),0.02))',
          boxShadow:
            'inset 0 1px 0 rgba(var(--glass-tint),0.08), ' +
            '0 2px 8px rgba(0,0,0,0.18)',
        }}
      >
        <AvatarContent
          avatar={member.avatar}
          statusText={statusText}
          firstName={member.firstName}
          name={dn}
          letterClassName="text-[12px] font-semibold text-[var(--theme-text)]"
        />
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-[var(--theme-text)] truncate" style={{ letterSpacing: '-0.005em' }}>{dn}</span>
          {/* Moderasyon ikonları — sade ikon badge. Renkler:
              sistem mute = turuncu, sunucu mute = turuncu, timeout = mor + canlı countdown. */}
          {member.isMuted && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full"
              style={{
                background: 'rgba(251,146,60,0.10)',
                color: 'rgba(251,146,60,0.88)',
                boxShadow: 'inset 0 0 0 1px rgba(251,146,60,0.18)',
              }}
              title="Sistem tarafından susturulmuş"
              aria-label="Sistem susturma"
            >
              <MicOff size={10} strokeWidth={2} />
            </span>
          )}
          {muted && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full"
              style={{
                background: 'rgba(251,146,60,0.10)',
                color: 'rgba(251,146,60,0.88)',
                boxShadow: 'inset 0 0 0 1px rgba(251,146,60,0.18)',
              }}
              title={
                member.voiceMutedUntil
                  ? `Sunucu susturma aktif — bitiş: ${fmtDate(member.voiceMutedUntil)}`
                  : 'Sunucu susturma aktif — süresiz'
              }
              aria-label="Sunucu susturma"
            >
              <MicOff size={10} strokeWidth={2} />
            </span>
          )}
          {timedOut && member.timeoutUntil && (
            <span
              className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-medium tabular-nums"
              style={{
                background: 'rgba(167,139,250,0.10)',
                color: 'rgba(167,139,250,0.92)',
                boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.22)',
              }}
              title={`Zamanaşımı — bitiş: ${fmtDate(member.timeoutUntil)}`}
              aria-label="Zamanaşımı"
            >
              <Clock size={10} strokeWidth={2} />
              <TimeoutCountdown until={member.timeoutUntil} />
            </span>
          )}
          {chatBanned && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full"
              style={{
                background: 'rgba(244,114,182,0.10)',
                color: 'rgba(244,114,182,0.88)',
                boxShadow: 'inset 0 0 0 1px rgba(244,114,182,0.22)',
              }}
              title={
                member.chatBannedUntil
                  ? `Sohbet yasağı aktif — bitiş: ${fmtDate(member.chatBannedUntil)}`
                  : 'Sohbet yasağı aktif — süresiz'
              }
              aria-label="Sohbet yasağı"
            >
              <MessageSquareOff size={10} strokeWidth={2} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 leading-relaxed">
          {member.username && member.username !== dn && (
            <span className="text-[10.5px] text-[var(--theme-secondary-text)] truncate">@{member.username}</span>
          )}
          {member.username && member.username !== dn && (
            <span className="text-[var(--theme-secondary-text)]/40 shrink-0">·</span>
          )}
          <span className="text-[10.5px] text-[var(--theme-secondary-text)]/75 shrink-0">
            {fmtDate(member.joinedAt)}
          </span>
        </div>
      </div>

      {/* Role pill — glassy, borderless */}
      <button
        ref={chipRef}
        type="button"
        disabled={!canChangeRole || busy}
        onClick={() => {
          if (!chipRef.current) return;
          onOpenRolePicker(chipRef.current.getBoundingClientRect());
        }}
        className={`rolePill inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium shrink-0 ${
          canChangeRole && !busy ? 'is-interactive' : 'is-static'
        }`}
        style={{
          background: chip.bg,
          color: chip.color,
          boxShadow: `inset 0 0 0 1px ${chip.border}`,
          opacity: busy ? 0.8 : 0.95,
        }}
        title={
          canChangeRole
            ? 'Rolü değiştir'
            : isSelf
              ? 'Kendi rolünü değiştiremezsin'
              : targetRole === 'owner'
                ? 'Sahibin rolü değiştirilemez'
                : myRole === 'mod'
                  ? 'Rol değiştirme yetkin yok'
                  : 'Bu üyeye rol atayamazsın'
        }
      >
        <span className="opacity-85 shrink-0">{chip.icon}</span>
        {ROLE_LABEL[targetRole] ?? targetRole}
      </button>

      {/* Actions cluster — hover'da fade-in + soft slide */}
      <div className="rowActions flex items-center gap-0.5 shrink-0">
        {canModerate && !isSelf && (
          <button
            ref={historyRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (historyRef.current) onOpenHistory(historyRef.current.getBoundingClientRect());
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--theme-accent-rgb),0.08)] transition-colors"
            title="Ceza geçmişi"
            aria-label="Ceza geçmişi"
          >
            <History size={14} strokeWidth={1.9} />
          </button>
        )}

        <button
          ref={kebabRef}
          type="button"
          disabled={!canAnyAction || busy}
          onClick={() => {
            if (!kebabRef.current) return;
            onOpenKebab(kebabRef.current.getBoundingClientRect());
          }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            canAnyAction && !busy
              ? 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)]'
              : 'text-[var(--theme-secondary-text)]/35 cursor-default'
          }`}
          aria-label="Daha fazla aksiyon"
        >
          {busy
            ? <div className="w-3.5 h-3.5 border-2 border-[var(--theme-accent)]/25 border-t-[var(--theme-accent)] rounded-full animate-spin" />
            : <MoreHorizontal size={15} strokeWidth={1.9} />}
        </button>
      </div>
    </div>
  );
}
