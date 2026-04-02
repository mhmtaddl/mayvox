/**
 * Platform algılama ve Electron API güvenli erişim katmanı.
 * Mobilde Electron API'leri yoktur — bu modül güvenli fallback sağlar.
 */

/** Capacitor native ortamında mı çalışıyoruz? (Android/iOS — web bundle'da false) */
export const isCapacitor = (): boolean => {
  return !!(window as any).Capacitor?.isNativePlatform?.();
};

/** Electron ortamında mı çalışıyoruz? */
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && typeof (window as any).electronApp !== 'undefined';
};

/** Mobil cihaz mı? (Capacitor veya user-agent) */
export const isMobile = (): boolean => {
  if (isCapacitor()) return true;
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/** Masaüstü Electron uygulaması mı? */
export const isDesktop = (): boolean => isElectron();

/** Uygulama versiyonunu al — Electron'da native API, aksi halde build-time sabiti */
export const getAppVersion = async (): Promise<string> => {
  if (isElectron()) {
    try {
      return await (window as any).electronApp!.getVersion();
    } catch {
      // fallthrough
    }
  }
  // Vite build-time sabiti
  return (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || '1.0.0';
};

/** Tray kanal adını güncelle — sadece Electron'da çalışır */
export const setTrayChannel = (name: string | null): void => {
  if (isElectron()) {
    (window as any).electronApp?.setTrayChannel?.(name);
  }
};

// Global type augmentation — diğer dosyalarda zaten tanımlı, burada tekrar etmiyoruz
declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string;
}
