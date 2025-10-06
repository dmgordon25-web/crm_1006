import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.{test.js,spec.ts}'],
    environment: 'node',
    reporters: 'default',
    setupFiles: ['tests/unit/vitest.setup.js'],
    globalSetup: 'tests/unit/vitest.global-setup.js'
  }
});
