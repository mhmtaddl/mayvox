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
import { getPublicDisplayName } from '../../lib/formatName';

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
  selfUser: Pick<User, 'id' | 'displayName' | 'firstName' | 'lastName' | 'name' | 'avatar'>;
  themeAccentRgb?: string;
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
  themeAccentRgb,
}: UseOverlaySyncOpts) {
  // Ayar değişimlerini main'e tek seferde ilet
  useEffect(() => {
    const host = getHost();
    if (!host) return;
    host.applySettings(settings);
  }, [settings.enabled, settings.position, settings.size, settings.clickThrough, settings.cardOpacity, settings.variant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot göndericisi — LEADING-EDGE throttle.
  // State değişince ANINDA flush (PTT gecikme hissi yok), sonra min 40ms aralık.
  // Spam update'lerde (hızlı speaking flicker) trailing-edge fallback devreye girer.
  const lastSentRef = useRef<string>('');
  const lastRenderableRef = useRef(false);
  const throttleTimerRef = useRef<number | null>(null);
  const lastFlushAtRef = useRef<number>(0);
  const MIN_GAP_MS = 40;

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
        return {
          roomId: null, roomName: null, participants: [], size: settings.size,
          position: settings.position,
          cardOpacity: settings.cardOpacity,
          variant: settings.variant,
          themeAccentRgb,
        };
      }
      const partList: OverlayParticipant[] = [];
      // Self (eğer showSelf ise)
      if (settings.showSelf && currentUserId) {
        const selfSpeakingFinal = selfSpeaking && !selfMuted;
        const selfName = getPublicDisplayName(selfUser) || 'Ben';
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
        const name = getPublicDisplayName(u);
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
      // Öncelik sıralaması — overlay MAX_VISIBLE=6 üst sınırla. Aktif/durumlu kullanıcılar
      // her zaman görünür kalsın (kalabalık odada konuşan biri overflow'a düşmesin).
      // Sıra: speaking → muted/deafened → self → diğer idle.
      partList.sort((a, b) => {
        const pa = a.isSpeaking ? 0 : (a.isMuted || a.isDeafened) ? 1 : a.isSelf ? 2 : 3;
        const pb = b.isSpeaking ? 0 : (b.isMuted || b.isDeafened) ? 1 : b.isSelf ? 2 : 3;
        return pa - pb;
      });

      return {
        roomId: activeChannelId,
        roomName: activeChannelName || null,
        participants: partList,
        size: settings.size, // main process kendi mevcut size'ını enjekte eder; bu yine de defensive
        position: settings.position,
        cardOpacity: settings.cardOpacity,
        variant: settings.variant,
        themeAccentRgb,
      };
    };

    const flush = () => {
      const snap = build();
      const renderable = !!snap.roomId && snap.participants.length > 0;
      if (!snap.roomId && !lastRenderableRef.current) return;
      const serialized = JSON.stringify(snap);
      if (serialized === lastSentRef.current) return;
      lastSentRef.current = serialized;
      lastRenderableRef.current = renderable;
      host.update(snap);
    };

    // Leading-edge throttle — state değişince anında flush, sonra MIN_GAP_MS koruma.
    const now = performance.now();
    const elapsed = now - lastFlushAtRef.current;
    if (elapsed >= MIN_GAP_MS) {
      if (throttleTimerRef.current) { window.clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null; }
      lastFlushAtRef.current = now;
      flush();
    } else {
      // Yakın zamanda flush yapıldı — kalan gap için trailing timer planla (flicker absorbe).
      if (throttleTimerRef.current) window.clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = window.setTimeout(() => {
        lastFlushAtRef.current = performance.now();
        throttleTimerRef.current = null;
        flush();
      }, MIN_GAP_MS - elapsed);
    }

    return () => {
      if (throttleTimerRef.current) { window.clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null; }
    };
  }, [
    settings.enabled,
    settings.position,
    settings.showSelf,
    settings.showOnlySpeaking,
    settings.cardOpacity,
    settings.variant,
    currentUserId,
    activeChannelId,
    activeChannelName,
    roomMembers,
    selfSpeaking,
    selfMuted,
    selfDeafened,
    selfUser,
    themeAccentRgb,
  ]);
}
