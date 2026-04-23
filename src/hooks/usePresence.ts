import { useRef } from 'react';
import type React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, updateUserAppVersion } from '../lib/supabase';
import type { User, VoiceChannel } from '../types';

interface Props {
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  /** Kullanıcının aktif olarak gezdiği sunucu ID'si — presence payload'ına her track'te eklenir. */
  activeServerIdRef: React.MutableRefObject<string>;
  /** Kanal sırası token'ı — reorder broadcast'ı geldiğinde remote token ile senkron tut. */
  channelOrderTokenRef: React.MutableRefObject<string | null>;
  disconnectFromLiveKit: () => Promise<void>;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  setToastMsg: (v: string | null) => void;
  /** Moderation broadcast'tan gelen timedOutUntil değerini App.tsx state'ine yansıtır. */
  setTimedOutUntil: (v: string | null) => void;
  /** Moderation broadcast'tan gelen chatBannedUntil değerini App.tsx state'ine yansıtır. */
  setChatBannedUntil: (v: string | null) => void;
  /** Chat ban aktif mi (süresiz ise until null olsa bile true). */
  setIsChatBanned: (v: boolean) => void;
  /**
   * Moderation broadcast `clear_timeout` / `timeout` anında voiceDisabledReason'ı doğrudan
   * temizlemek/set etmek için. Aksi halde App.tsx expire watcher'ı beklemek gerekirdi.
   */
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
  disconnectFromLiveKit,
  setAllUsers,
  setCurrentUser,
  setChannels,
  setActiveChannel,
  setToastMsg,
  setTimedOutUntil,
  setChatBannedUntil,
  setIsChatBanned,
  setVoiceDisabledReason,
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

  // onlineSince: session başlangıç zamanı — tek sefer subscribe anında set edilir,
  // SONRAKİ TÜM track() çağrılarına dahil edilmeli. Supabase track() tam replace
  // yapar, bu değeri dışarıda kaybeden track çağrıları observer'ların timer'ını
  // sıfırlar. Bu ref'i App.tsx'teki trackPresence çağrıları da kullanır.
  const onlineSinceRef = useRef<number | null>(null);

