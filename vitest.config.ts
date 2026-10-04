import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/__tests__/*.test.ts', 'apps/desktop/src-ui/**/__tests__/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
