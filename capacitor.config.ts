import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.caylaklar.seslisohbet',
  appName: 'CylkSohbet',
  webDir: 'dist',
  server: {
    // https şeması — Supabase (https) ile uyumlu
    androidScheme: 'https',
    // Cleartext (ws://) bağlantılarına izin ver
    cleartext: true,
  },
  android: {
    // Mixed content'e izin ver (https sayfa → ws:// bağlantısı)
    allowMixedContent: true,
    captureInput: true,
  },
};

export default config;
