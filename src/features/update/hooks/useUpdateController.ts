// ── Update Controller Hook ──────────────────────────────────────────────────
// Tek merkezden update lifecycle yönetimi. Platform'a göre uygun adapter kullanır.
// Guards: duplicate check, duplicate download, retry, timeout, stale state koruması.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UpdateState, UpdateUrgency } from '../types';
import { evaluateUrgency } from '../evaluatePolicy';
import { fetchPolicyFromGitHub } from '../providers/githubReleases';
import { isElectron, isCapacitor } from '../../../lib/platform';
import { openApkDownload } from '../adapters/androidApk';
import {
  isElectronUpdateAvailable,
  electronCheck,
  electronDownload,
  electronInstall,
  electronOnChecking,
  electronOnAvailable,
  electronOnNotAvailable,
  electronOnProgress,
  electronOnDownloaded,
  electronOnError,
  electronOnIdle,
  electronRemoveAllListeners,
} from '../adapters/electronUpdater';
import {
  INITIAL_CHECK_DELAY,
  DESKTOP_CHECK_INTERVAL,
  ANDROID_CHECK_INTERVAL,
  MAX_AUTO_RETRIES,
  RETRY_BASE_DELAY,
  APK_REDIRECT_COOLDOWN,
} from '../constants';
import { logger } from '../../../lib/logger';

const INITIAL_STATE: UpdateState = {
  phase: 'idle',
  policy: null,
  progress: 0,
  error: null,
  version: null,
};

// Hangi phase'lerden hangi phase'lere geçiş legal
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  'idle':        ['checking'],
  'checking':    ['available', 'up-to-date', 'error'],
  'up-to-date':  ['checking'],
  'available':   ['downloading', 'idle', 'checking'],
  'downloading': ['downloaded', 'error'],
  'downloaded':  ['installing'],
  'installing':  [],             // terminal — app restart
  'error':       ['checking', 'idle'],
};

function canTransition(from: string, to: string): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface UpdateController {
  state: UpdateState;
  urgency: UpdateUrgency;
  check: () => void;
  download: () => void;
  install: () => void;
  dismiss: () => void;
}

