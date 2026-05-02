import { useEffect, useRef } from 'react';
import type React from 'react';
import { subscribeRealtimeEvents } from '../lib/chatService';
import { updateUserAppVersion } from '../lib/supabase';
import { logMemberIdentityDebug, normalizeMemberKeysToUserIds } from '../lib/memberIdentity';
import { applyLocalChannelOrder } from '../lib/channelOrder';
import { applyLocalChannelIcons } from '../lib/channelIcon';
import { applyLocalChannelIconColors } from '../lib/channelIconColor';
import { getServerChannels } from '../lib/serverService';
import type { User, VoiceChannel } from '../types';

interface Props {
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  activeServerIdRef: React.MutableRefObject<string>;
  channelOrderTokenRef: React.MutableRefObject<string | null>;
  liveVoicePresenceRef: React.MutableRefObject<{ channelId: string | null; memberIds: Set<string> }>;
  disconnectFromLiveKit: () => Promise<void>;
  allUsersRef: React.MutableRefObject<User[]>;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  setToastMsg: (v: string | null) => void;
  setTimedOutUntil: (v: string | null) => void;
  setChatBannedUntil: (v: string | null) => void;
  setIsChatBanned: (v: boolean) => void;
  setVoiceDisabledReason: React.Dispatch<React.SetStateAction<
    'server_muted' | 'timeout' | 'kicked' | 'banned' | null
  >>;
  setInvitationModal: (
    v: {
      inviterId: string;
      inviterName: string;
      inviterAvatar?: string;
      roomName: string;
      roomId: string;
      serverName?: string;
      serverAvatar?: string | null;
    } | null,
  ) => void;
  onMoved: (targetChannelId: string) => void;
  onPasswordResetUpdate?: (userId: string) => void;
  onInviteRejected?: (inviteeId: string) => void;
  onInviteAccepted?: (inviteeId: string) => void;
}

