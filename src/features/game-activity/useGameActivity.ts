/**
 * useGameActivity — Electron main process game detector'ını kontrol eder
 * ve güncel aktif oyun adını renderer state'ine yansıtır.
 *
 * Sadece Electron desktop'ta çalışır. Web/PWA/mobil no-op.
 * Toggle kapalıyken main process'e "disable" komutu gönderir; oyun state'i
 * temizlenir, presence'a gameActivity gitmez.
 */
import { useEffect, useState } from 'react';

interface ElectronGameAPI {
  setEnabled: (enabled: boolean) => void;
  onActivity: (cb: (info: { name: string | null }) => void) => void;
  removeAllListeners: () => void;
}

function getApi(): ElectronGameAPI | null {
  return (window as any).electronGame ?? null;
}

export function isGameActivityAvailable(): boolean {
  return getApi() !== null;
}

/**
 * Renderer hook — toggle değişimini main'e ileter, main'den gelen
 * { name } event'ini local state'e yansıtır.
 *
 * @returns currently detected game name, null if none or disabled.
 */
export function useGameActivity(enabled: boolean): string | null {
  const [gameName, setGameName] = useState<string | null>(null);

  useEffect(() => {
    const api = getApi();
    if (!api) return;

    // Event listener — main'den gelen sanitize edilmiş { name } alır
    api.onActivity((info) => {
      setGameName(info?.name ?? null);
    });

    return () => {
      try { api.removeAllListeners(); } catch {}
    };
  }, []);

  useEffect(() => {
    const api = getApi();
    if (!api) return;
    api.setEnabled(enabled);
    // Kapatılırsa local state'i hemen sıfırla — bir sonraki polling tick'ine
    // kadar renderer'da eski oyun görünmesin.
    if (!enabled) setGameName(null);
  }, [enabled]);

  return gameName;
}
