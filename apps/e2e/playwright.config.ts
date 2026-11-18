import { defineConfig, type Project } from '@playwright/test';

import { appServerEnv } from './src/app-env.ts';
import type { Theme } from './src/fixtures.ts';
import { E2E_APP_PORT, E2E_BASE_URL } from './src/network.ts';
import { runDir, runId } from './src/run.ts';

/**
 * Walkthrough suite (docs/plans/walkthroughs-and-docs.md §3, runbook docs/qa/WALKTHROUGHS.md).
 *
 * Coverage is hybrid (decision Q3):
 *   - `@matrix` specs (auth, forms up to signing, the state tour) run at 3 viewports × 2 themes;
 *   - `@chain` specs run once per run at desktop (dark, the hero theme); E2E_ROTATION=1 (the weekly
 *     run) adds mobile and tablet.
 */
const VIEWPORTS = {
  mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } }
} as const;
const THEMES: Theme[] = ['light', 'dark'];
const rotation = process.env.E2E_ROTATION === '1';

const projects: Project[] = Object.entries(VIEWPORTS).flatMap(([size, device]) =>
  THEMES.map((theme) => {
    const chainHere = (size === 'desktop' && theme === 'dark') || (rotation && theme === 'dark');
    return {
      name: `${size}-${theme}`,
      grep: chainHere ? /@matrix|@chain/ : /@matrix/,
      use: { ...device, browserName: 'chromium' as const, colorScheme: theme, theme }
    };
  })
);

const id = runId();
const reports = runDir(id);
const external = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './tests',
  outputDir: `${reports}/artifacts`,
  // Chain flows are minutes long by contract (§3.3); each spec sets its own budget on top.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  globalSetup: './src/global-setup.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: `${reports}/html`, open: 'never' }],
    ['json', { outputFile: `${reports}/results.json` }],
    ['./src/summary-reporter.ts']
  ],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects,
  // A local `next start` of the walkthrough build (`pnpm build:app`). With E2E_BASE_URL set (a
  // Vercel preview built with the flag) no server is started. Never point this at production.
  webServer: external
    ? undefined
    : {
        command: `pnpm --dir ../web exec next start --port ${E2E_APP_PORT}`,
        url: `${E2E_BASE_URL}/api/auth/session`,
        env: appServerEnv(),
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe'
      }
});
