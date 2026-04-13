/**
 * Audio pipeline feature flags — runtime-gated, non-UI.
 *
 * Şu anda sadece altyapı. Hiçbir yerde runtime etkisi yok.
 * RNNoise entegrasyonu geldiğinde `RNNOISE_ENABLED` kontrolü ile aktif edilir.
 *
 * Resolution order:
 *   1. `localStorage['audio:rnnoise']` === '1' (dev override)
 *   2. `import.meta.env.VITE_RNNOISE_ENABLED` === '1' (build-time)
 *   3. default false
 */

function readLocalStorage(key: string): string | null {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function readEnv(key: string): string | undefined {
  try { return (import.meta as { env?: Record<string, string> }).env?.[key]; }
  catch { return undefined; }
}

export const AUDIO_FLAGS = {
  get RNNOISE_ENABLED(): boolean {
    const ls = readLocalStorage('audio:rnnoise');
    if (ls === '1') return true;
    if (ls === '0') return false;
    return readEnv('VITE_RNNOISE_ENABLED') === '1';
  },
} as const;
