/**
 * useChannelActions — Channel CRUD, invite, kick/move, speaker toggle, password, volume.
 * Join/leave orchestration (LiveKit + presence) App.tsx'te kalır.
 */
import React, { useState, useRef } from 'react';
import { type RemoteParticipant, RemoteAudioTrack } from 'livekit-client';
import { setChannelPassword } from '../../../lib/supabase';
import {
  createServerChannel,
  updateServerChannel,
  deleteServerChannel,
  reorderServerChannels,
  getServerChannels,
  ApiError,
} from '../../../lib/serverService';
import { getPublicDisplayName } from '../../../lib/formatName';
import { applyVolumeToAudioElement, getUserVolumePercent, setUserVolumePercent } from '../../../lib/userVolume';
import { resolveUserByMemberKey } from '../../../lib/memberIdentity';
import { applyLocalChannelOrder } from '../../../lib/channelOrder';
import { applyLocalChannelIconColors, getDefaultChannelIconColor } from '../../../lib/channelIconColor';
import { applyLocalChannelIcons, getDefaultChannelIconName } from '../../../lib/channelIcon';
// Kota enforcement backend'de. Frontend sadece CreateRoomModal'da
// bilgisel sayaç gösterir (calcPersistentRoomsRemaining ChatView'dan çağrılır).
import { INVITE_RING_DURATION_MS } from '../../../lib/sounds';
import type { VoiceChannel, User } from '../../../types';

interface UseChannelActionsOptions {
  channels: VoiceChannel[];
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  activeChannel: string | null;
  setActiveChannel: (v: string | null) => void;
  activeServerId: string;
  /** Aktif sunucunun planı — kullanıcı oda limiti mesajı ve enforcement için. */
  activeServerPlan?: string | null;
  channelOrderTokenRef: React.MutableRefObject<string | null>;
  currentUser: User;
  allUsers: User[];
  presenceChannelRef: React.MutableRefObject<any>;
  livekitRoomRef: React.MutableRefObject<any>;
  // UI
  roomModal: { isOpen: boolean; type: 'create' | 'edit'; channelId?: string; name: string; maxUsers: number; isInviteOnly: boolean; isHidden: boolean; mode: string; iconColor?: string; iconName?: string; isPersistent?: boolean };
  setRoomModal: React.Dispatch<React.SetStateAction<any>>;
  setContextMenu: (v: null) => void;
  setUserActionMenu: (v: { userId: string; x: number; y: number } | null) => void;
  setPasswordModal: (v: { type: 'set' | 'enter'; channelId: string } | null) => void;
  setPasswordInput: (v: string) => void;
  setPasswordRepeatInput: (v: string) => void;
  setPasswordError: (v: boolean) => void;
  setToastMsg: (v: string | null) => void;
  userVolumes: Record<string, number>;
  setUserVolumes: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  view: string;
  setView: (v: string) => void;
}

