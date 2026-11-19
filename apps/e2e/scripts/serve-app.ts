// pnpm --dir apps/e2e serve:app
// Starts the walkthrough build (`next start` of apps/web/.next-e2e) with the same environment
// Playwright's webServer uses, and keeps it up. Several `playwright test` runs then share one server
// (reuseExistingServer), so a matrix run and a chain run can overlap without one stopping the other's
// server when it ends. Nothing secret is printed.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { appServerEnv } from '../src/app-env.ts';
import { E2E_APP_PORT } from '../src/network.ts';
import { E2E_ROOT } from '../src/run.ts';

const child = spawn('pnpm', ['--dir', resolve(E2E_ROOT, '../web'), 'exec', 'next', 'start', '--port', String(E2E_APP_PORT)], {
  env: { ...process.env, ...appServerEnv() },
  stdio: 'inherit'
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
