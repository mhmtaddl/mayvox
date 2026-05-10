import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeRealtimeEvents } from '../../../lib/chatService';
import { getPublicDisplayName } from '../../../lib/formatName';
import { listRoomActivityEvents, type RoomActivityEvent } from '../../../lib/serverService';
import type { User } from '../../../types';

export type RoomActivityType =
  | 'join'
  | 'leave'
  | 'chat_lock'
  | 'chat_unlock'
  | 'voice_mute'
  | 'voice_unmute'
  | 'timeout'
  | 'timeout_clear'
  | 'room_kick'
  | 'chat_ban'
  | 'chat_unban'
  | 'message_delete'
  | 'message_edit'
  | 'message_report'
  | 'chat_clear'
  | 'automod'
  | 'settings';

export interface RoomActivityItem {
  id: string;
  type: RoomActivityType;
  roomId: string;
  userId?: string;
  actorId?: string;
  messageId?: string;
  reportCount?: number;
  label: string;
  createdAt: number;
  dedupeKey: string;
}

interface UseRoomActivityLogOptions {
  activeChannel: string | null;
  activeServerId: string | null;
  members: User[];
  allUsers: User[];
  chatMuted: boolean;
  chatMuteEvent?: {
    seq: number;
    muted: boolean;
    actorId?: string;
    actorName?: string;
  } | null;
  chatClearEvent?: {
    seq: number;
    roomId: string;
    actorId?: string;
    actorName?: string;
  } | null;
  automodEvent?: {
    seq: number;
    code?: string;
    userId?: string;
    userName?: string;
    label?: string;
  } | null;
  messageDeleteEvent?: {
    seq: number;
    roomId: string;
    type?: 'message_delete' | 'message_edit';
    actorId?: string;
    actorName?: string;
    targetUserId?: string;
    targetName?: string;
    messageId?: string;
    reportCount?: number;
  } | null;
  messageReportEvent?: {
    seq: number;
    roomId: string;
    actorId?: string;
    actorName?: string;
    targetUserId?: string;
    targetName?: string;
    messageId?: string;
  } | null;
  enabled?: boolean;
}

const MAX_ITEMS = 75;
const DEDUPE_MS = 2_000;
const ROOM_ACTIVITY_TYPES: ReadonlySet<string> = new Set([
  'join',
  'leave',
  'chat_lock',
  'chat_unlock',
  'voice_mute',
  'voice_unmute',
  'timeout',
  'timeout_clear',
  'room_kick',
  'chat_ban',
  'chat_unban',
  'message_delete',
  'message_edit',
  'message_report',
  'chat_clear',
  'automod',
  'settings',
]);

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function userLabel(userId: string | undefined, allUsers: User[]): string {
  if (!userId) return 'Kullanıcı';
  const user = allUsers.find(u => u.id === userId || u.name === userId);
  return user ? getPublicDisplayName(user) : 'Kullanıcı';
}

function moderationType(action: unknown): RoomActivityType | null {
  if (action === 'mute') return 'voice_mute';
  if (action === 'unmute') return 'voice_unmute';
  if (action === 'timeout') return 'timeout';
  if (action === 'clear_timeout') return 'timeout_clear';
  if (action === 'room_kick') return 'room_kick';
  if (action === 'chat_ban') return 'chat_ban';
  if (action === 'chat_unban') return 'chat_unban';
  return null;
}

function moderationLabel(type: RoomActivityType, actor: string, target: string): string {
  if (type === 'voice_mute') return `${actor}, ${target} kullanıcısını susturdu`;
  if (type === 'voice_unmute') return `${actor}, ${target} susturmasını kaldırdı`;
  if (type === 'timeout') return `${actor}, ${target} kullanıcısını zaman aşımına aldı`;
  if (type === 'timeout_clear') return `${actor}, ${target} zaman aşımını kaldırdı`;
  if (type === 'room_kick') return `${actor}, ${target} kullanıcısını odadan çıkardı`;
  if (type === 'chat_ban') return `${actor}, ${target} kullanıcısını sohbetten yasakladı`;
  if (type === 'chat_unban') return `${actor}, ${target} sohbet yasağını kaldırdı`;
  if (type === 'message_delete') return `${actor}, ${target} kullanıcısının mesajını sildi`;
  if (type === 'message_edit') return `${actor}, ${target} kullanıcısının mesajını düzenledi`;
  if (type === 'message_report') return `${actor}, ${target} kullanıcısının mesajını bildirdi`;
  return `${actor}, ${target} için işlem yaptı`;
}

