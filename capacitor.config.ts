import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.caylaklar.seslisohbet',
  appName: 'CylkSohbet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    // Arka plana geçince WebView'ı dondurma — ses akışı devam etsin
    webContentsDebuggingEnabled: false,
  },
};

export default config;