export function useChannelActions({
  channels, setChannels, activeChannel, setActiveChannel,
  activeServerId, activeServerPlan,
  channelOrderTokenRef,
  currentUser, allUsers,
  presenceChannelRef, livekitRoomRef,
  roomModal, setRoomModal,
  setContextMenu, setUserActionMenu,
  setPasswordModal, setPasswordInput, setPasswordRepeatInput, setPasswordError,
  setToastMsg,
  userVolumes, setUserVolumes,
  view, setView,
}: UseChannelActionsOptions) {

  // ── Invite cooldown + status state ──
  const inviteCooldownsRef = useRef<Record<string, number>>({});
  const [inviteCooldowns, setInviteCooldowns] = useState<Record<string, number>>({});
  const [inviteStatuses, setInviteStatuses] = useState<Record<string, 'pending' | 'accepted' | 'rejected'>>({});

  // ── User volume ──
  const handleUpdateUserVolume = (userId: string, volume: number) => {
    setUserVolumePercent(userId, volume);
    const nextVolume = getUserVolumePercent(userId);
    setUserVolumes(prev => ({ ...prev, [userId]: nextVolume }));

    const vol = Math.max(0, Math.min(1, nextVolume / 100));
    const user = allUsers.find(u => u.id === userId);
    if (livekitRoomRef.current) {
      const participants = Array.from(livekitRoomRef.current.remoteParticipants.values()) as RemoteParticipant[];
      const participant = participants.find(p => (resolveUserByMemberKey(p.identity, allUsers)?.id ?? p.identity) === userId);
      if (participant) {
        participant.audioTrackPublications.forEach(pub => {
          const t = pub.track ?? pub.audioTrack;
          if (t && t instanceof RemoteAudioTrack) t.setVolume(vol);
        });
      }
    }
    const escapedUserId = CSS.escape(userId);
    document
      .querySelectorAll<HTMLAudioElement>(`audio[data-mayvox-user-id="${escapedUserId}"]`)
      .forEach(el => applyVolumeToAudioElement(el, userId));
    if (user) {
      const escapedIdentity = CSS.escape(user.name);
      document
        .querySelectorAll<HTMLAudioElement>(`audio[data-participant="${escapedIdentity}"]`)
        .forEach(el => applyVolumeToAudioElement(el, userId));
    }
  };

  // ── User action menu ──
  const handleUserActionClick = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    if (userId === currentUser.id) return;
    setUserActionMenu({ userId, x: e.clientX, y: e.clientY });
    setContextMenu(null);
  };

  // ── Broadcast speaker toggle ──
  const handleToggleSpeaker = async (userId: string) => {
    if (!activeChannel) return;
    const ch = channels.find(c => c.id === activeChannel);
    if (!ch || ch.mode !== 'broadcast' || ch.ownerId !== currentUser.id) return;

    const currentSpeakers = ch.speakerIds || [];
    const isSpeaker = currentSpeakers.includes(userId);
    if (isSpeaker && userId === ch.ownerId) return;

    const newSpeakers = isSpeaker
      ? currentSpeakers.filter(id => id !== userId)
      : [...currentSpeakers, userId];

    // Konuşmacı listesi — presence broadcast ile sync, DB persistence yok (transient role).
    setChannels(prev => prev.map(c => c.id === activeChannel ? { ...c, speakerIds: newSpeakers } : c));
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', channelId: activeChannel, updates: { speakerIds: newSpeakers } } });
    setToastMsg(isSpeaker ? 'Dinleyiciye alındı.' : 'Konuşmacı yapıldı.');
  };

  // ── Invite ──
  // Caller cancel/timeout için pending invitelerin timeout handle'ı tutulur —
  // cancel tetiklenirse auto-clear timer'ı iptal edilir, race ile state yeniden
  // pending'e dönmesin.
  const invitePendingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleInviteUser = (userId: string, serverContext?: { name?: string; avatar?: string | null }) => {
    const cooldownUntil = inviteCooldownsRef.current[userId];
    if (cooldownUntil && Date.now() < cooldownUntil) return;

    const channel = channels.find(c => c.id === activeChannel);
    if (!channel || !presenceChannelRef.current) return;
    presenceChannelRef.current.send({
      type: 'broadcast', event: 'invite',
      payload: {
        inviterId: currentUser.id, inviteeId: userId,
        inviterName: getPublicDisplayName(currentUser),
        inviterAvatar: currentUser.avatar, roomName: channel.name, roomId: channel.id,
        serverName: serverContext?.name ?? undefined,
        serverAvatar: serverContext?.avatar ?? undefined,
      },
    });
    setInviteStatuses(prev => ({ ...prev, [userId]: 'pending' }));
    // Eski timer varsa temizle (nadir: duplicate davet).
    const oldTimer = invitePendingTimersRef.current[userId];
    if (oldTimer) clearTimeout(oldTimer);
    invitePendingTimersRef.current[userId] = setTimeout(() => {
      setInviteStatuses(prev => { if (prev[userId] !== 'pending') return prev; const next = { ...prev }; delete next[userId]; return next; });
      delete invitePendingTimersRef.current[userId];
    }, INVITE_RING_DURATION_MS);
    setUserActionMenu(null);
  };

  // Caller tarafı iptal — davetlinin modal'ı kapanması için invite-cancelled yollanır.
  // Local state anında temizlenir; cooldown tetiklenmez (kullanıcı vazgeçti, ret değil).
  const handleCancelInvite = (userId: string) => {
    if (inviteStatuses[userId] !== 'pending') return;
    presenceChannelRef.current?.send({
      type: 'broadcast', event: 'invite-cancelled',
      payload: { inviterId: currentUser.id, inviteeId: userId },
    });
    const t = invitePendingTimersRef.current[userId];
    if (t) { clearTimeout(t); delete invitePendingTimersRef.current[userId]; }
    setInviteStatuses(prev => { const next = { ...prev }; delete next[userId]; return next; });
  };

  const handleInviteRejectedCooldown = (inviteeId: string) => {
    setInviteStatuses(prev => ({ ...prev, [inviteeId]: 'rejected' }));
    setTimeout(() => { setInviteStatuses(prev => { const next = { ...prev }; delete next[inviteeId]; return next; }); }, 2_000);
    const expiresAt = Date.now() + 60_000;
    inviteCooldownsRef.current[inviteeId] = expiresAt;
    setInviteCooldowns(prev => ({ ...prev, [inviteeId]: expiresAt }));
    setTimeout(() => { setInviteCooldowns(prev => { const next = { ...prev }; delete next[inviteeId]; return next; }); delete inviteCooldownsRef.current[inviteeId]; }, 60_000);
  };

  const handleInviteAccepted = (inviteeId: string) => {
    setInviteStatuses(prev => ({ ...prev, [inviteeId]: 'accepted' }));
    setTimeout(() => { setInviteStatuses(prev => { const next = { ...prev }; delete next[inviteeId]; return next; }); }, 2_000);
  };

  // ── Kick / Move ──
  // Optimistic UI yok — state yalnızca broadcast/presence sync'ten güncellensin

  const handleKickUser = (userId: string) => {
    if (!currentUser.isAdmin) return;
    if (userId === currentUser.id) return;

    const userToKick = allUsers.find(u => u.id === userId);
    if (!userToKick) return;

    // Sadece event gönder. Local setChannels YAPMA.
    // Kicked user'ın client'ında: kick event → disconnect + leaveRoom
    // Diğer herkes: presence sync ile member listesi güncellenir
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'kick',
      payload: { userId: userToKick.id, userName: userToKick.name },
    });
    setUserActionMenu(null);
  };

  const handleMoveUser = (userName: string, targetChannelId: string) => {
    if (!currentUser.isAdmin) return;
    if (userName === currentUser.name) return;

    const movedUser = allUsers.find(u => u.name === userName);
    if (!movedUser) return;

    const sourceChannel = channels.find(c => c.members?.includes(userName) || c.members?.includes(movedUser.id));
    if (!sourceChannel || sourceChannel.id === targetChannelId) return;

    const targetChannel = channels.find(c => c.id === targetChannelId);
    if (!targetChannel) return;

    // Sadece move event gönder. Local setChannels YAPMA.
    // Hedef user'ın client'ında: move event → disconnect + rejoin(targetChannelId)
    // Diğer herkes: presence sync ile member listesi güncellenir
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'move',
      payload: {
        userId: movedUser.id,
        userName: movedUser.name,
        sourceChannelId: sourceChannel.id,
        targetChannelId,
      },
    });
    setUserActionMenu(null);
  };

  // ── Room CRUD ──
  const handleSaveRoom = async () => {
    const trimmedName = roomModal.name.trim();
    if (!trimmedName) return;
    if (!activeServerId) { setToastMsg('Önce bir sunucu seç.'); return; }

    if (roomModal.type === 'create') {
      // KARAR (2026-04-19): Frontend kota kontrolü kaldırıldı — backend
      // authoritative. Frontend plan resolve'u yanlış olursa (cache/race/null)
      // kullanıcıyı hatalı bloklamasın; backend `assertLimit` gerçek kaynak.
      // CreateRoomModal'daki sayaç bilgisel; kullanıcı tıklayabilir, backend
      // 403 dönerse `err.message` toast'a düşer.
      try {
        // Toggle opt-in: default undefined → false (geçici). User tik attıysa true (kalıcı).
        const isPersistent = roomModal.isPersistent === true;
        console.log('[createRoom-debug] roomModal.isPersistent:', roomModal.isPersistent, '→ sending:', isPersistent);
        const created = await createServerChannel(activeServerId, {
          name: trimmedName,
          mode: roomModal.mode,
          maxUsers: roomModal.maxUsers || null,
          isInviteOnly: roomModal.isInviteOnly,
          isHidden: roomModal.isHidden,
          isPersistent,
          iconColor: roomModal.iconColor ?? getDefaultChannelIconColor(roomModal.mode),
          iconName: roomModal.iconName ?? getDefaultChannelIconName(roomModal.mode),
        });
        console.log('[createRoom-debug] backend returned:', created);
        console.log('[createRoom-debug] backend.isPersistent:', created.isPersistent, '· typeof:', typeof created.isPersistent, '· isDefault:', created.isDefault);
        const iconColor = created.iconColor ?? roomModal.iconColor ?? getDefaultChannelIconColor(roomModal.mode);
        const iconName = created.iconName ?? roomModal.iconName ?? getDefaultChannelIconName(roomModal.mode);
        const newRoom: VoiceChannel = {
          id: created.id, name: created.name, userCount: 0, members: [],
          isSystemChannel: created.isDefault,
          isPersistent: created.isPersistent,
          maxUsers: created.maxUsers ?? undefined,
          isInviteOnly: created.isInviteOnly,
          isHidden: created.isHidden,
          ownerId: created.ownerId ?? undefined,
          mode: created.mode ?? roomModal.mode,
          iconColor,
          iconName,
          speakerIds: roomModal.mode === 'broadcast' ? [currentUser.id] : undefined,
          position: created.position,
        };
        setChannels(prev => prev.some(c => c.id === newRoom.id) ? prev : [...prev, newRoom]);
        presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'create', serverId: activeServerId, channel: newRoom } });
        if (view === 'settings') setView('chat');
      } catch (err) {
        setToastMsg(err instanceof Error ? err.message : 'Oda oluşturulamadı. Lütfen tekrar deneyin.');
        return;
      }
    } else if (roomModal.type === 'edit' && roomModal.channelId) {
      const channelId = roomModal.channelId;
      const iconColor = roomModal.iconColor ?? getDefaultChannelIconColor(roomModal.mode);
      const iconName = roomModal.iconName ?? getDefaultChannelIconName(roomModal.mode);
      const updates = { name: trimmedName, maxUsers: roomModal.maxUsers, isInviteOnly: roomModal.isInviteOnly, isHidden: roomModal.isHidden, mode: roomModal.mode, iconColor, iconName };
      const prevSnapshot = channels;
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, ...updates } : c));
      try {
        await updateServerChannel(activeServerId, channelId, {
          name: trimmedName,
          mode: roomModal.mode,
          maxUsers: roomModal.maxUsers || null,
          isInviteOnly: roomModal.isInviteOnly,
          isHidden: roomModal.isHidden,
          iconColor,
          iconName,
        });
        presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', serverId: activeServerId, channelId, updates } });
      } catch (err) {
        setChannels(prevSnapshot);
        setToastMsg(err instanceof Error ? err.message : 'Oda güncellenemedi.');
        return;
      }
    }
    setRoomModal({ isOpen: false, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social' });
  };

  const handleDeleteRoom = async (id: string) => {
    const channel = channels.find(c => c.id === id);
    if (channel?.isSystemChannel) { setToastMsg('Sistem odaları silinemez.'); return; }
    if (!activeServerId) { setToastMsg('Sunucu bilgisi bulunamadı.'); return; }
    const prevSnapshot = channels;
    const wasActive = activeChannel === id;
    setChannels(prev => prev.filter(c => c.id !== id));
    if (wasActive) setActiveChannel(null);
    setContextMenu(null);
    try {
      await deleteServerChannel(activeServerId, id);
      presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'delete', serverId: activeServerId, channelId: id } });
    } catch (err) {
      setChannels(prevSnapshot);
      if (wasActive) setActiveChannel(id);
      setToastMsg(err instanceof Error ? err.message : 'Oda silinemedi.');
    }
  };

  const handleRenameRoom = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || !activeServerId) { setContextMenu(null); return; }
    const prevSnapshot = channels;
    setChannels(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c));
    setContextMenu(null);
    try {
      await updateServerChannel(activeServerId, id, { name: trimmed });
      presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', serverId: activeServerId, channelId: id, updates: { name: trimmed } } });
    } catch (err) {
      setChannels(prevSnapshot);
      setToastMsg(err instanceof Error ? err.message : 'Oda yeniden adlandırılamadı.');
    }
  };

  // ── Reorder (drag & drop) ──
  const reorderInFlightRef = useRef(false);
  const handleReorderChannels = async (orderedIds: string[]) => {
    if (!activeServerId) return;
    if (reorderInFlightRef.current) return;
    const prevSnapshot = channels;
    const serverIdAtStart = activeServerId;

    const byId = new Map(channels.map(c => [c.id, c]));
    const ordered: VoiceChannel[] = [];
    for (const id of orderedIds) {
      const c = byId.get(id);
      if (c) { ordered.push(c); byId.delete(id); }
    }
    byId.forEach(c => ordered.push(c));

    const updates = ordered.map((c, index) => ({ id: c.id, position: index }));
    const next = ordered.map((c, index) => ({ ...c, position: index }));

    const changed = next.some((c, i) => prevSnapshot[i]?.id !== c.id);
    if (!changed) return;

    setChannels(next);
    reorderInFlightRef.current = true;
    try {
      const token = channelOrderTokenRef.current;
      console.info('[channels:reorder] PATCH /servers/%s/channels/reorder', serverIdAtStart, { updates, expectedOrderToken: token });
      const result = await reorderServerChannels(serverIdAtStart, updates, token);
      channelOrderTokenRef.current = result.orderToken;
      const displayNameMap: Record<string, string> = {
        'Sohbet Muhabbet': 'Genel',
        'Oyun Takımı': 'Oyun',
        'Yayın Sahnesi': 'Yayın',
        'Sessiz Alan': 'Sessiz',
      };
      let authoritative = result;
      try {
        authoritative = await getServerChannels(serverIdAtStart);
      } catch (refetchErr) {
        console.error('[channels:reorder] refetch after PATCH failed; using PATCH response', refetchErr);
      }
      if (activeServerId === serverIdAtStart) {
        channelOrderTokenRef.current = authoritative.orderToken;
        setChannels(prev => {
          const prevMap = new Map<string, VoiceChannel>(prev.map(c => [c.id, c] as const));
          return applyLocalChannelIcons(applyLocalChannelIconColors(applyLocalChannelOrder(serverIdAtStart, authoritative.channels.map(ch => {
            const ex = prevMap.get(ch.id);
            return {
              id: ch.id,
              name: displayNameMap[ch.name] ?? ch.name,
              userCount: ex?.userCount ?? 0,
              members: ex?.members ?? [],
              isSystemChannel: ch.isDefault,
              isPersistent: ch.isPersistent,
              mode: ch.mode ?? ex?.mode ?? 'social',
              maxUsers: ch.maxUsers ?? undefined,
              isInviteOnly: ch.isInviteOnly,
              isHidden: ch.isHidden,
              ownerId: ch.ownerId ?? undefined,
              iconName: ch.iconName ?? undefined,
              iconColor: ch.iconColor ?? undefined,
              position: ch.position,
              speakerIds: ex?.speakerIds,
              password: ex?.password,
            };
          }))));
        });
      }
      const timestamp = Date.now();
      presenceChannelRef.current?.send({
        type: 'broadcast',
        event: 'channel-update',
        payload: { action: 'reorder', serverId: serverIdAtStart, updates, orderToken: result.orderToken, timestamp },
      });
      presenceChannelRef.current?.send({
        type: 'broadcast',
        event: 'channels-reordered',
        payload: { serverId: serverIdAtStart, channels: updates, orderToken: result.orderToken, timestamp },
      });
    } catch (err) {
      console.error('[channels:reorder] PATCH failed', err);
      setChannels(prevSnapshot);
      if (err instanceof ApiError && err.status === 409) {
        // Stale ordering → fresh data çek, token'ı yenile.
        setToastMsg('Kanal sırası başka bir yönetici tarafından değiştirildi. Liste yenilendi.');
        try {
          const fresh = await getServerChannels(serverIdAtStart);
          if (activeServerId === serverIdAtStart) {
            channelOrderTokenRef.current = fresh.orderToken;
            const displayNameMap: Record<string, string> = {
              'Sohbet Muhabbet': 'Genel',
              'Oyun Takımı': 'Oyun',
              'Yayın Sahnesi': 'Yayın',
              'Sessiz Alan': 'Sessiz',
            };
            setChannels(prev => {
              const prevMap = new Map<string, VoiceChannel>(prev.map(c => [c.id, c] as const));
              return applyLocalChannelIcons(applyLocalChannelIconColors(applyLocalChannelOrder(serverIdAtStart, fresh.channels.map(ch => {
                const ex = prevMap.get(ch.id);
                return {
                  id: ch.id,
                  name: displayNameMap[ch.name] ?? ch.name,
                  userCount: ex?.userCount ?? 0,
                  members: ex?.members ?? [],
                  isSystemChannel: ch.isDefault,
                  isPersistent: ch.isPersistent,
                  mode: ch.mode ?? ex?.mode ?? 'social',
                  maxUsers: ch.maxUsers ?? undefined,
                  isInviteOnly: ch.isInviteOnly,
                  isHidden: ch.isHidden,
                  ownerId: ch.ownerId ?? undefined,
                  iconName: ch.iconName ?? undefined,
                  iconColor: ch.iconColor ?? undefined,
                  position: ch.position,
                  speakerIds: ex?.speakerIds,
                  password: ex?.password,
                };
              }))));
            });
          }
        } catch { /* refetch hata verirse toast zaten atıldı */ }
      } else {
        setToastMsg(err instanceof Error ? err.message : 'Sıralama kaydedilemedi');
      }
    } finally {
      reorderInFlightRef.current = false;
    }
  };

  // ── Password ──
  const handleSetPassword = async (id: string, password: string, repeat: string) => {
    if (password.length !== 4 || isNaN(Number(password))) { setPasswordError(true); return; }
    if (password !== repeat) { setPasswordError(true); return; }
    const { error } = await setChannelPassword(id, password);
    if (error) { console.error('Şifre kaydetme hatası:', error); setToastMsg('Şifre kaydedilemedi. Lütfen tekrar deneyin.'); return; }
    setChannels(prev => prev.map(c => c.id === id ? { ...c, password: 'SET' } : c));
    setPasswordModal(null); setPasswordInput(''); setPasswordRepeatInput(''); setPasswordError(false); setContextMenu(null);
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', channelId: id, updates: { password: 'SET' } } });
  };

  const handleRemovePassword = async (id: string) => {
    await setChannelPassword(id, null);
    setChannels(prev => prev.map(c => c.id === id ? { ...c, password: undefined } : c));
    setContextMenu(null);
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', channelId: id, updates: { password: undefined } } });
  };

  // ── Context menu ──
  const handleContextMenu = (e: React.MouseEvent, channelId: string) => {
    if (!currentUser.isAdmin) return;
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, channelId } as any);
  };

  return {
    // Invite state (hook owns)
    inviteCooldowns,
    inviteStatuses,
    handleInviteRejectedCooldown,
    handleInviteAccepted,
    // Handlers
    handleUpdateUserVolume,
    handleUserActionClick,
    handleToggleSpeaker,
    handleInviteUser,
    handleCancelInvite,
    handleKickUser,
    handleMoveUser,
    handleSaveRoom,
    handleDeleteRoom,
    handleRenameRoom,
    handleReorderChannels,
    handleSetPassword,
    handleRemovePassword,
    handleContextMenu,
  };
}
