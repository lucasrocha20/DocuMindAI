import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Unit and e2e together, so coverage reflects everything that runs.
// Needs Postgres and Redis (docker compose up -d), like the e2e suite.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    // The e2e files share one Postgres and one BullMQ queue, and one of them runs a
    // live worker that would consume jobs the others leave waiting. One file at a time.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', '**/*.spec.ts'],
    },
  },
});
