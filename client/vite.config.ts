import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const API = process.env.VITE_PROXY_TARGET ?? 'http://172.48.0.116:4000';

// `npm run dev:https` serves the dev site over HTTPS (self-signed certificate, accept the browser warning once):
// phones/tablets allow the CAMERA only on https:// pages (or localhost), so QR scanning by camera needs it.
export default defineConfig(async ({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [(await import('@vitejs/plugin-basic-ssl')).default()] : [])],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
  },
}));