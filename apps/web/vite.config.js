import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind to all interfaces — needed so the dev server is reachable from
    // outside the container when run via docker-compose (Parte 8);
    // harmless for plain local `pnpm dev` too.
    host: true,
  },
});
