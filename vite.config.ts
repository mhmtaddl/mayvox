import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './', // 🔥 ELECTRON İÇİN KRİTİK (beyaz ekranı engeller)

    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || ''),
    },

    plugins: [
      react(),
      tailwindcss()
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      // HMR ayarın aynen kalıyor
      hmr: process.env.DISABLE_HMR !== 'true',
    },

    // RNNoise WASM + AudioWorklet asset support (POC).
    // Feature flag default OFF olduğundan build etkisi yok; hazır.
    assetsInclude: ['**/*.wasm'],

    // ExcelJS UMD bundle Vite dev server'da dynamic import ile bazen
    // 'Failed to fetch dynamically imported module' hatası veriyor.
    // optimizeDeps.include ile önceden prebundle edilir → chunk kararlı.
    optimizeDeps: {
      include: ['exceljs'],
    },

    // Multi-entry: ana app + ses odası overlay (Electron desktop)
    // Overlay ayrı BrowserWindow'da yüklenir, kendi minimal React bundle'ı var.
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          overlay: path.resolve(__dirname, 'overlay.html'),
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
            if (/[\\/]node_modules[\\/](motion|framer-motion)[\\/]/.test(id)) return 'vendor-motion';
            if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'vendor-icons';
            if (/[\\/]node_modules[\\/](@livekit|livekit-client)[\\/]/.test(id)) return 'vendor-livekit';
            if (/[\\/]node_modules[\\/]@capacitor[\\/]/.test(id)) return 'vendor-capacitor';
            if (/[\\/]node_modules[\\/]exceljs[\\/]/.test(id)) return 'vendor-exceljs';
            return 'vendor';
          },
        },
      },
    },
  };
});
