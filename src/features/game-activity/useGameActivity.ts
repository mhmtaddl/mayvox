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
  getCurrent?: () => Promise<{ name: string | null }>;
  listProcesses?: () => Promise<{ processes: Array<{ name: string; displayName?: string | null; known?: boolean }> }>;
  getCustomGames?: () => Promise<{ games: Array<{ displayName: string; processes: string[] }> }>;
  addCustomGame?: (entry: { displayName: string; processes: string[] }) => Promise<{ games: Array<{ displayName: string; processes: string[] }>; error?: string }>;
  removeCustomGame?: (processName: string) => Promise<{ games: Array<{ displayName: string; processes: string[] }>; error?: string }>;
  onActivity: (cb: (info: { name: string | null }) => void) => void;
  removeAllListeners: () => void;
}

function getApi(): ElectronGameAPI | null {
  return (window as any).electronGame ?? null;
}

export function isGameActivityAvailable(): boolean {
  return getApi() !== null;
}

export type GameProcessInfo = { name: string; displayName?: string | null; known?: boolean };
export type CustomGameEntry = { displayName: string; processes: string[] };

export async function listGameProcesses(): Promise<GameProcessInfo[]> {
  const res = await getApi()?.listProcesses?.();
  return Array.isArray(res?.processes) ? res.processes : [];
}

export async function getCustomGames(): Promise<CustomGameEntry[]> {
  const res = await getApi()?.getCustomGames?.();
  return Array.isArray(res?.games) ? res.games : [];
}

export async function addCustomGame(entry: CustomGameEntry): Promise<CustomGameEntry[]> {
  const res = await getApi()?.addCustomGame?.(entry);
  if (res?.error) throw new Error(res.error);
  return Array.isArray(res?.games) ? res.games : [];
}

export async function removeCustomGame(processName: string): Promise<CustomGameEntry[]> {
  const res = await getApi()?.removeCustomGame?.(processName);
  if (res?.error) throw new Error(res.error);
  return Array.isArray(res?.games) ? res.games : [];
}

export async function getCurrentGameActivity(): Promise<string | null> {
  const res = await getApi()?.getCurrent?.();
  return res?.name ?? null;
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
    if (!enabled) {
      setGameName(null);
      return;
    }

    let cancelled = false;
    const refresh = () => {
      api.getCurrent?.()
        .then(info => {
          if (!cancelled) setGameName(info?.name ?? null);
        })
        .catch(() => {
          if (!cancelled) setGameName(null);
        });
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);

  return gameName;
}
