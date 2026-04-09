import { useRef } from 'react';
import type React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, updateUserAppVersion } from '../lib/supabase';
import type { User, VoiceChannel } from '../types';

interface Props {
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  disconnectFromLiveKit: () => Promise<void>;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  setToastMsg: (v: string | null) => void;
  setInvitationModal: (
    v: {
      inviterId: string;
      inviterName: string;
      inviterAvatar?: string;
      roomName: string;
      roomId: string;
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
  disconnectFromLiveKit,
  setAllUsers,
  setCurrentUser,
  setChannels,
  setActiveChannel,
  setToastMsg,
  setInvitationModal,
  onMoved,
  onPasswordResetUpdate,
  onInviteRejected,
  onInviteAccepted,
}: Props) {
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  // Persistent cross-render cache: userId → appVersion
  // Populated by every presence sync/join event so resyncPresence can fall back to it
  // even when presenceState() hasn't populated yet (race condition fix).
  const knownVersionsRef = useRef<Map<string, string>>(new Map());

  // Use a ref so the kick handler always calls the latest disconnectFromLiveKit
  const disconnectRef = useRef(disconnectFromLiveKit);
  disconnectRef.current = disconnectFromLiveKit;

  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;

  const onPasswordResetUpdateRef = useRef(onPasswordResetUpdate);
  onPasswordResetUpdateRef.current = onPasswordResetUpdate;

  const onInviteRejectedRef = useRef(onInviteRejected);
  onInviteRejectedRef.current = onInviteRejected;

  const onInviteAcceptedRef = useRef(onInviteAccepted);
  onInviteAcceptedRef.current = onInviteAccepted;

  // ── Presence-derived room membership sync ────────────────────────────────
  // Broadcast'ler anlık güncelleme sağlar ama fire-and-forget'tir.
  // Yeni bağlanan veya broadcast'i kaçıran client'lar için presence
  // state'inden oda üyeliklerini türetiyoruz — bu stateful ve güvenilir.
  const syncRoomMembersFromPresence = (
    presenceData: Array<{ currentRoom?: string; userId?: string }>,
  ) => {
    const roomMembers = new Map<string, string[]>();
    for (const p of presenceData) {
      if (p.currentRoom && p.userId) {
        const list = roomMembers.get(p.currentRoom) || [];
        if (!list.includes(p.userId)) list.push(p.userId);
        roomMembers.set(p.currentRoom, list);
      }
    }

    const myId = currentUserRef.current.id;
    const myChannel = activeChannelRef.current;

    setChannels(prev => {
      let hasChanges = false;
      const next = prev.map(c => {
        const presenceMembers = roomMembers.get(c.id) || [];
        let members = [...presenceMembers];
        // Self: local ref is more up-to-date than presence propagation
        if (myChannel === c.id && myId && !members.includes(myId)) {
          members.push(myId);
        }
        if (myChannel !== c.id && myId) {
          members = members.filter(m => m !== myId);
        }
        const currentMembers = c.members || [];
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

  const startPresence = (user: User, appVersion?: string) => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.untrack();
      presenceChannelRef.current.unsubscribe();
      presenceChannelRef.current = null;
    }

    const channel = supabase.channel('app-presence', {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = channel;

    const applyPresenceState = () => {
      const state = channel.presenceState<{ userId: string; appVersion?: string; selfMuted?: boolean; selfDeafened?: boolean; currentRoom?: string; userName?: string; platform?: string; onlineSince?: number; autoStatus?: string }>();
      const presenceData = Object.values(state).flatMap(s => s);
      const onlineIds = new Set(presenceData.map(p => p.userId));
      const versionMap = new Map(
        presenceData.filter(p => p.appVersion).map(p => [p.userId, p.appVersion!]),
      );

      // onlineSince: her kullanıcı kendi oturum başlangıç zamanını yayınlar
      const onlineSinceMap = new Map(
        presenceData.filter(p => p.onlineSince).map(p => [p.userId, p.onlineSince!]),
      );

      // Persist to cross-render cache so resyncPresence can use it even if
      // presenceState() is empty at call time (race condition fix).
      versionMap.forEach((v, id) => knownVersionsRef.current.set(id, v));

      // Audio state map: selfMuted / selfDeafened from presence track.
      // This provides initial hydrate for new joiners who haven't received a speaking broadcast yet.
      const audioMap = new Map(
        presenceData
          .filter(p => p.selfMuted !== undefined || p.selfDeafened !== undefined)
          .map(p => [p.userId, { selfMuted: p.selfMuted, selfDeafened: p.selfDeafened }]),
      );

      // Platform bilgisi: mobile / desktop
      const platformMap = new Map(
        presenceData.filter(p => p.platform).map(p => [p.userId, p.platform as 'mobile' | 'desktop']),
      );

      // Auto-presence durumu: active/idle/deafened → Türkçe statusText
      const autoStatusMap = new Map(
        presenceData.filter(p => p.autoStatus).map(p => [p.userId, p.autoStatus!]),
      );

      setAllUsers(prev =>
        prev.map(u => {
          const audio = audioMap.get(u.id);
          const wasOnline = u.status === 'online';
          const willBeOnline = u.id === user.id || onlineIds.has(u.id);
          const nextOnlineSince = willBeOnline
            ? (onlineSinceMap.get(u.id) ?? u.onlineSince)
            : undefined;
          if (willBeOnline && nextOnlineSince !== u.onlineSince) {
            console.log('[usePresence] merge_user userId=' + u.id + ' previousOnlineSince=' + u.onlineSince + ' nextOnlineSince=' + nextOnlineSince);
          }
          return {
            ...u,
            appVersion: versionMap.get(u.id) ?? knownVersionsRef.current.get(u.id) ?? u.appVersion,
            platform: platformMap.get(u.id) ?? u.platform,
            status: willBeOnline ? 'online' : 'offline',
            statusText: (() => {
              if (u.id === user.id) return u.statusText;
              if (!willBeOnline) return 'Çevrimdışı';
              // Sabit durum varsa koru (AFK vb.)
              const current = u.statusText === 'Çevrimdışı' ? 'Aktif' : (u.statusText || 'Aktif');
              // Auto-presence: sadece manuel durum yoksa otomatik durumu uygula
              const autoSt = autoStatusMap.get(u.id);
              if (autoSt && (current === 'Aktif' || current === 'Pasif' || current === 'Duymuyor')) {
                if (autoSt === 'idle') return 'Pasif';
                if (autoSt === 'deafened') return 'Duymuyor';
                return 'Aktif';
              }
              return current;
            })(),
            // Auto-presence: remote kullanıcıların otomatik durumu (self hariç — local state yetkili)
            ...(u.id !== user.id && autoStatusMap.has(u.id) && {
              autoStatus: autoStatusMap.get(u.id) as 'active' | 'idle' | 'deafened',
            }),
            // onlineSince: presence payload'dan — her kullanıcının kendi oturum başlangıcı
            onlineSince: nextOnlineSince,
            // Kullanıcı online'dan offline'a geçti: lastSeenAt güncelle (yaklaşım)
            lastSeenAt: !willBeOnline && wasOnline
              ? new Date().toISOString()
              : u.lastSeenAt,
            // Apply audio state only if presence data includes it (skip self — local state is authoritative)
            ...(audio !== undefined && u.id !== user.id && {
              selfMuted: audio.selfMuted,
              selfDeafened: audio.selfDeafened,
            }),
          } as User;
        }),
      );

      // Room membership from presence state (reliable fallback for missed broadcasts)
      syncRoomMembersFromPresence(presenceData);
    };

    channel.on('presence', { event: 'sync' }, () => {
      applyPresenceState();
    });
    channel.on('presence', { event: 'join' }, applyPresenceState);
    channel.on('presence', { event: 'leave' }, applyPresenceState);

    channel.on('broadcast', { event: 'invite' }, ({ payload }) => {
      if (payload.inviteeId === user.id) {
        console.log('[usePresence] invite_received from:', payload.inviterName, 'room:', payload.roomName);
        setInvitationModal({
          inviterId: payload.inviterId,
          inviterName: payload.inviterName,
          inviterAvatar: payload.inviterAvatar,
          roomName: payload.roomName,
          roomId: payload.roomId,
        });
        console.log('[usePresence] invitation_modal_set');
        // Mobilde yerel bildirim — arka planda/kilitli ekranda da görünsün
        import('../lib/notifications').then(m => m.showInviteNotification(payload.inviterName, payload.roomName, payload.roomId)).catch(() => {});
      }
    });

    channel.on('broadcast', { event: 'invite-accepted' }, ({ payload }) => {
      if (payload.inviterId === user.id && payload.inviteeId) {
        onInviteAcceptedRef.current?.(payload.inviteeId);
      }
    });

    channel.on('broadcast', { event: 'invite-rejected' }, ({ payload }) => {
      if (payload.inviterId === user.id) {
        setToastMsg(`${payload.inviteeName} davetinize icabet etmedi.`);
        // auto-dismiss dock useEffect'te yönetiliyor
        if (payload.inviteeId) {
          onInviteRejectedRef.current?.(payload.inviteeId);
        }
      }
    });

    channel.on('broadcast', { event: 'kick' }, ({ payload }) => {
      if (payload.userId === user.id) {
        setActiveChannel(null);
        disconnectRef.current();
        setToastMsg('Odadan çıkarıldınız.');
        // auto-dismiss dock useEffect'te yönetiliyor
      }
    });

    channel.on('broadcast', { event: 'speaking' }, ({ payload }) => {
      if (payload.userId === user.id) return;
      setAllUsers(prev =>
        prev.map(u =>
          u.id === payload.userId
            ? {
                ...u,
                isSpeaking: payload.isSpeaking,
                // selfMuted / selfDeafened: kullanıcının kendi audio toggle'ı
                // undefined gelirse mevcut değeri koru (backward compat)
                ...(payload.selfMuted    !== undefined && { selfMuted:    payload.selfMuted }),
                ...(payload.selfDeafened !== undefined && { selfDeafened: payload.selfDeafened }),
              }
            : u,
        ),
      );
    });

    channel.on('broadcast', { event: 'moderation' }, ({ payload }) => {
      if (payload.userId === user.id) {
        setCurrentUser(prev => ({ ...prev, ...payload.updates }));
        // Ban geldiğinde aktif sesli kanaldan çıkar
        if (payload.updates.isVoiceBanned === true) {
          setActiveChannel(null);
          disconnectRef.current();
        }
      }
      setAllUsers(prev =>
        prev.map(u =>
          u.id === payload.userId ? { ...u, ...payload.updates } : u,
        ),
      );
    });

    channel.on('broadcast', { event: 'password-reset-update' }, ({ payload }) => {
      onPasswordResetUpdateRef.current?.(payload.userId);
    });

    channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload.userId !== user.id) return;
      // Ref'i hemen sıfırla — React render'ı beklemeden.
      // Aksi hâlde bu noktadan sonra gelen channel-update broadcast'leri
      // activeChannelRef.current'ı stale (eski oda) olarak okur ve
      // kullanıcıyı zaten terk ettiği odaya yeniden ekler (çift oda bug'ı).
      activeChannelRef.current = null;
      setActiveChannel(null);
      disconnectRef.current().then(() => {
        onMovedRef.current(payload.targetChannelId);
      });
    });

    channel.on('broadcast', { event: 'channel-update' }, ({ payload }) => {
      if (payload.action === 'create') {
        setChannels(prev =>
          prev.find(c => c.id === payload.channel.id)
            ? prev
            : [...prev, payload.channel],
        );
      } else if (payload.action === 'delete') {
        setChannels(prev => prev.filter(c => c.id !== payload.channelId));
        setActiveChannel(prev =>
          prev === payload.channelId ? null : prev,
        );
      } else if (payload.action === 'update') {
        setChannels(prev =>
          prev.map(c => {
            const myId = currentUserRef.current.id;
            const myChannel = activeChannelRef.current;

            if (c.id !== payload.channelId) {
              // Exclusivity: bir kanal için üye listesi güncellemesi geldiğinde,
              // o kanalda artık olan üyeleri diğer tüm kanallardan temizle.
              // Bu, oda taşıma sırasında "iki odada birden görünme" race condition'ını önler.
              if (Array.isArray(payload.updates?.members)) {
                const incomingMembers = payload.updates.members as string[];
                const filtered = (c.members || []).filter(
                  // Kendi ID'mizi yalnızca activeChannelRef'e göre yönetiyoruz —
                  // başkasının broadcast'i bizi yanlış yerden silmesin.
                  m => m === myId || !incomingMembers.includes(m),
                );
                if (filtered.length !== (c.members || []).length) {
                  return { ...c, members: filtered, userCount: filtered.length };
                }
              }
              return c;
            }

            const updates = { ...payload.updates };
            if (Array.isArray(updates.members)) {
              // Remove own ID then re-add based on actual channel membership.
              // This prevents stale broadcasts causing duplicate member entries.
              updates.members = (updates.members as string[]).filter(
                m => m !== myId,
              );
              if (myChannel === payload.channelId && myId) {
                updates.members = [...updates.members, myId];
              }
              updates.userCount = updates.members.length;
            }
            return { ...c, ...updates };
          }),
        );
      }
    });

    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        const isMobilePlatform = !!(window as any).Capacitor?.isNativePlatform?.() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const onlineSince = Date.now();
        console.log('[usePresence] track_payload onlineSince=' + onlineSince);
        await channel.track({ userId: user.id, appVersion: appVersion ?? '', userName: user.name, currentRoom: activeChannelRef.current || undefined, platform: isMobilePlatform ? 'mobile' : 'desktop', onlineSince, autoStatus: 'active' });

        // Kendi versiyonumuzu DB'ye kaydet — kullanıcı offline olsa bile
        // son bilinen sürüm SettingsView'de görünmeye devam eder.
        // user.appVersion = DB'deki mevcut değer; aynıysa gereksiz write atla.
        if (appVersion && appVersion !== user.appVersion) {
          updateUserAppVersion(user.id, appVersion).catch(() => {});
        }

        // ── Initial hydrate ───────────────────────────────────────────────
        // Supabase Realtime'da 'sync' eventi SUBSCRIBED'dan önce veya sonra
        // gelebilir. track() tamamlandıktan sonra presenceState() zaten
        // dolu olmalı; burada manuel okuyarak hemen uyguluyoruz.
        applyPresenceState();

        // Fallback hydrate: yavaş ağ koşullarında presenceState track()
        // sonrasında hâlâ boş gelebilir (Phoenix kanalı sync gecikmesi).
        // 300ms sonra tekrar uygula — o zaman kesinlikle dolu olur.
        setTimeout(applyPresenceState, 300);
      }
    });
  };