function automodLabel(code: string | undefined, userName: string): string {
  const normalized = (code || '').toLocaleLowerCase('tr-TR');
  if (normalized.includes('flood')) return `Sistem, ${userName} mesajını flood nedeniyle engelledi`;
  if (normalized.includes('profanity') || normalized.includes('küfür') || normalized.includes('kufur')) {
    return `Sistem, ${userName} mesajını küfür filtresiyle engelledi`;
  }
  if (
    normalized.includes('spam') ||
    normalized.includes('repeated') ||
    normalized.includes('mention') ||
    normalized.includes('link') ||
    normalized.includes('caps') ||
    normalized.includes('emoji')
  ) {
    return `Sistem, ${userName} mesajını spam nedeniyle engelledi`;
  }
  return `Sistem, ${userName} mesajını otomatik moderasyonla engelledi`;
}

function isRoomActivityType(type: string): type is RoomActivityType {
  return ROOM_ACTIVITY_TYPES.has(type);
}

function remoteDedupeKey(event: RoomActivityEvent): string {
  return `${event.channelId}:${event.type}:${event.actorId ?? 'system'}:${event.targetUserId ?? 'room'}:${event.createdAt}`;
}

function mapRemoteActivity(event: RoomActivityEvent): RoomActivityItem | null {
  if (!isRoomActivityType(event.type)) return null;
  const createdAt = Date.parse(event.createdAt);
  return {
    id: event.id,
    type: event.type,
    roomId: event.channelId,
    userId: event.targetUserId ?? undefined,
    actorId: event.actorId ?? undefined,
    messageId: typeof event.metadata?.messageId === 'string' ? event.metadata.messageId : undefined,
    reportCount: typeof event.metadata?.reportCount === 'number' ? event.metadata.reportCount : undefined,
    label: event.label,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    dedupeKey: remoteDedupeKey(event),
  };
}

