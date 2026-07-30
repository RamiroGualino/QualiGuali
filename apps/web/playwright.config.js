import { defineConfig } from '@playwright/test';

// Runs against a real, already-running stack (docker-compose services +
// `pnpm --filter web dev`) — it is NOT started by this config, since it
// needs the full backend, not just the frontend dev server. See README for
// how to run it.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
  },
});
