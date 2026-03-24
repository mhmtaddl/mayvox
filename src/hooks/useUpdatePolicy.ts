import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { isBelowMin, isOutdated } from '../lib/versionCompare';
import { logger } from '../lib/logger';

export type UpdateLevel = 'optional' | 'recommended' | 'force';

export interface UpdatePolicy {
  latestVersion: string;
  minSupportedVersion: string;
  updateLevel: UpdateLevel;
  reason: string | null;
  message: string | null;
}

export interface PolicyState {
  /** Remote'dan gelen ham policy */
  policy: UpdatePolicy | null;
  /** Mevcut sürüme göre hesaplanan efektif seviye */
  effectiveLevel: UpdateLevel;
  /** Force modda mı? */
  isForced: boolean;
  /** Recommended modda mı? */
  isRecommended: boolean;
  /** Kullanıcıya gösterilecek mesaj (remote veya varsayılan) */
  displayMessage: string;
  /** Yükleniyor */
  loading: boolean;
}

const DEFAULT_MESSAGES: Record<UpdateLevel, string> = {
  optional: '',
  recommended: 'Daha iyi bir deneyim için güncellemeniz önerilir.',
  force: 'Devam etmek için uygulamayı güncellemeniz gerekiyor.',
};

const POLL_INTERVAL = 10 * 60 * 1000; // 10 dakika

export function useUpdatePolicy(appVersion: string): PolicyState {
  const [policy, setPolicy] = useState<UpdatePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchPolicy = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('update_policy')
        .select('*')
        .eq('id', 1)
        .single();

      if (error || !data) {
        logger.warn('Update policy fetch failed', { error: error?.message });
        return;
      }

      if (!mountedRef.current) return;

      const p: UpdatePolicy = {
        latestVersion: data.latest_version,
        minSupportedVersion: data.min_supported_version,
        updateLevel: data.update_level as UpdateLevel,
        reason: data.reason,
        message: data.message,
      };

      logger.info('Update policy fetched', {
        latest: p.latestVersion,
        minSupported: p.minSupportedVersion,
        level: p.updateLevel,
        reason: p.reason,
      });

      setPolicy(p);
    } catch {
      // Ağ hatası — sessizce geç, mevcut policy kalsın
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // İlk fetch + polling
  useEffect(() => {
    mountedRef.current = true;
    fetchPolicy();
    const interval = setInterval(fetchPolicy, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchPolicy]);

  // ── Efektif seviye hesaplama ──
  if (!policy || !appVersion) {
    return {
      policy: null,
      effectiveLevel: 'optional',
      isForced: false,
      isRecommended: false,
      displayMessage: '',
      loading,
    };
  }

  let effectiveLevel: UpdateLevel = policy.updateLevel;

  // Versiyon kontrolü: minSupportedVersion altındaysa her durumda force
  if (isBelowMin(appVersion, policy.minSupportedVersion)) {
    effectiveLevel = 'force';
  }
  // Güncel versiyondaysa hiçbir şey gösterme
  else if (!isOutdated(appVersion, policy.latestVersion)) {
    effectiveLevel = 'optional';
  }

  const isForced = effectiveLevel === 'force';
  const isRecommended = effectiveLevel === 'recommended';

  const displayMessage = policy.message || DEFAULT_MESSAGES[effectiveLevel];

  return {
    policy,
    effectiveLevel,
    isForced,
    isRecommended,
    displayMessage,
    loading,
  };
}
