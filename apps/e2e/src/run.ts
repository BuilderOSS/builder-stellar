import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * One id per `playwright test` invocation, shared by the runner and its workers (set in the
 * config, inherited through the environment). Reports land in apps/e2e/reports/<run-id>/.
 */
export function runId() {
  process.env.E2E_RUN_ID ||= new Date().toISOString().replace(/[:.]/g, '-');
  return process.env.E2E_RUN_ID;
}

export function runDir(id = runId()) {
  return join(E2E_ROOT, 'reports', id);
}

export function writeRunJson(name: string, value: unknown) {
  const dir = runDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}
