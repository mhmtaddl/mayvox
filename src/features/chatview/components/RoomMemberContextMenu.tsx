import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MicOff, Mic, Clock, DoorOpen,
  MessageSquareOff, MessageSquare, UserX, Ban,
} from 'lucide-react';
import type { User } from '../../../types';
import {
  getMembers,
  muteMember, unmuteMember,
  kickFromRoom,
  chatBanMember, chatUnbanMember,
  timeoutMember, clearTimeoutMember,
  kickMember, banMember,
  type ServerMember,
  type TimeoutPresetSeconds,
} from '../../../lib/serverService';
import {
  type ServerRole, ROLE_HIERARCHY, canActOn,
} from '../../../lib/permissionBundles';
import { getRemainingMs } from '../../../lib/formatTimeout';
import ActionMenu, { type ActionItem } from '../../../components/server/settings/ActionMenu';
import TimeoutPicker from '../../../components/server/settings/TimeoutPicker';
import ConfirmModal, { type ConfirmVariant } from '../../../components/server/settings/ConfirmModal';
import { formatFullName } from '../../../lib/formatName';

export interface RoomMemberMenuCtx {
  user: User;
  x: number;
  y: number;
}

interface Props {
  ctx: RoomMemberMenuCtx | null;
  onClose: () => void;
  serverId: string | null;
  myRole: ServerRole;
  ownerUserId: string | null;
  currentUserId: string;
  showToast: (m: string) => void;
}

/** Cursor-anchored phantom anchor rect (ActionMenu right-anchor'a göre konum). */
function cursorRect(x: number, y: number): DOMRect {
  return new DOMRect(x, y - 6, 220, 0);
}

function deriveTargetRole(user: User, ownerUserId: string | null): ServerRole {
  if (ownerUserId && user.id === ownerUserId) return 'owner';
  if (user.isAdmin) return 'admin';
  if (user.isModerator) return 'mod';
  return 'member';
}

function isVoiceMuted(m: ServerMember | null): boolean {
  return !!m && m.voiceMutedBy !== null;
}
function isTimedOut(m: ServerMember | null): boolean {
  if (!m || !m.timeoutUntil) return false;
  return getRemainingMs(m.timeoutUntil) > 0;
}
function isChatBanned(m: ServerMember | null): boolean {
  return !!m && m.chatBannedBy !== null;
}

