// pnpm --dir apps/e2e preflight [--skip-build] [--require-manager]
// Funds the walkthrough identities and checks the dev Manager's contracts against this checkout.
import { preflight } from './preflight.ts';

const args = new Set(process.argv.slice(2));
try {
  await preflight({ build: !args.has('--skip-build'), requireManager: args.has('--require-manager') });
  console.info('Preflight passed.');
} catch (error) {
  console.error(`Preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
