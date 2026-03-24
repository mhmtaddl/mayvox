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

  const startPresence = (user: User, appVersion?: string) => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
    }

    const channel = supabase.channel('app-presence', {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = channel;

    const applyPresenceState = () => {
      const state = channel.presenceState<{ userId: string; appVersion?: string; selfMuted?: boolean; selfDeafened?: boolean }>();
      const presenceData = Object.values(state).flatMap(s => s);
      const onlineIds = new Set(presenceData.map(p => p.userId));
      const versionMap = new Map(
        presenceData.filter(p => p.appVersion).map(p => [p.userId, p.appVersion!]),
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

      setAllUsers(prev =>
        prev.map(u => {
          const audio = audioMap.get(u.id);
          return {
            ...u,
            appVersion: versionMap.get(u.id) ?? knownVersionsRef.current.get(u.id) ?? u.appVersion,
            status:
              u.id === user.id
                ? 'online'
                : onlineIds.has(u.id)
                  ? 'online'
                  : 'offline',
            statusText:
              u.id === user.id
                ? u.statusText
                : onlineIds.has(u.id)
                  ? u.statusText === 'Çevrimdışı'
                    ? 'Aktif'
                    : u.statusText
                  : 'Çevrimdışı',
            // Apply audio state only if presence data includes it (skip self — local state is authoritative)
            ...(audio !== undefined && u.id !== user.id && {
              selfMuted: audio.selfMuted,
              selfDeafened: audio.selfDeafened,
            }),
          } as User;
        }),
      );
    };

    channel.on('presence', { event: 'sync' }, () => {
      applyPresenceState();
    });
    channel.on('presence', { event: 'join' }, applyPresenceState);
    channel.on('presence', { event: 'leave' }, applyPresenceState);

    channel.on('broadcast', { event: 'invite' }, ({ payload }) => {
      if (payload.inviteeId === user.id) {
        setInvitationModal({
          inviterId: payload.inviterId,
          inviterName: payload.inviterName,
          inviterAvatar: payload.inviterAvatar,
          roomName: payload.roomName,
          roomId: payload.roomId,
        });
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
        setTimeout(() => setToastMsg(null), 4000);
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
        setTimeout(() => setToastMsg(null), 4000);
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
            const myName = currentUserRef.current.name;
            const myChannel = activeChannelRef.current;

            if (c.id !== payload.channelId) {
              // Exclusivity: bir kanal için üye listesi güncellemesi geldiğinde,
              // o kanalda artık olan üyeleri diğer tüm kanallardan temizle.
              // Bu, oda taşıma sırasında "iki odada birden görünme" race condition'ını önler.
              if (Array.isArray(payload.updates?.members)) {
                const incomingMembers = payload.updates.members as string[];
                const filtered = (c.members || []).filter(
                  // Kendi adımızı yalnızca activeChannelRef'e göre yönetiyoruz —
                  // başkasının broadcast'i bizi yanlış yerden silmesin.
                  m => m === myName || !incomingMembers.includes(m),
                );
                if (filtered.length !== (c.members || []).length) {
                  return { ...c, members: filtered, userCount: filtered.length };
                }
              }
              return c;
            }

            const updates = { ...payload.updates };
            if (Array.isArray(updates.members)) {
              // Remove own name then re-add based on actual channel membership.
              // This prevents stale broadcasts causing duplicate member entries.
              updates.members = (updates.members as string[]).filter(
                m => m !== myName,
              );
              if (myChannel === payload.channelId && myName) {
                updates.members = [...updates.members, myName];
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
        await channel.track({ userId: user.id, appVersion: appVersion ?? '' });

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
      presenceChannelRef.current.unsubscribe();
      presenceChannelRef.current = null;
    }
  };

  const resyncPresence = () => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    const state = channel.presenceState<{ userId: string; appVersion?: string }>();
    const presenceData = (Object.values(state).flatMap(s => s)) as { userId: string; appVersion?: string }[];
    const onlineIds = new Set(presenceData.map(p => p.userId));

    // Build merged version map: fresh presenceState takes priority, cache fills the gaps
    // This breaks the race where presenceState() is empty right after subscription.
    const mergedVersionMap = new Map(knownVersionsRef.current);
    presenceData.filter(p => p.appVersion).forEach(p => {
      mergedVersionMap.set(p.userId, p.appVersion!);
      knownVersionsRef.current.set(p.userId, p.appVersion!);
    });

    // Only skip if both live state AND cache are empty (truly no data yet)
    if (onlineIds.size === 0 && mergedVersionMap.size === 0) return;

    setAllUsers(prev =>
      prev.map(u => {
        const cachedVersion = mergedVersionMap.get(u.id);
        if (onlineIds.has(u.id)) {
          return {
            ...u,
            appVersion: cachedVersion ?? u.appVersion,
            status: 'online' as const,
            statusText: u.statusText === 'Çevrimdışı' ? 'Aktif' : u.statusText,
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
  };

  return { presenceChannelRef, knownVersionsRef, startPresence, stopPresence, resyncPresence };
}
