/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In `npm run dev`, the cabin hub (apps/hub, port 8080) answers /api and /ws, so the
// app works the same as when the hub serves the built files.
const HUB = process.env.HEARME_HUB ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: HUB, changeOrigin: true },
      '/ws': { target: HUB.replace(/^http/, 'ws'), ws: true },
      '/join': { target: HUB, changeOrigin: true },
      '/seats': { target: HUB, changeOrigin: true },
    },
  },
  preview: { port: 4173, host: true },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
