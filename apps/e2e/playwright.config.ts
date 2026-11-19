import { defineConfig, type Project } from '@playwright/test';

import { appServerEnv } from './src/app-env.ts';
import type { Theme } from './src/fixtures.ts';
import { E2E_APP_PORT, E2E_BASE_URL } from './src/network.ts';
import { runDir, runId } from './src/run.ts';

/**
 * Walkthrough suite (docs/plans/walkthroughs-and-docs.md §3, runbook docs/qa/WALKTHROUGHS.md).
 *
 * Coverage is hybrid (decision Q3):
 *   - `@matrix` specs (auth, forms up to signing, the state tour) run at 3 viewports × 2 themes, in
 *     parallel. They may sign messages but never submit a transaction;
 *   - `@chain` specs run in their own `*-chain` projects, at desktop (dark, the hero theme);
 *     E2E_ROTATION=1 (the weekly run) adds mobile and tablet.
 *
 * Chain projects run one test at a time (`workers: 1`). A rotation run (E2E_ROTATION=1) runs the
 * whole suite on one worker, so the desktop, tablet and mobile chain projects never sign at the
 * same time. There are no project `dependencies`: Playwright runs a dependency project's whole
 * suite even when files are named, which pulled other walkthroughs' chain tests into a run. The signer's per-account lock and `IdentityClaims` live in one
 * worker's memory, so serialising chain flows is what keeps two of them from signing from one
 * account at once (`tx_bad_seq`).
 */
const VIEWPORTS = {
  mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } }
} as const;
type Size = keyof typeof VIEWPORTS;
const THEMES: Theme[] = ['light', 'dark'];
const rotation = process.env.E2E_ROTATION === '1';

const matrixProjects: Project[] = (Object.keys(VIEWPORTS) as Size[]).flatMap((size) =>
  THEMES.map((theme) => ({
    name: `${size}-${theme}`,
    grep: /@matrix/,
    use: { ...VIEWPORTS[size], browserName: 'chromium' as const, colorScheme: theme, theme }
  }))
);

const chainSizes: Size[] = rotation ? ['desktop', 'tablet', 'mobile'] : ['desktop'];
const chainProjects: Project[] = chainSizes.map((size) => ({
  name: `${size}-dark-chain`,
  grep: /@chain/,
  workers: 1,
  fullyParallel: false,
  use: { ...VIEWPORTS[size], browserName: 'chromium' as const, colorScheme: 'dark' as const, theme: 'dark' as const }
}));

const projects: Project[] = [...matrixProjects, ...chainProjects];

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
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : rotation ? 1 : 3,
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
