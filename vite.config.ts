import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './', // 🔥 ELECTRON İÇİN KRİTİK (beyaz ekranı engeller)

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
  };
});