export function useRoomActivityLog({
  activeChannel,
  activeServerId,
  members,
  allUsers,
  chatMuted,
  chatMuteEvent,
  chatClearEvent,
  automodEvent,
  messageDeleteEvent,
  messageReportEvent,
  enabled = true,
}: UseRoomActivityLogOptions) {
  const [activities, setActivities] = useState<RoomActivityItem[]>([]);
  const prevRoomRef = useRef<string | null>(null);
  const prevMembersRef = useRef<Set<string>>(new Set());
  const dedupeRef = useRef<Map<string, number>>(new Map());
  const allUsersRef = useRef(allUsers);
  const activeChannelRef = useRef(activeChannel);
  const activeServerIdRef = useRef(activeServerId);
  const memberIdsRef = useRef<Set<string>>(new Set());
  const prevChatMutedRef = useRef<boolean | null>(null);
  const roomChangedAtRef = useRef(0);
  const handledChatMuteEventRef = useRef(0);
  const handledChatClearEventRef = useRef(0);
  const handledAutomodEventRef = useRef(0);
  const handledMessageDeleteEventRef = useRef(0);
  const handledMessageReportEventRef = useRef(0);

  useEffect(() => { allUsersRef.current = allUsers; }, [allUsers]);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { activeServerIdRef.current = activeServerId; }, [activeServerId]);

  useEffect(() => {
    if (!enabled || !activeServerId || !activeChannel) return undefined;

    let cancelled = false;
    const roomId = activeChannel;
    const serverId = activeServerId;

    listRoomActivityEvents(serverId, roomId, MAX_ITEMS)
      .then(events => {
        if (cancelled || activeChannelRef.current !== roomId || activeServerIdRef.current !== serverId) return;
        const mapped = events.map(mapRemoteActivity).filter((item): item is RoomActivityItem => Boolean(item));
        setActivities(mapped.slice(-MAX_ITEMS));

        const now = Date.now();
        mapped.forEach(item => dedupeRef.current.set(item.dedupeKey, now));
      })
      .catch(err => {
        if (!cancelled) {
          console.warn('[room-activity] geçmiş yüklenemedi:', err instanceof Error ? err.message : err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeChannel, activeServerId, enabled]);

  const clearActivities = useCallback(() => {
    setActivities([]);
    dedupeRef.current.clear();
  }, []);

  const addActivity = useCallback((item: Omit<RoomActivityItem, 'id' | 'createdAt' | 'dedupeKey'> & { dedupeKey?: string }) => {
    const now = Date.now();
    const dedupeKey = item.dedupeKey ?? `${item.roomId}:${item.type}:${item.userId ?? 'room'}`;
    const last = dedupeRef.current.get(dedupeKey);
    if (last && now - last < DEDUPE_MS) return;
    dedupeRef.current.set(dedupeKey, now);
    setActivities(prev => [
      ...prev,
      {
        ...item,
        id: makeId(),
        createdAt: now,
        dedupeKey,
      },
    ].slice(-MAX_ITEMS));
  }, []);

  const actorLabel = useCallback((actorId?: string, actorName?: string) => {
    if (actorName?.trim()) return actorName.trim();
    if (actorId) return userLabel(actorId, allUsersRef.current);
    return 'Bir yetkili';
  }, []);

  useEffect(() => {
    if (!enabled) {
      prevRoomRef.current = null;
      prevMembersRef.current = new Set();
      prevChatMutedRef.current = null;
      memberIdsRef.current = new Set();
      clearActivities();
      return;
    }
    const roomId = activeChannel;
    const nextMembers = new Set(members.map(user => user.id).filter(Boolean));
    memberIdsRef.current = nextMembers;

    if (!roomId) {
      prevRoomRef.current = null;
      prevMembersRef.current = new Set();
      prevChatMutedRef.current = null;
      clearActivities();
      return;
    }

    if (prevRoomRef.current !== roomId) {
      prevRoomRef.current = roomId;
      prevMembersRef.current = nextMembers;
      prevChatMutedRef.current = null;
      roomChangedAtRef.current = Date.now();
      clearActivities();
      return;
    }

    const previous = prevMembersRef.current;
    for (const user of members) {
      if (!previous.has(user.id)) {
        addActivity({
          type: 'join',
          roomId,
          userId: user.id,
          label: `${getPublicDisplayName(user)} odaya katıldı`,
        });
      }
    }
    previous.forEach(userId => {
      if (!nextMembers.has(userId)) {
        addActivity({
          type: 'leave',
          roomId,
          userId,
          label: `${userLabel(userId, allUsersRef.current)} odadan ayrıldı`,
        });
      }
    });
    prevMembersRef.current = nextMembers;
  }, [activeChannel, members, enabled, addActivity, clearActivities]);

  useEffect(() => {
    if (!enabled) {
      prevChatMutedRef.current = null;
      return;
    }
    const roomId = activeChannel;
    if (!roomId) {
      prevChatMutedRef.current = null;
      return;
    }
    if (prevChatMutedRef.current === null || Date.now() - roomChangedAtRef.current < 1_000) {
      prevChatMutedRef.current = chatMuted;
      return;
    }
    if (prevChatMutedRef.current === chatMuted) return;
    prevChatMutedRef.current = chatMuted;
    if (chatMuteEvent && handledChatMuteEventRef.current !== chatMuteEvent.seq && chatMuteEvent.muted === chatMuted) return;
    addActivity({
      type: chatMuted ? 'chat_lock' : 'chat_unlock',
      roomId,
      label: chatMuted ? 'Bir yetkili sohbeti kilitledi' : 'Bir yetkili sohbet kilidini açtı',
    });
  }, [activeChannel, chatMuted, chatMuteEvent, enabled, addActivity]);

  useEffect(() => {
    if (!enabled || !chatMuteEvent || handledChatMuteEventRef.current === chatMuteEvent.seq) return;
    handledChatMuteEventRef.current = chatMuteEvent.seq;
    const roomId = activeChannel;
    if (!roomId || Date.now() - roomChangedAtRef.current < 1_000) return;
    const actor = actorLabel(chatMuteEvent.actorId, chatMuteEvent.actorName);
    addActivity({
      type: chatMuteEvent.muted ? 'chat_lock' : 'chat_unlock',
      roomId,
      actorId: chatMuteEvent.actorId,
      label: chatMuteEvent.muted ? `${actor} sohbeti kilitledi` : `${actor} sohbet kilidini açtı`,
      dedupeKey: `${roomId}:${chatMuteEvent.muted ? 'chat_lock' : 'chat_unlock'}:room`,
    });
  }, [activeChannel, chatMuteEvent, enabled, actorLabel, addActivity]);

  useEffect(() => {
    if (!enabled || !chatClearEvent || handledChatClearEventRef.current === chatClearEvent.seq) return;
    handledChatClearEventRef.current = chatClearEvent.seq;
    const roomId = activeChannel;
    if (!roomId || chatClearEvent.roomId !== roomId) return;
    const actor = actorLabel(chatClearEvent.actorId, chatClearEvent.actorName);
    addActivity({
      type: 'chat_clear',
      roomId,
      actorId: chatClearEvent.actorId,
      label: `${actor} sohbet mesajlarını temizledi`,
      dedupeKey: `${roomId}:chat_clear:room`,
    });
  }, [activeChannel, chatClearEvent, enabled, actorLabel, addActivity]);

  useEffect(() => {
    if (!enabled || !automodEvent || handledAutomodEventRef.current === automodEvent.seq) return;
    handledAutomodEventRef.current = automodEvent.seq;
    const roomId = activeChannel;
    if (!roomId) return;
    const userName = automodEvent.userName || userLabel(automodEvent.userId, allUsersRef.current);
    const label = automodLabel(automodEvent.code, userName);
    addActivity({
      type: 'automod',
      roomId,
      userId: automodEvent.userId,
      label,
      dedupeKey: `${roomId}:automod:${automodEvent.code ?? 'generic'}:${automodEvent.userId ?? 'self'}`,
    });
  }, [activeChannel, automodEvent, enabled, addActivity]);

  useEffect(() => {
    if (!enabled || !messageDeleteEvent || handledMessageDeleteEventRef.current === messageDeleteEvent.seq) return;
    handledMessageDeleteEventRef.current = messageDeleteEvent.seq;
    const roomId = activeChannel;
    if (!roomId || messageDeleteEvent.roomId !== roomId) return;
    const actor = actorLabel(messageDeleteEvent.actorId, messageDeleteEvent.actorName);
    const target = messageDeleteEvent.targetName || userLabel(messageDeleteEvent.targetUserId, allUsersRef.current);
    const type = messageDeleteEvent.type === 'message_edit' ? 'message_edit' : 'message_delete';
    addActivity({
      type,
      roomId,
      userId: messageDeleteEvent.targetUserId,
      actorId: messageDeleteEvent.actorId,
      messageId: messageDeleteEvent.messageId,
      label: moderationLabel(type, actor, target),
      dedupeKey: `${roomId}:${type}:${messageDeleteEvent.actorId ?? 'actor'}:${messageDeleteEvent.targetUserId ?? 'target'}:${messageDeleteEvent.seq}`,
    });
  }, [activeChannel, messageDeleteEvent, enabled, actorLabel, addActivity]);

  useEffect(() => {
    if (!enabled || !messageReportEvent || handledMessageReportEventRef.current === messageReportEvent.seq) return;
    handledMessageReportEventRef.current = messageReportEvent.seq;
    const roomId = activeChannel;
    if (!roomId || messageReportEvent.roomId !== roomId) return;
    const actor = actorLabel(messageReportEvent.actorId, messageReportEvent.actorName);
    const target = messageReportEvent.targetName || userLabel(messageReportEvent.targetUserId, allUsersRef.current);
    addActivity({
      type: 'message_report',
      roomId,
      userId: messageReportEvent.targetUserId,
      actorId: messageReportEvent.actorId,
      messageId: messageReportEvent.messageId,
      reportCount: messageReportEvent.reportCount,
      label: moderationLabel('message_report', actor, target),
      dedupeKey: `${roomId}:message_report:${messageReportEvent.actorId ?? 'actor'}:${messageReportEvent.targetUserId ?? 'target'}:${messageReportEvent.seq}`,
    });
  }, [activeChannel, messageReportEvent, enabled, actorLabel, addActivity]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeRealtimeEvents(event => {
      if (event.type !== 'moderation-event') return;
      const payload = event.payload || {};
      const roomId = activeChannelRef.current;
      if (!roomId) return;
      if (payload.serverId && payload.serverId !== activeServerIdRef.current) return;

      const type = moderationType(payload.action);
      if (!type) return;
      const userId = typeof payload.userId === 'string' ? payload.userId : undefined;
      if (!userId) return;

      const payloadChannelId = typeof payload.channelId === 'string' ? payload.channelId : null;
      if (payloadChannelId && payloadChannelId !== roomId) return;
      if (!payloadChannelId && !memberIdsRef.current.has(userId)) return;

      const actorId = typeof payload.actorId === 'string' ? payload.actorId : undefined;
      const actorName = typeof payload.actorName === 'string' ? payload.actorName : undefined;
      const targetName =
        typeof payload.userName === 'string' ? payload.userName :
        typeof payload.targetName === 'string' ? payload.targetName :
        userLabel(userId, allUsersRef.current);
      const actor = actorLabel(actorId, actorName);
      addActivity({
        type,
        roomId,
        userId,
        actorId,
        label: moderationLabel(type, actor, targetName),
      });
    });
  }, [enabled, addActivity]);

  return { activities, addActivity, clearActivities };
}
