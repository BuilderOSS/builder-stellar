import { defineConfig } from 'vitest/config';

// Unit tests for the harness itself (signer, waits, preflight). The walkthroughs are Playwright specs in tests/.
export default defineConfig({ test: { include: ['unit/**/*.test.ts'], environment: 'node' } });
