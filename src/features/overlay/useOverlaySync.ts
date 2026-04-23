/**
 * useOverlaySync — ana renderer voice room participant state'ini alır,
 * sanitize eder ve Electron main process'e (→ overlay window) iletir.
 *
 * Kurallar:
 *  - Electron yoksa no-op
 *  - Toggle kapalıyken overlay:apply-settings({enabled:false}) tek sefer,
 *    sonraki update()'ler durdurulur
 *  - Oda boşsa gönderilen snapshot participants:[] (overlay kendini gizler)
 *  - IPC yüzeyi minimum — ham user/token/audio akışı yok
 */
import { useEffect, useRef } from 'react';
import type { User } from '../../types';
import type { OverlaySnapshot, OverlayParticipant, OverlaySettings } from '../../overlay/types';

interface OverlayHostAPI {
  applySettings: (s: Partial<OverlaySettings>) => void;
  update: (s: OverlaySnapshot) => void;
}

function getHost(): OverlayHostAPI | null {
  return (window as any).electronOverlayHost ?? null;
}

export function isOverlayHostAvailable(): boolean {
  return getHost() !== null;
}

export interface UseOverlaySyncOpts {
  settings: OverlaySettings;
  currentUserId: string;
  activeChannelId: string | null;
  activeChannelName?: string | null;
  roomMembers: User[]; // currentChannel.members → allUsers filter sonucu
  selfSpeaking: boolean; // isPttPressed && !isMuted vb
  selfMuted: boolean;
  selfDeafened: boolean;
  selfUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'name' | 'avatar'>;
}

export function useOverlaySync({
  settings,
  currentUserId,
  activeChannelId,
  activeChannelName,
  roomMembers,
  selfSpeaking,
  selfMuted,
  selfDeafened,
  selfUser,
}: UseOverlaySyncOpts) {
  // Ayar değişimlerini main'e tek seferde ilet
  useEffect(() => {
    const host = getHost();
    if (!host) return;
    host.applySettings(settings);
  }, [settings.enabled, settings.position, settings.size, settings.clickThrough]); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot göndericisi — throttle (son state 250ms'de bir)
  const lastSentRef = useRef<string>('');
  const throttleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const host = getHost();
    if (!host) return;

    // Overlay kapalıysa tamamen durdur — gereksiz IPC yok
    if (!settings.enabled) {
      if (throttleTimerRef.current) { window.clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null; }
      return;
    }

    const build = (): OverlaySnapshot => {
      if (!activeChannelId) {
        return { roomId: null, roomName: null, participants: [], size: settings.size };
      }
      const partList: OverlayParticipant[] = [];
      // Self (eğer showSelf ise)
      if (settings.showSelf && currentUserId) {
        const selfSpeakingFinal = selfSpeaking && !selfMuted;
        const selfName = [selfUser.firstName, selfUser.lastName].filter(Boolean).join(' ').trim() || selfUser.name || 'Ben';
        if (!settings.showOnlySpeaking || selfSpeakingFinal) {
          partList.push({
            id: currentUserId,
            displayName: selfName,
            avatarUrl: selfUser.avatar || null,
            statusText: null, // self için fallback 'Çevrimdışı' status PNG'si overlay tarafında direkt uygulanacak
            isSpeaking: selfSpeakingFinal,
            isMuted: selfMuted,
            isDeafened: selfDeafened,
            isSelf: true,
          });
        }
      }
      // Diğer üyeler
      for (const u of roomMembers) {
        if (u.id === currentUserId) continue;
        const isSpeaking = !!u.isSpeaking && !u.selfMuted && !u.isMuted;
        if (settings.showOnlySpeaking && !isSpeaking) continue;
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name || 'Kullanıcı';
        partList.push({
          id: u.id,
          displayName: name,
          avatarUrl: u.avatar || null,
          statusText: u.statusText ?? null,
          isSpeaking,
          isMuted: !!u.selfMuted || !!u.isMuted,
          isDeafened: !!u.selfDeafened,
          isSelf: false,
        });
      }
      return {
        roomId: activeChannelId,
        roomName: activeChannelName || null,
        participants: partList,
        size: settings.size, // main process kendi mevcut size'ını enjekte eder; bu yine de defensive
      };
    };

    const flush = () => {
      const snap = build();
      const serialized = JSON.stringify(snap);
      if (serialized === lastSentRef.current) return;
      lastSentRef.current = serialized;
      host.update(snap);
    };

    // Throttle: hızlı değişimlerde (speaking flicker) IPC spam olmasın
    if (throttleTimerRef.current) window.clearTimeout(throttleTimerRef.current);
    throttleTimerRef.current = window.setTimeout(() => {
      throttleTimerRef.current = null;
      flush();
    }, 120);

    return () => {
      if (throttleTimerRef.current) { window.clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null; }
    };
  }, [
    settings.enabled,
    settings.showSelf,
    settings.showOnlySpeaking,
    currentUserId,
    activeChannelId,
    activeChannelName,
    roomMembers,
    selfSpeaking,
    selfMuted,
    selfDeafened,
    selfUser,
  ]);
}
