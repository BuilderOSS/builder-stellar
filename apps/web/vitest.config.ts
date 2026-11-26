import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Panda's generated output (tsconfig resolves it through baseUrl; Vitest 4 needs the alias).
      'styled-system': fileURLToPath(new URL('./styled-system', import.meta.url))
    }
  },
  test: {
    environment: 'node'
  }
});
