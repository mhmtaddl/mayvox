import { useState, useEffect, useCallback } from 'react';
import IncomingCall from '../lib/incomingCall';

export interface PermissionState {
  notifications: 'granted' | 'denied' | 'unknown';
  microphone: 'granted' | 'denied' | 'unknown';
  fullScreen: 'granted' | 'denied' | 'unknown';
}

const UNKNOWN_STATE: PermissionState = {
  notifications: 'unknown',
  microphone: 'unknown',
  fullScreen: 'unknown',
};

export function usePermissionStatus() {
  const [status, setStatus] = useState<PermissionState>(UNKNOWN_STATE);

  const refresh = useCallback(async () => {
    if (!IncomingCall) return;
    console.log('[usePermissionStatus] refresh_started');
    try {
      const [perms, mic] = await Promise.all([
        IncomingCall.checkPermissions(),
        IncomingCall.checkMicrophonePermission(),
      ]);
      const newStatus: PermissionState = {
        notifications: perms.notifications as PermissionState['notifications'],
        microphone: mic.microphone as PermissionState['microphone'],
        fullScreen: perms.fullScreen as PermissionState['fullScreen'],
      };
      console.log('[usePermissionStatus] refresh_completed:', JSON.stringify(newStatus));
      setStatus(newStatus);
    } catch (err) {
      console.error('[usePermissionStatus] refresh_error:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isRefreshing = false;

    const debouncedRefresh = () => {
      if (isRefreshing) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        isRefreshing = true;
        await refresh();
        isRefreshing = false;
      }, 300);
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') debouncedRefresh(); };
    const onResume = () => debouncedRefresh();
    const onFocus = () => debouncedRefresh();

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('resume', onResume);
    window.addEventListener('focus', onFocus);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', onResume);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const requestNotifications = useCallback(async (): Promise<boolean> => {
    if (!IncomingCall) return false;
    try {
      const result = await IncomingCall.requestPermissions();
      const granted = result.notifications === 'granted';
      await refresh();
      return granted;
    } catch { return false; }
  }, [refresh]);

  const requestMicrophone = useCallback(async (): Promise<boolean> => {
    if (!IncomingCall) return false;
    try {
      const result = await IncomingCall.requestMicrophonePermission();
      const granted = result.microphone === 'granted';
      await refresh();
      return granted;
    } catch { return false; }
  }, [refresh]);

  const openAppSettings = useCallback(async () => {
    if (!IncomingCall) return;
    try { await IncomingCall.openAppSettings(); } catch {}
  }, []);

  const openNotificationSettings = useCallback(async () => {
    if (!IncomingCall) return;
    try { await IncomingCall.openNotificationSettings(); } catch {}
  }, []);

  return {
    status,
    refresh,
    requestNotifications,
    requestMicrophone,
    openAppSettings,
    openNotificationSettings,
  };
}
