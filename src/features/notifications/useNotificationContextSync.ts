import { useEffect } from 'react';
import { updateContext } from './notificationService';
import { requestElectronFlash } from './electronAttention';
import type { NotificationMode } from './intelligence';

interface Params {
  currentUserId: string | null;
  isAppFocused: boolean;
  /** v3 opsiyonel — verilmezse isAppFocused'a düşer. */
  isWindowVisible?: boolean;
  dmPanelOpen: boolean;
  activeDmConvKey: string | null;
  /** Active DM thread'i tabanda mı — yukarıdaysa yeni mesaj görülmüyor, suppress kapalı. */
  dmAtBottom: boolean;
  activeServerId: string | null;

  // v3 voice-first signals — opsiyonel, default false.
  isUserSpeaking?: boolean;
  isInVoiceRoom?: boolean;
  isPttActive?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;

  // v3 mode — default NORMAL.
  mode?: NotificationMode;
}

/**
 * Notification service context registry'sini React state'leriyle senkronize eder.
 * v2.1 alanları zorunlu; v3 alanları opsiyonel (default'larla geriye uyumlu).
 */
export function useNotificationContextSync(p: Params) {
  useEffect(() => {
    updateContext({
      currentUserId: p.currentUserId,
      isAppFocused: p.isAppFocused,
      isWindowVisible: p.isWindowVisible ?? p.isAppFocused,
      dmPanelOpen: p.dmPanelOpen,
      activeDmConvKey: p.activeDmConvKey,
      dmAtBottom: p.dmAtBottom,
      activeServerId: p.activeServerId,
      isUserSpeaking: p.isUserSpeaking ?? false,
      isInVoiceRoom: p.isInVoiceRoom ?? false,
      isPttActive: p.isPttActive ?? false,
      isMuted: p.isMuted ?? false,
      isDeafened: p.isDeafened ?? false,
      mode: p.mode ?? 'NORMAL',
    });
    if (p.isAppFocused) {
      requestElectronFlash(false);
    }
  }, [
    p.currentUserId, p.isAppFocused, p.isWindowVisible,
    p.dmPanelOpen, p.activeDmConvKey, p.dmAtBottom, p.activeServerId,
    p.isUserSpeaking, p.isInVoiceRoom, p.isPttActive,
    p.isMuted, p.isDeafened, p.mode,
  ]);
}
