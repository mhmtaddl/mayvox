import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.caylaklar.seslisohbet',
  appName: 'MAYVOX',
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
  plugins: {
    // Capacitor native HTTP: fetch çağrılarını WebView yerine native olarak yapar.
    // Origin 'https://localhost' yüzünden backend CORS'a takılmasını engeller.
    CapacitorHttp: {
      enabled: true,
    },
    // Klavye açıldığında WebView doğal olarak yeniden boyutlanır (adjustResize).
    // 'body' modu bazı cihazlarda içeriğin klavye altında kalmasına yol açıyordu.
    Keyboard: {
      resize: 'native' as any,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
