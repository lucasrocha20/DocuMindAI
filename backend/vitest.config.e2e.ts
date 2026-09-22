import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The e2e files share one Postgres and one BullMQ queue, and one of them runs a
    // live worker that would consume jobs the others leave waiting. One file at a time.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
  },
});