export default function RoomMemberContextMenu({
  ctx, onClose, serverId, myRole, ownerUserId, currentUserId, showToast,
}: Props) {
  const [confirm, setConfirm] = useState<{ variant: ConfirmVariant; user: User } | null>(null);
  const [timeoutPicker, setTimeoutPicker] = useState<{ user: User; rect: DOMRect } | null>(null);
  const [busy, setBusy] = useState(false);

  // Target'ın ServerMember row'u — menü açılınca fetch edilir, toggle label'larda
  // (mute/unmute, chat-ban/unban, timeout set/clear) kullanılır. Fetch sırasında
  // default state olarak "not muted / not banned" varsayarız; cevap gelince label yenilenir.
  const [targetMember, setTargetMember] = useState<ServerMember | null>(null);

  useEffect(() => {
    if (!ctx || !serverId) { setTargetMember(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await getMembers(serverId);
        if (cancelled) return;
        setTargetMember(list.find(m => m.userId === ctx.user.id) ?? null);
      } catch { /* fetch başarısızsa fallback label gösterilir; backend yine doğru action'ı doğrular */ }
    })();
    return () => { cancelled = true; };
  }, [ctx, serverId]);

  // Debounced action runner.
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    if (busy || !serverId) return;
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  }, [busy, serverId, onClose, showToast]);

  const items = useMemo<ActionItem[]>(() => {
    if (!ctx || !serverId) return [];
    const { user } = ctx;
    const targetRole = deriveTargetRole(user, ownerUserId);
    const isSelf = user.id === currentUserId;
    const canAct = !isSelf && canActOn(myRole, targetRole);
    const canModerate = canAct && ROLE_HIERARCHY[myRole] >= 2;
    const canServerKick = canAct && ROLE_HIERARCHY[myRole] >= 2;
    const canServerBan = canAct && ROLE_HIERARCHY[myRole] >= 3;

    // Moderation-only menü: hiçbir yetki yoksa menü render edilmez (items.length === 0).
    if (!canModerate && !canServerKick && !canServerBan) return [];

    const muted = isVoiceMuted(targetMember);
    const timedOut = isTimedOut(targetMember);
    const chatBanned = isChatBanned(targetMember);

    return [
      {
        id: 'voice_mute',
        label: muted ? 'Susturmayı Kaldır' : 'Sesini Sustur',
        icon: muted ? <Mic size={13} /> : <MicOff size={13} />,
        disabled: !canModerate || busy,
        onClick: () => act(() => muted
          ? unmuteMember(serverId, user.id)
          : muteMember(serverId, user.id, null)),
      },
      {
        id: 'timeout',
        label: timedOut ? 'Zaman Aşımını Kaldır' : 'Zaman Aşımı Ver...',
        icon: <Clock size={13} />,
        disabled: !canModerate || busy,
        // timedOut ise direkt temizle (menu kapanır); değilse picker aç (menu açık kalsın).
        closesMenu: !timedOut ? false : true,
        onClick: () => {
          if (timedOut) act(() => clearTimeoutMember(serverId, user.id));
          else setTimeoutPicker({ user, rect: cursorRect(ctx.x + 40, ctx.y) });
        },
      },
      {
        id: 'room_kick',
        label: 'Odadan Çıkar',
        icon: <DoorOpen size={13} />,
        disabled: !canModerate || busy,
        onClick: () => act(() => kickFromRoom(serverId, user.id, null)),
      },
      {
        id: 'chat_ban',
        label: chatBanned ? 'Sohbet Yasağını Kaldır' : 'Sohbeti Yasakla',
        icon: chatBanned ? <MessageSquare size={13} /> : <MessageSquareOff size={13} />,
        disabled: !canModerate || busy,
        onClick: () => act(() => chatBanned
          ? chatUnbanMember(serverId, user.id)
          : chatBanMember(serverId, user.id, null)),
      },
      {
        id: 'server_kick',
        label: 'Sunucudan At',
        icon: <UserX size={13} />,
        tone: 'warn',
        disabled: !canServerKick || busy,
        separatorBefore: true,
        onClick: () => { onClose(); setConfirm({ variant: 'kick', user }); },
      },
      {
        id: 'server_ban',
        label: 'Yasakla...',
        icon: <Ban size={13} />,
        tone: 'danger',
        disabled: !canServerBan || busy,
        onClick: () => { onClose(); setConfirm({ variant: 'ban', user }); },
      },
    ];
  }, [ctx, serverId, myRole, ownerUserId, currentUserId, targetMember, busy, act, onClose]);

  const handleConfirmSubmit = useCallback(async (reason: string) => {
    if (!confirm || !serverId) return;
    setBusy(true);
    try {
      if (confirm.variant === 'kick') {
        await kickMember(serverId, confirm.user.id);
      } else {
        await banMember(serverId, confirm.user.id, reason);
      }
      setConfirm(null);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  }, [confirm, serverId, showToast]);

  const handleTimeoutSelect = useCallback((duration: TimeoutPresetSeconds) => {
    if (!timeoutPicker || !serverId) return;
    const userId = timeoutPicker.user.id;
    setTimeoutPicker(null);
    setBusy(true);
    (async () => {
      try { await timeoutMember(serverId, userId, duration); }
      catch (e: unknown) { showToast(e instanceof Error ? e.message : 'İşlem başarısız'); }
      finally { setBusy(false); onClose(); }
    })();
  }, [timeoutPicker, serverId, showToast, onClose]);

  useEffect(() => {
    if (!ctx) setTimeoutPicker(null);
  }, [ctx]);

  return (
    <>
      {/* ActionMenu ve TimeoutPicker aynı anda render edilmez: ActionMenu'nun
          outside-click handler'ı TimeoutPicker tıklamasını "dışarı" sayar ve
          preset seçimi kaybedilir. Timeout picker açıkken ActionMenu unmount. */}
      {ctx && serverId && items.length > 0 && !timeoutPicker && (
        <ActionMenu
          items={items}
          anchorRect={cursorRect(ctx.x, ctx.y)}
          onClose={onClose}
        />
      )}
      {timeoutPicker && (
        <TimeoutPicker
          anchorRect={timeoutPicker.rect}
          onSelect={handleTimeoutSelect}
          onClose={() => { setTimeoutPicker(null); onClose(); }}
          busy={busy}
        />
      )}
      {confirm && (
        <ConfirmModal
          variant={confirm.variant}
          targetName={formatFullName(confirm.user.firstName, confirm.user.lastName) || confirm.user.name}
          open={true}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={handleConfirmSubmit}
        />
      )}
    </>
  );
}
