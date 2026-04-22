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
  };
});