  const stopPresence = () => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.untrack();
      presenceChannelRef.current.unsubscribe();
      presenceChannelRef.current = null;
    }
  };

  const resyncPresence = () => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    const state = channel.presenceState<{ userId: string; appVersion?: string; currentRoom?: string; userName?: string; onlineSince?: number; autoStatus?: string }>();
    const presenceData = (Object.values(state).flatMap(s => s)) as { userId: string; appVersion?: string; currentRoom?: string; userName?: string; onlineSince?: number; autoStatus?: string }[];
    const onlineIds = new Set(presenceData.map(p => p.userId));

    // Build merged version map: fresh presenceState takes priority, cache fills the gaps
    // This breaks the race where presenceState() is empty right after subscription.
    const mergedVersionMap = new Map(knownVersionsRef.current);
    presenceData.filter(p => p.appVersion).forEach(p => {
      mergedVersionMap.set(p.userId, p.appVersion!);
      knownVersionsRef.current.set(p.userId, p.appVersion!);
    });

    // onlineSince from presence payload
    const onlineSinceMap = new Map(
      presenceData.filter(p => p.onlineSince).map(p => [p.userId, p.onlineSince!]),
    );

    // Only skip if both live state AND cache are empty (truly no data yet)
    if (onlineIds.size === 0 && mergedVersionMap.size === 0) return;

    // Auto-presence durumu
    const autoStatusMap = new Map(
      presenceData.filter(p => p.autoStatus).map(p => [p.userId, p.autoStatus!]),
    );

    setAllUsers(prev =>
      prev.map(u => {
        const cachedVersion = mergedVersionMap.get(u.id);
        if (onlineIds.has(u.id)) {
          const currentStatusText = u.statusText === 'Çevrimdışı' ? 'Aktif' : (u.statusText || 'Aktif');
          const autoSt = autoStatusMap.get(u.id);
          let resolvedStatusText = currentStatusText;
          if (autoSt && (currentStatusText === 'Aktif' || currentStatusText === 'Pasif' || currentStatusText === 'Duymuyor')) {
            resolvedStatusText = autoSt === 'idle' ? 'Pasif' : autoSt === 'deafened' ? 'Duymuyor' : 'Aktif';
          }
          return {
            ...u,
            appVersion: cachedVersion ?? u.appVersion,
            status: 'online' as const,
            statusText: resolvedStatusText,
            onlineSince: onlineSinceMap.get(u.id) ?? u.onlineSince,
            ...(autoSt && { autoStatus: autoSt as 'active' | 'idle' | 'deafened' }),
          };
        }
        // Even if not in live onlineIds, apply cached version if available
        // (prevents version from disappearing during brief presence gaps)
        if (cachedVersion && cachedVersion !== u.appVersion) {
          return { ...u, appVersion: cachedVersion };
        }
        return u;
      }),
    );

    // Room membership from presence state (reliable fallback for missed broadcasts)
    syncRoomMembersFromPresence(presenceData);
  };

  return { presenceChannelRef, knownVersionsRef, startPresence, stopPresence, resyncPresence };
}
