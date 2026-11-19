import { preflight } from './preflight.ts';
import { writeRunJson } from './run.ts';

/** Playwright globalSetup: the preflight, unless E2E_SKIP_PREFLIGHT=1 (e.g. a re-run minutes later). */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_PREFLIGHT === '1') {
    console.info('Preflight skipped (E2E_SKIP_PREFLIGHT=1).');
    return;
  }
  // Rebuilding contracts on every run is slow; the dedicated `pnpm preflight` builds them.
  const result = await preflight({ build: process.env.E2E_BUILD_CONTRACTS === '1' });
  writeRunJson('preflight.json', {
    funded: result.funded.map(({ name, address, action }) => ({ name, address, action })),
    manager: result.manager
  });
  process.env.E2E_MANAGER_STATUS = result.manager.status;
}