export function useUpdateController(currentVersion: string): UpdateController {
  const [state, setState] = useState<UpdateState>(INITIAL_STATE);
  const mountedRef = useRef(true);
  const checkingRef = useRef(false);    // check in-flight guard
  const downloadingRef = useRef(false); // download in-flight guard
  const retryCountRef = useRef(0);
  const apkCooldownRef = useRef(0);     // son APK redirect timestamp
  const versionRef = useRef(currentVersion);
  versionRef.current = currentVersion;

  // State'i güvenli geçişle güncelle
  const safeSetState = useCallback((updater: (prev: UpdateState) => UpdateState) => {
    if (!mountedRef.current) return;
    setState(prev => {
      const next = updater(prev);
      if (next.phase === prev.phase && next === prev) return prev;
      if (next.phase !== prev.phase && !canTransition(prev.phase, next.phase)) {
        logger.warn('Illegal update state transition blocked', { from: prev.phase, to: next.phase });
        return prev;
      }
      return next;
    });
  }, []);

  // ── Desktop: electron-updater event listeners ──
  useEffect(() => {
    if (!isElectron() || !isElectronUpdateAvailable()) return;

    electronOnChecking(() => {
      safeSetState(s => ({ ...s, phase: 'checking', error: null }));
    });

    electronOnAvailable(({ version, size }) => {
      safeSetState(s => ({
        ...s,
        phase: 'available',
        version,
        policy: s.policy
          ? { ...s.policy, latestVersion: version, assets: { ...s.policy.assets, desktop: { downloadUrl: '', size } } }
          : null,
      }));
      checkingRef.current = false;
      retryCountRef.current = 0;
    });

    electronOnNotAvailable(() => {
      safeSetState(s => ({ ...s, phase: 'up-to-date' }));
      checkingRef.current = false;
      retryCountRef.current = 0;
    });

    electronOnProgress(({ percent }) => {
      if (!mountedRef.current) return;
      // Progress same-phase update — state machine kontrolü gerekmez
      setState(s => s.phase === 'downloading' ? { ...s, progress: Math.round(percent) } : s);
    });

    electronOnDownloaded(({ version }) => {
      safeSetState(s => ({ ...s, phase: 'downloaded', version, progress: 100 }));
      downloadingRef.current = false;
      retryCountRef.current = 0;
    });

    electronOnError(({ message }) => {
      logger.error('Electron update error', { message });
      safeSetState(s => ({ ...s, phase: 'error', error: message }));
      checkingRef.current = false;
      downloadingRef.current = false;
      scheduleRetry();
    });

    // Main'den gelen idle sinyali — startup gate bittiğinde ya da splash kapandığında
    // state'i state machine bypass'ı ile sıfırlar. Main busy olduğu için response
    // gelmemiş bir 'checking' state'inin sonsuz spinner'a dönmesini engeller.
    electronOnIdle(() => {
      if (!mountedRef.current) return;
      checkingRef.current = false;
      downloadingRef.current = false;
      retryCountRef.current = 0;
      setState(INITIAL_STATE);
    });

    return () => {
      mountedRef.current = false;
      electronRemoveAllListeners();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Retry scheduler ──
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const scheduleRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_AUTO_RETRIES) return;
    retryCountRef.current++;
    const delay = RETRY_BASE_DELAY * Math.pow(2, retryCountRef.current - 1);
    logger.info('Update retry scheduled', { attempt: retryCountRef.current, delayMs: delay });
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      if (mountedRef.current) doCheck();
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check (platform-agnostic entry point) ──
  const doCheck = useCallback(async () => {
    if (checkingRef.current || downloadingRef.current) return;

    // Offline guard — bağlantı yoksa boşuna check yapma
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      logger.info('Update check skipped — offline');
      return;
    }

    checkingRef.current = true;

    if (isElectron() && isElectronUpdateAvailable()) {
      safeSetState(s => ({ ...s, phase: 'checking', error: null }));
      electronCheck();
      // Main tarafı busy ise (startup gate vs.) IPC response HİÇ gelmeyebilir —
      // 15s içinde transition olmazsa state'i idle'a düşür (sonsuz spinner önleme).
      setTimeout(() => {
        if (!mountedRef.current) return;
        if (!checkingRef.current) return;
        logger.warn('Electron check timeout — state idle\'a reset ediliyor');
        checkingRef.current = false;
        setState(prev => prev.phase === 'checking' ? INITIAL_STATE : prev);
      }, 15_000);
      return; // event listener'lar devralır, checkingRef orada sıfırlanır
    }

    // Android / Web: GitHub API
    safeSetState(s => ({ ...s, phase: 'checking', error: null }));

    try {
      const policy = await fetchPolicyFromGitHub();
      if (!mountedRef.current) return;

      const urgency = evaluateUrgency(versionRef.current, policy);

      if (urgency === 'none') {
        safeSetState(s => ({ ...s, phase: 'up-to-date', policy }));
      } else {
        safeSetState(s => ({ ...s, phase: 'available', policy, version: policy.latestVersion }));
      }
      retryCountRef.current = 0;
    } catch (e: any) {
      if (!mountedRef.current) return;
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const msg = isOffline ? 'İnternet bağlantısı yok' : 'Güncelleme kontrol edilemedi';
      logger.warn('Update check failed', { message: e?.message, offline: isOffline });
      safeSetState(s => ({ ...s, phase: 'error', error: msg }));
      // Offline ise retry yapma — online event'i bekle
      if (!isOffline) scheduleRetry();
    } finally {
      checkingRef.current = false;
    }
  }, [safeSetState, scheduleRetry]);

  // Stable ref for callbacks that don't need re-creation
  const doCheckRef = useRef(doCheck);
  doCheckRef.current = doCheck;

  // Public check — dışarıdan çağrılabilir
  const check = useCallback(() => { doCheckRef.current(); }, []);

  // ── Download ──
  const download = useCallback(() => {
    // State'i ref üzerinden oku — stale closure önleme
    setState(prev => {
      if (prev.phase !== 'available') return prev;
      if (downloadingRef.current) return prev;

      if (isElectron() && isElectronUpdateAvailable()) {
        downloadingRef.current = true;
        electronDownload();
        return { ...prev, phase: 'downloading', progress: 0 };
      }

      if (isCapacitor()) {
        // Cooldown kontrolü — APK redirect loop önleme
        const now = Date.now();
        if (now - apkCooldownRef.current < APK_REDIRECT_COOLDOWN) {
          logger.warn('APK redirect cooldown active');
          return prev;
        }
        apkCooldownRef.current = now;

        const apkUrl = prev.policy?.assets.android?.apkUrl;
        const ok = openApkDownload(apkUrl, prev.version || undefined);
        if (!ok) {
          return { ...prev, phase: 'error', error: 'APK indirme bağlantısı açılamadı' };
        }
      }

      return prev;
    });
  }, []);

  // ── Install (Desktop only) ──
  const install = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'downloaded' || !isElectron()) return prev;
      electronInstall();
      return { ...prev, phase: 'installing' };
    });
  }, []);

  // ── Dismiss ──
  const dismiss = useCallback(() => {
    safeSetState(s => (s.phase === 'available' ? { ...s, phase: 'idle' } : s));
  }, [safeSetState]);

  // ── Android: app resume sonrası recheck ──
  useEffect(() => {
    if (!isCapacitor()) return;

    const handleResume = () => {
      // APK indirdikten sonra geri dönünce — sürüm güncel mi kontrol et
      setTimeout(() => doCheckRef.current(), 2000);
    };

    document.addEventListener('resume', handleResume);
    window.addEventListener('focus', handleResume);
    return () => {
      document.removeEventListener('resume', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, []);

  // ── Online gelince recheck ──
  useEffect(() => {
    const handleOnline = () => {
      logger.info('Network online — scheduling update check');
      setTimeout(() => doCheckRef.current(), 3000);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // ── Periodic check (HMR-safe) ──
  useEffect(() => {
    mountedRef.current = true;

    // Dev modda update check tamamen devre dışı
    const isDev = import.meta.env.DEV;
    if (isDev) {
      safeSetState(() => ({ ...INITIAL_STATE, phase: 'up-to-date' }));
      return () => { mountedRef.current = false; };
    }

    // Production — HMR-safe tek seferlik initial check
    const win = window as unknown as Record<string, unknown>;
    const alreadyChecked = !!win.__mayvox_update_checked;
    win.__mayvox_update_checked = true;

    const delay = alreadyChecked
      ? undefined
      : setTimeout(() => doCheckRef.current(), INITIAL_CHECK_DELAY);

    const interval = isElectron() ? DESKTOP_CHECK_INTERVAL : ANDROID_CHECK_INTERVAL;
    const timer = setInterval(() => doCheckRef.current(), interval);

    return () => {
      mountedRef.current = false;
      if (delay) clearTimeout(delay);
      clearInterval(timer);
      clearTimeout(retryTimerRef.current);
    };
  }, []); // Sabit — timer'lar yeniden kurulmaz

  // ── Urgency (memoized) ──
  const urgency: UpdateUrgency = useMemo(
    () => state.policy ? evaluateUrgency(currentVersion, state.policy) : 'none',
    [currentVersion, state.policy],
  );

  return { state, urgency, check, download, install, dismiss };
}