export function usePresence({
  currentUserRef,
  activeChannelRef,
  activeServerIdRef,
  channelOrderTokenRef,
  liveVoicePresenceRef,
  disconnectFromLiveKit,
  allUsersRef,
  setAllUsers,
  setCurrentUser,
  setChannels,
  setActiveChannel,
  setToastMsg,
  setTimedOutUntil,
  setChatBannedUntil,
  setIsChatBanned,
  setVoiceDisabledReason,
}: Props) {
  const presenceChannelRef = useRef<null>(null);
  const knownVersionsRef = useRef<Map<string, string>>(new Map());
  const onlineSinceRef = useRef<number | null>(null);
  const platformRef = useRef<'mobile' | 'desktop'>(
    (() => {
      const isMobile =
        !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
          .Capacitor?.isNativePlatform?.() ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      return isMobile ? 'mobile' : 'desktop';
    })(),
  );

  const disconnectRef = useRef(disconnectFromLiveKit);
  disconnectRef.current = disconnectFromLiveKit;

  const syncRoomMembersFromPresence = (
    presenceData: Array<{ currentRoom?: string; userId?: string; serverId?: string }>,
  ) => {
    const myServerId = activeServerIdRef.current;
    const roomMembers = new Map<string, string[]>();
    for (const p of presenceData) {
      if (!p.currentRoom || !p.userId) continue;
      if (myServerId && p.serverId && p.serverId !== myServerId) continue;
      const list = roomMembers.get(p.currentRoom) || [];
      if (!list.includes(p.userId)) list.push(p.userId);
      roomMembers.set(p.currentRoom, list);
    }

    const myId = currentUserRef.current.id;
    const myChannel = activeChannelRef.current;

    setChannels(prev => {
      let hasChanges = false;
      const next = prev.map(c => {
        const presenceMembers = roomMembers.get(c.id) || [];
        const currentMembers = c.members || [];
        let members = [...presenceMembers];
        const live = liveVoicePresenceRef.current;
        if (live.channelId === c.id && live.memberIds.size > 0) {
          live.memberIds.forEach(memberId => {
            if (!members.includes(memberId)) members.push(memberId);
          });
        }
        if (myChannel === c.id && myId && !members.includes(myId)) members.push(myId);
        if (myChannel !== c.id && myId) {
          const liveHasSelf = live.channelId === c.id && live.memberIds.has(myId);
          if (!liveHasSelf) members = members.filter(m => m !== myId);
        }
        const sortedNew = [...members].sort();
        const sortedOld = [...currentMembers].sort();
        if (
          sortedNew.length !== sortedOld.length ||
          sortedNew.some((m, i) => m !== sortedOld[i])
        ) {
          hasChanges = true;
          return { ...c, members, userCount: members.length };
        }
        return c;
      });
      return hasChanges ? next : prev;
    });
  };

  const refetchServerChannels = async (serverId: string) => {
    try {
      const fresh = await getServerChannels(serverId);
      if (serverId !== activeServerIdRef.current) return;
      channelOrderTokenRef.current = fresh.orderToken;
      const displayNameMap: Record<string, string> = {
        'Sohbet Muhabbet': 'Genel',
        'Oyun Takımı': 'Oyun',
        'Yayın Sahnesi': 'Yayın',
        'Sessiz Alan': 'Sessiz',
      };
      setChannels(prev => {
        const prevMap = new Map<string, VoiceChannel>(prev.map(c => [c.id, c] as const));
        const myId = currentUserRef.current.id;
        const myChannel = activeChannelRef.current;
        return applyLocalChannelIcons(applyLocalChannelIconColors(applyLocalChannelOrder(serverId, fresh.channels.map(ch => {
          const existing = prevMap.get(ch.id);
          let members = existing?.members ?? [];
          let userCount = existing?.userCount ?? 0;
          if (ch.id === myChannel && myId && !members.includes(myId)) {
            members = [...members, myId];
            userCount = members.length;
          }
          return {
            id: ch.id,
            name: displayNameMap[ch.name] ?? ch.name,
            userCount,
            members,
            isSystemChannel: ch.isDefault,
            isPersistent: ch.isPersistent,
            maxUsers: ch.maxUsers ?? undefined,
            isInviteOnly: ch.isInviteOnly,
            isHidden: ch.isHidden,
            ownerId: ch.ownerId ?? undefined,
            mode: ch.mode ?? existing?.mode ?? 'social',
            iconName: ch.iconName ?? undefined,
            iconColor: ch.iconColor ?? undefined,
            speakerIds: existing?.speakerIds,
            position: ch.position,
            password: existing?.password,
          } satisfies VoiceChannel;
        }))));
      });
    } catch (err) {
      console.warn('[usePresence] channel refetch failed:', err);
    }
  };

  const handleChannelUpdate = (payload: any) => {
    if (payload?.serverId && payload.serverId !== activeServerIdRef.current) return;
    if (payload.action === 'create') {
      const incoming = payload.channel || {};
      const channelToAdd: VoiceChannel = {
        id: incoming.id,
        name: incoming.name,
        userCount: incoming.userCount ?? 0,
        members: incoming.members ?? [],
        isSystemChannel: incoming.isSystemChannel ?? incoming.isDefault,
        isPersistent: incoming.isPersistent,
        maxUsers: incoming.maxUsers ?? undefined,
        isInviteOnly: incoming.isInviteOnly,
        isHidden: incoming.isHidden,
        ownerId: incoming.ownerId ?? undefined,
        mode: incoming.mode ?? 'social',
        iconName: incoming.iconName ?? undefined,
        iconColor: incoming.iconColor ?? undefined,
        speakerIds: incoming.speakerIds,
        position: incoming.position ?? 0,
      };
      setChannels(prev =>
        prev.find(c => c.id === channelToAdd.id)
          ? prev
          : applyLocalChannelOrder(activeServerIdRef.current, [...prev, channelToAdd]),
      );
    } else if (payload.action === 'delete') {
      setChannels(prev => prev.filter(c => c.id !== payload.channelId));
      setActiveChannel(prev => (prev === payload.channelId ? null : prev));
    } else if (payload.action === 'reorder') {
      if (payload.serverId) void refetchServerChannels(payload.serverId);
      const updates = Array.isArray(payload.updates) ? payload.updates : [];
      if (updates.length === 0) return;
      const positionById = new Map<string, number>();
      for (const u of updates) {
        if (u && typeof u.id === 'string' && typeof u.position === 'number') {
          positionById.set(u.id, u.position);
        }
      }
      setChannels(prev => {
        const next = prev.map(c => {
          const p = positionById.get(c.id);
          return p !== undefined ? { ...c, position: p } : c;
        });
        next.sort((a, b) => {
          if (a.position !== b.position) return a.position - b.position;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        return applyLocalChannelOrder(activeServerIdRef.current, next);
      });
      if (typeof payload.orderToken === 'string' || payload.orderToken === null) {
        channelOrderTokenRef.current = payload.orderToken;
      }
    } else if (payload.action === 'update') {
      setChannels(prev =>
        prev.map(c => {
          const myId = currentUserRef.current.id;
          const myChannel = activeChannelRef.current;

          if (c.id !== payload.channelId) {
            if (Array.isArray(payload.updates?.members)) {
              const incomingMembers = normalizeMemberKeysToUserIds(
                payload.updates.members as string[],
                allUsersRef.current,
                'presence_channel_update_incoming',
              );
              const filtered = (c.members || []).filter(m => m === myId || !incomingMembers.includes(m));
              if (filtered.length !== (c.members || []).length) {
                return { ...c, members: filtered, userCount: filtered.length };
              }
            }
            return c;
          }

          const updates = { ...payload.updates };
          if (Array.isArray(updates.members)) {
            updates.members = normalizeMemberKeysToUserIds(
              updates.members as string[],
              allUsersRef.current,
              'presence_channel_update_target',
            );
            updates.members = (updates.members as string[]).filter(m => m !== myId);
            if (myChannel === payload.channelId && myId) {
              updates.members = [...updates.members, myId];
            }
            const live = liveVoicePresenceRef.current;
            if (live.channelId === payload.channelId && live.memberIds.size > 0) {
              const currentMembers = c.members || [];
              const incomingMembers = updates.members as string[];
              live.memberIds.forEach(memberId => {
                if (incomingMembers.includes(memberId)) return;
                incomingMembers.push(memberId);
                const event = currentMembers.includes(memberId)
                  ? 'presence_broadcast_remove_blocked_by_livekit'
                  : 'presence_broadcast_member_restored_from_livekit';
                logMemberIdentityDebug(event, { channelId: payload.channelId, memberId }, `${event}:${payload.channelId}:${memberId}`);
              });
            }
            updates.userCount = updates.members.length;
          }
          return { ...c, ...updates };
        }),
      );
    }
  };

  const handleModerationEvent = async (payload: any) => {
    const user = currentUserRef.current;
    const updates = payload?.updates || {};
    const action = payload?.action as string | undefined;
    const isActor = payload?.actorId && payload.actorId === user.id;

    if (payload?.userId === user.id && !isActor) {
      const userFields = {
        ...(updates.isMuted !== undefined && { isMuted: updates.isMuted }),
        ...(updates.isVoiceBanned !== undefined && { isVoiceBanned: updates.isVoiceBanned }),
        ...(updates.muteExpires !== undefined && { muteExpires: updates.muteExpires }),
        ...(updates.banExpires !== undefined && { banExpires: updates.banExpires }),
      };
      if (Object.keys(userFields).length > 0) {
        setCurrentUser(prev => ({ ...prev, ...userFields }));
      }

      const playMod = async () => {
        try {
          const mod = await import('../lib/sounds');
          mod.playSound('moderation');
        } catch { /* sound not critical */ }
      };

      if (action === 'ban' || updates.isVoiceBanned === true) {
        setToastMsg('Sunucuya erişiminiz kaldırıldı');
        setActiveChannel(null);
        void disconnectRef.current();
        window.dispatchEvent(new CustomEvent('mayvox:refresh-server-list'));
        void playMod();
      } else if (action === 'unban' || updates.isVoiceBanned === false) {
        setToastMsg('Ses yasağınız kaldırıldı');
        window.dispatchEvent(new CustomEvent('mayvox:refresh-server-list'));
        void playMod();
      } else if (action === 'mute' || updates.isServerMuted === true) {
        setToastMsg('Bu sunucuda susturuldunuz');
        void playMod();
      } else if (action === 'unmute' || updates.isServerMuted === false) {
        setToastMsg('Susturulmanız kaldırıldı');
        void playMod();
      } else if (action === 'timeout' && updates.timedOutUntil) {
        setTimedOutUntil(updates.timedOutUntil);
        setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'timeout'));
        const { formatRemainingFromIso } = await import('../lib/formatTimeout');
        const remStr = formatRemainingFromIso(updates.timedOutUntil);
        setToastMsg(remStr
          ? `Zamanaşımı cezası aldınız — ${remStr} boyunca konuşamaz ve sohbet odalarına giremezsiniz.`
          : 'Zamanaşımı cezası aldınız — belirli bir süre konuşamaz ve sohbet odalarına giremezsiniz.');
        void playMod();
      } else if (action === 'chat_ban') {
        setChatBannedUntil(updates.chatBannedUntil ?? null);
        setIsChatBanned(true);
        setToastMsg('Bu sunucuda sohbet yasağınız aktif — mesaj yazamazsınız.');
        void playMod();
      } else if (action === 'chat_unban') {
        setChatBannedUntil(null);
        setIsChatBanned(false);
        setToastMsg('Sohbet yasağınız kaldırıldı — tekrar mesaj yazabilirsiniz.');
        void playMod();
      } else if (action === 'clear_timeout' || (action === undefined && updates.timedOutUntil === null)) {
        setTimedOutUntil(null);
        setVoiceDisabledReason(prev => (prev === 'timeout' ? null : prev));
        setToastMsg('Zamanaşımı cezanız kaldırıldı — tekrar konuşabilir ve sohbet odalarına girebilirsiniz.');
        void playMod();
      } else if (action === 'kick') {
        setToastMsg('Sunucudan çıkarıldınız');
        window.dispatchEvent(new CustomEvent('mayvox:refresh-server-list'));
        void playMod();
      } else if (action === 'room_kick') {
        if (!activeChannelRef.current) setToastMsg('Odadan çıkarıldınız');
        void playMod();
      } else if (updates.isMuted === true) {
        setToastMsg('Susturuldunuz');
        void playMod();
      } else if (updates.isMuted === false) {
        setToastMsg('Susturulmanız kaldırıldı');
        void playMod();
      }
    }

    const otherFields = {
      ...(updates.isMuted !== undefined && { isMuted: updates.isMuted }),
      ...(updates.isVoiceBanned !== undefined && { isVoiceBanned: updates.isVoiceBanned }),
      ...(updates.displayName !== undefined && { displayName: updates.displayName }),
      ...(updates.firstName !== undefined && { firstName: updates.firstName }),
      ...(updates.lastName !== undefined && { lastName: updates.lastName }),
      ...(updates.avatar !== undefined && { avatar: updates.avatar }),
      ...(updates.statusText !== undefined && { statusText: updates.statusText }),
      ...(updates.avatarBorderColor !== undefined && { avatarBorderColor: updates.avatarBorderColor }),
    };
    if (Object.keys(otherFields).length > 0) {
      setAllUsers(prev => prev.map(u => (u.id === payload.userId ? { ...u, ...otherFields } : u)));
    }
  };

  useEffect(() => {
    return subscribeRealtimeEvents(event => {
      if (event.type === 'channel-update') {
        handleChannelUpdate(event.payload);
      } else if (event.type === 'channels-reordered') {
        const payload = event.payload || {};
        if (payload?.serverId && payload.serverId !== activeServerIdRef.current) return;
        if (payload?.serverId) void refetchServerChannels(payload.serverId);
        handleChannelUpdate({ ...payload, action: 'reorder', updates: payload.channels ?? payload.updates });
      } else if (event.type === 'moderation-event') {
        void handleModerationEvent(event.payload);
      }
    });
  }, []);

  const startPresence = (user: User, appVersion?: string) => {
    if (onlineSinceRef.current === null) {
      onlineSinceRef.current = Date.now();
    }
    if (appVersion && appVersion !== user.appVersion) {
      updateUserAppVersion(user.id, appVersion).catch(() => {});
    }
  };

  const stopPresence = () => {
    onlineSinceRef.current = null;
  };

  const resyncPresence = () => {
    // Presence online/offline state is now driven by chat-server events.
  };

  return { presenceChannelRef, knownVersionsRef, onlineSinceRef, platformRef, startPresence, stopPresence, resyncPresence };
}
