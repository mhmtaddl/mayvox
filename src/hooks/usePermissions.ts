/**
 * Merkezi izin yönetimi hook'u.
 * Tüm platform izin kontrolleri ve talepleri bu hook üzerinden yapılır.
 * Capacitor native plugin (IncomingCall) varsa onu kullanır, yoksa web API'lerine düşer.
 */
import { useState, useCallback } from 'react';
import IncomingCall from '../lib/incomingCall';
import { isCapacitor } from '../lib/platform';

export type PermStatus = 'granted' | 'denied' | 'pending';

export interface PermissionResult {
  microphone: PermStatus;
  notifications: PermStatus;
}

const PENDING_RESULT: PermissionResult = { microphone: 'pending', notifications: 'pending' };

export function usePermissions() {
  const [status, setStatus] = useState<PermissionResult>(PENDING_RESULT);
  const [checking, setChecking] = useState(false);

  /** Mevcut izin durumunu kontrol et (istemeden) */
  const checkPermissions = useCallback(async (): Promise<PermissionResult> => {
    setChecking(true);
    let mic: PermStatus = 'pending';
    let notif: PermStatus = 'pending';

    try {
      if (IncomingCall) {
        // Native Capacitor plugin
        const [micResult, notifResult] = await Promise.all([
          IncomingCall.checkMicrophonePermission(),
          IncomingCall.checkPermissions(),
        ]);
        mic = micResult.microphone === 'granted' ? 'granted' : 'denied';
        notif = notifResult.notifications === 'granted' ? 'granted' : 'denied';
      } else if (!isCapacitor()) {
        // Masaüstü / web — izin sorgusu yok, direkt granted kabul et
        mic = 'granted';
        notif = 'granted';
      }
    } catch (err) {
      console.error('[usePermissions] check_error:', err);
      // Native plugin hatası — web API ile fallback dene
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        mic = 'granted';
      } catch {
        mic = 'denied';
      }
      notif = 'granted'; // fallback: bildirim kontrolü yapılamıyorsa granted kabul et
    }

    const result: PermissionResult = { microphone: mic, notifications: notif };
    console.log('[usePermissions] check_result:', JSON.stringify(result));
    setStatus(result);
    setChecking(false);
    return result;
  }, []);

  /** Mikrofon iznini runtime olarak iste */
  const requestMicrophone = useCallback(async (): Promise<PermStatus> => {
    // 1) Native plugin ile dene
    if (IncomingCall) {
      try {
        const result = await IncomingCall.requestMicrophonePermission();
        const s: PermStatus = result.microphone === 'granted' ? 'granted' : 'denied';
        setStatus(prev => ({ ...prev, microphone: s }));
        return s;
      } catch (err) {
        console.warn('[usePermissions] native_mic_request_failed, trying web fallback:', err);
      }
    }

    // 2) Web API fallback — getUserMedia tetikler Android WebView'da da çalışır
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setStatus(prev => ({ ...prev, microphone: 'granted' }));
      return 'granted';
    } catch {
      setStatus(prev => ({ ...prev, microphone: 'denied' }));
      return 'denied';
    }
  }, []);

  /** Bildirim iznini runtime olarak iste */
  const requestNotifications = useCallback(async (): Promise<PermStatus> => {
    // 1) Native plugin
    if (IncomingCall) {
      try {
        const result = await IncomingCall.requestPermissions();
        const s: PermStatus = result.notifications === 'granted' ? 'granted' : 'denied';
        setStatus(prev => ({ ...prev, notifications: s }));
        return s;
      } catch {
        // Eski Android — izin otomatik verilir
        setStatus(prev => ({ ...prev, notifications: 'granted' }));
        return 'granted';
      }
    }

    // 2) Web Notification API fallback
    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      try {
        const perm = await Notification.requestPermission();
        const s: PermStatus = perm === 'granted' ? 'granted' : 'denied';
        setStatus(prev => ({ ...prev, notifications: s }));
        return s;
      } catch {
        setStatus(prev => ({ ...prev, notifications: 'granted' }));
        return 'granted';
      }
    }

    setStatus(prev => ({ ...prev, notifications: 'granted' }));
    return 'granted';
  }, []);

  /** Uygulama ayarlarını aç */
  const openAppSettings = useCallback(async () => {
    if (IncomingCall) {
      try { await IncomingCall.openAppSettings(); } catch {}
    }
  }, []);

  /** Bildirim ayarlarını aç */
  const openNotificationSettings = useCallback(async () => {
    if (IncomingCall) {
      try { await IncomingCall.openNotificationSettings(); } catch {}
    }
  }, []);

  return {
    status,
    checking,
    checkPermissions,
    requestMicrophone,
    requestNotifications,
    openAppSettings,
    openNotificationSettings,
  };
}
