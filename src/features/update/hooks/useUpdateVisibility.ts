// ── Update Visibility Hook ──────────────────────────────────────────────────
// UI'da ne gösterilmeli kararını verir. Business logic'i UI'dan ayırır.

import type { UpdateState, UpdateUrgency } from '../types';

export interface UpdateVisibility {
  /** Footer hub'ın update modunda mı normal modda mı gösterileceği */
  showUpdateHub: boolean;
  /** Popover/sheet açılabilir mi */
  canOpenDetails: boolean;
  /** Force overlay gösterilmeli mi */
  showForceOverlay: boolean;
  /** Badge (pulsing dot) gösterilmeli mi */
  showBadge: boolean;
  /** Progress ring gösterilmeli mi */
  showProgress: boolean;
  /** Ana metin */
  label: string;
  /** Yardımcı metin */
  sublabel: string;
}

export function useUpdateVisibility(
  state: UpdateState,
  urgency: UpdateUrgency,
  currentVersion: string,
): UpdateVisibility {
  const { phase, version, progress, error } = state;

  const base: UpdateVisibility = {
    showUpdateHub: false,
    canOpenDetails: false,
    showForceOverlay: false,
    showBadge: false,
    showProgress: false,
    label: `v${currentVersion}`,
    sublabel: '',
  };

  switch (phase) {
    case 'idle':
    case 'up-to-date':
      return base;

    case 'checking':
      return {
        ...base,
        label: `v${currentVersion}`,
        sublabel: '',
      };

    case 'available':
      return {
        ...base,
        showUpdateHub: true,
        canOpenDetails: true,
        showForceOverlay: urgency === 'force',
        showBadge: true,
        label: 'Yeni sürüm',
        sublabel: version ? `v${version}` : '',
      };

    case 'downloading':
      return {
        ...base,
        showUpdateHub: true,
        showProgress: true,
        label: `%${progress}`,
        sublabel: progress > 0 && progress < 100 ? 'İndiriliyor' : 'Hazırlanıyor',
      };

    case 'downloaded':
      return {
        ...base,
        showUpdateHub: true,
        canOpenDetails: true,
        showBadge: true,
        label: 'Kurmaya hazır',
        sublabel: version ? `v${version}` : '',
      };

    case 'installing':
      return {
        ...base,
        showUpdateHub: true,
        label: `v${currentVersion}`,
        sublabel: '',
      };

    case 'error': {
      // Uzun hata mesajlarını footer'da truncate et — detay popover'da gösterilir
      const shortError = error && error.length > 30 ? error.slice(0, 27) + '...' : (error || 'Hata oluştu');
      return {
        ...base,
        showUpdateHub: !!error,
        canOpenDetails: true,
        label: `v${currentVersion}`,
        sublabel: shortError,
      };
    }

    default:
      return base;
  }
}