  // platform: Kullanıcının cihaz tipi (desktop/mobile) — onlineSince ile aynı
  // gerekçe: track() replace yaptığı için her çağrıda dahil edilmeli, yoksa
  // observer'da platform chip kaybolur.
  // EAGER init: SUBSCRIBED handler'dan önce fire olan track() çağrıları
  // (auto-status/mute/deafen race'leri) null/undefined basarsa platform presence
  // state'inden düşer. Bu yüzden hook mount anında synchronously set ediliyor.
  const platformRef = useRef<'mobile' | 'desktop'>(
    (() => {
      const isMobile =
        !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
          .Capacitor?.isNativePlatform?.() ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      return isMobile ? 'mobile' : 'desktop';
    })(),
  );

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
    presenceData: Array<{ currentRoom?: string; userId?: string; serverId?: string }>,
  ) => {
    // Server-level izolasyon: sadece aktif sunucudaki kullanıcıları bu sunucunun
    // kanal member listelerine dağıt. Channel ID'leri UUID olduğu için normalde
    // çakışma olmaz — ama server filtresi defense-in-depth ve yanlış popülasyonu
    // (başka sunucudan gelen üye yabancı kanala düşmez) engeller.
    const myServerId = activeServerIdRef.current;
    const roomMembers = new Map<string, string[]>();
    for (const p of presenceData) {
      if (!p.currentRoom || !p.userId) continue;
      // Eğer aktif sunucu belirli ise ve presence'ta serverId farklı ise atla.
      // serverId tanımsızsa (eski client) esnek davran — dahil et.
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
      const state = channel.presenceState<{ userId: string; appVersion?: string; selfMuted?: boolean; selfDeafened?: boolean; currentRoom?: string; userName?: string; platform?: string; onlineSince?: number; autoStatus?: string; serverId?: string; statusText?: string; gameActivity?: string }>();
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

      // Payload-level manuel statusText (Çevrimdışı/Rahatsız Etmeyin/AFK/Online).
      // Presence payload'da taşındığı için broadcast-miss/resubscribe durumunda
      // bile tutarlı — SOR local state yerine presence authoritative.
      const payloadStatusMap = new Map(
        presenceData.filter(p => p.statusText).map(p => [p.userId, p.statusText!]),
      );

      // Kullanıcının aktif sunucu ID'si — server-level izolasyon için
      const serverIdMap = new Map(
        presenceData.filter(p => p.serverId).map(p => [p.userId, p.serverId!]),
      );

      // Oyun aktivitesi — opt-in, sadece whitelist eşleşmesi olan kullanıcılarda dolu
      const gameActivityMap = new Map(
        presenceData.filter(p => p.gameActivity).map(p => [p.userId, p.gameActivity!]),
      );

      setAllUsers(prev =>
        prev.map(u => {
          const audio = audioMap.get(u.id);
          // NOT: u.status ve u.lastSeenAt artık useBackendPresence tarafından
          // yönetiliyor (chat-server authoritative). Burada dokunmuyoruz.
          const willBeOnline = u.id === user.id || onlineIds.has(u.id);
          const nextOnlineSince = willBeOnline
            ? (onlineSinceMap.get(u.id) ?? u.onlineSince)
            : undefined;
          return {
            ...u,
            appVersion: versionMap.get(u.id) ?? knownVersionsRef.current.get(u.id) ?? u.appVersion,
            platform: platformMap.get(u.id) ?? u.platform,
            serverId: serverIdMap.get(u.id) ?? u.serverId,
            gameActivity: u.id === user.id
              ? u.gameActivity // self: App.tsx state authoritative
              : (gameActivityMap.get(u.id) ?? undefined), // others: presence authoritative, yoksa clear
            statusText: (() => {
              if (u.id === user.id) return u.statusText;
              // willBeOnline false ise presence'ta yok — status text korunur (backend
              // zaten u.status'u offline'a çekecek). Online path'te payload authoritative.
              if (!willBeOnline) return u.statusText;
              const payloadStatus = payloadStatusMap.get(u.id);
              const baseText = payloadStatus ?? u.statusText;
              const raw = baseText === 'Aktif' ? 'Online' : (baseText || 'Online');
              const current = raw;
              const autoSt = autoStatusMap.get(u.id);
              if (autoSt && (current === 'Online' || current === 'Pasif' || current === 'Duymuyor')) {
                if (autoSt === 'idle') return 'Pasif';
                if (autoSt === 'deafened') return 'Duymuyor';
                return 'Online';
              }
              return current;
            })(),
            ...(u.id !== user.id && autoStatusMap.has(u.id) && {
              autoStatus: autoStatusMap.get(u.id) as 'active' | 'idle' | 'deafened',
            }),
            onlineSince: nextOnlineSince,
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
          serverName: payload.serverName,
          serverAvatar: payload.serverAvatar ?? null,
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

    // Caller vazgeçtiğinde callee tarafının modal'ı anında kapanır.
    // Ringtone durur, missed-call push EDİLMEZ (kullanıcı cevapsız değil, iptal).
    channel.on('broadcast', { event: 'invite-cancelled' }, ({ payload }) => {
      if (payload.inviteeId === user.id) {
        import('../lib/sounds').then(m => m.stopInviteRingtone()).catch(() => {});
        setInvitationModal(null);
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
        activeChannelRef.current = null;
        setActiveChannel(null);
        disconnectRef.current();
        // Chat bağlantısını da kes
        import('../lib/chatService').then(({ leaveRoom }) => leaveRoom());
        setToastMsg('Odadan çıkarıldınız.');
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

    channel.on('broadcast', { event: 'moderation' }, async ({ payload }) => {
      // Defensive: payload shape backend broadcastModeration ile aynı.
      const updates = payload.updates || {};
      const action = payload.action as string | undefined;

      // Moderator/admin/owner kendi uyguladığı aksiyonu geri alıyor → toast/ses YOK.
      // Kullanıcı isteği: sunucu sahibine/admine/moderatöre kendi aksiyonlarında bildirim/ses çıkmasın.
      // Hedef UI sync için allUsers merge işlemini yine yapıyoruz (badge güncellemesi için).
      const isActor = payload.actorId && payload.actorId === user.id;

      if (payload.userId === user.id && !isActor) {
        // User tipine yansıtılabilen alanları setCurrentUser'a merge et.
        // timedOutUntil User tipinde değil — ayrı setTimedOutUntil ile yansıtılıyor.
        const userFields = {
          ...(updates.isMuted !== undefined && { isMuted: updates.isMuted }),
          ...(updates.isVoiceBanned !== undefined && { isVoiceBanned: updates.isVoiceBanned }),
          ...(updates.muteExpires !== undefined && { muteExpires: updates.muteExpires }),
          ...(updates.banExpires !== undefined && { banExpires: updates.banExpires }),
        };
        if (Object.keys(userFields).length > 0) {
          setCurrentUser(prev => ({ ...prev, ...userFields }));
        }

        // Action bazlı anlık toast + sound. Sound her action için tek kez çalar.
        const playMod = async () => {
          try {
            const mod = await import('../lib/sounds');
            mod.playSound('moderation');
          } catch { /* sound not critical */ }
        };

        if (action === 'ban' || updates.isVoiceBanned === true) {
          setToastMsg('Sunucuya erişiminiz kaldırıldı');
          setActiveChannel(null);
          disconnectRef.current();
          window.dispatchEvent(new CustomEvent('mayvox:refresh-server-list'));
          void playMod();
        } else if (action === 'unban' || updates.isVoiceBanned === false) {
          setToastMsg('Ses yasağınız kaldırıldı');
          window.dispatchEvent(new CustomEvent('mayvox:refresh-server-list'));
          void playMod();
        } else if (action === 'mute' || updates.isServerMuted === true) {
          // Sunucu-seviyesi mute (server_members.voice_muted_by). Sistem mute (users.is_muted)
          // ile karıştırma — ikisi de toast atar ama kaynak farklı.
          setToastMsg('Bu sunucuda susturuldunuz');
          void playMod();
        } else if (action === 'unmute' || updates.isServerMuted === false) {
          setToastMsg('Susturulmanız kaldırıldı');
          void playMod();
        } else if (action === 'timeout' && updates.timedOutUntil) {
          setTimedOutUntil(updates.timedOutUntil);
          // voiceDisabledReason anlık set — App.tsx expire watcher beklemeden PTT/VAD guard aktif olsun.
          setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'timeout'));
          // Toast her durumda at — odada olsun olmasın. Dedup setToastMsg içinde state-driven
          // (aynı mesaj yutulur), useLiveKit disconnect handler'daki moderationToast da 2sn dedup.
          // Yani aktif odada iki path'ten gelse bile kullanıcı tek toast görür.
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
          // ANLIK temizlik — App.tsx expire watcher'ı beklemeden reason + state birlikte.
          // Aksi halde setTimedOutUntil(null) sonrası useEffect `if (!timedOutUntil) return;`
          // ile erken çıkıyor ve reason 'timeout'ta stale kalıyordu.
          setTimedOutUntil(null);
          setVoiceDisabledReason(prev => (prev === 'timeout' ? null : prev));
          setToastMsg('Zamanaşımı cezanız kaldırıldı — tekrar konuşabilir ve sohbet odalarına girebilirsiniz.');
          void playMod();
        } else if (action === 'kick') {
          setToastMsg('Sunucudan çıkarıldınız');
          window.dispatchEvent(new CustomEvent('mayvox:refresh-server-list'));
          void playMod();
        } else if (action === 'room_kick') {
          // useLiveKitConnection disconnect'i zaten toast atıyor; duplicate'i önle:
          // eğer aktif channel varsa LiveKit handler'a bırak, yoksa burada bildir.
          if (!activeChannelRef.current) {
            setToastMsg('Odadan çıkarıldınız');
          }
          void playMod();
        } else if (updates.isMuted === true) {
          setToastMsg('Susturuldunuz');
          void playMod();
        } else if (updates.isMuted === false) {
          setToastMsg('Susturulmanız kaldırıldı');
          void playMod();
        }
      }

      // allUsers map'ine payload.updates'i merge — rozet UI'ları için.
      // timedOutUntil User tipinde olmadığı için sadece ortak field'ları yansıt.
      const otherFields = {
        ...(updates.isMuted !== undefined && { isMuted: updates.isMuted }),
        ...(updates.isVoiceBanned !== undefined && { isVoiceBanned: updates.isVoiceBanned }),
      };
      if (Object.keys(otherFields).length > 0) {
        setAllUsers(prev =>
          prev.map(u =>
            u.id === payload.userId ? { ...u, ...otherFields } : u,
          ),
        );
      }
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
      } else if (payload.action === 'reorder') {
        // Kanal sıralama güncellemesi — local position map + token senkronu.
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
          // Deterministic sort: position ASC, tie-break by id ASC
          next.sort((a, b) => {
            if (a.position !== b.position) return a.position - b.position;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          });
          return next;
        });
        // Broadcast payload yeni orderToken taşıyorsa bizim cihazın token'ını güncelle
        // — aksi hâlde bu client'ın sonraki reorder'ı stale token ile 409 alır.
        if (typeof payload.orderToken === 'string' || payload.orderToken === null) {
          channelOrderTokenRef.current = payload.orderToken;
        }
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
        // Session başlangıcı: onlineSince bu oturum boyunca SABİT.
        // Önceki track() varsa koru (aynı session içinde tekrar subscribe olursa timer sıfırlanmasın).
        if (onlineSinceRef.current === null) {
          onlineSinceRef.current = Date.now();
        }
        // platformRef eager init edildi — burada tekrar set etmeye gerek yok.
        const onlineSince = onlineSinceRef.current;
        console.log('[usePresence] track_payload onlineSince=' + onlineSince);
        await channel.track({ userId: user.id, appVersion: appVersion ?? '', userName: user.name, currentRoom: activeChannelRef.current || undefined, serverId: activeServerIdRef.current || undefined, platform: platformRef.current, onlineSince, autoStatus: 'active', statusText: currentUserRef.current.statusText || 'Online' });

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
    // Session-scoped state sıfırla — bu hook aynı kalıp sonra farklı user
    // login olursa eski onlineSince sızmasın. platformRef cihaza özel, sıfırlanmaz.
    onlineSinceRef.current = null;
  };

  const resyncPresence = () => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    const state = channel.presenceState<{ userId: string; appVersion?: string; currentRoom?: string; userName?: string; onlineSince?: number; autoStatus?: string }>();
    const presenceData = (Object.values(state).flatMap(s => s)) as { userId: string; appVersion?: string; currentRoom?: string; userName?: string; onlineSince?: number; autoStatus?: string; statusText?: string }[];
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

    // Payload-level manuel statusText — broadcast-miss/resubscribe için authoritative
    const payloadStatusMap = new Map(
      presenceData.filter(p => p.statusText).map(p => [p.userId, p.statusText!]),
    );

    setAllUsers(prev =>
      prev.map(u => {
        const cachedVersion = mergedVersionMap.get(u.id);
        // NOT: u.status güncellemesi useBackendPresence'a ait — burada sadece
        // oda/audio/autoStatus/version alanları. Online ise statusText senk.
        if (onlineIds.has(u.id)) {
          const payloadStatus = payloadStatusMap.get(u.id);
          const baseText = payloadStatus ?? u.statusText;
          const currentStatusText = baseText === 'Aktif' ? 'Online' : (baseText || 'Online');
          const autoSt = autoStatusMap.get(u.id);
          let resolvedStatusText = currentStatusText;
          if (autoSt && (currentStatusText === 'Online' || currentStatusText === 'Pasif' || currentStatusText === 'Duymuyor')) {
            resolvedStatusText = autoSt === 'idle' ? 'Pasif' : autoSt === 'deafened' ? 'Duymuyor' : 'Online';
          }
          return {
            ...u,
            appVersion: cachedVersion ?? u.appVersion,
            statusText: resolvedStatusText,
            onlineSince: onlineSinceMap.get(u.id) ?? u.onlineSince,
            ...(autoSt && { autoStatus: autoSt as 'active' | 'idle' | 'deafened' }),
          };
        }
        if (cachedVersion && cachedVersion !== u.appVersion) {
          return { ...u, appVersion: cachedVersion };
        }
        return u;
      }),
    );

    // Room membership from presence state (reliable fallback for missed broadcasts)
    syncRoomMembersFromPresence(presenceData);
  };

  return { presenceChannelRef, knownVersionsRef, onlineSinceRef, platformRef, startPresence, stopPresence, resyncPresence };
}
