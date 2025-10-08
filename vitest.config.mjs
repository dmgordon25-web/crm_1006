import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const crmJsRoot = resolve(repoRoot, 'crm-app/js');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^\/js\//,
        replacement: `${crmJsRoot}/`
      }
    ]
  },
  test: {
    include: ['tests/unit/**/*.{test.js,spec.ts}'],
    environment: 'node',
    reporters: 'default',
    setupFiles: ['tests/unit/vitest.setup.js'],
    globalSetup: 'tests/unit/vitest.global-setup.js'
  }
});
