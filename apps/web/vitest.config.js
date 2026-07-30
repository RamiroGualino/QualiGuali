import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    css: true,
    // Scoped to tests/ only — otherwise Vitest's default include pattern
    // also picks up e2e/*.spec.js, which is Playwright's, not Vitest's.
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
