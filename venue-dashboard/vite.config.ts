import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Сервер раздаёт собранный dist/ по пути /cabinet/, API живёт рядом на /api.
export default defineConfig({
  base: '/cabinet/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', xfwd: true },
    },
  },
});
